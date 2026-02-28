import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .url()
    .describe("PostgreSQL connection string"),

  OPENROUTER_API_KEY: z
    .string()
    .min(1)
    .describe("OpenRouter API key for LLM proxy"),

  STRIPE_SECRET_KEY: z
    .string()
    .min(1)
    .describe("Stripe secret key (test mode)"),

  STRIPE_METER_EVENT_NAME: z
    .string()
    .min(1)
    .default("ai_tokens_used")
    .describe("Stripe Billing Meter event name"),

  PORT: z
    .string()
    .default("3000")
    .transform(Number)
    .pipe(z.number().int().positive())
    .describe("Server port"),

  LOG_LEVEL: z
    .enum(["debug", "info", "warn", "error"])
    .default("info")
    .describe("Logging verbosity"),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

/**
 * Parse and validate environment variables. Throws with clear messages on failure.
 */
export function loadEnv(): Env {
  if (_env) return _env;

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    console.error(`\n❌ Environment validation failed:\n${formatted}\n`);
    console.error("Hint: Copy .env.example to .env and fill in the required values.\n");
    process.exit(1);
  }

  _env = result.data;
  return _env;
}

/**
 * Get the validated env (must call loadEnv() first).
 */
export function getEnv(): Env {
  if (!_env) {
    return loadEnv();
  }
  return _env;
}
