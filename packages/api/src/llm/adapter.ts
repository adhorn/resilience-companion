/**
 * LLM adapter interface — pluggable backend for the agent system.
 * Implementations must support streaming and tool calling.
 */

export type PromptCacheTtl = "5m" | "1h";

export interface CacheBreakpoint {
  ttl?: PromptCacheTtl;
}

export interface LLMMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: LLMToolCall[];
  tool_call_id?: string;
  cacheBreakpoint?: CacheBreakpoint;
}

export interface LLMToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface LLMToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>; // JSON Schema
  };
}

export interface LLMUsage {
  promptTokens: number;
  completionTokens: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
}

export function totalInputTokens(usage: LLMUsage): number {
  return usage.promptTokens + (usage.cacheCreationTokens ?? 0) + (usage.cacheReadTokens ?? 0);
}

export interface LLMChatOptions {
  enablePromptCaching?: boolean;
  toolsCacheTtl?: PromptCacheTtl;
}

export interface StreamChunk {
  type: "content" | "tool_call_start" | "tool_call_args" | "tool_call_end" | "done" | "retry" | "fallback";
  content?: string;
  toolCallId?: string;
  toolName?: string;
  toolArgs?: string;
  usage?: LLMUsage;
  // Retry-specific fields (present when type === "retry")
  attempt?: number;
  maxRetries?: number;
  delayMs?: number;
  reason?: string;
  fallbackModel?: string;
}

export interface LLMAdapter {
  chat(
    messages: LLMMessage[],
    tools?: LLMToolDef[],
    options?: LLMChatOptions,
  ): AsyncGenerator<StreamChunk>;
}
