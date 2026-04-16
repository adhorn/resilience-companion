/**
 * Eval runner — orchestrates scenarios, runs conversations, grades outcomes, reports.
 *
 * Capability evals: pass@3 (any of 3 runs must succeed)
 * Regression evals: pass^1 (must succeed on first attempt)
 */

import { runScenario } from "./harness.js";
import { gradePersistence } from "./graders/persistence.js";
import { gradeToolRate } from "./graders/tool-rate.js";
import { ALL_SCENARIOS, filterScenarios } from "./scenarios/index.js";
import type { EvalScenario, EvalResult, RunSummary, GraderResult } from "./types.js";

const PASS_AT_K = 3; // Number of attempts for capability evals

export interface RunnerOptions {
  category?: string;
  scenarioId?: string;
  apiKey: string;
  verbose?: boolean;
}

export async function runEvals(opts: RunnerOptions): Promise<RunSummary> {
  const scenarios = filterScenarios(ALL_SCENARIOS, {
    category: opts.category as any,
    id: opts.scenarioId,
  });

  if (scenarios.length === 0) {
    console.error("No scenarios matched the given filters.");
    process.exit(1);
  }

  console.log(`\nRunning ${scenarios.length} eval scenario(s)...\n`);
  console.log("─".repeat(70));

  const allResults: EvalResult[] = [];
  let totalTokens = 0;
  let totalMs = 0;
  let passedScenarios = 0;
  let failedScenarios = 0;

  for (const scenario of scenarios) {
    const maxAttempts = scenario.type === "capability" ? PASS_AT_K : 1;
    let scenarioPassed = false;
    const scenarioResults: EvalResult[] = [];

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (opts.verbose) {
        console.log(`\n[${scenario.id}] Attempt ${attempt}/${maxAttempts}...`);
      }

      let result: EvalResult;

      try {
        const harnessResult = await runScenario(scenario, { apiKey: opts.apiKey });

        const graderResults = grade(scenario, harnessResult);
        const passed = graderResults.every((g) => g.passed);

        result = {
          scenarioId: scenario.id,
          scenarioName: scenario.name,
          attempt,
          passed,
          graderResults,
          conversation: harnessResult.conversation,
          toolCalls: harnessResult.toolCalls,
          tokenUsage: harnessResult.tokenUsage,
          durationMs: harnessResult.durationMs,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result = {
          scenarioId: scenario.id,
          scenarioName: scenario.name,
          attempt,
          passed: false,
          graderResults: [],
          conversation: [],
          toolCalls: [],
          tokenUsage: 0,
          durationMs: 0,
          error: message,
        };
      }

      scenarioResults.push(result);
      totalTokens += result.tokenUsage;
      totalMs += result.durationMs;

      if (result.passed) {
        scenarioPassed = true;
        if (opts.verbose) console.log(`  PASS (attempt ${attempt})`);
        break;
      } else {
        if (opts.verbose) {
          console.log(`  FAIL (attempt ${attempt})`);
          for (const gr of result.graderResults) {
            const icon = gr.passed ? "✓" : "✗";
            console.log(`    ${icon} ${gr.outcomeDescription}`);
            if (!gr.passed) console.log(`      → ${gr.details}`);
          }
          if (result.error) console.log(`  Error: ${result.error}`);
        }
      }
    }

    allResults.push(...scenarioResults);

    if (scenarioPassed) {
      passedScenarios++;
      console.log(`PASS  ${scenario.id}`);
    } else {
      failedScenarios++;
      console.log(`FAIL  ${scenario.id}`);
      // Always print failure details even in non-verbose mode
      const lastResult = scenarioResults.at(-1)!;
      for (const gr of lastResult.graderResults) {
        if (!gr.passed) {
          console.log(`      ✗ ${gr.outcomeDescription}`);
          console.log(`        ${gr.details}`);
        }
      }
      if (lastResult.error) {
        console.log(`      Error: ${lastResult.error}`);
      }
    }
  }

  console.log("\n" + "─".repeat(70));
  console.log(
    `Results: ${passedScenarios}/${scenarios.length} passed` +
    ` | Tokens: ${totalTokens.toLocaleString()}` +
    ` | Time: ${(totalMs / 1000).toFixed(1)}s`,
  );
  console.log("─".repeat(70) + "\n");

  return {
    timestamp: new Date().toISOString(),
    totalScenarios: scenarios.length,
    passed: passedScenarios,
    failed: failedScenarios,
    totalTokens,
    totalDurationMs: totalMs,
    results: allResults,
  };
}

function grade(scenario: EvalScenario, harnessResult: Parameters<typeof gradePersistence>[0]): GraderResult[] {
  const persistenceOutcomes = scenario.expectedOutcomes.filter(
    (o) => ["tool_called", "tool_not_called", "question_persisted", "depth_set", "flag_set"].includes(o.type),
  );
  const toolRateOutcomes = scenario.expectedOutcomes.filter(
    (o) => o.type === "min_tool_calls",
  );

  return [
    ...gradePersistence(harnessResult, persistenceOutcomes),
    ...gradeToolRate(harnessResult, toolRateOutcomes),
  ];
}
