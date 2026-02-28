# AI Billing Engine

An engine that processes AI requests, handles billing logic, tracks usage, and logs transactions. Built with TypeScript, Express, PostgreSQL, OpenRouter (LLM proxy), and Stripe (usage-based billing).

The entire system runs via **Docker** — no manual service configuration needed.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Docker Compose                          │
│                                                             │
│  ┌──────────────┐         ┌──────────────────────────────┐  │
│  │              │         │          App (Express)        │  │
│  │  PostgreSQL  │◄────────│                              │  │
│  │  (postgres)  │         │  ┌─────────┐  ┌───────────┐  │  │
│  │              │         │  │  Auth    │  │  Routes   │  │  │
│  └──────────────┘         │  │Middleware│  │ /api/chat │  │  │
│                           │  └─────────┘  │ /api/usage│  │  │
│                           │               │ /health   │  │  │
│                           │  ┌─────────┐  └───────────┘  │  │
│                           │  │Services │                  │  │
│                           │  │         │──────────────────┼──┼──► OpenRouter API
│                           │  │  LLM    │                  │  │    (LLM Proxy)
│                           │  │ Billing │──────────────────┼──┼──► Stripe API
│                           │  │  Txn    │                  │  │    (Usage Billing)
│                           │  └─────────┘                  │  │
│                           └──────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Request Flow

1. Client sends `POST /api/chat` with an `X-API-Key` header and messages
2. Auth middleware looks up the user by API key in PostgreSQL
3. Request is forwarded to OpenRouter (OpenAI-compatible LLM proxy)
4. LLM response and token usage are logged as a transaction in the database
5. Token usage is reported to Stripe via the Billing Meters API
6. Transaction is updated with the Stripe reference ID
7. Client receives the AI response with metadata (request ID, usage, billing status)

---

## Architecture Decisions

| Decision | Rationale |
|---|---|
| **Express** | Most widely used Node.js framework; simple, familiar, mature ecosystem |
| **OpenRouter (direct)** | OpenAI-compatible API eliminates the need for a separate LiteLLM container; supports 100+ models via a single API |
| **Plain PostgreSQL** | The requirement says "Supabase (PostgreSQL)" — a standard `postgres:16` image satisfies this cleanly; Drizzle ORM provides the type-safe data layer |
| **Drizzle ORM** | Lightweight, type-safe ORM with SQL migration generation; no heavy runtime like Prisma |
| **Stripe Billing Meters API** | Modern usage-based billing approach with built-in deduplication; replaces legacy `usage_records` |
| **Simple API-key auth** | Meets the requirement without overcomplicating; keys stored in the users table |
| **Zod** | Validates all env vars at startup and request bodies at runtime — fail fast with clear errors |
| **Multi-stage Docker build** | Keeps the production image small and secure; dev dependencies stay out |

---

## Project Structure

```
├── docker-compose.yml          # Full stack: postgres + app
├── Dockerfile                  # Multi-stage build for the app
├── .env.example                # Template for required environment variables
├── package.json
├── tsconfig.json
├── drizzle.config.ts           # Drizzle ORM migration configuration
├── vitest.config.ts            # Unit test config
├── vitest.integration.config.ts # Integration test config
├── src/
│   ├── index.ts                # App entry: migrations → seed → server start
│   ├── config/
│   │   └── env.ts              # Zod-validated environment configuration
│   ├── db/
│   │   ├── client.ts           # PostgreSQL pool + Drizzle ORM instance
│   │   ├── schema.ts           # Database schema (users, transactions)
│   │   ├── migrate.ts          # Migration runner
│   │   └── seed.ts             # Test user seeder
│   ├── services/
│   │   ├── llm.service.ts      # OpenRouter integration (OpenAI SDK)
│   │   ├── billing.service.ts  # Stripe meter events reporting
│   │   └── transaction.service.ts  # DB transaction logging & querying
│   ├── routes/
│   │   ├── chat.ts             # POST /api/chat — main AI proxy
│   │   ├── usage.ts            # GET /api/usage — usage history
│   │   └── health.ts           # GET /health — health check
│   ├── middleware/
│   │   ├── auth.ts             # API key authentication
│   │   └── errorHandler.ts     # Global error handler
│   └── types/
│       └── index.ts            # Shared TypeScript interfaces
├── drizzle/                    # Auto-generated SQL migrations
└── tests/
    ├── unit/
    │   ├── billing.service.test.ts
    │   ├── transaction.service.test.ts
    │   └── validation.test.ts
    └── integration/
        └── chat.test.ts
```

---

## Database Schema

### `users`

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | Auto-generated |
| `email` | VARCHAR(255) | Unique email |
| `stripe_customer_id` | VARCHAR(255) | Stripe customer ID (nullable) |
| `api_key` | VARCHAR(255) | Unique API key for authentication |
| `created_at` | TIMESTAMPTZ | Auto-set on creation |

### `transactions`

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | Auto-generated |
| `user_id` | UUID (FK → users) | Who made the request |
| `request_id` | UUID | Unique request identifier |
| `model` | VARCHAR(255) | LLM model used |
| `prompt_tokens` | INTEGER | Input token count |
| `completion_tokens` | INTEGER | Output token count |
| `total_tokens` | INTEGER | Total token count |
| `request_timestamp` | TIMESTAMPTZ | When the request was made |
| `response_timestamp` | TIMESTAMPTZ | When the response was received |
| `billing_status` | ENUM | `pending`, `reported`, or `failed` |
| `stripe_meter_event_id` | VARCHAR(255) | Stripe reference ID (nullable) |
| `created_at` | TIMESTAMPTZ | Auto-set on creation |

