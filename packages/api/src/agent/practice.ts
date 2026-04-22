/**
 * PracticeConfig — the interface each resilience practice implements.
 *
 * The agent loop (loop.ts) is practice-agnostic. It delegates domain-specific
 * behavior to a PracticeConfig: context building, system prompt, tools, hooks.
 * ORR is the first implementation; Incident Analysis will be the second.
 */

import type { LLMToolDef } from "../llm/index.js";
import type { SteeringHook, SteeringTier } from "./steering.js";

export type PracticeType = "orr" | "incident";

/**
 * Opaque context object built by each practice.
 * The loop doesn't inspect it — just passes it to buildSystemPrompt.
 */
export interface PracticeContext {
  practiceType: PracticeType;
  practiceId: string;
  activeSectionId: string | null;
  [key: string]: unknown;
}

export interface PracticeConfig {
  practiceType: PracticeType;

  /** Load practice-specific context for the agent's system prompt. */
  buildContext(practiceId: string, activeSectionId: string | null): PracticeContext;

  /** Build the system prompt from practice context. */
  buildSystemPrompt(context: PracticeContext): string;

  /** LLM tool definitions available to the agent. */
  tools: LLMToolDef[];

  /** Execute a tool call. Returns JSON string result. */
  executeTool(name: string, args: Record<string, unknown>, practiceId: string, sessionId: string): string;

  /** Get steering hooks for the given tier. */
  getHooks(tier: SteeringTier): SteeringHook[];

  /** Tool names that trigger section_updated SSE events. */
  sectionUpdateTools: string[];

  /** Map tool name → field name for section_updated SSE events. */
  sectionUpdateFieldMap: Record<string, string>;

  /** Tool names that create non-section data (actions, experiments, etc.) and trigger data_updated SSE events. */
  dataUpdateTools: string[];

  /** Load the steering tier for a specific practice instance. */
  loadSteeringTier(practiceId: string): SteeringTier;
}
