// ORR lifecycle status
export const ORRStatus = {
  DRAFT: "DRAFT",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETE: "COMPLETE",
  ARCHIVED: "ARCHIVED",
} as const;
export type ORRStatus = (typeof ORRStatus)[keyof typeof ORRStatus];

// Section depth assessment — heuristic, not reliable judgment
export const SectionDepth = {
  UNKNOWN: "UNKNOWN",
  SURFACE: "SURFACE",
  MODERATE: "MODERATE",
  DEEP: "DEEP",
} as const;
export type SectionDepth = (typeof SectionDepth)[keyof typeof SectionDepth];

// Flags that can be attached to sections
export const SectionFlag = {
  RISK: "RISK",
  GAP: "GAP",
  STRENGTH: "STRENGTH",
  FOLLOW_UP: "FOLLOW_UP",
} as const;
export type SectionFlag = (typeof SectionFlag)[keyof typeof SectionFlag];

// Flag resolution status
export const FlagStatus = {
  OPEN: "OPEN",
  ACCEPTED: "ACCEPTED",   // Risk accepted — team acknowledges with reason
  RESOLVED: "RESOLVED",   // Risk addressed — action taken
} as const;
export type FlagStatus = (typeof FlagStatus)[keyof typeof FlagStatus];

// Risk severity levels
export const RiskSeverity = {
  HIGH: "HIGH",
  MEDIUM: "MEDIUM",
  LOW: "LOW",
} as const;
export type RiskSeverity = (typeof RiskSeverity)[keyof typeof RiskSeverity];

// Session status
export const SessionStatus = {
  ACTIVE: "ACTIVE",
  COMPLETED: "COMPLETED",
} as const;
export type SessionStatus = (typeof SessionStatus)[keyof typeof SessionStatus];

// Teaching moment lifecycle
export const TeachingMomentStatus = {
  DRAFT: "DRAFT",
  PUBLISHED: "PUBLISHED",
} as const;
export type TeachingMomentStatus =
  (typeof TeachingMomentStatus)[keyof typeof TeachingMomentStatus];

// Teaching moment origin
export const TeachingMomentSource = {
  ORG: "ORG",
  PUBLIC: "PUBLIC",
} as const;
export type TeachingMomentSource =
  (typeof TeachingMomentSource)[keyof typeof TeachingMomentSource];

