/**
 * Postgres schema — mirrors schema.ts but uses pgTable instead of sqliteTable.
 * This is the production schema for multi-team deployments.
 *
 * NOT YET ACTIVE — the query layer still uses SQLite-specific APIs (.get(), .run()).
 * This file is the target for the Postgres migration (P2 phase 2).
 */
import { pgTable, text, integer, real, timestamp, boolean, serial } from "drizzle-orm/pg-core";

// --- Teams ---

export const teams = pgTable("teams", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: text("created_at").notNull(),
});

// --- Users ---

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  teamId: text("team_id")
    .notNull()
    .references(() => teams.id),
  role: text("role").notNull().default("MEMBER"),
  authProvider: text("auth_provider").notNull().default("local"),
  createdAt: text("created_at").notNull(),
});

// --- API Tokens (PATs for programmatic clients) ---

export const apiTokens = pgTable("api_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull(),
  tokenPrefix: text("token_prefix").notNull(),
  expiresAt: text("expires_at"),
  lastUsedAt: text("last_used_at"),
  revokedAt: text("revoked_at"),
  createdAt: text("created_at").notNull(),
});

// --- Templates ---

export const templates = pgTable("templates", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  sections: text("sections").notNull(), // JSON string
  createdBy: text("created_by").references(() => users.id),
  createdAt: text("created_at").notNull(),
});

// --- Services ---

