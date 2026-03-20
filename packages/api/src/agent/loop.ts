import { MAX_AGENT_ITERATIONS, MAX_SESSION_TOKENS } from "@orr/shared";
import { getLLM } from "../llm/index.js";
import type { LLMMessage } from "../llm/index.js";
import type { SSEEvent } from "@orr/shared";
import type { PracticeConfig } from "./practice.js";
import { nanoid } from "nanoid";
import { TraceCollector } from "./trace.js";
import { log } from "../logger.js";
import { runBeforeHooks, runAfterHooks } from "./steering.js";
import type { ToolLedgerEntry } from "./steering.js";

/** Translate raw LLM errors into user-friendly messages */
function categorizeError(msg: string): string {
  const lower = msg.toLowerCase();
  if (lower.includes("rate limit") || lower.includes("429")) {
    return "The AI provider is rate limiting us. Retries were exhausted. Wait a moment and send your message again.";
  }
  if (lower.includes("overloaded") || lower.includes("529")) {
    return "The AI provider is currently overloaded. This is temporary — try again in a minute.";
  }
  if (lower.includes("credit balance") || lower.includes("billing") || lower.includes("purchase credits")) {
    return "AI provider billing issue — your API credit balance may be too low. Top up credits and try again.";
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
  if (lower.includes("500") || lower.includes("502") || lower.includes("503") || lower.includes("internal server error") || lower.includes("api_error")) {
    return "The AI provider had a server error. This is on their end — try again shortly.";
  }
  return `AI error: ${msg}`;
}

/** Finalize trace — updates the trace row with final totals. Spans already persisted eagerly. */
function finalizeTrace(collector: TraceCollector): void {
  collector.finalize();
}

export interface AgentInput {
  practiceConfig: PracticeConfig;
  practiceId: string;
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
  const { practiceConfig, practiceId, sessionId, activeSectionId, conversationHistory, userMessage, sessionTokenUsage } = input;
  const llm = getLLM();

  // Load steering tier and assemble hooks via practice config
  const tier = practiceConfig.loadSteeringTier(practiceId);
  const steeringHooks = practiceConfig.getHooks(tier);
  const toolLedger: ToolLedgerEntry[] = [];

  // Build context and system prompt via practice config
  const context = practiceConfig.buildContext(practiceId, activeSectionId);
  const systemPrompt = practiceConfig.buildSystemPrompt(context);

  // Build messages array
  const messages: LLMMessage[] = [
    { role: "system", content: systemPrompt },
    ...conversationHistory,
    { role: "user", content: userMessage },
  ];

  const messageId = nanoid();
  const model = process.env.LLM_MODEL || "sonnet";
  const trace = new TraceCollector(practiceId, sessionId, messageId, model);

  yield { type: "message_start", messageId };

  let totalUsage = 0;
  const cumulativeTokens = () => sessionTokenUsage + totalUsage;

  for (let iteration = 0; iteration < MAX_AGENT_ITERATIONS; iteration++) {
    // Check token budget before each LLM call
    if (iteration > 0 && cumulativeTokens() >= MAX_SESSION_TOKENS) {
      log("info", "Session hit token budget mid-turn", { sessionId, tokens: cumulativeTokens(), max: MAX_SESSION_TOKENS });
      break; // falls through to the graceful wrap-up below
    }

    let fullContent = "";
    const pendingToolCalls: Array<{
      id: string;
      name: string;
      args: string;
    }> = [];

    const llmSpanId = trace.startLLMCall(iteration, model);

    // Call LLM
    try {
      const stream = llm.chat(messages, practiceConfig.tools);

      for await (const chunk of stream) {
        // RetryAdapter emits retry/fallback events between attempts
        if (chunk.type === "retry") {
          trace.addRetry(chunk.attempt!, chunk.reason!, chunk.delayMs!);
          yield {
            type: "status",
            message: `${chunk.reason}. Retrying (${chunk.attempt}/${chunk.maxRetries})...`,
          } as SSEEvent;
          continue;
        }
        if (chunk.type === "fallback") {
          trace.addFallback(chunk.reason || "unknown", chunk.reason || "");
          yield {
            type: "status",
            message: `${chunk.reason}. Response quality may differ slightly.`,
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
              trace.endLLMCall(llmSpanId, chunk.usage);
            }
            break;
        }
      }
    } catch (err) {
      const errMsg = (err as Error).message || "Unknown error";
      log("error", "Agent LLM error", { iteration, error: errMsg, traceId: trace.id });
      trace.errorLLMCall(llmSpanId, errMsg, "llm_error");
      trace.setError(errMsg, "llm_error");
      finalizeTrace(trace);
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
      finalizeTrace(trace);
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

      log("info", "Agent tool call", { iteration, tool: tc.name, args, traceId: trace.id });

      const toolSpanId = trace.startToolCall(iteration, tc.name, args);

      let result: string;
      let parsedResult: Record<string, unknown>;

      // Steering: run before-hooks (security, ordering, validation)
      const ledger = { calls: toolLedger, currentIteration: iteration };
      const steering = runBeforeHooks(steeringHooks, tc.name, args, ledger);

      if (steering.action === "guide") {
        // Return guidance as tool error — LLM sees it and can adjust
        result = JSON.stringify({ error: steering.reason });
        parsedResult = { error: steering.reason };
        trace.endToolCall(toolSpanId, result.slice(0, 500), `steered:${steering.hookName}`);
        log("info", "Steering guided tool call", {
          hook: steering.hookName, tool: tc.name, reason: steering.reason, traceId: trace.id,
        });
      } else {
        try {
          result = practiceConfig.executeTool(tc.name, args, practiceId, sessionId);
          // Steering: run after-hooks (credential redaction, size caps, directory filtering)
          result = runAfterHooks(steeringHooks, tc.name, args, result);
          parsedResult = JSON.parse(result);
          trace.endToolCall(toolSpanId, result.slice(0, 500));
        } catch (err) {
          const errMsg = (err as Error).message || "Unknown tool error";
          log("error", "Tool execution failed", { tool: tc.name, error: errMsg, traceId: trace.id });
          result = JSON.stringify({ error: `Tool failed: ${errMsg}` });
          parsedResult = { error: `Tool failed: ${errMsg}` };
          trace.endToolCall(toolSpanId, result, errMsg);
          yield {
            type: "error",
            message: `Tool "${tc.name}" failed: ${errMsg}`,
          } as SSEEvent;
        }
      }

      // Record in ledger for subsequent hooks in this turn
      toolLedger.push({ tool: tc.name, args, result, iteration });

      log("info", "Agent tool result", { tool: tc.name, result: result.slice(0, 200), traceId: trace.id });

      yield { type: "tool_result", tool: tc.name, result: parsedResult };

      // Emit section_updated events for write operations
      if (
        practiceConfig.sectionUpdateTools.includes(tc.name) &&
        parsedResult.success
      ) {
        const field = practiceConfig.sectionUpdateFieldMap[tc.name] || tc.name;
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
  const wrapUpSpanId = trace.startLLMCall(MAX_AGENT_ITERATIONS, model);
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
        trace.endLLMCall(wrapUpSpanId, chunk.usage);
      }
    }
  } catch (err) {
    const errMsg = (err as Error).message || "Unknown error";
    log("error", "Agent wrap-up error", { error: errMsg, traceId: trace.id });
    trace.errorLLMCall(wrapUpSpanId, errMsg, "llm_error");
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

  finalizeTrace(trace);
  yield { type: "message_end", tokenUsage: totalUsage };
}
