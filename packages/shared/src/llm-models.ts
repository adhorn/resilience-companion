export const DEFAULT_LLM_MODEL = "sonnet" as const;

export type LlmModelShortname = "sonnet" | "opus";

export const ANTHROPIC_MODEL_IDS: Record<LlmModelShortname, string> = {
  sonnet: "claude-sonnet-4-6",
  opus: "claude-opus-4-8",
};

export const BEDROCK_MODEL_IDS: Record<LlmModelShortname, string> = {
  sonnet: "us.anthropic.claude-sonnet-4-6",
  opus: "us.anthropic.claude-opus-4-8",
};

const LEGACY_ANTHROPIC_MODEL_IDS: Record<string, string> = {
  haiku: "claude-haiku-4-5",
  "haiku-4.5": "claude-haiku-4-5",
  "sonnet-4.6": ANTHROPIC_MODEL_IDS.sonnet,
  "opus-4.8": ANTHROPIC_MODEL_IDS.opus,
};

const LEGACY_BEDROCK_MODEL_IDS: Record<string, string> = {
  haiku: "us.anthropic.claude-haiku-4-5-20251001-v1:0",
  "haiku-4.5": "us.anthropic.claude-haiku-4-5-20251001-v1:0",
  "sonnet-4.6": BEDROCK_MODEL_IDS.sonnet,
  "opus-4.8": BEDROCK_MODEL_IDS.opus,
};

export const EVAL_SIMULATED_USER_MODEL = "claude-haiku-4-5";

export function resolveAnthropicModel(input: string): string {
  return (ANTHROPIC_MODEL_IDS as Record<string, string>)[input] ?? LEGACY_ANTHROPIC_MODEL_IDS[input] ?? input;
}

export function resolveBedrockModel(input: string): string {
  return (BEDROCK_MODEL_IDS as Record<string, string>)[input] ?? LEGACY_BEDROCK_MODEL_IDS[input] ?? input;
}

export type PromptCacheTtl = "5m" | "1h";

export interface PromptCachingModelConfig {
  allowedTtls: PromptCacheTtl[];
}

export const PROMPT_CACHING_MODEL_CONFIG: Record<string, PromptCachingModelConfig> = {
  "claude-sonnet-4-6": { allowedTtls: ["5m"] },
  "claude-opus-4-8": { allowedTtls: ["5m"] },
  "claude-haiku-4-5": { allowedTtls: ["5m", "1h"] },
  "us.anthropic.claude-sonnet-4-6": { allowedTtls: ["5m"] },
  "us.anthropic.claude-opus-4-8": { allowedTtls: ["5m"] },
  "us.anthropic.claude-haiku-4-5-20251001-v1:0": { allowedTtls: ["5m", "1h"] },
  "us.anthropic.claude-sonnet-4-5-20250929-v1:0": { allowedTtls: ["5m", "1h"] },
  "us.anthropic.claude-opus-4-5-20251101-v1:0": { allowedTtls: ["5m", "1h"] },
};

function findPromptCachingConfig(modelId: string): PromptCachingModelConfig | undefined {
  return PROMPT_CACHING_MODEL_CONFIG[modelId];
}

export function supportsPromptCaching(modelId: string): boolean {
  return findPromptCachingConfig(modelId) !== undefined;
}

export function resolvePromptCacheTtl(modelId: string, requested?: string): PromptCacheTtl {
  const config = findPromptCachingConfig(modelId);
  const ttl: PromptCacheTtl = requested === "1h" ? "1h" : "5m";
  if (!config) return "5m";
  if (config.allowedTtls.includes(ttl)) return ttl;
  return config.allowedTtls[0];
}
