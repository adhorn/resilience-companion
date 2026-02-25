/**
 * Migration upgrade tests.
 *
 * These test the ALTER TABLE / backfill path that runs when migrate()
 * encounters an existing database created before new columns/tables
 * were added. Fresh-DB tests don't catch this — they always take the
 * CREATE TABLE path which includes the new columns from the start.
 */
import { describe, test, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { sql } from "drizzle-orm";
import * as schema from "./schema.js";
import { migrate } from "./migrate.js";
import type { Db } from "./connection.js";

/**
 * Create an in-memory DB with the "old" schema — before services,
 * service_id columns, and experiment_suggestions existed.
 * This simulates what a real database looked like before the Service Hub changes.
 */
function createOldSchemaDb(): Db {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });

  // Core tables as they existed before Service Hub
  db.run(sql.raw(`CREATE TABLE teams (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL
  )`));
  db.run(sql.raw(`CREATE TABLE users (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL, team_id TEXT NOT NULL REFERENCES teams(id),
    role TEXT NOT NULL DEFAULT 'MEMBER', auth_provider TEXT NOT NULL DEFAULT 'local',
    created_at TEXT NOT NULL
  )`));
  db.run(sql.raw(`CREATE TABLE templates (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, is_default INTEGER NOT NULL DEFAULT 0,
    sections TEXT NOT NULL, created_by TEXT REFERENCES users(id), created_at TEXT NOT NULL
  )`));
  // orrs WITHOUT service_id — the old schema
  db.run(sql.raw(`CREATE TABLE orrs (
    id TEXT PRIMARY KEY, service_name TEXT NOT NULL,
    team_id TEXT NOT NULL REFERENCES teams(id),
    template_version TEXT NOT NULL REFERENCES templates(id),
    status TEXT NOT NULL DEFAULT 'DRAFT',
    repository_path TEXT, repository_token TEXT, repository_local_path TEXT,
    steering_tier TEXT NOT NULL DEFAULT 'thorough',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT
  )`));
  db.run(sql.raw(`CREATE TABLE sections (
    id TEXT PRIMARY KEY, orr_id TEXT NOT NULL REFERENCES orrs(id) ON DELETE CASCADE,
    position INTEGER NOT NULL, title TEXT NOT NULL, prompts TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '', depth TEXT NOT NULL DEFAULT 'UNKNOWN',
    depth_rationale TEXT, prompt_responses TEXT NOT NULL DEFAULT '{}',
    flags TEXT NOT NULL DEFAULT '[]', conversation_snippet TEXT,
    updated_at TEXT NOT NULL, updated_by TEXT REFERENCES users(id)
  )`));
  db.run(sql.raw(`CREATE TABLE sessions (
    id TEXT PRIMARY KEY, orr_id TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id),
    agent_profile TEXT NOT NULL DEFAULT 'REVIEW_FACILITATOR',
    summary TEXT, sections_discussed TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'ACTIVE', token_usage INTEGER NOT NULL DEFAULT 0,
    started_at TEXT NOT NULL, ended_at TEXT
  )`));
  db.run(sql.raw(`CREATE TABLE session_messages (
    id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL, content TEXT NOT NULL, metadata TEXT, created_at TEXT NOT NULL
  )`));
  db.run(sql.raw(`CREATE TABLE teaching_moments (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'ORG', source_orr_id TEXT REFERENCES orrs(id),
    attributed_to TEXT, status TEXT NOT NULL DEFAULT 'DRAFT',
    tags TEXT NOT NULL DEFAULT '[]', section_tags TEXT NOT NULL DEFAULT '[]',
    system_pattern TEXT, failure_mode TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`));
  db.run(sql.raw(`CREATE TABLE case_studies (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, company TEXT NOT NULL, year INTEGER,
    summary TEXT NOT NULL, source_url TEXT, failure_category TEXT NOT NULL,
    section_tags TEXT NOT NULL DEFAULT '[]', lessons TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL
  )`));
  db.run(sql.raw(`CREATE TABLE orr_versions (
    id TEXT PRIMARY KEY, orr_id TEXT NOT NULL REFERENCES orrs(id) ON DELETE CASCADE,
    snapshot TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL
  )`));
  db.run(sql.raw(`CREATE TABLE agent_traces (
    id TEXT PRIMARY KEY, orr_id TEXT NOT NULL,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    message_id TEXT, model TEXT NOT NULL, fallback_model TEXT,
    total_tokens INTEGER NOT NULL DEFAULT 0, prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0, iteration_count INTEGER NOT NULL DEFAULT 0,
    tool_calls_count INTEGER NOT NULL DEFAULT 0, retry_count INTEGER NOT NULL DEFAULT 0,
    fallback_used INTEGER NOT NULL DEFAULT 0, error TEXT, error_category TEXT,
    duration_ms INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
  )`));
  db.run(sql.raw(`CREATE TABLE agent_spans (
    id TEXT PRIMARY KEY, trace_id TEXT NOT NULL REFERENCES agent_traces(id) ON DELETE CASCADE,
    type TEXT NOT NULL, iteration INTEGER NOT NULL DEFAULT 0,
    model TEXT, tool_name TEXT, tool_args TEXT, tool_result_summary TEXT, section_id TEXT,
    prompt_tokens INTEGER NOT NULL DEFAULT 0, completion_tokens INTEGER NOT NULL DEFAULT 0,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    retry_attempt INTEGER, retry_reason TEXT, retry_delay_ms INTEGER,
    error TEXT, error_category TEXT, created_at TEXT NOT NULL
  )`));
  db.run(sql.raw(`CREATE TABLE dependencies (
    id TEXT PRIMARY KEY, orr_id TEXT NOT NULL REFERENCES orrs(id) ON DELETE CASCADE,
    section_id TEXT, name TEXT NOT NULL, type TEXT NOT NULL,
    direction TEXT NOT NULL DEFAULT 'outbound', criticality TEXT NOT NULL DEFAULT 'important',
    has_fallback INTEGER NOT NULL DEFAULT 0, fallback_description TEXT, notes TEXT,
    created_at TEXT NOT NULL
  )`));
  // incidents WITHOUT service_id
  db.run(sql.raw(`CREATE TABLE incidents (
    id TEXT PRIMARY KEY, title TEXT NOT NULL,
    team_id TEXT NOT NULL REFERENCES teams(id),
    service_name TEXT, incident_date TEXT, duration_minutes INTEGER,
    severity TEXT, detection_method TEXT, incident_type TEXT,
    steering_tier TEXT NOT NULL DEFAULT 'thorough',
    status TEXT NOT NULL DEFAULT 'DRAFT',
    created_by TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, published_at TEXT
  )`));
  db.run(sql.raw(`CREATE TABLE incident_sections (
    id TEXT PRIMARY KEY, incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    position INTEGER NOT NULL, title TEXT NOT NULL, prompts TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '', depth TEXT NOT NULL DEFAULT 'UNKNOWN',
    depth_rationale TEXT, prompt_responses TEXT NOT NULL DEFAULT '{}',
    flags TEXT NOT NULL DEFAULT '[]', conversation_snippet TEXT, updated_at TEXT NOT NULL
  )`));
  db.run(sql.raw(`CREATE TABLE timeline_events (
    id TEXT PRIMARY KEY, incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    position INTEGER NOT NULL, timestamp TEXT NOT NULL, description TEXT NOT NULL,
    evidence TEXT, actor TEXT, event_type TEXT NOT NULL DEFAULT 'other', created_at TEXT NOT NULL
  )`));
  db.run(sql.raw(`CREATE TABLE contributing_factors (
    id TEXT PRIMARY KEY, incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    category TEXT NOT NULL, description TEXT NOT NULL, context TEXT,
    is_systemic INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
  )`));
  db.run(sql.raw(`CREATE TABLE factor_event_links (
    factor_id TEXT NOT NULL REFERENCES contributing_factors(id) ON DELETE CASCADE,
    event_id TEXT NOT NULL REFERENCES timeline_events(id) ON DELETE CASCADE
  )`));
  db.run(sql.raw(`CREATE TABLE action_items (
    id TEXT PRIMARY KEY, practice_type TEXT NOT NULL, practice_id TEXT NOT NULL,
    title TEXT NOT NULL, owner TEXT, due_date TEXT, priority TEXT NOT NULL DEFAULT 'medium',
    type TEXT NOT NULL, contributing_factor_id TEXT, success_criteria TEXT, backlog_link TEXT,
    status TEXT NOT NULL DEFAULT 'open', created_at TEXT NOT NULL, completed_at TEXT
  )`));
  db.run(sql.raw(`CREATE TABLE cross_practice_suggestions (
    id TEXT PRIMARY KEY, source_practice_type TEXT NOT NULL, source_practice_id TEXT NOT NULL,
    target_practice_type TEXT NOT NULL, suggestion TEXT NOT NULL, rationale TEXT NOT NULL,
    linked_practice_id TEXT, linked_section_id TEXT, status TEXT NOT NULL DEFAULT 'suggested',
    created_at TEXT NOT NULL
  )`));

  return db;
}

