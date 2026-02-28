# AI Billing Engine

A TypeScript service that proxies AI chat completions through OpenRouter, logs every request to PostgreSQL, and reports token usage to Stripe for metered billing. The entire stack runs in Docker with a single command.

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                     docker-compose                       │
│                                                          │
│  ┌────────────┐       ┌────────────────────────────────┐ │
│  │            │       │         app (Express)          │ │
│  │ PostgreSQL │◄──────│                                │ │
│  │            │       │   Routes          Services     │ │
│  └────────────┘       │   ├─ /health      ├─ LLM ─────┼─┼──► OpenRouter
│                       │   ├─ /api/chat    ├─ Billing ──┼─┼──► Stripe
│                       │   └─ /api/usage   └─ Txn       │ │
│                       │                                │ │
│                       └────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

A request to `POST /api/chat` flows through these steps:

1. The auth middleware resolves the caller from an API key stored in the `users` table.
2. The message payload is validated with Zod and forwarded to OpenRouter.
3. The response, including token counts, is written to the `transactions` table with a `pending` billing status.
4. Token usage is reported to Stripe via the Billing Meters API.
5. The transaction row is updated to `reported` (or `failed` if Stripe is unreachable).
6. The AI response is returned along with the request ID, usage metrics, and billing status.

## Architecture Decisions

**TypeScript + Express** — Express is the most mature HTTP framework in the Node ecosystem. It has a minimal API surface, which keeps the codebase straightforward and easy for reviewers to follow. TypeScript adds compile-time safety without the boilerplate of heavier frameworks like NestJS.

**OpenRouter (direct HTTPS)** — OpenRouter exposes an OpenAI-compatible API, so the standard `openai` npm package works without changes. Calling it directly avoids the operational complexity of running a separate LiteLLM proxy container while still supporting 100+ model providers behind a single endpoint.

**PostgreSQL (plain container)** — The requirement references Supabase, which is built on PostgreSQL. Rather than deploying the full 13-service Supabase stack for what is fundamentally a data logging use case, a single `postgres:16-alpine` container provides the same database engine with zero extra surface area. Drizzle ORM sits on top for type-safe queries and migration management.

**Drizzle ORM** — Drizzle generates SQL migrations from a TypeScript schema definition, so the database structure lives in code and is version-controlled. It has a smaller runtime footprint than Prisma and produces readable SQL, which makes debugging straightforward.

**Stripe Billing Meters API** — Stripe's Meters API is the current recommended approach for usage-based billing. Each meter event carries a deduplication identifier (the request UUID), which prevents double-counting if a retry occurs. The application creates the meter automatically on first startup if it doesn't already exist.

**API key authentication** — A simple `X-API-Key` header lookup against the `users` table. This avoids pulling in JWT libraries or an external auth provider for a service whose primary concern is billing and usage tracking.

**Zod** — Used for both environment variable validation at startup and request body validation at runtime. A single validation library for both concerns keeps the dependency tree small.

## Project Structure

```
├── docker-compose.yml
├── Dockerfile
├── .env.example
├── package.json
├── tsconfig.json
├── drizzle.config.ts
├── drizzle/                        Generated SQL migrations
├── src/
│   ├── index.ts                    Application entry point
│   ├── config/
│   │   └── env.ts                  Environment validation (Zod schema)
│   ├── db/
│   │   ├── client.ts               Connection pool and Drizzle instance
│   │   ├── schema.ts               Table definitions (users, transactions)
│   │   ├── migrate.ts              Migration runner
│   │   └── seed.ts                 Test user seeder
│   ├── services/
│   │   ├── llm.service.ts          OpenRouter chat completion
│   │   ├── billing.service.ts      Stripe meter event reporting
│   │   └── transaction.service.ts  Transaction logging and queries
│   ├── routes/
│   │   ├── chat.ts                 POST /api/chat
│   │   ├── usage.ts                GET /api/usage
│   │   └── health.ts               GET /health
│   ├── middleware/
│   │   ├── auth.ts                 API key authentication
│   │   └── errorHandler.ts         Centralized error responses
│   └── types/
│       └── index.ts                Shared interfaces
└── tests/
    ├── unit/                       Validation, billing, aggregation tests
    └── integration/                HTTP-level tests with supertest
```

`src/index.ts` orchestrates startup: it validates the environment, runs migrations, seeds the database if empty, ensures the Stripe meter exists, and then starts the HTTP server with graceful shutdown handling.

