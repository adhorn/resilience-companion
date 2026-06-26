import { describe, it, expect } from "vitest";
import { buildAnthropicStreamRequest, mapAnthropicUsage } from "./anthropic-request.js";

describe("buildAnthropicStreamRequest", () => {
  const tools = [
    {
      type: "function" as const,
      function: { name: "read_section", description: "Read a section", parameters: { type: "object" } },
    },
    {
      type: "function" as const,
      function: { name: "flag", description: "Flag a risk", parameters: { type: "object" } },
    },
  ];

  it("emits system as TextBlockParam[] with cache_control on static block only", () => {
    const request = buildAnthropicStreamRequest(
      [
        { role: "system", content: "static rules", cacheBreakpoint: { ttl: "5m" } },
        { role: "system", content: "dynamic context" },
        { role: "user", content: "hello" },
      ],
      tools,
      { enablePromptCaching: true, toolsCacheTtl: "5m" },
      "claude-sonnet-4-6",
    );

    expect(Array.isArray(request.system)).toBe(true);
    expect(request.system).toHaveLength(2);
    expect(request.system![0]).toMatchObject({
      type: "text",
      text: "static rules",
      cache_control: { type: "ephemeral", ttl: "5m" },
    });
    expect(request.system![1]).toEqual({ type: "text", text: "dynamic context" });
  });

  it("places cache_control on the last tool definition when caching enabled", () => {
    const request = buildAnthropicStreamRequest(
      [{ role: "user", content: "hi" }],
      tools,
      { enablePromptCaching: true, toolsCacheTtl: "5m" },
      "claude-sonnet-4-6",
    );

    expect(request.tools).toHaveLength(2);
    expect(request.tools![0].cache_control).toBeUndefined();
    expect(request.tools![1].cache_control).toEqual({ type: "ephemeral", ttl: "5m" });
  });

  it("marks user message cache breakpoint from hint", () => {
    const request = buildAnthropicStreamRequest(
      [
        { role: "user", content: "turn message", cacheBreakpoint: { ttl: "5m" } },
      ],
      undefined,
      { enablePromptCaching: true, toolsCacheTtl: "5m" },
      "claude-sonnet-4-6",
    );

    expect(request.messages[0]).toMatchObject({
      role: "user",
      content: [{ type: "text", text: "turn message", cache_control: { type: "ephemeral", ttl: "5m" } }],
    });
  });

  it("emits no cache_control when caching disabled", () => {
    const request = buildAnthropicStreamRequest(
      [
        { role: "system", content: "static", cacheBreakpoint: { ttl: "5m" } },
        { role: "user", content: "hi", cacheBreakpoint: { ttl: "5m" } },
      ],
      tools,
      { enablePromptCaching: false },
      "claude-sonnet-4-6",
    );

    expect(request.system![0].cache_control).toBeUndefined();
    expect(request.tools![1].cache_control).toBeUndefined();
    expect(request.messages[0].content).toBe("hi");
  });

  it("clamps a too-high TTL down to what the target model supports", () => {
    // Simulates a fallback to Sonnet 4.6 (5m-only) on a turn whose TTL was
    // resolved from a 1h-capable primary (e.g. Haiku). The unsupported 1h must
    // be clamped to 5m rather than sent to the API.
    const request = buildAnthropicStreamRequest(
      [
        { role: "system", content: "static", cacheBreakpoint: { ttl: "1h" } },
        { role: "user", content: "turn", cacheBreakpoint: { ttl: "1h" } },
      ],
      tools,
      { enablePromptCaching: true, toolsCacheTtl: "1h" },
      "claude-sonnet-4-6",
    );

    expect(request.system![0].cache_control).toEqual({ type: "ephemeral", ttl: "5m" });
    expect(request.tools![1].cache_control).toEqual({ type: "ephemeral", ttl: "5m" });
    expect(request.messages[0]).toMatchObject({
      content: [{ type: "text", text: "turn", cache_control: { type: "ephemeral", ttl: "5m" } }],
    });
  });

  it("honors 1h TTL for a model that supports it", () => {
    const request = buildAnthropicStreamRequest(
      [{ role: "system", content: "static", cacheBreakpoint: { ttl: "1h" } }, { role: "user", content: "hi" }],
      tools,
      { enablePromptCaching: true, toolsCacheTtl: "1h" },
      "claude-haiku-4-5",
    );

    expect(request.system![0].cache_control).toEqual({ type: "ephemeral", ttl: "1h" });
    expect(request.tools![1].cache_control).toEqual({ type: "ephemeral", ttl: "1h" });
  });

  it("disables caching when the target model does not support it, even if requested", () => {
    const request = buildAnthropicStreamRequest(
      [
        { role: "system", content: "static", cacheBreakpoint: { ttl: "5m" } },
        { role: "user", content: "hi", cacheBreakpoint: { ttl: "5m" } },
      ],
      tools,
      { enablePromptCaching: true, toolsCacheTtl: "5m" },
      "some.unsupported.model-v1:0",
    );

    expect(request.system![0].cache_control).toBeUndefined();
    expect(request.tools![1].cache_control).toBeUndefined();
    expect(request.messages[0].content).toBe("hi");
  });

  it("maps cache token fields from Anthropic usage", () => {
    expect(mapAnthropicUsage({
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_input_tokens: 1000,
      cache_read_input_tokens: 5000,
    })).toEqual({
      promptTokens: 100,
      completionTokens: 50,
      cacheCreationTokens: 1000,
      cacheReadTokens: 5000,
    });
  });
});
