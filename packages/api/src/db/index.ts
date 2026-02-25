import { getDb } from "./connection.js";
import { migrate } from "./migrate.js";
import { seed } from "./seed.js";

export { getDb, createTestDb } from "./connection.js";
export type { Db } from "./connection.js";
export * as schema from "./schema.js";

/**
 * Initialize database: run migrations, seed default data.
 * Call once at app startup.
 */
export async function initDb() {
  const db = getDb();
  migrate(db);
  await seed(db);
  console.log("Database initialized.");
  return db;
}