---

## How to Run Locally (Docker)

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/)
- An [OpenRouter API key](https://openrouter.ai/keys) (free tier available)
- A [Stripe test-mode API key](https://dashboard.stripe.com/test/apikeys)

### Steps

1. **Clone the repository**

   ```bash
   git clone <repo-url>
   cd ai-billing-engine
   ```

2. **Configure environment variables**

   ```bash
   cp .env.example .env
   ```

   Edit `.env` and fill in:
   - `OPENROUTER_API_KEY` — your OpenRouter key
   - `STRIPE_SECRET_KEY` — your Stripe test-mode secret key (`sk_test_...`)
   - (Optional) `STRIPE_CUSTOMER_ID_1`, `STRIPE_CUSTOMER_ID_2`, `STRIPE_CUSTOMER_ID_3` — Stripe test customer IDs for the seed users

3. **Start the stack**

   ```bash
   docker-compose up --build
   ```

   This will:
   - Start PostgreSQL
   - Build the app image
   - Run database migrations
   - Seed test users (alice, bob, charlie)
   - Create the Stripe billing meter (if it doesn't exist)
   - Start the Express server on port 3000

4. **Verify it's running**

   ```bash
   curl http://localhost:3000/health
   ```

   Expected:
   ```json
   {"status":"ok","db":"connected","timestamp":"2026-03-01T..."}
   ```

---

## API Reference

### Health Check

```
GET /health
```

**Response (200):**
```json
{
  "status": "ok",
  "db": "connected",
  "timestamp": "2026-03-01T12:00:00.000Z"
}
```

### Chat Completion

```
POST /api/chat
```

**Headers:**
| Header | Required | Description |
|---|---|---|
| `X-API-Key` | Yes | User's API key (e.g., `test-key-alice-001`) |
| `Content-Type` | Yes | `application/json` |

**Body:**
```json
{
  "messages": [
    { "role": "system", "content": "You are a helpful assistant." },
    { "role": "user", "content": "What is the capital of France?" }
  ],
  "model": "openai/gpt-3.5-turbo"
}
```

The `model` field is optional (defaults to `openai/gpt-3.5-turbo`). See [OpenRouter models](https://openrouter.ai/models) for available models.

**Response (200):**
```json
{
  "requestId": "d290f1ee-6c54-4b01-90e6-d701748f0851",
  "model": "openai/gpt-3.5-turbo",
  "message": {
    "role": "assistant",
    "content": "The capital of France is Paris."
  },
  "usage": {
    "promptTokens": 25,
    "completionTokens": 8,
    "totalTokens": 33
  },
  "billingStatus": "reported"
}
```

### Usage History

```
GET /api/usage
GET /api/usage/:userId
```

**Headers:**
| Header | Required | Description |
|---|---|---|
| `X-API-Key` | Yes | User's API key |

**Query Parameters (optional):**
| Param | Description |
|---|---|
| `start` | ISO 8601 start date filter |
| `end` | ISO 8601 end date filter |

**Response (200):**
```json
{
  "userId": "a1b2c3d4-...",
  "totalRequests": 5,
  "totalPromptTokens": 150,
  "totalCompletionTokens": 300,
  "totalTokens": 450,
  "transactions": [
    {
      "id": "...",
      "requestId": "...",
      "model": "openai/gpt-3.5-turbo",
      "promptTokens": 25,
      "completionTokens": 50,
      "totalTokens": 75,
      "requestTimestamp": "2026-03-01T12:00:00.000Z",
      "responseTimestamp": "2026-03-01T12:00:01.000Z",
      "billingStatus": "reported",
      "stripeMeterEventId": "evt_..."
    }
  ]
}
```

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `OPENROUTER_API_KEY` | Yes | — | OpenRouter API key |
| `STRIPE_SECRET_KEY` | Yes | — | Stripe secret key (test mode) |
| `STRIPE_METER_EVENT_NAME` | No | `ai_tokens_used` | Stripe Billing Meter event name |
| `PORT` | No | `3000` | Server port |
| `LOG_LEVEL` | No | `info` | Logging verbosity |
| `STRIPE_CUSTOMER_ID_1` | No | — | Stripe customer ID for seed user Alice |
| `STRIPE_CUSTOMER_ID_2` | No | — | Stripe customer ID for seed user Bob |
| `STRIPE_CUSTOMER_ID_3` | No | — | Stripe customer ID for seed user Charlie |

---

## How to Test

### Unit Tests (no external services needed)

```bash
# Install deps locally (if not using Docker)
npm install

# Run unit tests
npm test
```

### Integration Tests (requires running Postgres)

```bash
# Start Postgres
docker-compose up -d postgres

# Run integration tests
npm run test:integration
```

### Manual Testing with curl

```bash
# Health check
curl http://localhost:3000/health

# Chat completion
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -H "X-API-Key: test-key-alice-001" \
  -d '{"messages": [{"role": "user", "content": "Hello!"}]}'

# View usage
curl http://localhost:3000/api/usage \
  -H "X-API-Key: test-key-alice-001"
```

### Verify Stripe Integration

After making a chat request with a user who has a `stripe_customer_id`:
1. Go to [Stripe Test Dashboard](https://dashboard.stripe.com/test/billing/meters)
2. Click on the `ai_tokens_used` meter
3. You should see the reported token usage events

---

## Stopping the Stack

```bash
docker-compose down          # Stop and remove containers
docker-compose down -v       # Also remove the database volume
```
