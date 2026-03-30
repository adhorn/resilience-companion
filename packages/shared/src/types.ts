import type {
  ORRType,
  ChangeType,
  ORRStatus,
  SectionDepth,
  SectionFlag,
  RiskSeverity,
  FlagStatus,
  SessionStatus,
  TeachingMomentStatus,
  TeachingMomentSource,
  UserRole,
  AgentProfile,
  PracticeType,
  IncidentStatus,
  IncidentSeverity,
  IncidentType,
  TimelineEventType,
  ContributingFactorCategory,
  ActionItemStatus,
  ActionItemType,
  SuggestionStatus,
  CrossPracticeTarget,
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
  orrType: ORRType;
  parentOrrId: string | null;
  changeTypes: ChangeType[];
  changeDescription: string | null;
  status: ORRStatus;
  repositoryPath: string | null; // path to source code for code exploration
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  terminationReason: string | null;
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
  status: FlagStatus;       // OPEN, ACCEPTED, RESOLVED
  resolution?: string;      // reason for accept/resolve
  resolvedAt?: string;      // ISO 8601
  resolvedBy?: string;      // user ID
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
  repositoryPath?: string; // optional: path to source code for code exploration
  orrType?: ORRType;
  parentOrrId?: string;
  changeTypes?: ChangeType[];
  changeDescription?: string;
  /** For feature ORRs: the user's customized question selection from the creation wizard */
  selectedSections?: Array<{ title: string; prompts: string[] }>;
}

// --- Answer source tracking ---

export type AnswerSource = "team" | "code";

export interface PromptResponse {
  answer: string;
  source: AnswerSource; // "team" = generated from memory, "code" = read from source code
  codeRef?: string; // e.g. "src/llm/retry.ts:45-92" — file location the answer came from
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
  | { type: "data_updated"; tool: string }
  | { type: "session_renewed"; oldSessionId: string; newSessionId: string }
  | { type: "message_end"; tokenUsage: number }
  | { type: "status"; message: string }
  | { type: "error"; message: string };

// --- Dashboard types ---

export interface DashboardStats {
  // ORR practice
  totalOrrs: number;
  orrsByStatus: Record<ORRStatus, number>;
  recentOrrs: DashboardPracticeSummary[];

  // Incident practice
  totalIncidents: number;
  incidentsByStatus: Record<IncidentStatus, number>;
  recentIncidents: DashboardPracticeSummary[];

  // Learning signals
  openActionItems: number;
  experimentSuggestions: number;
  crossPracticeLinks: number;
  recentDiscoveries: number; // sessions with discoveries in last 30 days
}

/** Shared summary shape for both ORRs and incidents on the dashboard. */
export interface DashboardPracticeSummary {
  id: string;
  title: string;            // display name: serviceName for ORRs, title for incidents
  serviceName: string;      // the service this practice relates to
  status: string;
  updatedAt: string;
  coveragePercent: number;  // sections with depth > UNKNOWN
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
  flagIndex: number;  // index within section's flags array (for PATCH)
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

// --- Incident Analysis entities ---

export interface Incident {
  id: string;
  title: string;
  teamId: string;
  serviceName: string | null;
  incidentDate: string | null; // ISO 8601
  durationMinutes: number | null;
  severity: IncidentSeverity | null;
  detectionMethod: string | null;
  incidentType: IncidentType | null;
  steeringTier: "standard" | "thorough" | "rigorous";
  status: IncidentStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

export interface IncidentSection {
  id: string;
  incidentId: string;
  position: number;
  title: string;
  prompts: string[];
  content: string;
  depth: SectionDepth;
  depthRationale: string | null;
  promptResponses: Record<string, PromptResponse>;
  flags: SectionFlagEntry[];
  conversationSnippet: string | null;
  updatedAt: string;
}

export interface TimelineEvent {
  id: string;
  incidentId: string;
  position: number;
  timestamp: string; // ISO 8601 with timezone
  description: string;
  evidence: string | null;
  actor: string | null;
  eventType: TimelineEventType;
  createdAt: string;
}

export interface ContributingFactor {
  id: string;
  incidentId: string;
  category: ContributingFactorCategory;
  description: string;
  context: string | null;
  isSystemic: boolean;
  createdAt: string;
}

export interface FactorEventLink {
  factorId: string;
  eventId: string;
}

// --- Shared cross-practice entities ---

export interface ActionItem {
  id: string;
  practiceType: PracticeType;
  practiceId: string;
  title: string;
  owner: string | null;
  dueDate: string | null;
  priority: "high" | "medium" | "low";
  type: ActionItemType;
  contributingFactorId: string | null;
  successCriteria: string | null;
  backlogLink: string | null;
  status: ActionItemStatus;
  createdAt: string;
  completedAt: string | null;
}

export interface CrossPracticeSuggestion {
  id: string;
  sourcePracticeType: PracticeType;
  sourcePracticeId: string;
  targetPracticeType: CrossPracticeTarget;
  suggestion: string;
  rationale: string;
  linkedPracticeId: string | null;
  linkedSectionId: string | null;
  status: SuggestionStatus;
  createdAt: string;
}

// --- Incident API types ---

export interface CreateIncidentInput {
  title: string;
  serviceName?: string;
  incidentDate?: string;
  severity?: IncidentSeverity;
  incidentType?: IncidentType;
}
