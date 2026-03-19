/**
 * Agent steering pipeline — just-in-time hooks that intercept tool calls
 * before execution and scan results after execution.
 *
 * Inspired by Strands SDK steering pattern: deterministic code hooks achieve
 * higher accuracy than prompt-only instructions because rules that are hard
 * to express in natural language are easy to express in code.
 *
 * Security hooks (sensitive file filter, symlink check) are always active.
 * Quality hooks (tool ordering, parameter validation) are tier-gated:
 *   standard  = security + content scan only
 *   thorough  = + tool ordering (default)
 *   rigorous  = + parameter validation
 */

import { log } from "../logger.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SteeringTier = "standard" | "thorough" | "rigorous";

export interface SteeringResult {
  action: "proceed" | "guide";
  reason?: string;
  hookName?: string;
}

export interface ToolLedgerEntry {
  tool: string;
  args: Record<string, unknown>;
  result: string;
  iteration: number;
}

export interface ToolLedger {
  /** All completed tool calls in this turn, in order */
  calls: ToolLedgerEntry[];
  /** Current agent loop iteration (0-based) */
  currentIteration: number;
}

export interface SteeringHook {
  name: string;
  /** Which tools this hook applies to. null = all tools */
  tools: string[] | null;
  /** Inspect tool call before execution. Return "guide" to reject with corrective feedback. */
  beforeToolCall?(name: string, args: Record<string, unknown>, ledger: ToolLedger): SteeringResult;
  /** Transform tool result after execution. Return modified result string. */
  afterToolResult?(name: string, args: Record<string, unknown>, result: string): string;
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

function hookApplies(hook: SteeringHook, toolName: string): boolean {
  return hook.tools === null || hook.tools.includes(toolName);
}

/**
 * Run all before-hooks in order. First "guide" result wins (short-circuit).
 */
export function runBeforeHooks(
  hooks: SteeringHook[],
  toolName: string,
  args: Record<string, unknown>,
  ledger: ToolLedger,
): SteeringResult {
  for (const hook of hooks) {
    if (!hook.beforeToolCall || !hookApplies(hook, toolName)) continue;
    const result = hook.beforeToolCall(toolName, args, ledger);
    if (result.action === "guide") {
      log("info", "Steering hook guided tool call", {
        hook: hook.name,
        tool: toolName,
        reason: result.reason,
      });
      return { ...result, hookName: hook.name };
    }
  }
  return { action: "proceed" };
}

/**
 * Run all after-hooks in order. Each transforms the result string.
 */
export function runAfterHooks(
  hooks: SteeringHook[],
  toolName: string,
  args: Record<string, unknown>,
  result: string,
): string {
  let current = result;
  for (const hook of hooks) {
    if (!hook.afterToolResult || !hookApplies(hook, toolName)) continue;
    const transformed = hook.afterToolResult(toolName, args, current);
    if (transformed !== current) {
      log("info", "Steering hook transformed result", {
        hook: hook.name,
        tool: toolName,
      });
    }
    current = transformed;
  }
  return current;
}