// User roles
export const UserRole = {
  ADMIN: "ADMIN",
  MEMBER: "MEMBER",
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

// Agent profiles
export const AgentProfile = {
  REVIEW_FACILITATOR: "REVIEW_FACILITATOR",
  INCIDENT_LEARNING_FACILITATOR: "INCIDENT_LEARNING_FACILITATOR",
  SESSION_ASSISTANT: "SESSION_ASSISTANT",
  TRANSCRIPT_PROCESSOR: "TRANSCRIPT_PROCESSOR",
  DRIFT_ANALYST: "DRIFT_ANALYST",
  PREP_BRIEF_GENERATOR: "PREP_BRIEF_GENERATOR",
} as const;
export type AgentProfile = (typeof AgentProfile)[keyof typeof AgentProfile];

// Practice types
export const PracticeType = {
  ORR: "orr",
  INCIDENT: "incident",
} as const;
export type PracticeType = (typeof PracticeType)[keyof typeof PracticeType];

// Incident lifecycle status
export const IncidentStatus = {
  DRAFT: "DRAFT",
  IN_PROGRESS: "IN_PROGRESS",
  IN_REVIEW: "IN_REVIEW",
  PUBLISHED: "PUBLISHED",
  ARCHIVED: "ARCHIVED",
} as const;
export type IncidentStatus = (typeof IncidentStatus)[keyof typeof IncidentStatus];

// Incident severity
export const IncidentSeverity = {
  HIGH: "HIGH",
  MEDIUM: "MEDIUM",
  LOW: "LOW",
} as const;
export type IncidentSeverity = (typeof IncidentSeverity)[keyof typeof IncidentSeverity];

// Incident type classification
export const IncidentType = {
  OUTAGE: "OUTAGE",
  DEGRADATION: "DEGRADATION",
  NEAR_MISS: "NEAR_MISS",
  SURPRISING_BEHAVIOR: "SURPRISING_BEHAVIOR",
} as const;
export type IncidentType = (typeof IncidentType)[keyof typeof IncidentType];

// Timeline event types
export const TimelineEventType = {
  DETECTION: "detection",
  ESCALATION: "escalation",
  ACTION: "action",
  COMMUNICATION: "communication",
  RESOLUTION: "resolution",
  OTHER: "other",
} as const;
export type TimelineEventType = (typeof TimelineEventType)[keyof typeof TimelineEventType];

// Contributing factor categories
export const ContributingFactorCategory = {
  TECHNICAL: "technical",
  PROCESS: "process",
  ORGANIZATIONAL: "organizational",
  HUMAN_FACTORS: "human_factors",
  COMMUNICATION: "communication",
  KNOWLEDGE: "knowledge",
} as const;
export type ContributingFactorCategory =
  (typeof ContributingFactorCategory)[keyof typeof ContributingFactorCategory];

// Action item status
export const ActionItemStatus = {
  OPEN: "open",
  IN_PROGRESS: "in_progress",
  DONE: "done",
} as const;
export type ActionItemStatus = (typeof ActionItemStatus)[keyof typeof ActionItemStatus];

// Action item type
export const ActionItemType = {
  TECHNICAL: "technical",
  PROCESS: "process",
  ORGANIZATIONAL: "organizational",
  LEARNING: "learning",
} as const;
export type ActionItemType = (typeof ActionItemType)[keyof typeof ActionItemType];

// Cross-practice suggestion status
export const SuggestionStatus = {
  SUGGESTED: "suggested",
  ACCEPTED: "accepted",
  DISMISSED: "dismissed",
} as const;
export type SuggestionStatus = (typeof SuggestionStatus)[keyof typeof SuggestionStatus];

// Cross-practice target types
export const CrossPracticeTarget = {
  CHAOS_ENGINEERING: "chaos_engineering",
  LOAD_TESTING: "load_testing",
  ORR: "orr",
  INCIDENT_ANALYSIS: "incident_analysis",
  GAMEDAY: "gameday",
} as const;
export type CrossPracticeTarget =
  (typeof CrossPracticeTarget)[keyof typeof CrossPracticeTarget];

// Experiment suggestion types
export const ExperimentType = {
  CHAOS_EXPERIMENT: "chaos_experiment",
  LOAD_TEST: "load_test",
  GAMEDAY: "gameday",
} as const;
export type ExperimentType = (typeof ExperimentType)[keyof typeof ExperimentType];

// Experiment suggestion priority
export const ExperimentPriority = {
  CRITICAL: "critical",
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
} as const;
export type ExperimentPriority = (typeof ExperimentPriority)[keyof typeof ExperimentPriority];

// Experiment suggestion lifecycle
export const ExperimentStatus = {
  SUGGESTED: "suggested",
  ACCEPTED: "accepted",
  SCHEDULED: "scheduled",
  COMPLETED: "completed",
  DISMISSED: "dismissed",
} as const;
export type ExperimentStatus = (typeof ExperimentStatus)[keyof typeof ExperimentStatus];

// Staleness thresholds
export const STALENESS_MONTHS = 12;
export const AGING_MONTHS = 6;

// Agent loop limits
export const MAX_AGENT_ITERATIONS = 5;

// Token budget: max tokens per session before graceful wrap-up.
// ~200k tokens ≈ $1-3 depending on model. Covers a full ORR review
// (11 sections × ~15k tokens each) with headroom.
export const MAX_SESSION_TOKENS = 200_000;

// Daily token budget: hard cap across all sessions per team per day.
// 2M tokens ≈ ~10 full ORR reviews on Sonnet (~$10-20/day).
// Prevents runaway sessions from eating the monthly budget.
export const MAX_DAILY_TOKENS = 2_000_000;
