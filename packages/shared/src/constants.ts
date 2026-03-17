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

// Agent profiles (MVP: only REVIEW_FACILITATOR)
export const AgentProfile = {
  REVIEW_FACILITATOR: "REVIEW_FACILITATOR",
  SESSION_ASSISTANT: "SESSION_ASSISTANT",
  TRANSCRIPT_PROCESSOR: "TRANSCRIPT_PROCESSOR",
  DRIFT_ANALYST: "DRIFT_ANALYST",
  PREP_BRIEF_GENERATOR: "PREP_BRIEF_GENERATOR",
} as const;
export type AgentProfile = (typeof AgentProfile)[keyof typeof AgentProfile];

// Staleness thresholds
export const STALENESS_MONTHS = 12;
export const AGING_MONTHS = 6;

// Agent loop limits
export const MAX_AGENT_ITERATIONS = 5;

// Token budget: max tokens per session before graceful wrap-up.
// ~200k tokens ≈ $1-3 depending on model. Covers a full ORR review
// (11 sections × ~15k tokens each) with headroom.
export const MAX_SESSION_TOKENS = 200_000;
