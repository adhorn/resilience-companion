import type { LLMAdapter, LLMMessage, LLMToolDef, StreamChunk } from "./adapter.js";

/**
 * NoOp adapter — used when no LLM is configured.
 * Returns a helpful message explaining the tool works without AI.
 */
export class NoOpAdapter implements LLMAdapter {
  async *chat(
    _messages: LLMMessage[],
    _tools?: LLMToolDef[],
  ): AsyncGenerator<StreamChunk> {
    yield {
      type: "content",
      content:
        "AI assistance is not configured. You can still use the ORR Companion to work through sections manually — edit content directly and use the template prompts as your guide. To enable AI, set LLM_API_KEY in your environment.",
    };
    yield { type: "done", usage: { promptTokens: 0, completionTokens: 0 } };
  }
}
