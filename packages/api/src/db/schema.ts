import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

// --- Teams ---

export const teams = sqliteTable("teams", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: text("created_at").notNull(),
});

// --- Users ---

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  teamId: text("team_id")
    .notNull()
    .references(() => teams.id),
  role: text("role", { enum: ["ADMIN", "MEMBER"] })
    .notNull()
    .default("MEMBER"),
  authProvider: text("auth_provider", { enum: ["local", "oidc"] })
    .notNull()
    .default("local"),
  createdAt: text("created_at").notNull(),
});

// --- Templates ---

export const templates = sqliteTable("templates", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  sections: text("sections", { mode: "json" }).notNull(), // TemplateSection[]
  createdBy: text("created_by").references(() => users.id),
  createdAt: text("created_at").notNull(),
});

// --- ORRs ---

export const orrs = sqliteTable("orrs", {
  id: text("id").primaryKey(),
  serviceName: text("service_name").notNull(),
  serviceId: text("service_id").references(() => services.id), // nullable during migration
  teamId: text("team_id")
    .notNull()
    .references(() => teams.id),
  templateVersion: text("template_version")
    .notNull()
    .references(() => templates.id),
  status: text("status", {
    enum: ["DRAFT", "IN_PROGRESS", "COMPLETE", "ARCHIVED"],
  })
    .notNull()
    .default("DRAFT"),
  repositoryPath: text("repository_path"), // git URL (e.g. https://github.com/org/repo)
  repositoryToken: text("repository_token"), // encrypted PAT for private repos
  repositoryLocalPath: text("repository_local_path"), // local clone path (set by backend after clone)
  steeringTier: text("steering_tier", { enum: ["standard", "thorough", "rigorous"] })
    .notNull()
    .default("thorough"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  completedAt: text("completed_at"),
});

// --- Sections ---

export const sections = sqliteTable("sections", {
  id: text("id").primaryKey(),
  orrId: text("orr_id")
    .notNull()
    .references(() => orrs.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  title: text("title").notNull(),
  prompts: text("prompts", { mode: "json" }).notNull(), // string[]
  content: text("content").notNull().default(""),
  depth: text("depth", {
    enum: ["UNKNOWN", "SURFACE", "MODERATE", "DEEP"],
  })
    .notNull()
    .default("UNKNOWN"),
  depthRationale: text("depth_rationale"),
  promptResponses: text("prompt_responses", { mode: "json" }).notNull().default("{}"), // Record<number, string>
  flags: text("flags", { mode: "json" }).notNull().default("[]"), // SectionFlagEntry[]
  conversationSnippet: text("conversation_snippet"),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by").references(() => users.id),
});

// --- Sessions ---

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  orrId: text("orr_id").notNull(), // polymorphic: holds orrId or incidentId
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  agentProfile: text("agent_profile", {
    enum: [
      "REVIEW_FACILITATOR",
      "INCIDENT_LEARNING_FACILITATOR",
      "SESSION_ASSISTANT",
      "TRANSCRIPT_PROCESSOR",
      "DRIFT_ANALYST",
      "PREP_BRIEF_GENERATOR",
    ],
  })
    .notNull()
    .default("REVIEW_FACILITATOR"),
  summary: text("summary"),
  sectionsDiscussed: text("sections_discussed", { mode: "json" }).notNull().default("[]"), // string[]
  status: text("status", { enum: ["ACTIVE", "COMPLETED"] })
    .notNull()
    .default("ACTIVE"),
  tokenUsage: integer("token_usage").notNull().default(0),
  startedAt: text("started_at").notNull(),
  endedAt: text("ended_at"),
});

// --- Session Messages ---

export const sessionMessages = sqliteTable("session_messages", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  content: text("content").notNull(),
  metadata: text("metadata", { mode: "json" }), // tool calls audit trail for assistant messages
  createdAt: text("created_at").notNull(),
});

// --- Teaching Moments ---

