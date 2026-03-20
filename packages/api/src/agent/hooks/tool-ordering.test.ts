import { describe, it, expect } from "vitest";
import { toolOrderingHook } from "./tool-ordering.js";
import type { ToolLedger } from "../steering.js";

function ledger(calls: Array<{ tool: string; args: Record<string, unknown> }>): ToolLedger {
  return {
    calls: calls.map((c) => ({ ...c, result: "{}", iteration: 0 })),
    currentIteration: 0,
  };
}

describe("tool-ordering hook", () => {
  it("guides update_section_content without prior read_section", () => {
    const result = toolOrderingHook.beforeToolCall!(
      "update_section_content",
      { section_id: "sec-1" },
      ledger([]),
    );
    expect(result.action).toBe("guide");
    expect(result.reason).toContain("read_section");
  });

  it("proceeds after read_section for same section", () => {
    const result = toolOrderingHook.beforeToolCall!(
      "update_section_content",
      { section_id: "sec-1" },
      ledger([{ tool: "read_section", args: { section_id: "sec-1" } }]),
    );
    expect(result.action).toBe("proceed");
  });

  it("guides when read_section was for different section", () => {
    const result = toolOrderingHook.beforeToolCall!(
      "update_section_content",
      { section_id: "sec-1" },
      ledger([{ tool: "read_section", args: { section_id: "sec-2" } }]),
    );
    expect(result.action).toBe("guide");
  });

  it("guides write_session_summary without prior write operations", () => {
    const result = toolOrderingHook.beforeToolCall!(
      "write_session_summary",
      {},
      ledger([{ tool: "read_section", args: { section_id: "sec-1" } }]),
    );
    expect(result.action).toBe("guide");
    expect(result.reason).toContain("update at least one section");
  });

  it("proceeds write_session_summary after section update", () => {
    const result = toolOrderingHook.beforeToolCall!(
      "write_session_summary",
      {},
      ledger([
        { tool: "read_section", args: { section_id: "sec-1" } },
        { tool: "update_section_content", args: { section_id: "sec-1", content: "obs" } },
      ]),
    );
    expect(result.action).toBe("proceed");
  });
});
