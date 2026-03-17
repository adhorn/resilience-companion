import { MAX_AGENT_ITERATIONS, MAX_SESSION_TOKENS } from "@orr/shared";
import { getLLM } from "../llm/index.js";
import type { LLMMessage } from "../llm/index.js";
import type { SSEEvent } from "@orr/shared";
import { buildSystemPrompt } from "./system-prompt.js";
import { buildORRContext } from "./context.js";
import { AGENT_TOOLS, executeTool } from "./tools.js";
import { nanoid } from "nanoid";

/** Translate raw LLM errors into user-friendly messages */
function categorizeError(msg: string): string {
  const lower = msg.toLowerCase();
  if (lower.includes("rate limit") || lower.includes("429")) {
    return "The AI provider is rate limiting us. Retries were exhausted. Wait a moment and send your message again.";
  }
  if (lower.includes("overloaded") || lower.includes("529")) {
    return "The AI provider is currently overloaded. This is temporary — try again in a minute.";
  }
  if (lower.includes("401") || lower.includes("authentication") || lower.includes("unauthorized")) {
    return "AI authentication failed. Check that LLM_API_KEY is valid.";
  }
  if (lower.includes("timeout") || lower.includes("etimedout")) {
    return "The AI request timed out. This can happen with complex prompts. Send your message again to retry.";
  }
  if (lower.includes("econnrefused") || lower.includes("enotfound") || lower.includes("fetch failed")) {
    return "Cannot reach the AI provider. Check your network connection.";
  }
  if (lower.includes("500") || lower.includes("502") || lower.includes("503")) {
    return "The AI provider had a server error. This is on their end — try again shortly.";
  }
  return `AI error: ${msg}`;
}

export interface AgentInput {
  orrId: string;
  sessionId: string;
  activeSectionId: string | null;
  conversationHistory: LLMMessage[];
  userMessage: string;
  sessionTokenUsage: number; // cumulative tokens used so far in this session
}

/**
 * Core agent loop. Runs the Review Facilitator:
 * 1. Build system prompt with ORR context
 * 2. Send to LLM with tools
 * 3. If LLM calls tools, execute them and loop (max 5 iterations)
 * 4. Yield SSE events throughout for streaming to client
 */
export async function* runAgent(input: AgentInput): AsyncGenerator<SSEEvent> {
  const { orrId, sessionId, activeSectionId, conversationHistory, userMessage, sessionTokenUsage } = input;
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
  const cumulativeTokens = () => sessionTokenUsage + totalUsage;

  for (let iteration = 0; iteration < MAX_AGENT_ITERATIONS; iteration++) {
    // Check token budget before each LLM call
    if (iteration > 0 && cumulativeTokens() >= MAX_SESSION_TOKENS) {
      console.log(`Session ${sessionId} hit token budget mid-turn (${cumulativeTokens()}/${MAX_SESSION_TOKENS}). Wrapping up.`);
      break; // falls through to the graceful wrap-up below
    }

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
        // RetryAdapter emits retry events between attempts
        if (chunk.type === "retry") {
          yield {
            type: "status",
            message: `${chunk.reason}. Retrying (${chunk.attempt}/${chunk.maxRetries})...`,
          } as SSEEvent;
          continue;
        }

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
      const errMsg = (err as Error).message || "Unknown error";
      console.error(`Agent LLM error [iter ${iteration}]:`, errMsg);
      // Categorize the error for the user
      const userMessage = categorizeError(errMsg);
      yield {
        type: "error",
        message: userMessage,
      } as SSEEvent;
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

      let result: string;
      let parsedResult: Record<string, unknown>;
      try {
        result = executeTool(tc.name, args, orrId, sessionId);
        parsedResult = JSON.parse(result);
      } catch (err) {
        const errMsg = (err as Error).message || "Unknown tool error";
        console.error(`Tool execution failed [${tc.name}]:`, errMsg);
        result = JSON.stringify({ error: `Tool failed: ${errMsg}` });
        parsedResult = { error: `Tool failed: ${errMsg}` };
        yield {
          type: "error",
          message: `Tool "${tc.name}" failed: ${errMsg}`,
        } as SSEEvent;
      }

      console.log(`Agent tool result: ${result.slice(0, 200)}`);

      yield { type: "tool_result", tool: tc.name, result: parsedResult };

      // Emit section_updated events for write operations
      if (
        ["update_section_content", "update_depth_assessment", "set_flags", "update_question_response"].includes(
          tc.name,
        ) &&
        parsedResult.success
      ) {
        const field =
          tc.name === "update_section_content"
            ? "content"
            : tc.name === "update_depth_assessment"
              ? "depth"
              : tc.name === "update_question_response"
                ? "promptResponses"
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

  // Hit max iterations — give the LLM one final text-only turn (no tools)
  // so it can wrap up coherently instead of being cut off mid-thought.
  try {
    messages.push({
      role: "user",
      content: "[System: You've used all available tool iterations for this turn. Wrap up your response to the team now — no more tool calls are available. If you had pending work, briefly note what still needs to be done.]",
    });

    const finalStream = llm.chat(messages, []); // empty tools array = text only
    for await (const chunk of finalStream) {
      if (chunk.type === "content") {
        yield { type: "content_delta", content: chunk.content! };
      }
      if (chunk.type === "done" && chunk.usage) {
        totalUsage += chunk.usage.promptTokens + chunk.usage.completionTokens;
      }
    }
  } catch (err) {
    const errMsg = (err as Error).message || "Unknown error";
    console.error("Agent wrap-up error:", errMsg);
    yield {
      type: "error",
      message: `Could not generate summary: ${categorizeError(errMsg)}`,
    } as SSEEvent;
    yield {
      type: "content_delta",
      content:
        "\n\n*I've reached the limit for tool operations in this turn. Please send another message to continue our discussion.*",
    };
  }

  yield { type: "message_end", tokenUsage: totalUsage };
}
