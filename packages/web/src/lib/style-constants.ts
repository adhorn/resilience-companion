/**
 * Shared color/style constants for badge and pill components.
 *
 * Two variants per dimension:
 *   - "light" (pastel bg + colored text) — for tables, lists, inline badges
 *   - "bold"  (solid bg + white text)    — for prominent pills, flags panels
 */

// --- Severity ---

export const SEVERITY_COLORS_LIGHT: Record<string, string> = {
  HIGH: "bg-red-100 text-red-700",
  MEDIUM: "bg-orange-100 text-orange-700",
  LOW: "bg-yellow-100 text-yellow-700",
};

export const SEVERITY_COLORS_BOLD: Record<string, string> = {
  HIGH: "bg-red-600 text-white",
  MEDIUM: "bg-orange-500 text-white",
  LOW: "bg-yellow-400 text-gray-900",
};

// --- Practice status (ORR + Incident unified) ---

export const PRACTICE_STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  IN_REVIEW: "bg-purple-100 text-purple-700",
  COMPLETE: "bg-green-100 text-green-700",
  PUBLISHED: "bg-green-100 text-green-700",
  ARCHIVED: "bg-yellow-100 text-yellow-700",
};

// --- Flag type ---

export const FLAG_COLORS: Record<string, string> = {
  RISK: "bg-red-100 text-red-700",
  GAP: "bg-amber-100 text-amber-700",
  STRENGTH: "bg-green-100 text-green-700",
  FOLLOW_UP: "bg-blue-100 text-blue-700",
};

// --- Flag status ---

export const FLAG_STATUS_COLORS: Record<string, string> = {
  OPEN: "",
  ACCEPTED: "bg-purple-100 text-purple-700",
  RESOLVED: "bg-green-100 text-green-700",
};

// --- Section depth ---

export const DEPTH_COLORS: Record<string, string> = {
  UNKNOWN: "bg-gray-200",
  SURFACE: "bg-yellow-400",
  MODERATE: "bg-orange-400",
  DEEP: "bg-green-500",
};

export const DEPTH_LABELS: Record<string, string> = {
  UNKNOWN: "Not reviewed",
  SURFACE: "Surface",
  MODERATE: "Moderate",
  DEEP: "Deep",
};

// --- Incident-specific ---

export const FACTOR_CATEGORY_COLORS: Record<string, string> = {
  technical: "bg-blue-100 text-blue-700",
  process: "bg-purple-100 text-purple-700",
  organizational: "bg-indigo-100 text-indigo-700",
  human_factors: "bg-orange-100 text-orange-700",
  communication: "bg-teal-100 text-teal-700",
  knowledge: "bg-amber-100 text-amber-700",
};

export const EVENT_TYPE_COLORS: Record<string, string> = {
  detection: "bg-yellow-100 text-yellow-800",
  escalation: "bg-orange-100 text-orange-800",
  action: "bg-blue-100 text-blue-800",
  communication: "bg-teal-100 text-teal-800",
  resolution: "bg-green-100 text-green-800",
  other: "bg-gray-100 text-gray-800",
};

// --- Experiment-specific ---

export const EXPERIMENT_TYPE_COLORS: Record<string, string> = {
  chaos_experiment: "bg-purple-100 text-purple-700",
  load_test: "bg-blue-100 text-blue-700",
  gameday: "bg-teal-100 text-teal-700",
};

export const EXPERIMENT_STATUS_COLORS: Record<string, string> = {
  suggested: "bg-gray-100 text-gray-600",
  accepted: "bg-blue-100 text-blue-700",
  scheduled: "bg-indigo-100 text-indigo-700",
  completed: "bg-green-100 text-green-700",
  dismissed: "bg-gray-100 text-gray-400 line-through",
};

export const PRIORITY_COLORS: Record<string, string> = {
  critical: "bg-red-600 text-white",
  high: "bg-orange-500 text-white",
  medium: "bg-yellow-400 text-gray-900",
  low: "bg-gray-300 text-gray-700",
};
