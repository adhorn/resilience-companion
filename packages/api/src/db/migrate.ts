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

  // Services must be created before orrs (orrs.service_id references services)
  db.run(sql`CREATE TABLE IF NOT EXISTS services (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    team_id TEXT NOT NULL REFERENCES teams(id),
    description TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);

  db.run(sql`CREATE TABLE IF NOT EXISTS orrs (
    id TEXT PRIMARY KEY,
    service_name TEXT NOT NULL,
    service_id TEXT REFERENCES services(id),
    team_id TEXT NOT NULL REFERENCES teams(id),
    template_version TEXT NOT NULL REFERENCES templates(id),
    status TEXT NOT NULL DEFAULT 'DRAFT',
    repository_path TEXT,
    repository_token TEXT,
    repository_local_path TEXT,
    steering_tier TEXT NOT NULL DEFAULT 'thorough',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT
  )`);

  db.run(sql`CREATE TABLE IF NOT EXISTS sections (
    id TEXT PRIMARY KEY,
    orr_id TEXT NOT NULL REFERENCES orrs(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    title TEXT NOT NULL,
    prompts TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    depth TEXT NOT NULL DEFAULT 'UNKNOWN',
    depth_rationale TEXT,
    prompt_responses TEXT NOT NULL DEFAULT '{}',
    flags TEXT NOT NULL DEFAULT '[]',
    conversation_snippet TEXT,
    updated_at TEXT NOT NULL,
    updated_by TEXT REFERENCES users(id)
  )`);

  db.run(sql`CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    orr_id TEXT NOT NULL,
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
    metadata TEXT,
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
    orr_id TEXT NOT NULL,
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

  // --- Incident Analysis tables ---

  db.run(sql`CREATE TABLE IF NOT EXISTS incidents (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    team_id TEXT NOT NULL REFERENCES teams(id),
    service_name TEXT,
    service_id TEXT REFERENCES services(id),
    incident_date TEXT,
    duration_minutes INTEGER,
    severity TEXT,
    detection_method TEXT,
    incident_type TEXT,
    steering_tier TEXT NOT NULL DEFAULT 'thorough',
    status TEXT NOT NULL DEFAULT 'DRAFT',
    created_by TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    published_at TEXT
  )`);

  db.run(sql`CREATE TABLE IF NOT EXISTS incident_sections (
    id TEXT PRIMARY KEY,
    incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    title TEXT NOT NULL,
    prompts TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    depth TEXT NOT NULL DEFAULT 'UNKNOWN',
    depth_rationale TEXT,
    prompt_responses TEXT NOT NULL DEFAULT '{}',
    flags TEXT NOT NULL DEFAULT '[]',
    conversation_snippet TEXT,
    updated_at TEXT NOT NULL
  )`);

  db.run(sql`CREATE TABLE IF NOT EXISTS timeline_events (
    id TEXT PRIMARY KEY,
    incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    timestamp TEXT NOT NULL,
    description TEXT NOT NULL,
    evidence TEXT,
    actor TEXT,
    event_type TEXT NOT NULL DEFAULT 'other',
    created_at TEXT NOT NULL
  )`);

  db.run(sql`CREATE TABLE IF NOT EXISTS contributing_factors (
    id TEXT PRIMARY KEY,
    incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    context TEXT,
    is_systemic INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )`);

  db.run(sql`CREATE TABLE IF NOT EXISTS factor_event_links (
    factor_id TEXT NOT NULL REFERENCES contributing_factors(id) ON DELETE CASCADE,
    event_id TEXT NOT NULL REFERENCES timeline_events(id) ON DELETE CASCADE
  )`);

  // --- Shared cross-practice tables ---

  db.run(sql`CREATE TABLE IF NOT EXISTS action_items (
    id TEXT PRIMARY KEY,
    practice_type TEXT NOT NULL,
    practice_id TEXT NOT NULL,
    title TEXT NOT NULL,
    owner TEXT,
    due_date TEXT,
    priority TEXT NOT NULL DEFAULT 'medium',
    type TEXT NOT NULL,
    contributing_factor_id TEXT,
    success_criteria TEXT,
    backlog_link TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    created_at TEXT NOT NULL,
    completed_at TEXT
  )`);

  db.run(sql`CREATE TABLE IF NOT EXISTS cross_practice_suggestions (
    id TEXT PRIMARY KEY,
    source_practice_type TEXT NOT NULL,
    source_practice_id TEXT NOT NULL,
    target_practice_type TEXT NOT NULL,
    suggestion TEXT NOT NULL,
    rationale TEXT NOT NULL,
    linked_practice_id TEXT,
    linked_section_id TEXT,
    status TEXT NOT NULL DEFAULT 'suggested',
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

  // --- Experiment Suggestions ---

  db.run(sql`CREATE TABLE IF NOT EXISTS experiment_suggestions (
    id TEXT PRIMARY KEY,
    service_id TEXT NOT NULL REFERENCES services(id),
    source_practice_type TEXT NOT NULL,
    source_practice_id TEXT NOT NULL,
    source_section_id TEXT,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    hypothesis TEXT NOT NULL,
    rationale TEXT NOT NULL,
    priority TEXT NOT NULL,
    priority_reasoning TEXT NOT NULL,
    blast_radius_notes TEXT,
    status TEXT NOT NULL DEFAULT 'suggested',
    dismissed_reason TEXT,
    completed_at TEXT,
    completed_notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);

  // --- Indexes ---
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_dependencies_orr ON dependencies(orr_id)`);
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_incidents_team ON incidents(team_id)`);
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_incident_sections_incident ON incident_sections(incident_id)`);
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_timeline_events_incident ON timeline_events(incident_id)`);
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_contributing_factors_incident ON contributing_factors(incident_id)`);
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_action_items_practice ON action_items(practice_type, practice_id)`);
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_cross_practice_source ON cross_practice_suggestions(source_practice_type, source_practice_id)`);
  db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_services_team_name ON services(team_id, name)`);
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_experiment_suggestions_service ON experiment_suggestions(service_id)`);
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_experiment_suggestions_source ON experiment_suggestions(source_practice_type, source_practice_id)`);

  // Backward-compat ALTERs for existing databases that were created before
  // these columns were added to the CREATE TABLE statements above.
  const migrations: [string, string, string][] = [
    ["orrs", "repository_path", "TEXT"],
    ["orrs", "repository_token", "TEXT"],
    ["orrs", "repository_local_path", "TEXT"],
    ["orrs", "steering_tier", "TEXT NOT NULL DEFAULT 'thorough'"],
    ["sections", "prompt_responses", "TEXT NOT NULL DEFAULT '{}'"],
    ["session_messages", "metadata", "TEXT"],
    ["orrs", "service_id", "TEXT REFERENCES services(id)"],
    ["incidents", "service_id", "TEXT REFERENCES services(id)"],
  ];
  for (const [table, col, type] of migrations) {
    try {
      db.run(sql.raw(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`));
    } catch (_) {
      // Column already exists — expected for fresh DBs
    }
  }

  // These indexes depend on service_id which may have just been added via ALTER TABLE above
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_orrs_service ON orrs(service_id)`);
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_incidents_service ON incidents(service_id)`);

  // Backfill: auto-create services from existing serviceName values and link them.
  // Idempotent — safe to run on every startup.
  try {
    const now = new Date().toISOString();

    const backfillTable = (table: string) => {
      const rows = db.all(sql.raw(
        `SELECT DISTINCT team_id, service_name FROM ${table} WHERE service_id IS NULL AND service_name IS NOT NULL`
      )) as any[];
      for (const row of rows) {
        const existing = db.all(sql`SELECT id FROM services WHERE team_id = ${row.team_id} AND name = ${row.service_name}`) as any[];
        let serviceId: string;
        if (existing.length > 0) {
          serviceId = existing[0].id;
        } else {
          serviceId = `svc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
          db.run(sql`INSERT INTO services (id, name, team_id, created_at, updated_at) VALUES (${serviceId}, ${row.service_name}, ${row.team_id}, ${now}, ${now})`);
        }
        db.run(sql.raw(
          `UPDATE ${table} SET service_id = '${serviceId.replace(/'/g, "''")}' WHERE team_id = '${row.team_id.replace(/'/g, "''")}' AND service_name = '${row.service_name.replace(/'/g, "''")}' AND service_id IS NULL`
        ));
      }
    };

    backfillTable("orrs");
    backfillTable("incidents");
  } catch (_) {
    // Backfill is best-effort — don't block startup
  }

  // Indexes for common trace queries
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_agent_traces_orr ON agent_traces(orr_id)`);
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_agent_traces_session ON agent_traces(session_id)`);
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_agent_spans_trace ON agent_spans(trace_id)`);
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_agent_spans_type ON agent_spans(type)`);
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_agent_spans_tool ON agent_spans(tool_name)`);

  // Fix session_messages FK if it points to sessions_old (caused by prior rename migration).
  // Also remove FK constraint from sessions.orr_id so it can hold incidentIds too.
  try {
    const smFks = db.all(sql.raw(`PRAGMA foreign_key_list(session_messages)`)) as any[];
    const hasBrokenFk = smFks.some((fk: any) => fk.table === "sessions_old");

    const sessFks = db.all(sql.raw(`PRAGMA foreign_key_list(sessions)`)) as any[];
    const hasOrrFk = sessFks.some((fk: any) => fk.table === "orrs" && fk.from === "orr_id");

    // Check all tables that might have broken FKs from prior renames
    const atFks = db.all(sql.raw(`PRAGMA foreign_key_list(agent_traces)`)) as any[];
    const atBroken = atFks.some((fk: any) => fk.table !== "sessions" || (fk.from === "orr_id" && fk.table === "orrs"));

    const asFks = db.all(sql.raw(`PRAGMA foreign_key_list(agent_spans)`)) as any[];
    const asBroken = asFks.some((fk: any) => fk.table !== "agent_traces");

    if (hasBrokenFk || hasOrrFk || atBroken || asBroken) {
      db.run(sql.raw(`PRAGMA foreign_keys = OFF`));
      db.run(sql.raw(`BEGIN TRANSACTION`));

      // Recreate tables bottom-up (drop dependents first, then recreate in order)
      // 1. Drop dependents
      if (asBroken) {
        db.run(sql.raw(`DROP TABLE IF EXISTS _as_bak`));
        db.run(sql.raw(`ALTER TABLE agent_spans RENAME TO _as_bak`));
      }
      if (atBroken) {
        db.run(sql.raw(`DROP TABLE IF EXISTS _at_bak`));
        db.run(sql.raw(`ALTER TABLE agent_traces RENAME TO _at_bak`));
      }
      if (hasBrokenFk) {
        db.run(sql.raw(`DROP TABLE IF EXISTS _sm_bak`));
        db.run(sql.raw(`ALTER TABLE session_messages RENAME TO _sm_bak`));
      }
      if (hasOrrFk) {
        db.run(sql.raw(`DROP TABLE IF EXISTS _sess_bak`));
        db.run(sql.raw(`ALTER TABLE sessions RENAME TO _sess_bak`));
      }

      // 2. Recreate in order (parent tables first)
      if (hasOrrFk) {
        db.run(sql.raw(`CREATE TABLE sessions (
          id TEXT PRIMARY KEY, orr_id TEXT NOT NULL,
          user_id TEXT NOT NULL REFERENCES users(id),
          agent_profile TEXT NOT NULL DEFAULT 'REVIEW_FACILITATOR',
          summary TEXT, sections_discussed TEXT NOT NULL DEFAULT '[]',
          status TEXT NOT NULL DEFAULT 'ACTIVE', token_usage INTEGER NOT NULL DEFAULT 0,
          started_at TEXT NOT NULL, ended_at TEXT
        )`));
        db.run(sql.raw(`INSERT INTO sessions SELECT * FROM _sess_bak`));
        db.run(sql.raw(`DROP TABLE _sess_bak`));
      }
      if (hasBrokenFk) {
        db.run(sql.raw(`CREATE TABLE session_messages (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
          role TEXT NOT NULL, content TEXT NOT NULL, metadata TEXT, created_at TEXT NOT NULL
        )`));
        db.run(sql.raw(`INSERT INTO session_messages SELECT id, session_id, role, content, metadata, created_at FROM _sm_bak`));
        db.run(sql.raw(`DROP TABLE _sm_bak`));
      }
      if (atBroken) {
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
        db.run(sql.raw(`INSERT INTO agent_traces SELECT * FROM _at_bak`));
        db.run(sql.raw(`DROP TABLE _at_bak`));
      }
      if (asBroken) {
        db.run(sql.raw(`CREATE TABLE agent_spans (
          id TEXT PRIMARY KEY,
          trace_id TEXT NOT NULL REFERENCES agent_traces(id) ON DELETE CASCADE,
          type TEXT NOT NULL, iteration INTEGER NOT NULL DEFAULT 0,
          model TEXT, tool_name TEXT, tool_args TEXT, tool_result_summary TEXT, section_id TEXT,
          prompt_tokens INTEGER NOT NULL DEFAULT 0, completion_tokens INTEGER NOT NULL DEFAULT 0,
          duration_ms INTEGER NOT NULL DEFAULT 0,
          retry_attempt INTEGER, retry_reason TEXT, retry_delay_ms INTEGER,
          error TEXT, error_category TEXT, created_at TEXT NOT NULL
        )`));
        db.run(sql.raw(`INSERT INTO agent_spans SELECT * FROM _as_bak`));
        db.run(sql.raw(`DROP TABLE _as_bak`));
      }

      db.run(sql.raw(`COMMIT`));
      db.run(sql.raw(`PRAGMA foreign_keys = ON`));
    }
  } catch (_) {
    try { db.run(sql.raw(`ROLLBACK`)); } catch (__) { /* ignore */ }
    try { db.run(sql.raw(`PRAGMA foreign_keys = ON`)); } catch (__) { /* ignore */ }
  }
}
