import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";
import * as schema from "./schema.js";

// Resolve DB_PATH: if relative, resolve from the monorepo root (3 levels up from this file)
const __dirname = dirname(fileURLToPath(import.meta.url));
const monorepoRoot = resolve(__dirname, "../../../..");
const rawPath = process.env.DB_PATH || "./data/orr-companion.db";
const DB_PATH = rawPath.startsWith("/") ? rawPath : resolve(monorepoRoot, rawPath);

function createConnection(dbPath: string = DB_PATH) {
  // Ensure the parent directory exists
  mkdirSync(dirname(dbPath), { recursive: true });
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

/** Override the singleton DB instance — for tests only. */
export function setTestDb(db: ReturnType<typeof createConnection>) {
  _db = db;
}

// For tests — create in-memory DB
export function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  return drizzle(sqlite, { schema });
}

export type Db = ReturnType<typeof createConnection>;
