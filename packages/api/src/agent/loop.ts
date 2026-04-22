import { MAX_AGENT_ITERATIONS, MAX_SESSION_TOKENS, SESSION_TOKEN_WARNING, SESSION_TOKEN_URGENT } from "@orr/shared";
import { getLLM } from "../llm/index.js";
import type { LLMMessage } from "../llm/index.js";
import type { SSEEvent } from "@orr/shared";
import type { PracticeConfig } from "./practice.js";
import { nanoid } from "nanoid";
import { TraceLogger } from "./trace.js";
import { log } from "../logger.js";
import { runBeforeHooks, runAfterHooks } from "./steering.js";
import type { ToolLedgerEntry } from "./steering.js";
import { assessEngagement } from "./engagement.js";
import type { SectionEngagementContext } from "./engagement.js";
import { isWriteSlashCommand, parseSlashResponse, persistSlashResult } from "./slash-commands.js";

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
  log("error", "Uncategorized LLM error", { rawError: msg });
  return "Something went wrong with the AI provider. Try sending your message again. If the problem persists, check the server logs.";
}

/** Finalize trace — emits summary log with totals for the agent turn. */
function finalizeTrace(trace: TraceLogger): void {
  trace.finalize();
}

export interface AgentInput {
  practiceConfig: PracticeConfig;
  practiceId: string;
  sessionId: string;
  activeSectionId: string | null;
  conversationHistory: LLMMessage[];
  userMessage: string;
  sessionTokenUsage: number;
  /** Original display content (e.g. "/experiments") — used to detect slash commands */
  displayContent?: string;
}

