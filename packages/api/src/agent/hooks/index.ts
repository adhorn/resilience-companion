/**
 * Hook registry — assembles steering hooks by tier.
 *
 * Security hooks and content scan hooks are always active (zero iteration cost).
 * Quality hooks are tier-gated:
 *   standard  = security + content scan
 *   thorough  = + tool ordering (default)
 *   rigorous  = + parameter validation
 */

import type { SteeringHook, SteeringTier } from "../steering.js";
import { securityHooks } from "./security.js";
import { toolOrderingHooks } from "./tool-ordering.js";
import { paramValidationHooks } from "./param-validation.js";
import { contentScanHooks } from "./content-scan.js";

/** Always-on hooks (security + content scanning) */
const BASE_HOOKS: SteeringHook[] = [...securityHooks, ...contentScanHooks];

/**
 * Get the active hooks for a given steering tier.
 */
export function getHooksForTier(tier: SteeringTier): SteeringHook[] {
  const hooks = [...BASE_HOOKS];

  if (tier === "thorough" || tier === "rigorous") {
    hooks.push(...toolOrderingHooks);
  }

  if (tier === "rigorous") {
    hooks.push(...paramValidationHooks);
  }

  return hooks;
}
