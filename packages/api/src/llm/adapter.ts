/**
 * LLM adapter interface — pluggable backend for the agent system.
 * Implementations must support streaming and tool calling.
 */

export interface LLMMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: LLMToolCall[];
  tool_call_id?: string;
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

export interface StreamChunk {
  type: "content" | "tool_call_start" | "tool_call_args" | "tool_call_end" | "done" | "retry" | "fallback";
  content?: string;
  toolCallId?: string;
  toolName?: string;
  toolArgs?: string;
  usage?: { promptTokens: number; completionTokens: number };
  // Retry-specific fields (present when type === "retry")
  attempt?: number;
  maxRetries?: number;
  delayMs?: number;
  reason?: string;
}

export interface LLMAdapter {
  chat(
    messages: LLMMessage[],
    tools?: LLMToolDef[],
  ): AsyncGenerator<StreamChunk>;
}
