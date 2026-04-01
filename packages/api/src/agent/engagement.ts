/**
 * Engagement detection — Yerkes-Dodson controller for the agent.
 *
 * Pure heuristic function that runs every turn on the already-loaded
 * conversation history. No LLM call, no DB access.
 *
 * Detects three zones:
 *   TOO_EASY    — fluency illusion, team breezing through, no learning
 *   PRODUCTIVE  — desirable difficulty sweet spot
 *   FRUSTRATED  — team hitting walls, needs more scaffolding
 *
 * The agent loop injects adaptive guidance into the system prompt
 * based on the detected zone, dynamically adjusting the code
 * exploration escalation ladder.
 */

import type { LLMMessage } from "../llm/index.js";

export type EngagementZone = "TOO_EASY" | "PRODUCTIVE" | "FRUSTRATED";

export interface EngagementSignals {
  zone: EngagementZone;
  /** 0-1, fraction of applicable signals that fired */
  confidence: number;
  /** Human-readable signal descriptions (for logging + prompt injection) */
  signals: string[];
}

export interface SectionEngagementContext {
  depth: string;
  codeSourced: number;
  questionsAnswered: number;
}

// --- Frustration signals ---

const HEDGE_PATTERNS = [
  /\bi think\b/i, /\bprobably\b/i, /\bnot sure\b/i,
  /\bi don'?t know\b/i, /\bno idea\b/i, /\bmaybe\b/i,
  /\bwe'?d have to\b/i, /\bnot confident\b/i, /\bi'?m guessing\b/i,
  /\bshould be\b/i, /\btheoretically\b/i, /\bi assume\b/i,
];

const WALL_PHRASES = [
  /\bi don'?t know\b/i, /\bno idea\b/i,
  /\bhave to look\b/i, /\bcan'?t remember\b/i,
  /\bnot sure at all\b/i, /\bno clue\b/i,
  /\bi'?d have to check\b/i, /\bI really don'?t\b/i,
];

/** Fraction of recent user messages that contain hedging language. */
export function hedgingRatio(userMessages: string[]): number {
  const recent = userMessages.slice(-5);
  if (recent.length === 0) return 0;
  const hedging = recent.filter(msg =>
    HEDGE_PATTERNS.some(p => p.test(msg)),
  ).length;
  return hedging / recent.length;
}

/** Whether the last 3+ user messages are all terse (< 30 chars). */
export function hasTersePattern(userMessages: string[]): boolean {
  const recent = userMessages.slice(-3);
  return recent.length >= 3 && recent.every(m => m.length < 30);
}

/** Whether 2+ of the last 3 user messages hit a genuine wall. */
export function hasWallHitPattern(userMessages: string[]): boolean {
  const recent = userMessages.slice(-3);
  const wallHits = recent.filter(msg =>
    WALL_PHRASES.some(p => p.test(msg)),
  ).length;
  return wallHits >= 2;
}

// --- Too-easy signals ---

/** Whether recent messages are long + confident with no hedging. */
export function hasFluentNoSurprisePattern(userMessages: string[]): boolean {
  const recent = userMessages.slice(-5);
  if (recent.length < 3) return false;
  const avgLength = recent.reduce((s, m) => s + m.length, 0) / recent.length;
  const hedging = recent.filter(msg =>
    HEDGE_PATTERNS.some(p => p.test(msg)),
  ).length;
  return avgLength > 200 && hedging === 0;
}

// --- Main assessment ---

/**
 * Assess engagement zone from conversation history and section context.
 *
 * @param history  Trimmed conversation history (user + assistant messages)
 * @param section  Active section context (depth, code-sourced ratio). Null if no active section.
 */
export function assessEngagement(
  history: LLMMessage[],
  section: SectionEngagementContext | null,
): EngagementSignals {
  // Extract user messages only
  const userMessages = history
    .filter(m => m.role === "user")
    .map(m => m.content || "");

  // Need at least 3 user messages to have meaningful signals
  if (userMessages.length < 3) {
    return { zone: "PRODUCTIVE", confidence: 0, signals: [] };
  }

  let score = 0;
  const signals: string[] = [];
  let applicableSignals = 0;

  // --- Frustration signals (positive score) ---

  applicableSignals++;
  const hedgeR = hedgingRatio(userMessages);
  if (hedgeR > 0.5) {
    score += 1;
    signals.push(`high hedging (${Math.round(hedgeR * 100)}% of recent messages)`);
  }

  applicableSignals++;
  if (hasTersePattern(userMessages)) {
    score += 1;
    signals.push("terse responses (last 3+ messages under 30 chars)");
  }

  applicableSignals++;
  if (hasWallHitPattern(userMessages)) {
    score += 2; // Strong signal — double weight
    signals.push("wall-hit pattern (repeated 'I don't know')");
  }

  if (section && section.questionsAnswered > 0) {
    applicableSignals++;
    const codeRatio = section.codeSourced / section.questionsAnswered;
    if (codeRatio > 0.6) {
      score += 1;
      signals.push(`high code-source ratio (${Math.round(codeRatio * 100)}% from code)`);
    }
  }

  // --- Too-easy signals (negative score) ---

  applicableSignals++;
  if (hasFluentNoSurprisePattern(userMessages)) {
    score -= 1;
    signals.push("fluent no-surprise (long confident answers, no hedging)");
  }

  if (section) {
    applicableSignals++;
    // Count user turns in conversation (rough proxy for "turns discussing this section")
    const turnCount = userMessages.length;
    if (section.depth === "SURFACE" && turnCount > 6) {
      score -= 1;
      signals.push("stuck at SURFACE despite extended discussion");
    }
  }

  // --- Zone determination ---

  const zone: EngagementZone =
    score >= 2 ? "FRUSTRATED" :
    score <= -2 ? "TOO_EASY" :
    "PRODUCTIVE";

  const firedCount = signals.length;
  const confidence = applicableSignals > 0 ? firedCount / applicableSignals : 0;

  return { zone, confidence, signals };
}
