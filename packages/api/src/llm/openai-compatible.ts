import OpenAI from "openai";
import type { LLMAdapter, LLMMessage, LLMToolDef, StreamChunk } from "./adapter.js";

export class OpenAICompatibleAdapter implements LLMAdapter {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, baseURL?: string, model?: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL: baseURL || undefined,
    });
    this.model = model || "gpt-4o";
  }

  async *chat(
    messages: LLMMessage[],
    tools?: LLMToolDef[],
  ): AsyncGenerator<StreamChunk> {
    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
      tools: tools as OpenAI.Chat.Completions.ChatCompletionTool[] | undefined,
      stream: true,
      stream_options: { include_usage: true },
    });

    const toolCalls = new Map<number, { id: string; name: string; args: string }>();

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta;

      if (delta?.content) {
        yield { type: "content", content: delta.content };
      }

      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (tc.id) {
            toolCalls.set(tc.index, { id: tc.id, name: tc.function?.name || "", args: "" });
            yield {
              type: "tool_call_start",
              toolCallId: tc.id,
              toolName: tc.function?.name || "",
            };
          }
          if (tc.function?.arguments) {
            const existing = toolCalls.get(tc.index);
            if (existing) {
              existing.args += tc.function.arguments;
              yield {
                type: "tool_call_args",
                toolCallId: existing.id,
                toolArgs: tc.function.arguments,
              };
            }
          }
        }
      }

      if (chunk.choices?.[0]?.finish_reason === "tool_calls") {
        for (const [, tc] of toolCalls) {
          yield { type: "tool_call_end", toolCallId: tc.id, toolName: tc.name, toolArgs: tc.args };
        }
      }

      if (chunk.usage) {
        yield {
          type: "done",
          usage: {
            promptTokens: chunk.usage.prompt_tokens,
            completionTokens: chunk.usage.completion_tokens,
          },
        };
      }
    }
  }
}
