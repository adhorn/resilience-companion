import { describe, it, expect, vi, beforeEach } from "vitest";
import { trimHistory, flushSessionSummary } from "./session-routes.js";
import type { LLMMessage } from "../../llm/index.js";
import { MAX_SESSION_TOKENS, SESSION_TOKEN_WARNING, SESSION_TOKEN_URGENT } from "@orr/shared";

// --- trimHistory tests ---

describe("trimHistory", () => {
  const CHARS_PER_TOKEN = 4;

  it("returns all messages when under budget", () => {
    const msgs: LLMMessage[] = [
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi there" },
    ];
    const result = trimHistory(msgs, 1000, CHARS_PER_TOKEN);
    expect(result).toHaveLength(2);
  });

  it("trims oldest messages when over budget", () => {
    const msgs: LLMMessage[] = [
      { role: "user", content: "a".repeat(400) },      // 100 tokens
      { role: "assistant", content: "b".repeat(400) },  // 100 tokens
      { role: "user", content: "c".repeat(400) },       // 100 tokens
      { role: "assistant", content: "d".repeat(400) },   // 100 tokens
    ];
    // Budget of 250 tokens — should keep last 2 messages
    const result = trimHistory(msgs, 250, CHARS_PER_TOKEN);
    expect(result.length).toBeLessThan(4);
    // Last message should always be preserved
    expect(result[result.length - 1].content).toBe("d".repeat(400));
  });

  it("returns empty array for empty input", () => {
    expect(trimHistory([], 1000, CHARS_PER_TOKEN)).toHaveLength(0);
  });

  it("ensures first kept message is a user message", () => {
    const msgs: LLMMessage[] = [
      { role: "user", content: "a".repeat(100) },
      { role: "assistant", content: "b".repeat(100) },
      { role: "user", content: "c".repeat(100) },
      { role: "assistant", content: "d".repeat(100) },
    ];
    // Budget that would start on an assistant message
    const result = trimHistory(msgs, 60, CHARS_PER_TOKEN);
    if (result.length > 0) {
      expect(result[0].role).toBe("user");
    }
  });
});

// --- Budget warning threshold tests ---

describe("budget warning thresholds", () => {
  it("WARNING threshold is 75%", () => {
    expect(SESSION_TOKEN_WARNING).toBe(0.75);
  });

  it("URGENT threshold is 90%", () => {
    expect(SESSION_TOKEN_URGENT).toBe(0.90);
  });

  it("WARNING triggers before URGENT", () => {
    expect(SESSION_TOKEN_WARNING).toBeLessThan(SESSION_TOKEN_URGENT);
  });

  it("budget warning logic appends correct text at each threshold", () => {
    // Simulate the logic from loop.ts
    function getBudgetWarning(sessionTokenUsage: number): string | null {
      const tokenFraction = sessionTokenUsage / MAX_SESSION_TOKENS;
      if (tokenFraction >= SESSION_TOKEN_URGENT) {
        return "SESSION BUDGET — URGENT";
      } else if (tokenFraction >= SESSION_TOKEN_WARNING) {
        return "Session Budget";
      }
      return null;
    }

    // Below warning: no message
    expect(getBudgetWarning(MAX_SESSION_TOKENS * 0.5)).toBeNull();
    expect(getBudgetWarning(MAX_SESSION_TOKENS * 0.74)).toBeNull();

    // At/above warning, below urgent
    expect(getBudgetWarning(MAX_SESSION_TOKENS * 0.75)).toBe("Session Budget");
    expect(getBudgetWarning(MAX_SESSION_TOKENS * 0.85)).toBe("Session Budget");

    // At/above urgent
    expect(getBudgetWarning(MAX_SESSION_TOKENS * 0.90)).toBe("SESSION BUDGET — URGENT");
    expect(getBudgetWarning(MAX_SESSION_TOKENS * 0.99)).toBe("SESSION BUDGET — URGENT");
  });
});

// --- flushSessionSummary tests ---

// Mock the LLM module
vi.mock("../../llm/index.js", () => ({
  getLLM: vi.fn(),
}));

import { getLLM } from "../../llm/index.js";
const mockGetLLM = vi.mocked(getLLM);

