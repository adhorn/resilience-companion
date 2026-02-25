import { persistenceScenarios } from "./persistence.js";
import { toolUsageScenarios } from "./tool-usage.js";
import type { EvalScenario, EvalCategory } from "../types.js";

export const ALL_SCENARIOS: EvalScenario[] = [
  ...persistenceScenarios,
  ...toolUsageScenarios,
];

export function filterScenarios(
  scenarios: EvalScenario[],
  opts: { category?: EvalCategory; id?: string },
): EvalScenario[] {
  let result = scenarios;
  if (opts.category) result = result.filter((s) => s.category === opts.category);
  if (opts.id) result = result.filter((s) => s.id === opts.id);
  return result;
}
