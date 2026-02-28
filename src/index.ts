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
  const env = loadEnv();
  console.log(`Starting AI Billing Engine on port ${env.PORT}...`);

  await runMigrations(env.DATABASE_URL);

  await seedDatabase(env.DATABASE_URL);

  await ensureMeterExists();

  const app = express();

  app.use(express.json({ limit: "1mb" }));

  app.use("/health", healthRouter);
  app.use("/api/chat", chatRouter);
  app.use("/api/usage", usageRouter);

  app.use(errorHandler);

  const server = app.listen(env.PORT, () => {
    console.log(`Server listening on http://0.0.0.0:${env.PORT}`);
    console.log(`Health check: http://localhost:${env.PORT}/health`);
  });

  const shutdown = async (signal: string) => {
    console.log(`\nReceived ${signal}. Shutting down gracefully...`);
    server.close(async () => {
      await closePool();
      console.log("Server shut down.");
      process.exit(0);
    });

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
