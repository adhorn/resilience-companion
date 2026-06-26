/**
 * Parallel test for BedrockAdapter — same `done`-emission rule.
 * BedrockAdapter wraps @anthropic-ai/bedrock-sdk, whose streaming surface
 * mirrors the direct Anthropic SDK, so the same double-emission risk
 * applies.
 */
import { describe, it, expect, vi } from "vitest";
import { BedrockAdapter } from "./bedrock.js";

function streamWithMessageDelta() {
  return {
    [Symbol.asyncIterator]: async function* () {
      yield {
        type: "message_delta",
        delta: { stop_reason: "end_turn", stop_sequence: null },
        usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 200, cache_read_input_tokens: 800 },
      };
    },
    finalMessage: async () => ({
      usage: { input_tokens: 100, output_tokens: 50 },
    }),
  };
}

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

describe("BedrockAdapter usage emission", () => {
  it("emits a single done chunk when message_delta carries usage", async () => {
    const adapter = new BedrockAdapter("sonnet", "us-east-1");
    (adapter as any).client = {
      messages: { stream: vi.fn(() => streamWithMessageDelta()) },
    };

    const chunks: any[] = [];
    for await (const chunk of adapter.chat([{ role: "user", content: "hi" }])) {
      chunks.push(chunk);
    }

    const doneChunks = chunks.filter((c) => c.type === "done");
    expect(doneChunks.length).toBe(1);
    expect(doneChunks[0].usage).toEqual({
      promptTokens: 100,
      completionTokens: 50,
      cacheCreationTokens: 200,
      cacheReadTokens: 800,
    });
  });

  it("falls back to finalMessage() when no message_delta has usage", async () => {
    const adapter = new BedrockAdapter("sonnet", "us-east-1");
    (adapter as any).client = {
      messages: { stream: vi.fn(() => streamWithoutMessageDelta()) },
    };

    const chunks: any[] = [];
    for await (const chunk of adapter.chat([{ role: "user", content: "hi" }])) {
      chunks.push(chunk);
    }

    const doneChunks = chunks.filter((c) => c.type === "done");
    expect(doneChunks.length).toBe(1);
    expect(doneChunks[0].usage).toEqual({
      promptTokens: 100,
      completionTokens: 50,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    });
  });
});
