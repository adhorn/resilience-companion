import AnthropicBedrock from "@anthropic-ai/bedrock-sdk";
import type { LLMAdapter, LLMMessage, LLMChatOptions, LLMToolDef, StreamChunk } from "./adapter.js";
import { buildAnthropicStreamRequest, mapAnthropicUsage } from "./anthropic-request.js";
import { BEDROCK_MODEL_IDS } from "@orr/shared";

export { resolveBedrockModel } from "@orr/shared";

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
    this.model = model || BEDROCK_MODEL_IDS.sonnet;
  }

  async *chat(
    messages: LLMMessage[],
    tools?: LLMToolDef[],
    options?: LLMChatOptions,
  ): AsyncGenerator<StreamChunk> {
    const request = buildAnthropicStreamRequest(messages, tools, options, this.model);

    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: 4096,
      system: request.system,
      messages: request.messages,
      tools: request.tools,
    });

    let currentToolId = "";
    let currentToolName = "";
    let currentToolArgs = "";
    let doneEmitted = false;

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
        const usage = (event as { usage?: Parameters<typeof mapAnthropicUsage>[0] }).usage;
        if (usage) {
          yield { type: "done", usage: mapAnthropicUsage(usage) };
          doneEmitted = true;
        }
      }
    }

    if (!doneEmitted) {
      // Backstop: emit done from finalMessage only if message_delta didn't already fire.
      const finalMessage = await stream.finalMessage();
      yield { type: "done", usage: mapAnthropicUsage(finalMessage.usage) };
    }
  }
}
