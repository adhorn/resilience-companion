/**
 * Session summary security — input validation and prompt injection prevention.
 *
 * Session summaries are written by the LLM and persist across sessions. They're
 * injected into future system prompts. Without validation, a malicious summary
 * can manipulate the agent's behavior in all subsequent sessions.
 *
 * Three defenses:
 * 1. Input validation (sanitizeSummary) — length cap, strip injection patterns
 * 2. Output escaping (wrapSummaryForPrompt) — delimit summaries in system prompt
 * 3. Enum re-validation — learning_quality and engagement_pattern checked at write time
 */

const MAX_SUMMARY_LENGTH = 5000;
const MAX_DISCOVERY_LENGTH = 1000;
const MAX_DISCOVERIES = 20;

/**
 * Patterns that indicate prompt injection attempts.
 * These are stripped from summary content before storage.
 */
const INJECTION_PATTERNS: RegExp[] = [
  // System/instruction overrides
  /SYSTEM\s*PROMPT\s*OVERRIDE[:\s]*/gi,
  /IGNORE\s*PREVIOUS\s*INSTRUCTIONS/gi,
  /NEW\s*INSTRUCTIONS?\s*:/gi,
  /YOU\s*ARE\s*NOW\s*/gi,
  /FROM\s*NOW\s*ON\s*/gi,
  /OVERRIDE\s*:?\s*/gi,

  // Role impersonation in square brackets
  /\[SYSTEM\][:\s]*/gi,
  /\[ASSISTANT\][:\s]*/gi,
  /\[USER\][:\s]*/gi,
  /\[INSTRUCTION\][:\s]*/gi,

  // XML-style tags that could be interpreted as prompt structure
  /<\/?system\b[^>]*>/gi,
  /<\/?instruction\b[^>]*>/gi,
  /<\/?prompt\b[^>]*>/gi,
  /<\/?assistant\b[^>]*>/gi,
  /<\/?user\b[^>]*>/gi,

  // Markdown headings that mimic prompt sections
  /^##\s*(Operational\s*Rules|System\s*Prompt|Instructions|How\s*You\s*Facilitate|Adaptive\s*Guidance)/gim,

  // Common injection phrases
  /SYSTEM\s*:\s*/gi,
];

/**
 * Sanitize a session summary before writing to DB.
 * Strips injection patterns, caps length.
 */
export function sanitizeSummary(input: string | null | undefined): string {
  if (!input || typeof input !== "string") return "";

  let text = input;

  // Strip injection patterns
  for (const pattern of INJECTION_PATTERNS) {
    pattern.lastIndex = 0;
    text = text.replace(pattern, "");
  }

  // Remove lines that became empty after stripping
  text = text.replace(/\n{3,}/g, "\n\n").trim();

  // Cap length
  if (text.length > MAX_SUMMARY_LENGTH) {
    text = text.slice(0, MAX_SUMMARY_LENGTH - 15) + "... [truncated]";
  }

  return text;
}

/**
 * Sanitize a discoveries array before writing to DB.
 */
export function sanitizeDiscoveries(input: unknown[]): string[] {
  if (!Array.isArray(input)) return [];

  return input
    .filter((item): item is string => typeof item === "string")
    .slice(0, MAX_DISCOVERIES)
    .map((text) => {
      let sanitized = text;
      for (const pattern of INJECTION_PATTERNS) {
        pattern.lastIndex = 0;
        sanitized = sanitized.replace(pattern, "");
      }
      sanitized = sanitized.trim();
      if (sanitized.length > MAX_DISCOVERY_LENGTH) {
        sanitized = sanitized.slice(0, MAX_DISCOVERY_LENGTH - 15) + "... [truncated]";
      }
      return sanitized;
    })
    .filter((text) => text.length > 0);
}

const VALID_LEARNING_QUALITY = ["high", "moderate", "low"];
const VALID_ENGAGEMENT_PATTERNS = [
  "sustained_productive",
  "started_easy_deepened",
  "struggled_then_learned",
  "stayed_surface",
  "frustrated_throughout",
];

/**
 * Validate learning_quality enum. Returns null if invalid.
 */
export function validateLearningQuality(value: unknown): string | null {
  if (typeof value !== "string" || !VALID_LEARNING_QUALITY.includes(value)) return null;
  return value;
}

/**
 * Validate engagement_pattern enum. Returns null if invalid.
 */
export function validateEngagementPattern(value: unknown): string | null {
  if (typeof value !== "string" || !VALID_ENGAGEMENT_PATTERNS.includes(value)) return null;
  return value;
}

/**
 * Wrap a summary in delimiters for safe injection into the system prompt.
 * The LLM sees the summary as data within boundaries, not as instructions.
 */
export function wrapSummaryForPrompt(summary: string): string {
  // Strip any existing delimiter tags from the content to prevent escaping
  const clean = summary
    .replace(/<\/?session-summary>/g, "")
    .trim();

  return `<session-summary>${clean}</session-summary>`;
}