export const services = pgTable("services", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  teamId: text("team_id")
    .notNull()
    .references(() => teams.id),
  description: text("description"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// --- ORRs ---

export const orrs = pgTable("orrs", {
  id: text("id").primaryKey(),
  serviceName: text("service_name").notNull(),
  serviceId: text("service_id").references(() => services.id),
  teamId: text("team_id")
    .notNull()
    .references(() => teams.id),
  templateVersion: text("template_version")
    .notNull()
    .references(() => templates.id),
  status: text("status").notNull().default("DRAFT"),
  repositoryPath: text("repository_path"),
  repositoryToken: text("repository_token"),
  repositoryLocalPath: text("repository_local_path"),
  steeringTier: text("steering_tier").notNull().default("thorough"),
  orrType: text("orr_type").notNull().default("service"),
  parentOrrId: text("parent_orr_id"),
  changeTypes: text("change_types").notNull().default("[]"),
  changeDescription: text("change_description"),
  terminationReason: text("termination_reason"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  completedAt: text("completed_at"),
});

// --- Sections ---

export const sections = pgTable("sections", {
  id: text("id").primaryKey(),
  orrId: text("orr_id")
    .notNull()
    .references(() => orrs.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  title: text("title").notNull(),
  prompts: text("prompts").notNull(), // JSON string
  content: text("content").notNull().default(""),
  depth: text("depth").notNull().default("UNKNOWN"),
  depthRationale: text("depth_rationale"),
  promptResponses: text("prompt_responses").notNull().default("{}"),
  flags: text("flags").notNull().default("[]"),
  conversationSnippet: text("conversation_snippet"),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by").references(() => users.id),
});

// --- Sessions ---

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  orrId: text("orr_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  agentProfile: text("agent_profile").notNull().default("REVIEW_FACILITATOR"),
  summary: text("summary"),
  discoveries: text("discoveries").notNull().default("[]"),
  sectionsDiscussed: text("sections_discussed").notNull().default("[]"),
  status: text("status").notNull().default("ACTIVE"),
  learningQuality: text("learning_quality"),
  engagementPattern: text("engagement_pattern"),
  tokenUsage: integer("token_usage").notNull().default(0),
  startedAt: text("started_at").notNull(),
  endedAt: text("ended_at"),
});

// --- Session Messages ---

export const sessionMessages = pgTable("session_messages", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  metadata: text("metadata"),
  createdAt: text("created_at").notNull(),
});

// --- Teaching Moments ---

export const teachingMoments = pgTable("teaching_moments", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  source: text("source").notNull().default("ORG"),
  sourceOrrId: text("source_orr_id").references(() => orrs.id),
  attributedTo: text("attributed_to"),
  status: text("status").notNull().default("DRAFT"),
  tags: text("tags").notNull().default("[]"),
  sectionTags: text("section_tags").notNull().default("[]"),
  systemPattern: text("system_pattern"),
  failureMode: text("failure_mode"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// --- Case Studies ---

export const caseStudies = pgTable("case_studies", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  company: text("company").notNull(),
  year: integer("year"),
  summary: text("summary").notNull(),
  sourceUrl: text("source_url"),
  failureCategory: text("failure_category").notNull(),
  sectionTags: text("section_tags").notNull().default("[]"),
  lessons: text("lessons").notNull().default("[]"),
  createdAt: text("created_at").notNull(),
});

// --- Dependencies ---

export const dependencies = pgTable("dependencies", {
  id: text("id").primaryKey(),
  orrId: text("orr_id")
    .notNull()
    .references(() => orrs.id, { onDelete: "cascade" }),
  sectionId: text("section_id"),
  name: text("name").notNull(),
  type: text("type").notNull(),
  direction: text("direction").notNull().default("outbound"),
  criticality: text("criticality").notNull().default("important"),
  hasFallback: integer("has_fallback").notNull().default(0),
  fallbackDescription: text("fallback_description"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
});

// --- Incidents ---

export const incidents = pgTable("incidents", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  teamId: text("team_id")
    .notNull()
    .references(() => teams.id),
  serviceName: text("service_name"),
  serviceId: text("service_id").references(() => services.id),
  incidentDate: text("incident_date"),
  durationMinutes: integer("duration_minutes"),
  severity: text("severity"),
  detectionMethod: text("detection_method"),
  incidentType: text("incident_type"),
  steeringTier: text("steering_tier").notNull().default("thorough"),
  status: text("status").notNull().default("DRAFT"),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  publishedAt: text("published_at"),
});

// --- Incident Sections ---

export const incidentSections = pgTable("incident_sections", {
  id: text("id").primaryKey(),
  incidentId: text("incident_id")
    .notNull()
    .references(() => incidents.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  title: text("title").notNull(),
  prompts: text("prompts").notNull(),
  content: text("content").notNull().default(""),
  depth: text("depth").notNull().default("UNKNOWN"),
  depthRationale: text("depth_rationale"),
  promptResponses: text("prompt_responses").notNull().default("{}"),
  flags: text("flags").notNull().default("[]"),
  conversationSnippet: text("conversation_snippet"),
  updatedAt: text("updated_at").notNull(),
});

// --- Timeline Events ---

export const timelineEvents = pgTable("timeline_events", {
  id: text("id").primaryKey(),
  incidentId: text("incident_id")
    .notNull()
    .references(() => incidents.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  timestamp: text("timestamp").notNull(),
  description: text("description").notNull(),
  evidence: text("evidence"),
  actor: text("actor"),
  eventType: text("event_type").notNull().default("other"),
  createdAt: text("created_at").notNull(),
});

// --- Contributing Factors ---

export const contributingFactors = pgTable("contributing_factors", {
  id: text("id").primaryKey(),
  incidentId: text("incident_id")
    .notNull()
    .references(() => incidents.id, { onDelete: "cascade" }),
  category: text("category").notNull(),
  description: text("description").notNull(),
  context: text("context"),
  isSystemic: boolean("is_systemic").notNull().default(false),
  createdAt: text("created_at").notNull(),
});

// --- Factor-Event Links ---

export const factorEventLinks = pgTable("factor_event_links", {
  factorId: text("factor_id")
    .notNull()
    .references(() => contributingFactors.id, { onDelete: "cascade" }),
  eventId: text("event_id")
    .notNull()
    .references(() => timelineEvents.id, { onDelete: "cascade" }),
});

// --- Action Items ---

export const actionItems = pgTable("action_items", {
  id: text("id").primaryKey(),
  practiceType: text("practice_type").notNull(),
  practiceId: text("practice_id").notNull(),
  title: text("title").notNull(),
  owner: text("owner"),
  dueDate: text("due_date"),
  priority: text("priority").notNull().default("medium"),
  type: text("type").notNull(),
  contributingFactorId: text("contributing_factor_id"),
  successCriteria: text("success_criteria"),
  backlogLink: text("backlog_link"),
  status: text("status").notNull().default("open"),
  createdAt: text("created_at").notNull(),
  completedAt: text("completed_at"),
});

// --- Cross-Practice Suggestions ---

export const crossPracticeSuggestions = pgTable("cross_practice_suggestions", {
  id: text("id").primaryKey(),
  sourcePracticeType: text("source_practice_type").notNull(),
  sourcePracticeId: text("source_practice_id").notNull(),
  targetPracticeType: text("target_practice_type").notNull(),
  suggestion: text("suggestion").notNull(),
  rationale: text("rationale").notNull(),
  linkedPracticeId: text("linked_practice_id"),
  linkedSectionId: text("linked_section_id"),
  status: text("status").notNull().default("suggested"),
  createdAt: text("created_at").notNull(),
});

// --- Discoveries ---

export const discoveries = pgTable("discoveries", {
  id: text("id").primaryKey(),
  practiceType: text("practice_type").notNull(),
  practiceId: text("practice_id").notNull(),
  sectionId: text("section_id"),
  sessionId: text("session_id").notNull(),
  text: text("text").notNull(),
  source: text("source").notNull().default("conversation"),
  createdAt: text("created_at").notNull(),
});

// --- Experiment Suggestions ---

export const experimentSuggestions = pgTable("experiment_suggestions", {
  id: text("id").primaryKey(),
  serviceId: text("service_id")
    .notNull()
    .references(() => services.id),
  sourcePracticeType: text("source_practice_type").notNull(),
  sourcePracticeId: text("source_practice_id").notNull(),
  sourceSectionId: text("source_section_id"),
  type: text("type").notNull(),
  title: text("title").notNull(),
  hypothesis: text("hypothesis").notNull(),
  rationale: text("rationale").notNull(),
  priority: text("priority").notNull(),
  priorityReasoning: text("priority_reasoning").notNull(),
  blastRadiusNotes: text("blast_radius_notes"),
  status: text("status").notNull().default("suggested"),
  dismissedReason: text("dismissed_reason"),
  completedAt: text("completed_at"),
  completedNotes: text("completed_notes"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// --- ORR Versions ---

export const orrVersions = pgTable("orr_versions", {
  id: text("id").primaryKey(),
  orrId: text("orr_id")
    .notNull()
    .references(() => orrs.id, { onDelete: "cascade" }),
  snapshot: text("snapshot").notNull(),
  reason: text("reason").notNull(),
  createdAt: text("created_at").notNull(),
});
