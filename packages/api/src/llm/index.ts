import type { LLMAdapter } from "./adapter.js";
import { OpenAICompatibleAdapter } from "./openai-compatible.js";
import { AnthropicAdapter } from "./anthropic.js";
import { BedrockAdapter } from "./bedrock.js";
import { NoOpAdapter } from "./noop.js";
import { RetryAdapter } from "./retry.js";
import { log } from "../logger.js";
import {
  DEFAULT_LLM_MODEL,
  resolveAnthropicModel,
  resolveBedrockModel,
} from "@orr/shared";

export type { LLMAdapter, LLMMessage, LLMToolDef, LLMToolCall, StreamChunk, LLMChatOptions, LLMUsage, CacheBreakpoint, PromptCacheTtl } from "./adapter.js";
export { totalInputTokens } from "./adapter.js";
export { isPromptCachingEnabled, resolveConfiguredPromptCacheTtl } from "./caching-config.js";
export type { RetryEvent } from "./retry.js";

function isAnthropicKey(key: string): boolean {
  return key.startsWith("sk-ant-");
}

let _adapter: LLMAdapter | null = null;

/**
 * Returns the singleton LLM adapter, auto-configured from environment variables.
 *
 * Provider detection (in order):
 * 1. `LLM_PROVIDER=bedrock` → BedrockAdapter (AWS credential chain, no API key needed)
 * 2. `sk-ant-*` key         → AnthropicAdapter (native SDK, supports model shortnames)
 * 3. Any other key          → OpenAICompatibleAdapter (works with OpenAI, Azure, Ollama)
 * 4. No key                 → NoOpAdapter (app works without AI as structured review tool)
 *
 * All real adapters are wrapped in RetryAdapter (exponential backoff + optional
 * fallback model via LLM_FALLBACK_MODEL).
 */
/** Override the singleton adapter (for evals and tests). */
export function setLLM(adapter: LLMAdapter): void {
  _adapter = adapter;
}

/** Reset the singleton so it will be re-initialized from env vars on next getLLM() call. */
export function resetLLM(): void {
  _adapter = null;
}

export function resolveConfiguredModelForLogging(env: Record<string, string | undefined> = process.env): string {
  const provider = env.LLM_PROVIDER;
  const apiKey = env.LLM_API_KEY;

  if (provider === "bedrock") {
    return resolveBedrockModel(env.LLM_MODEL || DEFAULT_LLM_MODEL);
  }

  if (apiKey) {
    if (isAnthropicKey(apiKey)) {
      return resolveAnthropicModel(env.LLM_MODEL || DEFAULT_LLM_MODEL);
    }
    return env.LLM_MODEL || "gpt-4o";
  }

  return "noop";
}

export function getLLM(): LLMAdapter {
  if (!_adapter) {
    const provider = process.env.LLM_PROVIDER;
    const apiKey = process.env.LLM_API_KEY;

    if (provider === "bedrock") {
      const modelInput = process.env.LLM_MODEL || DEFAULT_LLM_MODEL;
      const model = resolveBedrockModel(modelInput);
      const region = process.env.AWS_REGION;
      const fallbackModelInput = process.env.LLM_FALLBACK_MODEL;

      if (fallbackModelInput && fallbackModelInput !== modelInput) {
        const fallbackModel = resolveBedrockModel(fallbackModelInput);
        _adapter = new RetryAdapter(
          new BedrockAdapter(model, region),
          new BedrockAdapter(fallbackModel, region),
          fallbackModel,
        );
        log("info", "LLM adapter initialized", { provider: "bedrock", model, fallbackModel, region: region || "us-east-1" });
      } else {
        _adapter = new RetryAdapter(new BedrockAdapter(model, region));
        log("info", "LLM adapter initialized", { provider: "bedrock", model, region: region || "us-east-1" });
      }
    } else if (apiKey) {
      if (isAnthropicKey(apiKey)) {
        const modelInput = process.env.LLM_MODEL || DEFAULT_LLM_MODEL;
        const model = resolveAnthropicModel(modelInput);
        const fallbackModelInput = process.env.LLM_FALLBACK_MODEL;

        if (fallbackModelInput && fallbackModelInput !== modelInput) {
          const fallbackModel = resolveAnthropicModel(fallbackModelInput);
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
