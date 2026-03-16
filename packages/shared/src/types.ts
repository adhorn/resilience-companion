import type {
  ORRStatus,
  SectionDepth,
  SectionFlag,
  RiskSeverity,
  SessionStatus,
  TeachingMomentStatus,
  TeachingMomentSource,
  UserRole,
  AgentProfile,
} from "./constants.js";

// --- Core entities ---

export interface Team {
  id: string;
  name: string;
  createdAt: string; // ISO 8601
}

export interface User {
  id: string;
  name: string;
  email: string;
  teamId: string;
  role: UserRole;
  authProvider: "local" | "oidc";
  createdAt: string;
}

export interface ORR {
  id: string;
  serviceName: string;
  teamId: string;
  templateVersion: string;
  status: ORRStatus;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface Section {
  id: string;
  orrId: string;
  position: number;
  title: string;
  prompts: string[]; // customized from template
  content: string; // team's responses
  depth: SectionDepth;
  depthRationale: string | null;
  flags: SectionFlagEntry[];
  conversationSnippet: string | null; // last relevant AI exchange
  updatedAt: string;
  updatedBy: string | null;
}

export interface SectionFlagEntry {
  type: SectionFlag;
  note: string;
  severity?: RiskSeverity;  // RISK flags only
  deadline?: string;        // ISO date, RISK flags only
  createdAt: string;
}

export interface Session {
  id: string;
  orrId: string;
  userId: string;
  agentProfile: AgentProfile;
  summary: string | null;
  sectionsDiscussed: string[]; // section IDs
  status: SessionStatus;
  tokenUsage: number;
  startedAt: string;
  endedAt: string | null;
}

export interface SessionMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface TeachingMoment {
  id: string;
  title: string;
  content: string;
  source: TeachingMomentSource;
  sourceOrrId: string | null;
  attributedTo: string | null;
  status: TeachingMomentStatus;
  tags: string[];
  sectionTags: string[]; // match to template section titles
  systemPattern: string | null;
  failureMode: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CaseStudy {
  id: string;
  title: string;
  company: string;
  year: number | null;
  summary: string;
  sourceUrl: string | null;
  failureCategory: string;
  sectionTags: string[];
  lessons: string[];
  createdAt: string;
}

export interface ORRVersion {
  id: string;
  orrId: string;
  snapshot: object; // full ORR + sections JSON
  reason: string;
  createdAt: string;
}

export interface Template {
  id: string;
  name: string;
  isDefault: boolean;
  sections: TemplateSection[];
  createdBy: string | null;
  createdAt: string;
}

export interface TemplateSection {
  position: number;
  title: string;
  prompts: string[];
}

// --- API types ---

export interface ApiError {
  error: string;
  message: string;
}

export interface AuthTokens {
  token: string;
  user: Omit<User, "authProvider">;
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  teamName: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface CreateORRInput {
  serviceName: string;
  templateId?: string; // defaults to default template
}

export interface UpdateSectionInput {
  content?: string;
  prompts?: string[];
}

export interface SendMessageInput {
  content: string;
  sectionId?: string; // which section the conversation is about
}

// --- SSE event types ---

export type SSEEvent =
  | { type: "message_start"; messageId: string }
  | { type: "content_delta"; content: string }
  | { type: "tool_call"; tool: string; args: Record<string, unknown> }
  | { type: "tool_result"; tool: string; result: Record<string, unknown> }
  | { type: "section_updated"; sectionId: string; field: string }
  | { type: "session_renewed"; oldSessionId: string; newSessionId: string }
  | { type: "message_end"; tokenUsage: number }
  | { type: "error"; message: string };

// --- Dashboard types ---

export interface DashboardStats {
  totalOrrs: number;
  byStatus: Record<ORRStatus, number>;
  stale: number;
  aging: number;
  recentActivity: DashboardORRSummary[];
  totalTokens: number; // cumulative tokens across all sessions
}

export interface DashboardORRSummary {
  id: string;
  serviceName: string;
  status: ORRStatus;
  updatedAt: string;
  staleness: "fresh" | "aging" | "stale";
  coveragePercent: number; // sections with depth > UNKNOWN
}

// --- Flags aggregation types ---

export interface FlagWithContext extends SectionFlagEntry {
  orrId: string;
  serviceName: string;
  orrStatus: ORRStatus;
  sectionId: string;
  sectionTitle: string;
  sectionPosition: number;
  isOverdue: boolean;
}

export interface FlagsSummary {
  total: number;
  byType: Record<SectionFlag, number>;
  bySeverity: Record<RiskSeverity, number>;
  overdueCount: number;
}

export interface FlagsResponse {
  summary: FlagsSummary;
  flags: FlagWithContext[];
}