describe("flushSessionSummary", () => {
  const mockPracticeConfig = {
    practiceType: "orr" as const,
    tools: [],
    sectionUpdateTools: [],
    sectionUpdateFieldMap: {},
    dataUpdateTools: [],
    buildContext: vi.fn(),
    buildSystemPrompt: vi.fn(),
    executeTool: vi.fn().mockReturnValue(JSON.stringify({ success: true })),
    loadSteeringTier: vi.fn(),
    getHooks: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls write_session_summary when LLM produces a tool call", async () => {
    // Mock LLM that produces a write_session_summary tool call
    const mockChat = async function* () {
      yield { type: "tool_call_start" as const, toolCallId: "tc-1", toolName: "write_session_summary" };
      yield { type: "tool_call_args" as const, toolCallId: "tc-1", toolArgs: '{"summary":"Test session summary","discoveries":["Discovery 1"]}' };
      yield { type: "tool_call_end" as const, toolCallId: "tc-1", toolArgs: '{"summary":"Test session summary","discoveries":["Discovery 1"]}' };
      yield { type: "done" as const, usage: { promptTokens: 100, completionTokens: 50 } };
    };
    mockGetLLM.mockReturnValue({ chat: mockChat } as any);

    const result = await flushSessionSummary(
      mockPracticeConfig as any,
      "orr-1",
      "session-1",
      [{ role: "user", content: "hello" }, { role: "assistant", content: "hi there" }],
    );

    expect(result).toBe(true);
    expect(mockPracticeConfig.executeTool).toHaveBeenCalledWith(
      "write_session_summary",
      { summary: "Test session summary", discoveries: ["Discovery 1"] },
      "orr-1",
      "session-1",
    );
  });

  it("returns false when LLM produces no tool call", async () => {
    const mockChat = async function* () {
      yield { type: "content" as const, content: "I cannot summarize." };
      yield { type: "done" as const, usage: { promptTokens: 50, completionTokens: 20 } };
    };
    mockGetLLM.mockReturnValue({ chat: mockChat } as any);

    const result = await flushSessionSummary(
      mockPracticeConfig as any,
      "orr-1",
      "session-1",
      [{ role: "user", content: "hello" }],
    );

    expect(result).toBe(false);
    expect(mockPracticeConfig.executeTool).not.toHaveBeenCalled();
  });

  it("returns false when LLM throws an error", async () => {
    const mockChat = async function* () {
      throw new Error("API rate limited");
      yield; // unreachable, satisfies generator type
    };
    mockGetLLM.mockReturnValue({ chat: mockChat } as any);

    const result = await flushSessionSummary(
      mockPracticeConfig as any,
      "orr-1",
      "session-1",
      [{ role: "user", content: "hello" }],
    );

    expect(result).toBe(false);
    expect(mockPracticeConfig.executeTool).not.toHaveBeenCalled();
  });

  it("only uses last 10 messages for context", async () => {
    let capturedMessages: any[] = [];
    const mockChat = async function* (messages: any[]) {
      capturedMessages = messages;
      yield { type: "done" as const, usage: { promptTokens: 50, completionTokens: 20 } };
    };
    mockGetLLM.mockReturnValue({ chat: mockChat } as any);

    const manyMessages = Array.from({ length: 20 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `Message ${i}`,
    }));

    await flushSessionSummary(mockPracticeConfig as any, "orr-1", "session-1", manyMessages);

    // The user message content should contain only last 10 messages
    const userContent = capturedMessages[1]?.content || "";
    expect(userContent).toContain("Message 10");
    expect(userContent).toContain("Message 19");
    expect(userContent).not.toContain("Message 0");
    expect(userContent).not.toContain("Message 9");
  });

  it("truncates long message content to 300 chars", async () => {
    let capturedMessages: any[] = [];
    const mockChat = async function* (messages: any[]) {
      capturedMessages = messages;
      yield { type: "done" as const, usage: { promptTokens: 50, completionTokens: 20 } };
    };
    mockGetLLM.mockReturnValue({ chat: mockChat } as any);

    const longMessage = "x".repeat(1000);
    await flushSessionSummary(
      mockPracticeConfig as any,
      "orr-1",
      "session-1",
      [{ role: "user", content: longMessage }],
    );

    const userContent = capturedMessages[1]?.content || "";
    // The message content in the prompt should be truncated
    expect(userContent).not.toContain("x".repeat(1000));
    // But should contain the truncated version (300 chars)
    expect(userContent).toContain("x".repeat(300));
  });

  it("handles streaming tool args in chunks", async () => {
    const mockChat = async function* () {
      yield { type: "tool_call_start" as const, toolCallId: "tc-1", toolName: "write_session_summary" };
      yield { type: "tool_call_args" as const, toolCallId: "tc-1", toolArgs: '{"summary":' };
      yield { type: "tool_call_args" as const, toolCallId: "tc-1", toolArgs: '"Chunk summary",' };
      yield { type: "tool_call_args" as const, toolCallId: "tc-1", toolArgs: '"discoveries":["d1"]}' };
      yield { type: "tool_call_end" as const, toolCallId: "tc-1", toolArgs: '{"summary":"Chunk summary","discoveries":["d1"]}' };
      yield { type: "done" as const, usage: { promptTokens: 100, completionTokens: 50 } };
    };
    mockGetLLM.mockReturnValue({ chat: mockChat } as any);

    const result = await flushSessionSummary(
      mockPracticeConfig as any,
      "orr-1",
      "session-1",
      [{ role: "user", content: "hello" }],
    );

    expect(result).toBe(true);
    // tool_call_end provides the final args, which should be used
    expect(mockPracticeConfig.executeTool).toHaveBeenCalledWith(
      "write_session_summary",
      { summary: "Chunk summary", discoveries: ["d1"] },
      "orr-1",
      "session-1",
    );
  });
});
