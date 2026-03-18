import type { LLMAdapter } from "./adapter.js";
import { OpenAICompatibleAdapter } from "./openai-compatible.js";
import { AnthropicAdapter } from "./anthropic.js";
import { NoOpAdapter } from "./noop.js";
import { RetryAdapter } from "./retry.js";
import { log } from "../logger.js";

export type { LLMAdapter, LLMMessage, LLMToolDef, LLMToolCall, StreamChunk } from "./adapter.js";
export type { RetryEvent } from "./retry.js";

// Map short model names to Anthropic model IDs
const ANTHROPIC_MODEL_MAP: Record<string, string> = {
  "opus-4.6": "claude-opus-4-6",
  "sonnet-4.6": "claude-sonnet-4-6",
  "haiku-4.5": "claude-haiku-4-5-20251001",
  "sonnet": "claude-sonnet-4-20250514",
  "opus": "claude-opus-4-20250514",
  "haiku": "claude-haiku-4-5-20251001",
};

function isAnthropicKey(key: string): boolean {
  return key.startsWith("sk-ant-");
}

let _adapter: LLMAdapter | null = null;

export function getLLM(): LLMAdapter {
  if (!_adapter) {
    const apiKey = process.env.LLM_API_KEY;
    if (apiKey) {
      if (isAnthropicKey(apiKey)) {
        const modelInput = process.env.LLM_MODEL || "sonnet";
        const model = ANTHROPIC_MODEL_MAP[modelInput] || modelInput;
        const fallbackModelInput = process.env.LLM_FALLBACK_MODEL;

        if (fallbackModelInput && fallbackModelInput !== modelInput) {
          const fallbackModel = ANTHROPIC_MODEL_MAP[fallbackModelInput] || fallbackModelInput;
          _adapter = new RetryAdapter(
            new AnthropicAdapter(apiKey, model),
            new AnthropicAdapter(apiKey, fallbackModel),
            fallbackModel,
          );
          log("info", "LLM adapter initialized", { provider: "anthropic", model, fallbackModel });
        } else {
          _adapter = new RetryAdapter(new AnthropicAdapter(apiKey, model));
          log("info", "LLM adapter initialized", { provider: "anthropic", model });
        }
      } else {
        _adapter = new RetryAdapter(new OpenAICompatibleAdapter(
          apiKey,
          process.env.LLM_BASE_URL,
          process.env.LLM_MODEL,
        ));
        log("info", "LLM adapter initialized", { provider: "openai-compatible", model: process.env.LLM_MODEL || "gpt-4o" });
      }
    } else {
      _adapter = new NoOpAdapter();
      log("info", "LLM adapter initialized", { provider: "noop" });
    }
  }
  return _adapter;
}
