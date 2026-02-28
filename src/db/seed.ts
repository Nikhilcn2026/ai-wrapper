import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { users } from "./schema";
import { eq } from "drizzle-orm";

const SEED_USERS = [
  {
    email: "alice@example.com",
    apiKey: "test-key-alice-001",
    stripeCustomerId: process.env.STRIPE_CUSTOMER_ID_1 || null,
  },
  {
    email: "bob@example.com",
    apiKey: "test-key-bob-002",
    stripeCustomerId: process.env.STRIPE_CUSTOMER_ID_2 || null,
  },
  {
    email: "charlie@example.com",
    apiKey: "test-key-charlie-003",
    stripeCustomerId: process.env.STRIPE_CUSTOMER_ID_3 || null,
  },
];

export async function seedDatabase(databaseUrl: string): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    const db = drizzle(pool);

    const existing = await db.select().from(users).limit(1);
    if (existing.length > 0) {
      console.log("Seed skipped: users table already has data.");
      return;
    }

    console.log("Seeding database with test users...");

    for (const user of SEED_USERS) {
      await db.insert(users).values(user).onConflictDoNothing();
    }

    const seeded = await db.select().from(users);
    console.log(`Seeded ${seeded.length} users:`);
    for (const u of seeded) {
      console.log(`  - ${u.email} (API key: ${u.apiKey}, ID: ${u.id})`);
    }
  } catch (error) {
    console.error("Seed failed:", error);
    throw error;
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  const url =
    process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@localhost:5432/ai_billing";
  seedDatabase(url)
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
