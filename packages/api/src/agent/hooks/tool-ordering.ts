/**
 * Tool ordering steering hooks — active at "thorough" tier and above.
 *
 * Enforces read-before-write: the agent must read a section's current state
 * before updating it. This prevents blind overwrites and ensures the agent
 * works with current data.
 *
 * When violated, the hook returns corrective guidance — the LLM sees it as
 * a tool error and can retry with the correct sequence on the next iteration.
 */

import type { SteeringHook, SteeringResult, ToolLedger } from "../steering.js";

interface OrderingRule {
  tool: string;
  requires: (ledger: ToolLedger, args: Record<string, unknown>) => boolean;
  guidance: string;
}

const ORDERING_RULES: OrderingRule[] = [
  {
    tool: "update_section_content",
    requires: (ledger, args) =>
      ledger.calls.some(
        (c) => c.tool === "read_section" && c.args.section_id === args.section_id,
      ),
    guidance:
      "Read the current section content before updating it. Use read_section first to see what's already there, so you can build on existing observations rather than overwriting them.",
  },
  {
    tool: "update_depth_assessment",
    requires: (ledger, args) =>
      ledger.calls.some(
        (c) => c.tool === "read_section" && c.args.section_id === args.section_id,
      ),
    guidance:
      "Read the section before assessing its depth. Use read_section first to review the current content and depth rationale.",
  },
  {
    tool: "set_flags",
    requires: (ledger, args) =>
      ledger.calls.some(
        (c) => c.tool === "read_section" && c.args.section_id === args.section_id,
      ),
    guidance:
      "Read existing flags before adding new ones. Use read_section first to check what flags are already set and avoid duplicates.",
  },
  {
    tool: "write_session_summary",
    requires: (ledger) =>
      ledger.calls.some(
        (c) =>
          c.tool === "update_section_content" ||
          c.tool === "update_depth_assessment" ||
          c.tool === "set_flags",
      ),
    guidance:
      "Write section observations before summarizing the session. A summary should reflect actual work done — update at least one section first.",
  },
];

export const toolOrderingHook: SteeringHook = {
  name: "tool-ordering",
  tools: ORDERING_RULES.map((r) => r.tool),
  beforeToolCall(
    name: string,
    args: Record<string, unknown>,
    ledger: ToolLedger,
  ): SteeringResult {
    for (const rule of ORDERING_RULES) {
      if (rule.tool !== name) continue;
      if (!rule.requires(ledger, args)) {
        return { action: "guide", reason: rule.guidance };
      }
    }
    return { action: "proceed" };
  },
};

export const toolOrderingHooks: SteeringHook[] = [toolOrderingHook];
