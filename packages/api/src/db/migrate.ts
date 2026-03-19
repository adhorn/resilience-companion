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
    ["orrs", "steering_tier", "TEXT NOT NULL DEFAULT 'thorough'"],
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

  db.run(sql`CREATE TABLE IF NOT EXISTS agent_traces (
    id TEXT PRIMARY KEY,
    orr_id TEXT NOT NULL REFERENCES orrs(id) ON DELETE CASCADE,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    message_id TEXT,
    model TEXT NOT NULL,
    fallback_model TEXT,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    iteration_count INTEGER NOT NULL DEFAULT 0,
    tool_calls_count INTEGER NOT NULL DEFAULT 0,
    retry_count INTEGER NOT NULL DEFAULT 0,
    fallback_used INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    error_category TEXT,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )`);

  db.run(sql`CREATE TABLE IF NOT EXISTS agent_spans (
    id TEXT PRIMARY KEY,
    trace_id TEXT NOT NULL REFERENCES agent_traces(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    iteration INTEGER NOT NULL DEFAULT 0,
    model TEXT,
    tool_name TEXT,
    tool_args TEXT,
    tool_result_summary TEXT,
    section_id TEXT,
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    retry_attempt INTEGER,
    retry_reason TEXT,
    retry_delay_ms INTEGER,
    error TEXT,
    error_category TEXT,
    created_at TEXT NOT NULL
  )`);

  db.run(sql`CREATE TABLE IF NOT EXISTS dependencies (
    id TEXT PRIMARY KEY,
    orr_id TEXT NOT NULL REFERENCES orrs(id) ON DELETE CASCADE,
    section_id TEXT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    direction TEXT NOT NULL DEFAULT 'outbound',
    criticality TEXT NOT NULL DEFAULT 'important',
    has_fallback INTEGER NOT NULL DEFAULT 0,
    fallback_description TEXT,
    notes TEXT,
    created_at TEXT NOT NULL
  )`);

  db.run(sql`CREATE INDEX IF NOT EXISTS idx_dependencies_orr ON dependencies(orr_id)`);

  // Indexes for common trace queries
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_agent_traces_orr ON agent_traces(orr_id)`);
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_agent_traces_session ON agent_traces(session_id)`);
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_agent_spans_trace ON agent_spans(trace_id)`);
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_agent_spans_type ON agent_spans(type)`);
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_agent_spans_tool ON agent_spans(tool_name)`);
}
