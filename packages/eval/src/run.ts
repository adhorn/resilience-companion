#!/usr/bin/env tsx
/**
 * Eval CLI entry point.
 *
 * Usage:
 *   npx tsx packages/eval/src/run.ts
 *   npx tsx packages/eval/src/run.ts --category persistence
 *   npx tsx packages/eval/src/run.ts --scenario persist-basic-qa
 *   npx tsx packages/eval/src/run.ts --verbose
 *
 * Requires LLM_API_KEY env var (or a .env file in the monorepo root).
 * The production agent uses whatever model is configured in LLM_MODEL/LLM_PROVIDER.
 * The simulated user always uses claude-haiku-4-5.
 */

import { runEvals } from "./runner.js";

// Parse CLI args
const args = process.argv.slice(2);
function getArg(flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : undefined;
}
const hasFlag = (flag: string) => args.includes(flag);

const category = getArg("--category");
const scenarioId = getArg("--scenario");
const verbose = hasFlag("--verbose") || hasFlag("-v");

// Require API key
const apiKey = process.env.LLM_API_KEY;
if (!apiKey) {
  console.error("LLM_API_KEY is not set. The eval requires a real API key to run the simulated user.");
  console.error("Set it in .env or export it in your shell before running.");
  process.exit(1);
}

await runEvals({ category, scenarioId, apiKey, verbose });
