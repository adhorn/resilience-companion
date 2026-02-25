/**
 * Parameter validation steering hooks — active at "rigorous" tier only.
 *
 * Validates tool arguments for quality before execution:
 * - DEEP depth assessment must include substantial evidence in rationale
 * - Flags must have specific notes (not generic text)
 * - Content updates must not silently truncate existing content
 * - Depth values must be valid enum members
 */

import type { SteeringHook, SteeringResult, ToolLedger } from "../steering.js";

const VALID_DEPTHS = ["UNKNOWN", "SURFACE", "MODERATE", "DEEP"];

export const paramValidationHook: SteeringHook = {
  name: "param-validation",
  tools: ["update_depth_assessment", "set_flags", "update_section_content"],
  beforeToolCall(
    name: string,
    args: Record<string, unknown>,
    ledger: ToolLedger,
  ): SteeringResult {
    switch (name) {
      case "update_depth_assessment": {
        const depth = args.depth as string;
        const rationale = args.rationale as string;

        // Validate depth enum
        if (!VALID_DEPTHS.includes(depth)) {
          return {
            action: "guide",
            reason: `Invalid depth value "${depth}". Use one of: ${VALID_DEPTHS.join(", ")}.`,
          };
        }

        // DEEP requires substantial evidence
        if (depth === "DEEP" && (!rationale || rationale.length < 50)) {
          return {
            action: "guide",
            reason:
              "A DEEP assessment requires detailed evidence in the rationale (at least 50 characters). Explain what specific evidence from the conversation supports this depth rating — concrete examples, verified configurations, or demonstrated understanding.",
          };
        }

        // MODERATE also benefits from rationale
        if (depth === "MODERATE" && (!rationale || rationale.length < 20)) {
          return {
            action: "guide",
            reason:
              "A MODERATE assessment should include a rationale explaining what was covered and what gaps remain.",
          };
        }

        return { action: "proceed" };
      }

      case "set_flags": {
        const flags = args.flags as Array<{ type: string; note: string }>;
        if (!Array.isArray(flags)) return { action: "proceed" };

        for (const flag of flags) {
          if (!flag.note || flag.note.trim().length < 10) {
            return {
              action: "guide",
              reason: `Flag of type "${flag.type}" needs a specific note (at least 10 characters) explaining the concern. Generic notes like "needs work" aren't actionable.`,
            };
          }
        }

        return { action: "proceed" };
      }

      case "update_section_content": {
        const newContent = args.content as string;
        if (!newContent) return { action: "proceed" };

        // Check content preservation: find the last read_section for this section
        const sectionId = args.section_id as string;
        const lastRead = [...ledger.calls]
          .reverse()
          .find((c) => c.tool === "read_section" && c.args.section_id === sectionId);

        if (lastRead) {
          let existingContent = "";
          try {
            const parsed = JSON.parse(lastRead.result);
            existingContent = parsed.content || "";
          } catch {
            // Can't parse, skip this check
          }

          // Only flag if existing content is substantial and new content is much shorter
          // (append mode adds to existing, so this mainly catches replace mode)
          if (
            args.append === false &&
            existingContent.length > 100 &&
            newContent.length < existingContent.length * 0.5
          ) {
            return {
              action: "guide",
              reason: `New content (${newContent.length} chars) is significantly shorter than existing content (${existingContent.length} chars) and you're replacing, not appending. Include previous observations or set append to true to add to existing content.`,
            };
          }
        }

        return { action: "proceed" };
      }

      default:
        return { action: "proceed" };
    }
  },
};

export const paramValidationHooks: SteeringHook[] = [paramValidationHook];