export const teachingMoments = sqliteTable("teaching_moments", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  source: text("source", { enum: ["ORG", "PUBLIC"] })
    .notNull()
    .default("ORG"),
  sourceOrrId: text("source_orr_id").references(() => orrs.id),
  attributedTo: text("attributed_to"),
  status: text("status", { enum: ["DRAFT", "PUBLISHED"] })
    .notNull()
    .default("DRAFT"),
  tags: text("tags", { mode: "json" }).notNull().default("[]"), // string[]
  sectionTags: text("section_tags", { mode: "json" }).notNull().default("[]"), // string[]
  systemPattern: text("system_pattern"),
  failureMode: text("failure_mode"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// --- Case Studies ---

export const caseStudies = sqliteTable("case_studies", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  company: text("company").notNull(),
  year: integer("year"),
  summary: text("summary").notNull(),
  sourceUrl: text("source_url"),
  failureCategory: text("failure_category").notNull(),
  sectionTags: text("section_tags", { mode: "json" }).notNull().default("[]"), // string[]
  lessons: text("lessons", { mode: "json" }).notNull().default("[]"), // string[]
  createdAt: text("created_at").notNull(),
});

// --- Agent Traces ---

export const agentTraces = sqliteTable("agent_traces", {
  id: text("id").primaryKey(),
  orrId: text("orr_id").notNull(), // polymorphic: holds orrId or incidentId
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id, { onDelete: "cascade" }),
  messageId: text("message_id"),
  model: text("model").notNull(),
  fallbackModel: text("fallback_model"),
  totalTokens: integer("total_tokens").notNull().default(0),
  promptTokens: integer("prompt_tokens").notNull().default(0),
  completionTokens: integer("completion_tokens").notNull().default(0),
  iterationCount: integer("iteration_count").notNull().default(0),
  toolCallsCount: integer("tool_calls_count").notNull().default(0),
  retryCount: integer("retry_count").notNull().default(0),
  fallbackUsed: integer("fallback_used").notNull().default(0),
  error: text("error"),
  errorCategory: text("error_category"),
  durationMs: integer("duration_ms").notNull().default(0),
  createdAt: text("created_at").notNull(),
});

// --- Agent Spans ---

export const agentSpans = sqliteTable("agent_spans", {
  id: text("id").primaryKey(),
  traceId: text("trace_id")
    .notNull()
    .references(() => agentTraces.id, { onDelete: "cascade" }),
  type: text("type", { enum: ["llm_call", "tool_call", "retry", "fallback"] }).notNull(),
  iteration: integer("iteration").notNull().default(0),
  model: text("model"),
  toolName: text("tool_name"),
  toolArgs: text("tool_args"),
  toolResultSummary: text("tool_result_summary"),
  sectionId: text("section_id"),
  promptTokens: integer("prompt_tokens").notNull().default(0),
  completionTokens: integer("completion_tokens").notNull().default(0),
  durationMs: integer("duration_ms").notNull().default(0),
  retryAttempt: integer("retry_attempt"),
  retryReason: text("retry_reason"),
  retryDelayMs: integer("retry_delay_ms"),
  error: text("error"),
  errorCategory: text("error_category"),
  createdAt: text("created_at").notNull(),
});

// --- Dependencies (discovered by agent during conversation) ---

export const dependencies = sqliteTable("dependencies", {
  id: text("id").primaryKey(),
  orrId: text("orr_id")
    .notNull()
    .references(() => orrs.id, { onDelete: "cascade" }),
  sectionId: text("section_id"),
  name: text("name").notNull(),
  type: text("type", {
    enum: [
      "database", "cache", "queue", "api", "storage",
      "cdn", "dns", "auth", "internal_service", "external_service", "infrastructure", "other",
    ],
  }).notNull(),
  direction: text("direction", { enum: ["inbound", "outbound", "both"] }).notNull().default("outbound"),
  criticality: text("criticality", { enum: ["critical", "important", "optional"] }).notNull().default("important"),
  hasFallback: integer("has_fallback").notNull().default(0),
  fallbackDescription: text("fallback_description"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
});

// --- Incidents ---

export const incidents = sqliteTable("incidents", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  teamId: text("team_id")
    .notNull()
    .references(() => teams.id),
  serviceName: text("service_name"),
  serviceId: text("service_id").references(() => services.id), // nullable during migration
  incidentDate: text("incident_date"),
  durationMinutes: integer("duration_minutes"),
  severity: text("severity", { enum: ["HIGH", "MEDIUM", "LOW"] }),
  detectionMethod: text("detection_method"),
  incidentType: text("incident_type", {
    enum: ["OUTAGE", "DEGRADATION", "NEAR_MISS", "SURPRISING_BEHAVIOR"],
  }),
  steeringTier: text("steering_tier", { enum: ["standard", "thorough", "rigorous"] })
    .notNull()
    .default("thorough"),
  status: text("status", {
    enum: ["DRAFT", "IN_PROGRESS", "IN_REVIEW", "PUBLISHED", "ARCHIVED"],
  })
    .notNull()
    .default("DRAFT"),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  publishedAt: text("published_at"),
});

// --- Incident Sections ---

