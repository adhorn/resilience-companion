import { describe, expect, it } from "vitest";
import {
  ANTHROPIC_MODEL_IDS,
  BEDROCK_MODEL_IDS,
  DEFAULT_LLM_MODEL,
  EVAL_SIMULATED_USER_MODEL,
  resolveAnthropicModel,
  resolveBedrockModel,
  resolvePromptCacheTtl,
  supportsPromptCaching,
} from "./llm-models.js";

describe("llm-models", () => {
  it("defaults to sonnet shortname", () => {
    expect(DEFAULT_LLM_MODEL).toBe("sonnet");
  });

  it("resolves anthropic shortnames", () => {
    expect(resolveAnthropicModel("sonnet")).toBe("claude-sonnet-4-6");
    expect(resolveAnthropicModel("opus")).toBe("claude-opus-4-8");
  });

  it("passes through full anthropic model IDs", () => {
    expect(resolveAnthropicModel("claude-opus-4-6")).toBe("claude-opus-4-6");
  });

  it("resolves bedrock shortnames", () => {
    expect(resolveBedrockModel("sonnet")).toBe(BEDROCK_MODEL_IDS.sonnet);
    expect(resolveBedrockModel("opus")).toBe(BEDROCK_MODEL_IDS.opus);
  });

  it("uses canonical Bedrock geo inference profile IDs for 4.6+ models", () => {
    expect(BEDROCK_MODEL_IDS.sonnet).toBe("us.anthropic.claude-sonnet-4-6");
    expect(BEDROCK_MODEL_IDS.opus).toBe("us.anthropic.claude-opus-4-8");
  });

  it("passes through unmapped bedrock model IDs unchanged", () => {
    const fullId = "global.anthropic.claude-opus-4-8";
    expect(resolveBedrockModel(fullId)).toBe(fullId);
  });

  it("still resolves legacy haiku shortnames at the code layer", () => {
    expect(resolveAnthropicModel("haiku")).toBe("claude-haiku-4-5");
    expect(resolveAnthropicModel("haiku-4.5")).toBe("claude-haiku-4-5");
    expect(resolveBedrockModel("haiku")).toBe("us.anthropic.claude-haiku-4-5-20251001-v1:0");
    expect(resolveBedrockModel("haiku-4.5")).toBe("us.anthropic.claude-haiku-4-5-20251001-v1:0");
  });

  it("defines eval simulated-user model as haiku alias", () => {
    expect(EVAL_SIMULATED_USER_MODEL).toBe("claude-haiku-4-5");
  });
});

describe("resolvePromptCacheTtl", () => {
  it("defaults to 5m for Sonnet 4.6", () => {
    expect(resolvePromptCacheTtl("us.anthropic.claude-sonnet-4-6", "1h")).toBe("5m");
    expect(resolvePromptCacheTtl("claude-sonnet-4-6")).toBe("5m");
  });

  it("allows 1h for Haiku 4.5 when requested", () => {
    expect(resolvePromptCacheTtl("claude-haiku-4-5", "1h")).toBe("1h");
  });

  it("downgrades unsupported TTL to model default", () => {
    expect(resolvePromptCacheTtl("us.anthropic.claude-opus-4-8", "1h")).toBe("5m");
  });
});

describe("supportsPromptCaching", () => {
  it("returns true for known caching-capable models", () => {
    expect(supportsPromptCaching("us.anthropic.claude-sonnet-4-6")).toBe(true);
    expect(supportsPromptCaching("claude-opus-4-8")).toBe(true);
  });

  it("returns false for unknown models", () => {
    expect(supportsPromptCaching("some.unsupported.model-v1:0")).toBe(false);
  });
});
