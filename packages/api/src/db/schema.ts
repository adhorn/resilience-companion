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
  orrId: text("orr_id")
    .notNull()
    .references(() => orrs.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  agentProfile: text("agent_profile", {
    enum: [
      "REVIEW_FACILITATOR",
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
