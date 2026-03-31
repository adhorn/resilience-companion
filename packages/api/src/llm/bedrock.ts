import AnthropicBedrock from "@anthropic-ai/bedrock-sdk";
import type Anthropic from "@anthropic-ai/sdk";
import type { LLMAdapter, LLMMessage, LLMToolDef, StreamChunk } from "./adapter.js";

// Bedrock uses different model IDs than the direct API
const BEDROCK_MODEL_MAP: Record<string, string> = {
  "sonnet": "us.anthropic.claude-sonnet-4-20250514-v1:0",
  "sonnet-4.6": "us.anthropic.claude-sonnet-4-6-20250610-v1:0",
  "opus": "us.anthropic.claude-opus-4-20250514-v1:0",
  "opus-4.6": "us.anthropic.claude-opus-4-6-20250610-v1:0",
  "haiku": "us.anthropic.claude-haiku-4-5-20251001-v1:0",
  "haiku-4.5": "us.anthropic.claude-haiku-4-5-20251001-v1:0",
};

export function resolveBedrockModel(input: string): string {
  return BEDROCK_MODEL_MAP[input] || input;
}

/**
 * Amazon Bedrock adapter using @anthropic-ai/bedrock-sdk.
 * Uses standard AWS credential chain (env vars, IAM role, SSO profile).
 * The streaming API is identical to the direct Anthropic SDK.
 */
export class BedrockAdapter implements LLMAdapter {
  private client: AnthropicBedrock;
  private model: string;

  constructor(model?: string, awsRegion?: string) {
    this.client = new AnthropicBedrock({
      awsRegion: awsRegion || process.env.AWS_REGION || "us-east-1",
    });
    this.model = model || "us.anthropic.claude-sonnet-4-20250514-v1:0";
  }

  async *chat(
    messages: LLMMessage[],
    tools?: LLMToolDef[],
  ): AsyncGenerator<StreamChunk> {
    // Extract system message
    const systemMsg = messages.find((m) => m.role === "system");
    const nonSystemMsgs = messages.filter((m) => m.role !== "system");

    // Convert messages to Anthropic format (same as direct API)
    const anthropicMessages: Anthropic.MessageParam[] = nonSystemMsgs.map((m) => {
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

      return {
        role: m.role as "user" | "assistant",
        content: m.content || "",
      };
    });

    // Merge consecutive user messages
    const mergedMessages: Anthropic.MessageParam[] = [];
    for (const msg of anthropicMessages) {
      const last = mergedMessages[mergedMessages.length - 1];
      if (last && last.role === "user" && msg.role === "user") {
        const lastContent = Array.isArray(last.content)
          ? last.content
          : [{ type: "text" as const, text: last.content }];
        const msgContent = Array.isArray(msg.content)
          ? msg.content
          : [{ type: "text" as const, text: msg.content }];
        last.content = [...lastContent, ...msgContent] as Anthropic.ContentBlockParam[];
      } else {
        mergedMessages.push(msg);
      }
    }

    // Convert tools
    const anthropicTools: Anthropic.Tool[] | undefined = tools?.map((t) => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters as Anthropic.Tool.InputSchema,
    }));

    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: 4096,
      system: systemMsg?.content || undefined,
      messages: mergedMessages,
      tools: anthropicTools,
    });

    let currentToolId = "";
    let currentToolName = "";
    let currentToolArgs = "";

    for await (const event of stream) {
      if (event.type === "content_block_start") {
        if (event.content_block.type === "tool_use") {
          currentToolId = event.content_block.id;
          currentToolName = event.content_block.name;
          currentToolArgs = "";
          yield {
            type: "tool_call_start",
            toolCallId: currentToolId,
            toolName: currentToolName,
          };
        }
      }

      if (event.type === "content_block_delta") {
        if (event.delta.type === "text_delta") {
          yield { type: "content", content: event.delta.text };
        }
        if (event.delta.type === "input_json_delta") {
          currentToolArgs += event.delta.partial_json;
          yield {
            type: "tool_call_args",
            toolCallId: currentToolId,
            toolArgs: event.delta.partial_json,
          };
        }
      }

      if (event.type === "content_block_stop" && currentToolId) {
        yield {
          type: "tool_call_end",
          toolCallId: currentToolId,
          toolName: currentToolName,
          toolArgs: currentToolArgs,
        };
        currentToolId = "";
      }

      if (event.type === "message_delta") {
        const usage = (event as any).usage;
        if (usage) {
          yield {
            type: "done",
            usage: {
              promptTokens: usage.input_tokens || 0,
              completionTokens: usage.output_tokens || 0,
            },
          };
        }
      }
    }

    // Ensure we always emit done
    const finalMessage = await stream.finalMessage();
    yield {
      type: "done",
      usage: {
        promptTokens: finalMessage.usage.input_tokens,
        completionTokens: finalMessage.usage.output_tokens,
      },
    };
  }
}