function seedOldData(db: Db) {
  const now = new Date().toISOString();
  db.run(sql.raw(`INSERT INTO teams VALUES ('t1', 'Alpha Team', '${now}')`));
  db.run(sql.raw(`INSERT INTO users VALUES ('u1', 'Alice', 'alice@test.com', 'hash', 't1', 'ADMIN', 'local', '${now}')`));
  db.run(sql.raw(`INSERT INTO templates VALUES ('tpl1', 'Default', 1, '[]', 'u1', '${now}')`));

  // ORR with a service name (should get backfilled)
  db.run(sql.raw(`INSERT INTO orrs (id, service_name, team_id, template_version, status, steering_tier, created_at, updated_at)
    VALUES ('orr1', 'Payment Service', 't1', 'tpl1', 'IN_PROGRESS', 'thorough', '${now}', '${now}')`));

  // Second ORR with same service name (should reuse the same service)
  db.run(sql.raw(`INSERT INTO orrs (id, service_name, team_id, template_version, status, steering_tier, created_at, updated_at)
    VALUES ('orr2', 'Payment Service', 't1', 'tpl1', 'DRAFT', 'thorough', '${now}', '${now}')`));

  // Incident with a different service name
  db.run(sql.raw(`INSERT INTO incidents (id, title, team_id, service_name, status, steering_tier, created_by, created_at, updated_at)
    VALUES ('inc1', 'Outage', 't1', 'Auth Service', 'IN_PROGRESS', 'thorough', 'u1', '${now}', '${now}')`));
}

