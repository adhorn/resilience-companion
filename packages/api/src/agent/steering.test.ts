import { describe, it, expect } from "vitest";
import { runBeforeHooks, runAfterHooks, type SteeringHook, type ToolLedger } from "./steering.js";

const emptyLedger: ToolLedger = { calls: [], currentIteration: 0 };

describe("runBeforeHooks", () => {
  it("returns proceed when no hooks match", () => {
    const hook: SteeringHook = {
      name: "test-hook",
      tools: ["other_tool"],
      beforeToolCall: () => ({ action: "guide", reason: "nope" }),
    };
    const result = runBeforeHooks([hook], "read_section", {}, emptyLedger);
    expect(result.action).toBe("proceed");
  });

  it("short-circuits on first guide", () => {
    const hook1: SteeringHook = {
      name: "hook-1",
      tools: null,
      beforeToolCall: () => ({ action: "guide", reason: "first" }),
    };
    const hook2: SteeringHook = {
      name: "hook-2",
      tools: null,
      beforeToolCall: () => ({ action: "guide", reason: "second" }),
    };
    const result = runBeforeHooks([hook1, hook2], "any_tool", {}, emptyLedger);
    expect(result.action).toBe("guide");
    expect(result.reason).toBe("first");
    expect(result.hookName).toBe("hook-1");
  });

  it("tools: null applies to all tools", () => {
    const hook: SteeringHook = {
      name: "global",
      tools: null,
      beforeToolCall: () => ({ action: "guide", reason: "blocked" }),
    };
    const result = runBeforeHooks([hook], "any_tool_name", {}, emptyLedger);
    expect(result.action).toBe("guide");
  });

  it("proceeds when all hooks proceed", () => {
    const hook: SteeringHook = {
      name: "ok",
      tools: null,
      beforeToolCall: () => ({ action: "proceed" }),
    };
    const result = runBeforeHooks([hook], "read_section", {}, emptyLedger);
    expect(result.action).toBe("proceed");
  });
});

describe("runAfterHooks", () => {
  it("chains transformations in order", () => {
    const hook1: SteeringHook = {
      name: "upper",
      tools: null,
      afterToolResult: (_name, _args, result) => result.toUpperCase(),
    };
    const hook2: SteeringHook = {
      name: "wrap",
      tools: null,
      afterToolResult: (_name, _args, result) => `[${result}]`,
    };
    const result = runAfterHooks([hook1, hook2], "any_tool", {}, "hello");
    expect(result).toBe("[HELLO]");
  });

  it("skips hooks that don't match the tool", () => {
    const hook: SteeringHook = {
      name: "specific",
      tools: ["other_tool"],
      afterToolResult: (_name, _args, result) => "REPLACED",
    };
    const result = runAfterHooks([hook], "read_section", {}, "original");
    expect(result).toBe("original");
  });
});
