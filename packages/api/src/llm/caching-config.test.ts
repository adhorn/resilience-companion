import { describe, it, expect } from "vitest";
import { isPromptCachingEnabled, resolveConfiguredPromptCacheTtl } from "./caching-config.js";

describe("caching-config", () => {
  it("enables caching by default for Bedrock", () => {
    expect(isPromptCachingEnabled({ LLM_PROVIDER: "bedrock" })).toBe(true);
  });

  it("enables caching by default for Anthropic keys", () => {
    expect(isPromptCachingEnabled({ LLM_API_KEY: "sk-ant-test" })).toBe(true);
  });

  it("disables caching by default for OpenAI-compatible keys", () => {
    expect(isPromptCachingEnabled({ LLM_API_KEY: "sk-openai" })).toBe(false);
  });

  it("respects LLM_PROMPT_CACHING=false override", () => {
    expect(isPromptCachingEnabled({ LLM_PROVIDER: "bedrock", LLM_PROMPT_CACHING: "false" })).toBe(false);
  });

  it("disables caching for a Bedrock model that does not support cache_control", () => {
    expect(isPromptCachingEnabled({ LLM_PROVIDER: "bedrock", LLM_MODEL: "some.unsupported.model-v1:0" })).toBe(false);
  });

  it("does not enable caching even when explicitly requested on an unsupported model", () => {
    expect(isPromptCachingEnabled({
      LLM_PROVIDER: "bedrock",
      LLM_MODEL: "some.unsupported.model-v1:0",
      LLM_PROMPT_CACHING: "true",
    })).toBe(false);
  });

  it("clamps TTL for Sonnet 4.6 on Bedrock", () => {
    expect(resolveConfiguredPromptCacheTtl({
      LLM_PROVIDER: "bedrock",
      LLM_MODEL: "sonnet",
      LLM_PROMPT_CACHE_TTL: "1h",
    })).toBe("5m");
  });
});
