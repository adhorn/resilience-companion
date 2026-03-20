/**
 * Incident-specific steering hooks.
 * Same pipeline as ORR (SteeringHook interface), with additional incident-focused rules.
 */
import type { SteeringHook, SteeringTier, ToolLedger } from "../../agent/steering.js";

// Import shared hook arrays
import { securityHooks } from "../../agent/hooks/security.js";
import { contentScanHooks } from "../../agent/hooks/content-scan.js";
import { paramValidationHooks } from "../../agent/hooks/param-validation.js";

/**
 * Incident-specific tool ordering:
 * - record_action_item requires at least one record_contributing_factor in the session
 * - write_session_summary requires at least one update_section_content
 */
const incidentToolOrderingHook: SteeringHook = {
  name: "incident-tool-ordering",
  tools: ["record_action_item", "write_session_summary"],
  beforeToolCall(toolName: string, _args: Record<string, unknown>, ledger: ToolLedger) {
    if (toolName === "record_action_item") {
      const hasFactors = ledger.calls.some((h) => h.tool === "record_contributing_factor");
      if (!hasFactors) {
        return {
          action: "guide" as const,
          reason: "Before recording action items, ensure at least one contributing factor has been identified. Actions should trace to factors — otherwise we're fixing symptoms, not addressing systemic conditions.",
        };
      }
    }

    if (toolName === "write_session_summary") {
      const hasContent = ledger.calls.some((h) => h.tool === "update_section_content");
      if (!hasContent) {
        return {
          action: "guide" as const,
          reason: "Before summarizing the session, write observations to at least one section. The document is the durable artifact.",
        };
      }
    }

    return { action: "proceed" as const };
  },
};

/**
 * Incident-specific content scan: detect blame language and guide reframing.
 */
const blameScanHook: SteeringHook = {
  name: "incident-blame-scan",
  tools: ["update_section_content", "update_question_response"],
  afterToolResult(_toolName: string, args: Record<string, unknown>, result: string) {
    const content = (args.content as string) || (args.response as string) || "";
    const blamePatterns = [
      /\bshould have\b/i,
      /\bfailed to\b/i,
      /\bnegligen/i,
      /\bcareless/i,
      /\bhuman error\b/i,
      /\broot cause\b/i,
      /\boperator error\b/i,
    ];

    const found = blamePatterns.filter((p) => p.test(content));
    if (found.length > 0) {
      const warning = `\n\n[STEERING NOTE: The content uses language that may assign blame (${found.map((p) => p.source).join(", ")}). Consider reframing: use "contributing factors" instead of "root cause", "systemic conditions" instead of "human error", and explore why actions made sense at the time.]`;
      return result + warning;
    }

    return result;
  },
};

/**
 * Incident-specific param validation for contributing factors and action items.
 */
const incidentParamValidationHook: SteeringHook = {
  name: "incident-param-validation",
  tools: ["record_contributing_factor", "record_action_item"],
  beforeToolCall(toolName: string, args: Record<string, unknown>) {
    if (toolName === "record_contributing_factor") {
      if (args.is_systemic && (!args.context || (args.context as string).length < 50)) {
        return {
          action: "guide" as const,
          reason: "Systemic factors need substantial context (>50 chars) explaining why this is a recurring pattern and not a one-off.",
        };
      }
    }

    if (toolName === "record_action_item") {
      if (!args.contributing_factor_id) {
        return {
          action: "guide" as const,
          reason: "Action items should trace to a contributing factor. Link this action to the factor it addresses using contributing_factor_id.",
        };
      }
    }

    return { action: "proceed" as const };
  },
};

export function getIncidentHooksForTier(tier: SteeringTier): SteeringHook[] {
  // Security + content scan always on
  const hooks: SteeringHook[] = [...securityHooks, ...contentScanHooks];

  if (tier === "standard") {
    return hooks;
  }

  // Thorough: add ordering, blame scan
  hooks.push(incidentToolOrderingHook, blameScanHook);

  if (tier === "thorough") {
    return hooks;
  }

  // Rigorous: add all validation hooks
  hooks.push(incidentParamValidationHook, ...paramValidationHooks);

  return hooks;
}
