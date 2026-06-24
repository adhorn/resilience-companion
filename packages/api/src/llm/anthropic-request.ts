import type Anthropic from "@anthropic-ai/sdk";
import { resolvePromptCacheTtl, supportsPromptCaching } from "@orr/shared";
import type {
  CacheBreakpoint,
  LLMChatOptions,
  LLMMessage,
  LLMToolDef,
  LLMUsage,
  PromptCacheTtl,
} from "./adapter.js";

export interface AnthropicStreamRequest {
  system?: Anthropic.TextBlockParam[];
  messages: Anthropic.MessageParam[];
  tools?: Anthropic.Tool[];
}

/**
 * Build a cache_control directive whose TTL is clamped to what the target model
 * actually supports. The turn-level TTL is resolved from the primary model, but
 * the fallback model may support a narrower set (e.g. Sonnet 4.6 is 5m-only while
 * a Haiku primary allows 1h). Sending an unsupported TTL is a hard API error, so
 * each adapter re-clamps against its own model id here.
 */
function cacheControl(
  modelId: string,
  breakpoint: CacheBreakpoint | undefined,
  defaultTtl: PromptCacheTtl,
): Anthropic.CacheControlEphemeral {
  return { type: "ephemeral", ttl: resolvePromptCacheTtl(modelId, breakpoint?.ttl ?? defaultTtl) };
}

function collectLeadingSystemMessages(messages: LLMMessage[]): {
  systemMessages: LLMMessage[];
  nonSystemMessages: LLMMessage[];
} {
  const systemMessages: LLMMessage[] = [];
  let i = 0;
  while (i < messages.length && messages[i].role === "system") {
    systemMessages.push(messages[i]);
    i++;
  }
  return { systemMessages, nonSystemMessages: messages.slice(i) };
}

function buildSystemBlocks(
  modelId: string,
  systemMessages: LLMMessage[],
  cachingEnabled: boolean,
  ttl: PromptCacheTtl,
): Anthropic.TextBlockParam[] | undefined {
  if (systemMessages.length === 0) return undefined;
  return systemMessages.map((msg) => {
    const block: Anthropic.TextBlockParam = { type: "text", text: msg.content || "" };
    if (cachingEnabled && msg.cacheBreakpoint) {
      block.cache_control = cacheControl(modelId, msg.cacheBreakpoint, ttl);
    }
    return block;
  });
}

function buildAnthropicTools(
  tools: LLMToolDef[] | undefined,
  cachingEnabled: boolean,
  ttl: PromptCacheTtl,
): Anthropic.Tool[] | undefined {
  if (!tools || tools.length === 0) return undefined;
  return tools.map((t, index) => {
    const tool: Anthropic.Tool = {
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters as Anthropic.Tool.InputSchema,
    };
    if (cachingEnabled && index === tools.length - 1) {
      tool.cache_control = { type: "ephemeral", ttl };
    }
    return tool;
  });
}

function userContentBlock(
  modelId: string,
  text: string,
  cachingEnabled: boolean,
  breakpoint: CacheBreakpoint | undefined,
  ttl: PromptCacheTtl,
): Anthropic.ContentBlockParam[] {
  const block: Anthropic.TextBlockParam = { type: "text", text };
  if (cachingEnabled && breakpoint) {
    block.cache_control = cacheControl(modelId, breakpoint, ttl);
  }
  return [block];
}

function convertNonSystemMessages(
  modelId: string,
  messages: LLMMessage[],
  cachingEnabled: boolean,
  ttl: PromptCacheTtl,
): Anthropic.MessageParam[] {
  return messages.map((m) => {
    if (m.role === "assistant" && m.tool_calls && m.tool_calls.length > 0) {
      const content: Anthropic.ContentBlockParam[] = [];
      if (m.content) {
        content.push({ type: "text", text: m.content });
      }
      for (const tc of m.tool_calls) {
        let input: Record<string, unknown>;
        try {
          input = JSON.parse(tc.function.arguments);
        } catch {
          input = {};
        }
        content.push({
          type: "tool_use",
          id: tc.id,
          name: tc.function.name,
          input,
        });
      }
      return { role: "assistant" as const, content };
    }

    if (m.role === "tool") {
      return {
        role: "user" as const,
        content: [
          {
            type: "tool_result" as const,
            tool_use_id: m.tool_call_id!,
            content: m.content || "",
          },
        ],
      };
    }

    if (m.role === "user" && cachingEnabled && m.cacheBreakpoint) {
      return {
        role: "user" as const,
        content: userContentBlock(modelId, m.content || "", cachingEnabled, m.cacheBreakpoint, ttl),
      };
    }

    return {
      role: m.role as "user" | "assistant",
      content: m.content || "",
    };
  });
}

function mergeConsecutiveUserMessages(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  const merged: Anthropic.MessageParam[] = [];
  for (const msg of messages) {
    const last = merged[merged.length - 1];
    if (last && last.role === "user" && msg.role === "user") {
      const lastContent = Array.isArray(last.content)
        ? last.content
        : [{ type: "text" as const, text: last.content as string }];
      const msgContent = Array.isArray(msg.content)
        ? msg.content
        : [{ type: "text" as const, text: msg.content as string }];
      last.content = [...lastContent, ...msgContent] as Anthropic.ContentBlockParam[];
    } else {
      merged.push(msg);
    }
  }
  return merged;
}

export function buildAnthropicStreamRequest(
  messages: LLMMessage[],
  tools: LLMToolDef[] | undefined,
  options: LLMChatOptions | undefined,
  modelId: string,
): AnthropicStreamRequest {
  // Caching is gated on the *target* model, not just the request intent. The loop
  // resolves enablement from the primary model, but a fallback model may not
  // support cache_control at all — emitting it would be a hard API error.
  const cachingEnabled = options?.enablePromptCaching === true && supportsPromptCaching(modelId);
  const ttl = resolvePromptCacheTtl(modelId, options?.toolsCacheTtl);

  const { systemMessages, nonSystemMessages } = collectLeadingSystemMessages(messages);
  const system = buildSystemBlocks(modelId, systemMessages, cachingEnabled, ttl);
  const anthropicMessages = mergeConsecutiveUserMessages(
    convertNonSystemMessages(modelId, nonSystemMessages, cachingEnabled, ttl),
  );
  const anthropicTools = buildAnthropicTools(tools, cachingEnabled, ttl);

  return { system, messages: anthropicMessages, tools: anthropicTools };
}

interface AnthropicUsageLike {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

export function mapAnthropicUsage(usage: AnthropicUsageLike): LLMUsage {
  return {
    promptTokens: usage.input_tokens || 0,
    completionTokens: usage.output_tokens || 0,
    cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
  };
}