/**
 * Core agent loop — single loop with all tools (read + write).
 *
 * 1. Build system prompt via PracticeConfig (with token budget warnings at 75%/90%)
 * 2. Send to LLM with ALL practice-specific tools (read and write)
 * 3. If LLM calls tools, run steering hooks then execute — loop up to MAX_AGENT_ITERATIONS
 * 4. Yield SSE events throughout for real-time streaming to client
 * 5. On retry/fallback events from RetryAdapter, reset accumulated state
 * 6. If max iterations hit, give LLM one final text-only turn to wrap up
 *
 * For write slash commands (/experiments, /learning, etc.), the agent returns
 * structured JSON which is parsed and persisted directly after the loop.
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

  // Append token budget warning when session is running long.
  const tokenFraction = sessionTokenUsage / MAX_SESSION_TOKENS;
  let budgetAwarePrompt = systemPrompt;
  if (tokenFraction >= SESSION_TOKEN_URGENT) {
    const remaining = Math.round((MAX_SESSION_TOKENS - sessionTokenUsage) / 1000);
    budgetAwarePrompt += `\n\n## SESSION BUDGET — URGENT\nThis session has used ${Math.round(tokenFraction * 100)}% of its token budget (~${remaining}k tokens remaining). The session will auto-renew soon, which resets conversation context. Call write_session_summary NOW to preserve your observations, depth assessments, and discoveries before they are lost. Include a discoveries array — things that surprised the team or contradicted their expectations.`;
  } else if (tokenFraction >= SESSION_TOKEN_WARNING) {
    const remaining = Math.round((MAX_SESSION_TOKENS - sessionTokenUsage) / 1000);
    budgetAwarePrompt += `\n\n## Session Budget\nThis session has used ${Math.round(tokenFraction * 100)}% of its token budget (~${remaining}k tokens remaining). Start wrapping up the current line of discussion. You should call write_session_summary soon to persist your observations and discoveries before the session auto-renews.`;
  }

  // Adaptive learning: detect engagement zone and inject guidance
  let sectionCtx: SectionEngagementContext | null = null;
  const ctxSections = (context as any).sections as Array<{ id: string; depth: string; codeSourced: number; questionsAnswered: number }> | undefined;
  if (context.activeSectionId && ctxSections) {
    const sec = ctxSections.find(s => s.id === context.activeSectionId);
    if (sec) {
      sectionCtx = { depth: sec.depth, codeSourced: sec.codeSourced, questionsAnswered: sec.questionsAnswered };
    }
  }
  const engagement = assessEngagement(conversationHistory, sectionCtx);

  if (engagement.zone === "FRUSTRATED") {
    budgetAwarePrompt += `\n\n## Adaptive Guidance — Team Struggling
The team appears to be hitting a wall in this area (signals: ${engagement.signals.join("; ")}).

Adjust your approach:
- LOWER the code exploration barrier. You may now proactively offer: "Want me to search the codebase for that?" You don't need to wait for the team to ask.
- Reframe "I don't know" as useful data: "That's useful — the team's operational model doesn't cover this area. Let's look at the code together and see what we find."
- Ask simpler, more focused questions. Break complex topics into smaller pieces.
- Tag this area as a blind spot worth noting in the session summary.
- Do NOT reduce depth expectations — change HOW you get there, not WHERE you're going.`;
    log("info", "Engagement: FRUSTRATED zone", { sessionId, signals: engagement.signals, confidence: engagement.confidence });
  } else if (engagement.zone === "TOO_EASY") {
    budgetAwarePrompt += `\n\n## Adaptive Guidance — Push Deeper
The conversation is flowing easily with few surprises (signals: ${engagement.signals.join("; ")}). This may indicate fluency illusion — the team sounds confident but may not have deep understanding.

Adjust your approach:
- RAISE the challenge. Ask harder prediction questions: "What happens if X AND Y fail simultaneously?" "What's the blast radius if this component is down for 30 minutes?"
- TIGHTEN the code exploration ladder. Do NOT offer to check code — push the team to recall from memory first. Their recall gaps ARE the learning signal.
- Probe for novel scenarios the docs don't cover. Find the boundary of their knowledge.
- Try cross-section connection questions: "How does this interact with what you described in [other section]?"
- Consider whether the current depth assessment is too generous — fluent recitation is SURFACE, not MODERATE.`;
    log("info", "Engagement: TOO_EASY zone", { sessionId, signals: engagement.signals, confidence: engagement.confidence });
  }

  // Build messages array
  const messages: LLMMessage[] = [
    { role: "system", content: budgetAwarePrompt },
    ...conversationHistory,
    { role: "user", content: userMessage },
  ];

  const messageId = nanoid();
  const model = process.env.LLM_MODEL || "sonnet";
  const trace = new TraceLogger(practiceConfig.practiceType, practiceId, sessionId, messageId, model);
  trace.setEngagement(engagement.zone, engagement.signals);

  yield { type: "message_start", messageId };

  let totalUsage = 0;
  let converseFullText = "";
  const cumulativeTokens = () => sessionTokenUsage + totalUsage;

  // Detect write slash commands — suppress text streaming, parse JSON after loop
  const isSlashWrite = input.displayContent && isWriteSlashCommand(input.displayContent);

  for (let iteration = 0; iteration < MAX_AGENT_ITERATIONS; iteration++) {
    if (iteration > 0 && cumulativeTokens() >= MAX_SESSION_TOKENS) {
      log("info", "Session hit token budget mid-turn", { sessionId, tokens: cumulativeTokens(), max: MAX_SESSION_TOKENS });
      break;
    }

    let fullContent = "";
    const pendingToolCalls: Array<{ id: string; name: string; args: string }> = [];
    const llmSpanId = trace.startLLMCall(iteration, model);

    try {
      const stream = llm.chat(messages, practiceConfig.tools);

      for await (const chunk of stream) {
        if (chunk.type === "retry") {
          trace.addRetry(chunk.attempt!, chunk.reason!, chunk.delayMs!);
          fullContent = "";
          pendingToolCalls.length = 0;
          yield { type: "status", message: `${chunk.reason}. Retrying (${chunk.attempt}/${chunk.maxRetries})...` } as SSEEvent;
          continue;
        }
        if (chunk.type === "fallback") {
          trace.addFallback(chunk.reason || "unknown", chunk.reason || "");
          fullContent = "";
          pendingToolCalls.length = 0;
          yield { type: "status", message: `${chunk.reason}. Response quality may differ slightly.` } as SSEEvent;
          continue;
        }

        switch (chunk.type) {
          case "content": {
            const text = chunk.content!;
            if (text.match(/<invoke\s|<parameter\s|<\/invoke>|<\/parameter>/)) break;
            fullContent += text;
            converseFullText += text;
            // For write slash commands, suppress streaming — show spinner until slash_result
            if (!isSlashWrite) {
              yield { type: "content_delta", content: text };
            }
            break;
          }
          case "tool_call_start":
            pendingToolCalls.push({ id: chunk.toolCallId!, name: chunk.toolName!, args: "" });
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
      yield { type: "error", message: categorizeError(errMsg) } as SSEEvent;
      yield { type: "message_end", tokenUsage: totalUsage };
      return;
    }

    // If no tool calls, we're done with the loop
    if (pendingToolCalls.length === 0) {
      break;
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
      try { args = JSON.parse(tc.args); } catch { args = {}; }

      yield { type: "tool_call", tool: tc.name, args };
      log("info", "Agent tool call", { iteration, tool: tc.name, args, traceId: trace.id });

      const toolSpanId = trace.startToolCall(iteration, tc.name, args);
      let result: string;
      let parsedResult: Record<string, unknown>;

      const ledger = { calls: toolLedger, currentIteration: iteration };
      const steering = runBeforeHooks(steeringHooks, tc.name, args, ledger);

      if (steering.action === "guide") {
        result = JSON.stringify({ error: steering.reason });
        parsedResult = { error: steering.reason };
        trace.endToolCall(toolSpanId, result.slice(0, 500), `steered:${steering.hookName}`);
        log("info", "Steering guided tool call", {
          hook: steering.hookName, tool: tc.name, reason: steering.reason, traceId: trace.id,
        });
      } else {
        try {
          result = practiceConfig.executeTool(tc.name, args, practiceId, sessionId);
          result = runAfterHooks(steeringHooks, tc.name, args, result);
          parsedResult = JSON.parse(result);
          trace.endToolCall(toolSpanId, result.slice(0, 500));
        } catch (err) {
          const errMsg = (err as Error).message || "Unknown tool error";
          log("error", "Tool execution failed", { tool: tc.name, error: errMsg, traceId: trace.id });
          const safeMsg = `Tool "${tc.name}" encountered an error. The operation could not be completed.`;
          result = JSON.stringify({ error: safeMsg });
          parsedResult = { error: safeMsg };
          trace.endToolCall(toolSpanId, result, errMsg);
          yield { type: "error", message: safeMsg } as SSEEvent;
        }
      }

      toolLedger.push({ tool: tc.name, args, result, iteration });
      log("info", "Agent tool result", { tool: tc.name, result: result.slice(0, 200), traceId: trace.id });

      yield { type: "tool_result", tool: tc.name, result: parsedResult };

      if (practiceConfig.sectionUpdateTools.includes(tc.name) && parsedResult.success) {
        yield { type: "section_updated", sectionId: args.section_id as string, field: practiceConfig.sectionUpdateFieldMap[tc.name] || tc.name };
      }
      if (practiceConfig.dataUpdateTools.includes(tc.name) && parsedResult.success) {
        yield { type: "data_updated", tool: tc.name };
      }

      messages.push({ role: "tool", content: result, tool_call_id: tc.id });
    }
  }

  // Emit message_end before any post-loop processing
  finalizeTrace(trace);
  yield { type: "message_end", tokenUsage: totalUsage };

  // For write slash commands, parse the agent's structured JSON and persist directly
  if (isSlashWrite) {
    const slashResult = parseSlashResponse(input.displayContent!, converseFullText);
    if (slashResult) {
      const written = persistSlashResult(slashResult, practiceConfig.practiceType, practiceId, sessionId);
      yield { type: "slash_result", result: slashResult } as SSEEvent;
      if (written > 0) {
        yield { type: "data_updated", tool: slashResult.command } as SSEEvent;
      }
    }
  }
}
