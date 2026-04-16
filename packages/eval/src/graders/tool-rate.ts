/**
 * Tool rate grader — code-based, deterministic.
 *
 * Checks tool call counts and rates across the full conversation.
 * Catches the degradation pattern where the agent has a pleasant
 * conversation but stops using tools to persist observations.
 */

import type { HarnessResult, ExpectedOutcome, GraderResult } from "../types.js";

export function gradeToolRate(
  result: HarnessResult,
  outcomes: ExpectedOutcome[],
): GraderResult[] {
  const graderResults: GraderResult[] = [];

  for (const outcome of outcomes) {
    if (outcome.type === "min_tool_calls") {
      graderResults.push(gradeMinToolCalls(result, outcome));
    }
  }

  return graderResults;
}

function gradeMinToolCalls(result: HarnessResult, outcome: ExpectedOutcome): GraderResult {
  const minCalls = outcome.minCalls ?? 1;
  const actualCalls = result.toolCalls.length;
  const passed = actualCalls >= minCalls;

  const toolBreakdown = Object.entries(
    result.toolCalls.reduce<Record<string, number>>((acc, tc) => {
      acc[tc.tool] = (acc[tc.tool] ?? 0) + 1;
      return acc;
    }, {}),
  )
    .map(([tool, count]) => `${tool}×${count}`)
    .join(", ");

  return {
    grader: "tool-rate",
    outcomeDescription: outcome.description,
    passed,
    details: passed
      ? `${actualCalls} tool calls (≥${minCalls} required). Breakdown: ${toolBreakdown || "none"}`
      : `Only ${actualCalls} tool calls, but ≥${minCalls} required. Breakdown: ${toolBreakdown || "none"}`,
  };
}
