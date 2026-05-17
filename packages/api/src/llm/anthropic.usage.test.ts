/**
 * Verifies the `done`-emission behavior of AnthropicAdapter. One LLM call
 * must produce exactly one `done` chunk; otherwise the agent loop's
 * accumulator at agent/loop.ts double-counts and the recorded
 * `tokenUsage` (UI counter, persisted session total, cost dashboards) runs
 * at ~2× the real spend, with the further consequence that session
 * auto-renewal and the SESSION_TOKEN_WARNING / SESSION_TOKEN_URGENT
 * thresholds trip at half the configured budget.
 */
import { describe, it, expect, vi } from "vitest";
import { AnthropicAdapter } from "./anthropic.js";

/** A stream that yields one message_delta event with cumulative usage. */
function streamWithMessageDelta() {
  return {
    [Symbol.asyncIterator]: async function* () {
      yield {
        type: "message_delta",
        delta: { stop_reason: "end_turn", stop_sequence: null },
        usage: { input_tokens: 100, output_tokens: 50 },
      };
    },
    finalMessage: async () => ({
      usage: { input_tokens: 100, output_tokens: 50 },
    }),
  };
}

/** A stream that yields no message_delta events (e.g. content-only stream). */
function streamWithoutMessageDelta() {
  return {
    [Symbol.asyncIterator]: async function* () {
      // no events
    },
    finalMessage: async () => ({
      usage: { input_tokens: 100, output_tokens: 50 },
    }),
  };
}

describe("AnthropicAdapter usage emission", () => {
  it("emits a single done chunk when message_delta carries usage", async () => {
    const adapter = new AnthropicAdapter("test-key");
    (adapter as any).client = {
      messages: { stream: vi.fn(() => streamWithMessageDelta()) },
    };

    const chunks: any[] = [];
    for await (const chunk of adapter.chat([{ role: "user", content: "hi" }])) {
      chunks.push(chunk);
    }

    const doneChunks = chunks.filter((c) => c.type === "done");
    expect(doneChunks.length).toBe(1);
    expect(doneChunks[0].usage).toEqual({ promptTokens: 100, completionTokens: 50 });
  });

  it("falls back to finalMessage() when no message_delta has usage", async () => {
    const adapter = new AnthropicAdapter("test-key");
    (adapter as any).client = {
      messages: { stream: vi.fn(() => streamWithoutMessageDelta()) },
    };

    const chunks: any[] = [];
    for await (const chunk of adapter.chat([{ role: "user", content: "hi" }])) {
      chunks.push(chunk);
    }

    const doneChunks = chunks.filter((c) => c.type === "done");
    expect(doneChunks.length).toBe(1);
    expect(doneChunks[0].usage).toEqual({ promptTokens: 100, completionTokens: 50 });
  });
});
