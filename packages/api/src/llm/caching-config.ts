import {
  DEFAULT_LLM_MODEL,
  resolveAnthropicModel,
  resolveBedrockModel,
  resolvePromptCacheTtl,
  supportsPromptCaching,
  type PromptCacheTtl,
} from "@orr/shared";
import { log } from "../logger.js";

function isAnthropicKey(key: string): boolean {
  return key.startsWith("sk-ant-");
}

function parseEnvBool(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === "") return defaultValue;
  return value.toLowerCase() === "true" || value === "1";
}

function resolveCachingModelId(env: Record<string, string | undefined>): string | null {
  const provider = env.LLM_PROVIDER;
  const apiKey = env.LLM_API_KEY;
  const modelInput = env.LLM_MODEL || DEFAULT_LLM_MODEL;

  if (provider === "bedrock") return resolveBedrockModel(modelInput);
  if (apiKey && isAnthropicKey(apiKey)) return resolveAnthropicModel(modelInput);
  return null;
}

export function isPromptCachingEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const modelId = resolveCachingModelId(env);
  if (!modelId) return false;

  const explicit = env.LLM_PROMPT_CACHING;
  const explicitlyRequested =
    explicit !== undefined && explicit !== "" ? parseEnvBool(explicit, true) : null;

  if (explicitlyRequested === false) return false;

  if (!supportsPromptCaching(modelId)) {
    if (explicitlyRequested === true) {
      log("warn", "LLM_PROMPT_CACHING requested but model does not support prompt caching — disabling", { model: modelId });
    }
    return false;
  }

  return true;
}

export function resolveConfiguredPromptCacheTtl(env: Record<string, string | undefined> = process.env): PromptCacheTtl {
  const modelId = resolveCachingModelId(env);
  if (!modelId) return "5m";
  return resolvePromptCacheTtl(modelId, env.LLM_PROMPT_CACHE_TTL);
}
