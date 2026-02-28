import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import request from "supertest";
import { Pool } from "pg";

async function createTestApp() {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@localhost:5432/ai_billing";
  process.env.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "test-key";
  process.env.STRIPE_SECRET_KEY =
    process.env.STRIPE_SECRET_KEY || "sk_test_fake";
  process.env.STRIPE_METER_EVENT_NAME =
    process.env.STRIPE_METER_EVENT_NAME || "ai_tokens_used";
  process.env.PORT = process.env.PORT || "3001";

  const { loadEnv } = await import("../../src/config/env");
  loadEnv();

  const { default: healthRouter } = await import("../../src/routes/health");
  const { errorHandler } = await import("../../src/middleware/errorHandler");

  const app = express();
  app.use(express.json());
  app.use("/health", healthRouter);
  app.use(errorHandler);

  return app;
}

describe("Health endpoint", () => {
  let app: express.Application;

  beforeAll(async () => {
    app = await createTestApp();
  });

  it("GET /health should return status", async () => {
    const res = await request(app).get("/health");

    expect(res.status).toBeOneOf([200, 503]);
    expect(res.body).toHaveProperty("status");
    expect(res.body).toHaveProperty("db");
    expect(res.body).toHaveProperty("timestamp");
  });
});

describe("Chat endpoint", () => {
  it("should reject requests without API key", async () => {
    const app = await createTestApp();

    const { default: chatRouter } = await import("../../src/routes/chat");
    const { errorHandler } = await import("../../src/middleware/errorHandler");
    app.use("/api/chat", chatRouter);
    app.use(errorHandler);

    const res = await request(app)
      .post("/api/chat")
      .send({ messages: [{ role: "user", content: "Hello" }] });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Unauthorized");
  });

  it("should reject requests with invalid API key", async () => {
    const app = await createTestApp();

    const { default: chatRouter } = await import("../../src/routes/chat");
    const { errorHandler } = await import("../../src/middleware/errorHandler");
    app.use("/api/chat", chatRouter);
    app.use(errorHandler);

    const res = await request(app)
      .post("/api/chat")
      .set("X-API-Key", "nonexistent-key")
      .send({ messages: [{ role: "user", content: "Hello" }] });

    expect(res.status).toBeOneOf([401, 500]);
  });
});
