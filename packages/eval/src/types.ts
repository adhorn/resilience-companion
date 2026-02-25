/**
 * Core types for the Resilience Companion eval framework.
 *
 * Evals run simulated multi-turn conversations against the real agent,
 * then grade outcomes (was data persisted? were the right tools called?).
 * This is a continuous canary on production code, not a CI gate.
 */

export type EvalCategory = "persistence" | "tool_usage" | "depth" | "quality";

/**
 * capability — start below target; pass@3 (any of 3 runs must succeed)
 * regression — should always work; pass^1 (must succeed every time)
 */
export type EvalType = "capability" | "regression";

export interface SectionSetup {
  /** Override this section's title (matches by position) */
  sectionIndex: number;
  title: string;
  prompts: string[];
  /** Optionally pre-fill some question responses */
  prefilledResponses?: Record<number, string>;
  /** Optionally pre-set depth */
  prefilledDepth?: "UNKNOWN" | "SURFACE" | "MODERATE" | "DEEP";
}

export type UserStyle = "cooperative" | "terse" | "verbose" | "uncertain";

export interface UserPersona {
  /** Instructions for the simulated user LLM */
  systemPrompt: string;
  /** What this team member knows — injected into system prompt */
  knowledge: string;
  style: UserStyle;
}

export type OutcomeType =
  | "tool_called"       // Specific tool must appear in tool calls
  | "tool_not_called"   // Specific tool must NOT appear
  | "question_persisted" // promptResponses[questionIndex] has content
  | "depth_set"         // section depth equals expected value
  | "flag_set"          // set_flags was called
  | "min_tool_calls";   // total tool calls >= minCalls

export interface ExpectedOutcome {
  type: OutcomeType;
  /** Tool name for tool_called / tool_not_called */
  tool?: string;
  /** Section index (0-based) for question_persisted / depth_set */
  sectionIndex?: number;
  /** Question index within section for question_persisted */
  questionIndex?: number;
  /** Expected depth value for depth_set */
  depth?: "SURFACE" | "MODERATE" | "DEEP";
  /** Minimum total tool calls for min_tool_calls */
  minCalls?: number;
  /** Human-readable description for reports */
  description: string;
}

export interface EvalScenario {
  id: string;
  name: string;
  category: EvalCategory;
  type: EvalType;
  practiceType: "orr";
  /** Override default section setup (seedTestOrr creates 3 sections by default) */
  sectionSetup?: SectionSetup[];
  userPersona: UserPersona;
  /** Maximum number of conversation turns (user + agent = 1 turn) */
  maxTurns: number;
  expectedOutcomes: ExpectedOutcome[];
}

export interface ToolCall {
  tool: string;
  args: Record<string, unknown>;
  result: string;
}

export interface ConversationTurn {
  role: "user" | "agent";
  content: string;
}

export interface HarnessResult {
  scenarioId: string;
  conversation: ConversationTurn[];
  toolCalls: ToolCall[];
  /** Final DB state for graders to query */
  db: import("@orr/api/src/db/connection.js").Db;
  sectionIds: string[];
  tokenUsage: number;
  durationMs: number;
}

export interface GraderResult {
  grader: string;
  outcomeDescription: string;
  passed: boolean;
  details: string;
}

export interface EvalResult {
  scenarioId: string;
  scenarioName: string;
  /** Which attempt (1-indexed, for pass@k) */
  attempt: number;
  passed: boolean;
  graderResults: GraderResult[];
  conversation: ConversationTurn[];
  toolCalls: ToolCall[];
  tokenUsage: number;
  durationMs: number;
  error?: string;
}

export interface RunSummary {
  timestamp: string;
  totalScenarios: number;
  passed: number;
  failed: number;
  totalTokens: number;
  totalDurationMs: number;
  results: EvalResult[];
}
