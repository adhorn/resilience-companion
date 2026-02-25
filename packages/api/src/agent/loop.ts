import { MAX_AGENT_ITERATIONS } from "@orr/shared";
import { getLLM } from "../llm/index.js";
import type { LLMMessage, StreamChunk } from "../llm/index.js";
import type { SSEEvent } from "@orr/shared";
import { buildSystemPrompt } from "./system-prompt.js";
import { buildORRContext } from "./context.js";
import { AGENT_TOOLS, executeTool } from "./tools.js";
import { nanoid } from "nanoid";

export interface AgentInput {
  orrId: string;
  sessionId: string;
  activeSectionId: string | null;
  conversationHistory: LLMMessage[];
  userMessage: string;
}

/**
 * Core agent loop. Runs the Review Facilitator:
 * 1. Build system prompt with ORR context
 * 2. Send to LLM with tools
 * 3. If LLM calls tools, execute them and loop (max 5 iterations)
 * 4. Yield SSE events throughout for streaming to client
 */
export async function* runAgent(input: AgentInput): AsyncGenerator<SSEEvent> {
  const { orrId, sessionId, activeSectionId, conversationHistory, userMessage } = input;
  const llm = getLLM();

  // Build context and system prompt
  const context = buildORRContext(orrId, activeSectionId);
  const systemPrompt = buildSystemPrompt(context);

  // Build messages array
  const messages: LLMMessage[] = [
    { role: "system", content: systemPrompt },
    ...conversationHistory,
    { role: "user", content: userMessage },
  ];

  const messageId = nanoid();
  yield { type: "message_start", messageId };

  let totalUsage = 0;

  for (let iteration = 0; iteration < MAX_AGENT_ITERATIONS; iteration++) {
    let fullContent = "";
    const pendingToolCalls: Array<{
      id: string;
      name: string;
      args: string;
    }> = [];

    // Call LLM
    try {
      const stream = llm.chat(messages, AGENT_TOOLS);

      for await (const chunk of stream) {
        switch (chunk.type) {
          case "content":
            fullContent += chunk.content!;
            yield { type: "content_delta", content: chunk.content! };
            break;

          case "tool_call_start":
            pendingToolCalls.push({
              id: chunk.toolCallId!,
              name: chunk.toolName!,
              args: "",
            });
            break;

          case "tool_call_args": {
            const tc = pendingToolCalls.find((t) => t.id === chunk.toolCallId);
            if (tc) tc.args += chunk.toolArgs!;
            break;
          }

          case "tool_call_end": {
            const tc = pendingToolCalls.find((t) => t.id === chunk.toolCallId);
            if (tc) tc.args = chunk.toolArgs!;
            break;
          }

          case "done":
            if (chunk.usage) {
              totalUsage += chunk.usage.promptTokens + chunk.usage.completionTokens;
            }
            break;
        }
      }
    } catch (err) {
      const errMsg = (err as Error).message || "Unknown LLM error";
      console.error(`Agent LLM error [iter ${iteration}]:`, errMsg);
      yield {
        type: "content_delta",
        content: `\n\n*AI error: ${errMsg}. Send your message again to retry.*`,
      };
      yield { type: "message_end", tokenUsage: totalUsage };
      return;
    }

    // If no tool calls, we're done
    if (pendingToolCalls.length === 0) {
      yield { type: "message_end", tokenUsage: totalUsage };
      return;
    }

    // Execute tool calls and build response messages
    const assistantMessage: LLMMessage = {
      role: "assistant",
      content: fullContent || null,
      tool_calls: pendingToolCalls.map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: { name: tc.name, arguments: tc.args },
      })),
    };
    messages.push(assistantMessage);

    for (const tc of pendingToolCalls) {
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(tc.args);
      } catch {
        args = {};
      }

      yield { type: "tool_call", tool: tc.name, args };

      console.log(`Agent tool call [iter ${iteration}]: ${tc.name}(${JSON.stringify(args).slice(0, 200)})`);
      const result = executeTool(tc.name, args, orrId, sessionId);
      const parsedResult = JSON.parse(result);
      console.log(`Agent tool result: ${result.slice(0, 200)}`);

      yield { type: "tool_result", tool: tc.name, result: parsedResult };

      // Emit section_updated events for write operations
      if (
        ["update_section_content", "update_depth_assessment", "set_flags"].includes(
          tc.name,
        ) &&
        parsedResult.success
      ) {
        const field =
          tc.name === "update_section_content"
            ? "content"
            : tc.name === "update_depth_assessment"
              ? "depth"
              : "flags";
        yield {
          type: "section_updated",
          sectionId: args.section_id as string,
          field,
        };
      }

      messages.push({
        role: "tool",
        content: result,
        tool_call_id: tc.id,
      });
    }

    // Loop continues — LLM will generate a response based on tool results
  }

  // If we hit max iterations, send a wrap-up message
  yield {
    type: "content_delta",
    content:
      "\n\n*I've reached the limit for tool operations in this turn. Please send another message to continue our discussion.*",
  };
  yield { type: "message_end", tokenUsage: totalUsage };
}
