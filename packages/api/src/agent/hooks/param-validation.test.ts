import { describe, it, expect } from "vitest";
import { paramValidationHook } from "./param-validation.js";
import type { ToolLedger } from "../steering.js";

const emptyLedger: ToolLedger = { calls: [], currentIteration: 0 };

describe("param-validation hook", () => {
  describe("update_depth_assessment", () => {
    it("guides on invalid depth value", () => {
      const result = paramValidationHook.beforeToolCall!(
        "update_depth_assessment",
        { depth: "VERY_DEEP", rationale: "It's great" },
        emptyLedger,
      );
      expect(result.action).toBe("guide");
      expect(result.reason).toContain("Invalid depth");
    });

    it("guides DEEP with short rationale", () => {
      const result = paramValidationHook.beforeToolCall!(
        "update_depth_assessment",
        { depth: "DEEP", rationale: "Good" },
        emptyLedger,
      );
      expect(result.action).toBe("guide");
      expect(result.reason).toContain("at least 50 characters");
    });

    it("proceeds DEEP with sufficient rationale", () => {
      const result = paramValidationHook.beforeToolCall!(
        "update_depth_assessment",
        { depth: "DEEP", rationale: "Team demonstrated deep understanding by tracing failover paths and predicting novel failure modes." },
        emptyLedger,
      );
      expect(result.action).toBe("proceed");
    });

    it("guides MODERATE with short rationale", () => {
      const result = paramValidationHook.beforeToolCall!(
        "update_depth_assessment",
        { depth: "MODERATE", rationale: "OK" },
        emptyLedger,
      );
      expect(result.action).toBe("guide");
    });
  });

  describe("set_flags", () => {
    it("guides when flag note is too short", () => {
      const result = paramValidationHook.beforeToolCall!(
        "set_flags",
        { flags: [{ type: "RISK", note: "bad" }] },
        emptyLedger,
      );
      expect(result.action).toBe("guide");
      expect(result.reason).toContain("at least 10 characters");
    });

    it("proceeds with sufficient flag notes", () => {
      const result = paramValidationHook.beforeToolCall!(
        "set_flags",
        { flags: [{ type: "RISK", note: "No failover path tested for database dependency" }] },
        emptyLedger,
      );
      expect(result.action).toBe("proceed");
    });
  });

  describe("update_section_content", () => {
    it("guides when replacing with much shorter content", () => {
      const existingContent = "A".repeat(200);
      const ledger: ToolLedger = {
        calls: [{
          tool: "read_section",
          args: { section_id: "sec-1" },
          result: JSON.stringify({ content: existingContent }),
          iteration: 0,
        }],
        currentIteration: 0,
      };

      const result = paramValidationHook.beforeToolCall!(
        "update_section_content",
        { section_id: "sec-1", content: "Short.", append: false },
        ledger,
      );
      expect(result.action).toBe("guide");
      expect(result.reason).toContain("significantly shorter");
    });

    it("proceeds in append mode regardless of length", () => {
      const existingContent = "A".repeat(200);
      const ledger: ToolLedger = {
        calls: [{
          tool: "read_section",
          args: { section_id: "sec-1" },
          result: JSON.stringify({ content: existingContent }),
          iteration: 0,
        }],
        currentIteration: 0,
      };

      const result = paramValidationHook.beforeToolCall!(
        "update_section_content",
        { section_id: "sec-1", content: "Short addition." },
        ledger,
      );
      expect(result.action).toBe("proceed");
    });
  });
});
