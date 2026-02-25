import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";

const DB_PATH = process.env.DB_PATH || "./data/orr-companion.db";

function createConnection(dbPath: string = DB_PATH) {
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");

  return drizzle(sqlite, { schema });
}

// Singleton for app usage
let _db: ReturnType<typeof createConnection> | null = null;

export function getDb() {
  if (!_db) {
    _db = createConnection();
  }
  return _db;
}

// For tests — create in-memory DB
export function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  return drizzle(sqlite, { schema });
}

export type Db = ReturnType<typeof createConnection>;
