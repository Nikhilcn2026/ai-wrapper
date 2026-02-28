import { migrate } from "drizzle-orm/node-postgres/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import path from "path";

export async function runMigrations(databaseUrl: string): Promise<void> {
  console.log("Running database migrations...");

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    const db = drizzle(pool);
    await migrate(db, {
      migrationsFolder: path.resolve(__dirname, "../../drizzle"),
    });
    console.log("Migrations completed successfully.");
  } catch (error) {
    console.error("Migration failed:", error);
    throw error;
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  const url =
    process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@localhost:5432/ai_billing";
  runMigrations(url)
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
