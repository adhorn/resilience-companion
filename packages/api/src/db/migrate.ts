import type { Db } from "./connection.js";
import { sql } from "drizzle-orm";

/**
 * Run migrations. For MVP, we use push-style: drop and recreate.
 * In production, use drizzle-kit generate + migrate.
 */
export function migrate(db: Db) {
  db.run(sql`CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`);

  db.run(sql`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    team_id TEXT NOT NULL REFERENCES teams(id),
    role TEXT NOT NULL DEFAULT 'MEMBER',
    auth_provider TEXT NOT NULL DEFAULT 'local',
    created_at TEXT NOT NULL
  )`);

  db.run(sql`CREATE TABLE IF NOT EXISTS templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    is_default INTEGER NOT NULL DEFAULT 0,
    sections TEXT NOT NULL,
    created_by TEXT REFERENCES users(id),
    created_at TEXT NOT NULL
  )`);

  db.run(sql`CREATE TABLE IF NOT EXISTS orrs (
    id TEXT PRIMARY KEY,
    service_name TEXT NOT NULL,
    team_id TEXT NOT NULL REFERENCES teams(id),
    template_version TEXT NOT NULL REFERENCES templates(id),
    status TEXT NOT NULL DEFAULT 'DRAFT',
    repository_path TEXT,
    repository_token TEXT,
    repository_local_path TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT
  )`);

  // Migrations: add columns to existing tables
  const migrations: [string, string, string][] = [
    ["orrs", "repository_path", "TEXT"],
    ["orrs", "repository_token", "TEXT"],
    ["orrs", "repository_local_path", "TEXT"],
    ["sections", "prompt_responses", "TEXT NOT NULL DEFAULT '{}'"],
    ["session_messages", "metadata", "TEXT"],
  ];
  for (const [table, col, type] of migrations) {
    try {
      db.run(sql.raw(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`));
    } catch (_) {
      // Column already exists
    }
  }

  db.run(sql`CREATE TABLE IF NOT EXISTS sections (
    id TEXT PRIMARY KEY,
    orr_id TEXT NOT NULL REFERENCES orrs(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    title TEXT NOT NULL,
    prompts TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    depth TEXT NOT NULL DEFAULT 'UNKNOWN',
    depth_rationale TEXT,
    flags TEXT NOT NULL DEFAULT '[]',
    conversation_snippet TEXT,
    updated_at TEXT NOT NULL,
    updated_by TEXT REFERENCES users(id)
  )`);

  db.run(sql`CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    orr_id TEXT NOT NULL REFERENCES orrs(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id),
    agent_profile TEXT NOT NULL DEFAULT 'REVIEW_FACILITATOR',
    summary TEXT,
    sections_discussed TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    token_usage INTEGER NOT NULL DEFAULT 0,
    started_at TEXT NOT NULL,
    ended_at TEXT
  )`);

  db.run(sql`CREATE TABLE IF NOT EXISTS session_messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`);

  db.run(sql`CREATE TABLE IF NOT EXISTS teaching_moments (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'ORG',
    source_orr_id TEXT REFERENCES orrs(id),
    attributed_to TEXT,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    tags TEXT NOT NULL DEFAULT '[]',
    section_tags TEXT NOT NULL DEFAULT '[]',
    system_pattern TEXT,
    failure_mode TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);

  db.run(sql`CREATE TABLE IF NOT EXISTS case_studies (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    company TEXT NOT NULL,
    year INTEGER,
    summary TEXT NOT NULL,
    source_url TEXT,
    failure_category TEXT NOT NULL,
    section_tags TEXT NOT NULL DEFAULT '[]',
    lessons TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL
  )`);

  db.run(sql`CREATE TABLE IF NOT EXISTS orr_versions (
    id TEXT PRIMARY KEY,
    orr_id TEXT NOT NULL REFERENCES orrs(id) ON DELETE CASCADE,
    snapshot TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`);
}
