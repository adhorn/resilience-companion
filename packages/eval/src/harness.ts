/**
 * Eval harness — runs a simulated multi-turn conversation against the real agent.
 *
 * Calls runAgent() directly (in-process, no HTTP server needed) using a fresh
 * in-memory SQLite database per scenario. Mirrors how session-routes.ts builds
 * the AgentInput, but strips the HTTP/SSE transport layer.
 */

import { setupTestDb, seedTestOrr, seedTestSession } from "@orr/api/src/test-helpers.js";
import { runAgent } from "@orr/api/src/agent/loop.js";
import type { AgentInput } from "@orr/api/src/agent/loop.js";
import type { LLMMessage } from "@orr/api/src/llm/index.js";
import { setLLM, resetLLM } from "@orr/api/src/llm/index.js";
import { AnthropicAdapter } from "@orr/api/src/llm/anthropic.js";
import { getDb } from "@orr/api/src/db/index.js";
import { orrPracticeConfig } from "@orr/api/src/practices/orr/config.js";
import type { EvalScenario, HarnessResult, ConversationTurn, ToolCall } from "./types.js";
import { SimulatedUser } from "./simulated-user.js";

const CHARS_PER_TOKEN = 4;
const MAX_HISTORY_TOKENS = 10_000;

function trimHistory(messages: LLMMessage[], maxTokens: number): LLMMessage[] {
  if (messages.length === 0) return messages;
  let tokenCount = 0;
  let keepFrom = messages.length;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msgTokens = Math.ceil((messages[i].content?.length || 0) / CHARS_PER_TOKEN);
    if (tokenCount + msgTokens > maxTokens) break;
    tokenCount += msgTokens;
    keepFrom = i;
  }
  if (keepFrom < messages.length && messages[keepFrom].role === "assistant") keepFrom++;
  return messages.slice(keepFrom);
}

export interface HarnessOptions {
  /** Anthropic API key — used for the simulated user (Haiku) */
  apiKey: string;
}

export async function runScenario(
  scenario: EvalScenario,
  opts: HarnessOptions,
): Promise<HarnessResult> {
  const start = Date.now();

  // Fresh in-memory DB per scenario — complete isolation
  const db = setupTestDb();
  const { orrId, sectionIds, userId } = seedTestOrr(db);
  const sessionId = seedTestSession(db, orrId, userId);

  // Apply any custom section overrides from the scenario
  if (scenario.sectionSetup && scenario.sectionSetup.length > 0) {
    const rawDb = db as any;
    for (const setup of scenario.sectionSetup) {
      const sectionId = sectionIds[setup.sectionIndex];
      if (!sectionId) continue;
      const updates: Record<string, unknown> = {
        title: setup.title,
        prompts: JSON.stringify(setup.prompts),
        updatedAt: new Date().toISOString(),
      };
      if (setup.prefilledResponses) {
        updates.promptResponses = JSON.stringify(setup.prefilledResponses);
      }
      if (setup.prefilledDepth) {
        updates.depth = setup.prefilledDepth;
      }
      rawDb.run(
        `UPDATE sections SET title = ?, prompts = ?, updatedAt = ?${setup.prefilledResponses ? ", promptResponses = ?" : ""}${setup.prefilledDepth ? ", depth = ?" : ""} WHERE id = ?`,
        [
          setup.title,
          JSON.stringify(setup.prompts),
          new Date().toISOString(),
          ...(setup.prefilledResponses ? [JSON.stringify(setup.prefilledResponses)] : []),
          ...(setup.prefilledDepth ? [setup.prefilledDepth] : []),
          sectionId,
        ],
      );
    }
  }

  // Set the production LLM adapter (from env vars — the real model under test)
  // resetLLM() so getLLM() re-reads env and re-initializes from scratch
  resetLLM();

  const simulatedUser = new SimulatedUser(scenario.userPersona, opts.apiKey);

  const conversation: ConversationTurn[] = [];
  const allToolCalls: ToolCall[] = [];
  let conversationHistory: LLMMessage[] = [];
  let totalTokenUsage = 0;

  // Kick off the conversation — simulated user speaks first
  const openingMsg = await simulatedUser.openingMessage();
  conversation.push({ role: "user", content: openingMsg });

  let currentUserMessage = openingMsg;

  for (let turn = 0; turn < scenario.maxTurns; turn++) {
    // Build agent input (mirrors session-routes.ts messages handler)
    const history = trimHistory(conversationHistory, MAX_HISTORY_TOKENS);

    const input: AgentInput = {
      practiceConfig: orrPracticeConfig,
      practiceId: orrId,
      sessionId,
      activeSectionId: sectionIds[0] ?? null,
      conversationHistory: history,
      userMessage: currentUserMessage,
      sessionTokenUsage: totalTokenUsage,
    };

    // Collect SSE events from agent
    let agentTextContent = "";
    const turnToolCalls: ToolCall[] = [];
    let turnTokens = 0;

    for await (const event of runAgent(input)) {
      switch (event.type) {
        case "content_delta":
          agentTextContent += event.content;
          break;
        case "tool_call":
          turnToolCalls.push({ tool: event.tool, args: event.args, result: "" });
          break;
        case "tool_result": {
          // Match result to the most recent call for the same tool
          const lastIdx = [...turnToolCalls].reverse().findIndex(
            (tc: ToolCall) => tc.tool === event.tool && tc.result === "",
          );
          if (lastIdx !== -1) {
            turnToolCalls[turnToolCalls.length - 1 - lastIdx].result = JSON.stringify(event.result);
          }
          break;
        }
        case "message_end":
          turnTokens = event.tokenUsage;
          break;
        case "error":
          throw new Error(`Agent error: ${event.message}`);
      }
    }

    totalTokenUsage += turnTokens;
    allToolCalls.push(...turnToolCalls);

    if (agentTextContent) {
      conversation.push({ role: "agent", content: agentTextContent });
    }

    // Update conversation history for the next turn
    conversationHistory.push({ role: "user", content: currentUserMessage });
    if (agentTextContent) {
      conversationHistory.push({ role: "assistant", content: agentTextContent });
    }

    // Ask simulated user for next message
    if (turn < scenario.maxTurns - 1) {
      const nextMsg = await simulatedUser.nextMessage(agentTextContent);
      if (!nextMsg) break; // Simulated user signals done
      conversation.push({ role: "user", content: nextMsg });
      currentUserMessage = nextMsg;
    }
  }

  return {
    scenarioId: scenario.id,
    conversation,
    toolCalls: allToolCalls,
    db,
    sectionIds,
    tokenUsage: totalTokenUsage,
    durationMs: Date.now() - start,
  };
}