export const incidentSections = sqliteTable("incident_sections", {
  id: text("id").primaryKey(),
  incidentId: text("incident_id")
    .notNull()
    .references(() => incidents.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  title: text("title").notNull(),
  prompts: text("prompts", { mode: "json" }).notNull(), // string[]
  content: text("content").notNull().default(""),
  depth: text("depth", {
    enum: ["UNKNOWN", "SURFACE", "MODERATE", "DEEP"],
  })
    .notNull()
    .default("UNKNOWN"),
  depthRationale: text("depth_rationale"),
  promptResponses: text("prompt_responses", { mode: "json" }).notNull().default("{}"),
  flags: text("flags", { mode: "json" }).notNull().default("[]"),
  conversationSnippet: text("conversation_snippet"),
  updatedAt: text("updated_at").notNull(),
});

// --- Timeline Events ---

export const timelineEvents = sqliteTable("timeline_events", {
  id: text("id").primaryKey(),
  incidentId: text("incident_id")
    .notNull()
    .references(() => incidents.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  timestamp: text("timestamp").notNull(),
  description: text("description").notNull(),
  evidence: text("evidence"),
  actor: text("actor"),
  eventType: text("event_type", {
    enum: ["detection", "escalation", "action", "communication", "resolution", "other"],
  })
    .notNull()
    .default("other"),
  createdAt: text("created_at").notNull(),
});

// --- Contributing Factors ---

export const contributingFactors = sqliteTable("contributing_factors", {
  id: text("id").primaryKey(),
  incidentId: text("incident_id")
    .notNull()
    .references(() => incidents.id, { onDelete: "cascade" }),
  category: text("category", {
    enum: ["technical", "process", "organizational", "human_factors", "communication", "knowledge"],
  }).notNull(),
  description: text("description").notNull(),
  context: text("context"),
  isSystemic: integer("is_systemic", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
});

// --- Factor-Event Links ---

export const factorEventLinks = sqliteTable("factor_event_links", {
  factorId: text("factor_id")
    .notNull()
    .references(() => contributingFactors.id, { onDelete: "cascade" }),
  eventId: text("event_id")
    .notNull()
    .references(() => timelineEvents.id, { onDelete: "cascade" }),
});

// --- Action Items (shared across practices) ---

export const actionItems = sqliteTable("action_items", {
  id: text("id").primaryKey(),
  practiceType: text("practice_type", { enum: ["orr", "incident"] }).notNull(),
  practiceId: text("practice_id").notNull(),
  title: text("title").notNull(),
  owner: text("owner"),
  dueDate: text("due_date"),
  priority: text("priority", { enum: ["high", "medium", "low"] }).notNull().default("medium"),
  type: text("type", { enum: ["technical", "process", "organizational", "learning"] }).notNull(),
  contributingFactorId: text("contributing_factor_id"),
  successCriteria: text("success_criteria"),
  backlogLink: text("backlog_link"),
  status: text("status", { enum: ["open", "in_progress", "done"] }).notNull().default("open"),
  createdAt: text("created_at").notNull(),
  completedAt: text("completed_at"),
});

// --- Cross-Practice Suggestions (shared) ---

export const crossPracticeSuggestions = sqliteTable("cross_practice_suggestions", {
  id: text("id").primaryKey(),
  sourcePracticeType: text("source_practice_type", { enum: ["orr", "incident"] }).notNull(),
  sourcePracticeId: text("source_practice_id").notNull(),
  targetPracticeType: text("target_practice_type", {
    enum: ["chaos_engineering", "load_testing", "orr", "incident_analysis", "gameday"],
  }).notNull(),
  suggestion: text("suggestion").notNull(),
  rationale: text("rationale").notNull(),
  linkedPracticeId: text("linked_practice_id"),
  linkedSectionId: text("linked_section_id"),
  status: text("status", { enum: ["suggested", "accepted", "dismissed"] })
    .notNull()
    .default("suggested"),
  createdAt: text("created_at").notNull(),
});

// --- Services (first-class entity connecting all practices) ---

export const services = sqliteTable("services", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  teamId: text("team_id")
    .notNull()
    .references(() => teams.id),
  description: text("description"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// --- Experiment Suggestions (chaos experiments, load tests, gamedays) ---

export const experimentSuggestions = sqliteTable("experiment_suggestions", {
  id: text("id").primaryKey(),
  serviceId: text("service_id")
    .notNull()
    .references(() => services.id),
  sourcePracticeType: text("source_practice_type", { enum: ["orr", "incident"] }).notNull(),
  sourcePracticeId: text("source_practice_id").notNull(),
  sourceSectionId: text("source_section_id"),
  type: text("type", { enum: ["chaos_experiment", "load_test", "gameday"] }).notNull(),
  title: text("title").notNull(),
  hypothesis: text("hypothesis").notNull(),
  rationale: text("rationale").notNull(),
  priority: text("priority", { enum: ["critical", "high", "medium", "low"] }).notNull(),
  priorityReasoning: text("priority_reasoning").notNull(),
  blastRadiusNotes: text("blast_radius_notes"),
  status: text("status", {
    enum: ["suggested", "accepted", "scheduled", "completed", "dismissed"],
  })
    .notNull()
    .default("suggested"),
  dismissedReason: text("dismissed_reason"),
  completedAt: text("completed_at"),
  completedNotes: text("completed_notes"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// --- ORR Versions (snapshots) ---

export const orrVersions = sqliteTable("orr_versions", {
  id: text("id").primaryKey(),
  orrId: text("orr_id")
    .notNull()
    .references(() => orrs.id, { onDelete: "cascade" }),
  snapshot: text("snapshot", { mode: "json" }).notNull(), // full ORR + sections
  reason: text("reason").notNull(),
  createdAt: text("created_at").notNull(),
});
