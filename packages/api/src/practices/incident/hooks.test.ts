import { describe, it, expect } from "vitest";
import { getIncidentHooksForTier } from "./hooks.js";
import { runBeforeHooks, runAfterHooks } from "../../agent/steering.js";
import type { ToolLedger, ToolLedgerEntry } from "../../agent/steering.js";

function ledger(calls: Array<{ tool: string; args?: Record<string, unknown> }>): ToolLedger {
  return {
    calls: calls.map((c) => ({ tool: c.tool, args: c.args || {}, result: "{}", iteration: 0 })),
    currentIteration: 0,
  };
}

describe("getIncidentHooksForTier", () => {
  it("standard tier returns security + content-scan only", () => {
    const hooks = getIncidentHooksForTier("standard");
    const names = hooks.map((h) => h.name);
    expect(names).not.toContain("incident-tool-ordering");
    expect(names).not.toContain("incident-blame-scan");
    expect(names).not.toContain("incident-param-validation");
  });

  it("thorough tier adds tool ordering and blame scan", () => {
    const hooks = getIncidentHooksForTier("thorough");
    const names = hooks.map((h) => h.name);
    expect(names).toContain("incident-tool-ordering");
    expect(names).toContain("incident-blame-scan");
    expect(names).not.toContain("incident-param-validation");
  });

  it("rigorous tier adds all incident hooks", () => {
    const hooks = getIncidentHooksForTier("rigorous");
    const names = hooks.map((h) => h.name);
    expect(names).toContain("incident-tool-ordering");
    expect(names).toContain("incident-blame-scan");
    expect(names).toContain("incident-param-validation");
  });
});

describe("incident tool ordering hook", () => {
  const hooks = getIncidentHooksForTier("thorough");

  it("guides record_action_item without prior contributing factor", () => {
    const result = runBeforeHooks(hooks, "record_action_item", { title: "Fix" }, ledger([]));
    expect(result.action).toBe("guide");
    expect(result.reason).toContain("contributing factor");
  });

  it("proceeds record_action_item after contributing factor recorded", () => {
    const result = runBeforeHooks(
      hooks,
      "record_action_item",
      { title: "Fix" },
      ledger([{ tool: "record_contributing_factor" }]),
    );
    expect(result.action).toBe("proceed");
  });

  it("guides write_session_summary without prior section update", () => {
    const result = runBeforeHooks(hooks, "write_session_summary", {}, ledger([]));
    expect(result.action).toBe("guide");
    expect(result.reason).toContain("section");
  });

  it("proceeds write_session_summary after section update", () => {
    const result = runBeforeHooks(
      hooks,
      "write_session_summary",
      {},
      ledger([{ tool: "update_section_content" }]),
    );
    expect(result.action).toBe("proceed");
  });
});

describe("incident blame scan hook", () => {
  const hooks = getIncidentHooksForTier("thorough");

  it("appends warning when content contains 'human error'", () => {
    const result = runAfterHooks(
      hooks,
      "update_section_content",
      { content: "This was caused by human error in deployment" },
      '{"success":true}',
    );
    expect(result).toContain("STEERING NOTE");
    expect(result).toContain("blame");
  });

  it("appends warning for 'should have'", () => {
    const result = runAfterHooks(
      hooks,
      "update_section_content",
      { content: "The engineer should have checked the logs" },
      '{"success":true}',
    );
    expect(result).toContain("STEERING NOTE");
  });

  it("appends warning for 'root cause'", () => {
    const result = runAfterHooks(
      hooks,
      "update_question_response",
      { response: "The root cause was operator error" },
      '{"success":true}',
    );
    expect(result).toContain("STEERING NOTE");
  });

  it("does not modify content without blame language", () => {
    const original = '{"success":true}';
    const result = runAfterHooks(
      hooks,
      "update_section_content",
      { content: "The connection pool reached its configured maximum of 50 connections" },
      original,
    );
    expect(result).toBe(original);
  });

  it("does not trigger on unmatched tools", () => {
    const original = '{"success":true}';
    const result = runAfterHooks(
      hooks,
      "read_section",
      { content: "human error everywhere" },
      original,
    );
    expect(result).toBe(original);
  });
});

describe("incident param validation hook", () => {
  const hooks = getIncidentHooksForTier("rigorous");

  it("guides systemic factor with short context", () => {
    const result = runBeforeHooks(
      hooks,
      "record_contributing_factor",
      { category: "technical", description: "Pool sizing", is_systemic: true, context: "too small" },
      ledger([]),
    );
    expect(result.action).toBe("guide");
    expect(result.reason).toContain("Systemic");
  });

  it("proceeds for systemic factor with adequate context", () => {
    const result = runBeforeHooks(
      hooks,
      "record_contributing_factor",
      {
        category: "technical",
        description: "Pool sizing",
        is_systemic: true,
        context: "Connection pool sizing has been a recurring issue across three services in the last quarter, suggesting a systemic gap in capacity planning.",
      },
      ledger([]),
    );
    expect(result.action).toBe("proceed");
  });

  it("proceeds for non-systemic factor without context", () => {
    const result = runBeforeHooks(
      hooks,
      "record_contributing_factor",
      { category: "technical", description: "Pool sizing", is_systemic: false },
      ledger([]),
    );
    expect(result.action).toBe("proceed");
  });

  it("guides action item without contributing_factor_id", () => {
    const result = runBeforeHooks(
      hooks,
      "record_action_item",
      { title: "Fix pool", priority: "high", type: "technical" },
      // Need a contributing factor in the ledger for the ordering hook to pass
      ledger([{ tool: "record_contributing_factor" }]),
    );
    expect(result.action).toBe("guide");
    expect(result.reason).toContain("contributing factor");
  });

  it("proceeds for action item with contributing_factor_id", () => {
    const result = runBeforeHooks(
      hooks,
      "record_action_item",
      { title: "Fix pool", priority: "high", type: "technical", contributing_factor_id: "cf-1" },
      ledger([{ tool: "record_contributing_factor" }]),
    );
    expect(result.action).toBe("proceed");
  });
});
