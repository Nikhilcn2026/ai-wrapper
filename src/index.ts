import express from "express";
import { loadEnv } from "./config/env";
import { runMigrations } from "./db/migrate";
import { seedDatabase } from "./db/seed";
import { closePool } from "./db/client";
import { ensureMeterExists } from "./services/billing.service";
import { errorHandler } from "./middleware/errorHandler";
import chatRouter from "./routes/chat";
import usageRouter from "./routes/usage";
import healthRouter from "./routes/health";

async function main(): Promise<void> {
  // 1. Validate environment
  const env = loadEnv();
  console.log(`Starting AI Billing Engine on port ${env.PORT}...`);

  // 2. Run database migrations
  await runMigrations(env.DATABASE_URL);

  // 3. Seed database with test users (skips if data exists)
  await seedDatabase(env.DATABASE_URL);

  // 4. Ensure Stripe billing meter exists
  await ensureMeterExists();

  // 5. Create Express app
  const app = express();

  // Body parsing
  app.use(express.json({ limit: "1mb" }));

  // Routes
  app.use("/health", healthRouter);
  app.use("/api/chat", chatRouter);
  app.use("/api/usage", usageRouter);

  // Global error handler (must be after routes)
  app.use(errorHandler);

  // 6. Start server
  const server = app.listen(env.PORT, () => {
    console.log(`Server listening on http://0.0.0.0:${env.PORT}`);
    console.log(`Health check: http://localhost:${env.PORT}/health`);
  });

  // 7. Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\nReceived ${signal}. Shutting down gracefully...`);
    server.close(async () => {
      await closePool();
      console.log("Server shut down.");
      process.exit(0);
    });

    // Force exit after 10 seconds
    setTimeout(() => {
      console.error("Forced shutdown after timeout.");
      process.exit(1);
    }, 10000);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("Fatal error during startup:", err);
  process.exit(1);
});