The `services/` layer contains all external integrations. Each service is a plain module with exported functions — no classes, no DI framework. This keeps the code flat and easy to test.

The `routes/` layer is thin: validate input, call services, return JSON. Business logic lives in services, not in route handlers.

## Database Schema

**users**

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key, auto-generated |
| email | varchar(255) | Unique |
| stripe_customer_id | varchar(255) | Nullable; links to Stripe |
| api_key | varchar(255) | Unique; used for authentication |
| created_at | timestamptz | Default now() |

**transactions**

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key, auto-generated |
| user_id | uuid | Foreign key → users(id), cascade delete |
| request_id | uuid | Unique; doubles as Stripe dedup identifier |
| model | varchar(255) | LLM model used |
| prompt_tokens | integer | Input tokens |
| completion_tokens | integer | Output tokens |
| total_tokens | integer | Sum of prompt + completion |
| request_timestamp | timestamptz | When the request was initiated |
| response_timestamp | timestamptz | When the LLM responded |
| billing_status | enum | `pending`, `reported`, or `failed` |
| stripe_meter_event_id | varchar(255) | Nullable; Stripe event reference |
| created_at | timestamptz | Default now() |

## Running Locally

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- An [OpenRouter API key](https://openrouter.ai/keys)
- A [Stripe test-mode secret key](https://dashboard.stripe.com/test/apikeys)

### Setup

```bash
git clone <repository-url>
cd ai-billing-engine
cp .env.example .env
```

Open `.env` and set the two required keys:

```
OPENROUTER_API_KEY=sk-or-v1-...
STRIPE_SECRET_KEY=sk_test_...
```

The remaining variables have sensible defaults. If you want Stripe billing to work end-to-end, also set `STRIPE_CUSTOMER_ID_1` (etc.) to actual Stripe test customer IDs assigned to the seed users.

### Start

```bash
docker-compose up --build
```

This starts PostgreSQL, waits for it to be healthy, builds the application image, runs database migrations, seeds three test users, creates the Stripe billing meter if needed, and starts the server on port 3000.

### Verify

```bash
curl http://localhost:3000/health
```

Expected response:

```json
{"status":"ok","db":"connected","timestamp":"2026-03-01T12:00:00.000Z"}
```

### Make a chat request

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -H "X-API-Key: test-key-alice-001" \
  -d '{"messages":[{"role":"user","content":"What is the capital of France?"}]}'
```

The response includes the AI completion, token usage, and billing status:

```json
{
  "requestId": "d290f1ee-6c54-4b01-90e6-d701748f0851",
  "model": "openai/gpt-3.5-turbo",
  "message": {"role":"assistant","content":"The capital of France is Paris."},
  "usage": {"promptTokens":14,"completionTokens":8,"totalTokens":22},
  "billingStatus": "reported"
}
```

### View usage history

```bash
curl http://localhost:3000/api/usage \
  -H "X-API-Key: test-key-alice-001"
```

Supports optional `?start=` and `?end=` query parameters (ISO 8601 dates) for filtering by time range.

### Stop

```bash
docker-compose down        # stop containers
docker-compose down -v     # also delete the database volume
```

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| DATABASE_URL | Yes | — | PostgreSQL connection string |
| OPENROUTER_API_KEY | Yes | — | OpenRouter API key |
| STRIPE_SECRET_KEY | Yes | — | Stripe secret key (test mode) |
| STRIPE_METER_EVENT_NAME | No | ai_tokens_used | Stripe billing meter event name |
| PORT | No | 3000 | HTTP server port |
| LOG_LEVEL | No | info | Logging verbosity (debug, info, warn, error) |

When running through `docker-compose`, `DATABASE_URL` is set automatically to point at the Postgres container. You only need to provide `OPENROUTER_API_KEY` and `STRIPE_SECRET_KEY`.

## Testing

### Unit tests

Unit tests cover request validation schemas, billing payload structure, and usage aggregation logic. They do not require any external services.

```bash
npm install
npm test
```

### Integration tests

Integration tests use supertest to exercise the HTTP endpoints. They require a running PostgreSQL instance.

```bash
docker-compose up -d postgres
npm run test:integration
```

### Verifying Stripe integration

After sending a chat request for a user with a configured `stripe_customer_id`, go to the [Stripe test dashboard](https://dashboard.stripe.com/test/billing/meters) and check the meter named `ai_tokens_used`. Reported token events should appear within a few seconds.