describe("migrate() on existing database", () => {
  let db: Db;

  beforeEach(() => {
    db = createOldSchemaDb();
    seedOldData(db);
  });

  test("does not crash on old schema", () => {
    expect(() => migrate(db)).not.toThrow();
  });

  test("adds service_id column to orrs", () => {
    migrate(db);
    const cols = db.all(sql.raw(`PRAGMA table_info(orrs)`)) as any[];
    expect(cols.some((c: any) => c.name === "service_id")).toBe(true);
  });

  test("adds service_id column to incidents", () => {
    migrate(db);
    const cols = db.all(sql.raw(`PRAGMA table_info(incidents)`)) as any[];
    expect(cols.some((c: any) => c.name === "service_id")).toBe(true);
  });

  test("creates services table", () => {
    migrate(db);
    const tables = db.all(sql.raw(`SELECT name FROM sqlite_master WHERE type='table' AND name='services'`)) as any[];
    expect(tables.length).toBe(1);
  });

  test("creates experiment_suggestions table", () => {
    migrate(db);
    const tables = db.all(sql.raw(`SELECT name FROM sqlite_master WHERE type='table' AND name='experiment_suggestions'`)) as any[];
    expect(tables.length).toBe(1);
  });

  test("backfills services from ORR service names", () => {
    migrate(db);
    const services = db.all(sql.raw(`SELECT * FROM services WHERE name = 'Payment Service'`)) as any[];
    expect(services.length).toBe(1);
    expect(services[0].team_id).toBe("t1");
  });

  test("backfills services from incident service names", () => {
    migrate(db);
    const services = db.all(sql.raw(`SELECT * FROM services WHERE name = 'Auth Service'`)) as any[];
    expect(services.length).toBe(1);
  });

  test("links ORRs to their backfilled service", () => {
    migrate(db);
    const orrs = db.all(sql.raw(`SELECT id, service_id FROM orrs ORDER BY id`)) as any[];
    // Both ORRs should point to the same service
    expect(orrs[0].service_id).toBeTruthy();
    expect(orrs[0].service_id).toBe(orrs[1].service_id);
  });

  test("links incidents to their backfilled service", () => {
    migrate(db);
    const inc = db.all(sql.raw(`SELECT service_id FROM incidents WHERE id = 'inc1'`)) as any[];
    expect(inc[0].service_id).toBeTruthy();
    // Should be a different service than the ORR one
    const orr = db.all(sql.raw(`SELECT service_id FROM orrs WHERE id = 'orr1'`)) as any[];
    expect(inc[0].service_id).not.toBe(orr[0].service_id);
  });

  test("creates indexes on service_id columns", () => {
    migrate(db);
    const indexes = db.all(sql.raw(`SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%service%'`)) as any[];
    const names = indexes.map((i: any) => i.name);
    expect(names).toContain("idx_orrs_service");
    expect(names).toContain("idx_incidents_service");
  });

  test("handles service names with apostrophes", () => {
    db.run(sql.raw(`INSERT INTO orrs (id, service_name, team_id, template_version, status, steering_tier, created_at, updated_at)
      VALUES ('orr3', 'O''Brien''s API', 't1', 'tpl1', 'DRAFT', 'thorough', '2024-01-01', '2024-01-01')`));
    expect(() => migrate(db)).not.toThrow();
    const svc = db.all(sql.raw(`SELECT * FROM services WHERE name = 'O''Brien''s API'`)) as any[];
    expect(svc.length).toBe(1);
  });

  test("is idempotent — running twice doesn't duplicate services", () => {
    migrate(db);
    const count1 = (db.all(sql.raw(`SELECT COUNT(*) as c FROM services`)) as any[])[0].c;
    migrate(db);
    const count2 = (db.all(sql.raw(`SELECT COUNT(*) as c FROM services`)) as any[])[0].c;
    expect(count2).toBe(count1);
  });

  test("existing data survives migration", () => {
    migrate(db);
    const orrs = db.all(sql.raw(`SELECT * FROM orrs`)) as any[];
    expect(orrs.length).toBe(2);
    expect(orrs.find((o: any) => o.id === "orr1")?.service_name).toBe("Payment Service");

    const incidents = db.all(sql.raw(`SELECT * FROM incidents`)) as any[];
    expect(incidents.length).toBe(1);
    expect(incidents[0].title).toBe("Outage");
  });
});
