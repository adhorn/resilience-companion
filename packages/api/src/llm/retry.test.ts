import { describe, it, expect, vi } from "vitest";
import { RetryAdapter } from "./retry.js";
import type { LLMAdapter, LLMMessage, LLMChatOptions, StreamChunk } from "./adapter.js";

function successStream(): AsyncGenerator<StreamChunk> {
  return (async function* () {
    yield { type: "done", usage: { promptTokens: 1, completionTokens: 1 } };
  })();
}

describe("RetryAdapter options forwarding", () => {
  it("forwards chat options to inner adapter", async () => {
    const inner: LLMAdapter = {
      chat: vi.fn(() => successStream()),
    };
    const adapter = new RetryAdapter(inner);
    const messages: LLMMessage[] = [
      { role: "system", content: "static", cacheBreakpoint: { ttl: "5m" } },
      { role: "user", content: "hi" },
    ];
    const options: LLMChatOptions = { enablePromptCaching: true, toolsCacheTtl: "5m" };

    for await (const _chunk of adapter.chat(messages, [], options)) {}

    expect(inner.chat).toHaveBeenCalledWith(messages, [], options);
  });

  it("forwards chat options to fallback adapter on primary failure", async () => {
    vi.useFakeTimers();
    const inner: LLMAdapter = {
      chat: vi.fn(() => {
        throw Object.assign(new Error("overloaded"), { status: 529 });
      }),
    };
    const fallback: LLMAdapter = {
      chat: vi.fn(() => successStream()),
    };
    const adapter = new RetryAdapter(inner, fallback, "fallback");
    const messages: LLMMessage[] = [{ role: "user", content: "hi" }];
    const options: LLMChatOptions = { enablePromptCaching: true, toolsCacheTtl: "5m" };

    const consume = (async () => {
      for await (const _chunk of adapter.chat(messages, [], options)) {}
    })();

    await vi.runAllTimersAsync();
    await consume;

    expect(fallback.chat).toHaveBeenCalledWith(messages, [], options);
    vi.useRealTimers();
  });
});
