/**
 * Agent loop tests — verifies wrap-up behavior doesn't cause text duplication.
 *
 * The bug: when the loop exits on a text-only iteration (no tool calls),
 * the text isn't pushed as an assistant message. So messages.at(-1) is still
 * "tool" from the previous iteration, and the wrap-up fires, producing a
 * paraphrased duplicate of what was already streamed.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { setupTestDb, seedTestOrr, seedTestSession } from "../test-helpers.js";
import { setLLM, resetLLM } from "../llm/index.js";
import type { LLMAdapter, StreamChunk, LLMToolDef } from "../llm/index.js";
import { runAgent } from "./loop.js";
import type { AgentInput } from "./loop.js";
import { orrPracticeConfig } from "../practices/orr/config.js";

/** Mock LLM that plays a sequence of responses, one per chat() call. */
function sequenceLLM(responses: StreamChunk[][]): LLMAdapter {
  let callIndex = 0;
  return {
    async *chat() {
      const chunks = responses[callIndex] || [
        { type: "content" as const, content: "fallback" },
        { type: "done" as const, usage: { promptTokens: 10, completionTokens: 5 } },
      ];
      callIndex++;
      for (const chunk of chunks) yield chunk;
    },
  };
}

function text(content: string): StreamChunk {
  return { type: "content", content };
}

function toolCall(id: string, name: string, args: Record<string, unknown>): StreamChunk[] {
  return [
    { type: "tool_call_start", toolCallId: id, toolName: name, toolArgs: "" },
    { type: "tool_call_end", toolCallId: id, toolName: name, toolArgs: JSON.stringify(args) },
  ];
}

function done(): StreamChunk {
  return { type: "done", usage: { promptTokens: 100, completionTokens: 50 } };
}

async function collectText(input: AgentInput): Promise<string> {
  let result = "";
  for await (const event of runAgent(input)) {
    if (event.type === "content_delta") result += event.content;
  }
  return result;
}

describe("agent loop — wrap-up does not duplicate text", () => {
  let orrId: string;
  let sectionIds: string[];
  let sessionId: string;

  beforeEach(() => {
    const db = setupTestDb();
    const seed = seedTestOrr(db);
    orrId = seed.orrId;
    sectionIds = seed.sectionIds;
    sessionId = seedTestSession(db, orrId, seed.userId);
    resetLLM();
  });

  function makeInput(): AgentInput {
    return {
      practiceConfig: orrPracticeConfig,
      practiceId: orrId,
      sessionId,
      activeSectionId: sectionIds[0],
      conversationHistory: [],
      userMessage: "Tell me about the architecture",
      sessionTokenUsage: 0,
    };
  }

  it("does not run wrap-up when loop exits on a text-only iteration after tool iterations", async () => {
    // This is the exact pattern from the incident trace:
    // iteration 0: text + tool call (read_section)
    // iteration 1: text + tool call (update_question_response)
    // iteration 2: text only → loop exits
    // wrap-up should NOT fire because iteration 2 produced text
    const llm = sequenceLLM([
      // Iteration 0: text + read_section
      [
        text("Three layers of validation were missing. "),
        ...toolCall("tc1", "read_section", { section_id: sectionIds[0] }),
        done(),
      ],
      // Iteration 1: text + update_question_response
      [
        text("Let me record this. "),
        ...toolCall("tc2", "update_question_response", {
          section_id: sectionIds[0], question_index: 0, response: "test",
        }),
        done(),
      ],
      // Iteration 2: text only — loop should exit here
      [
        text("Let's move to the next question."),
        done(),
      ],
      // Wrap-up — this should NOT be called
      [
        text("WRAP-UP SHOULD NOT APPEAR"),
        done(),
      ],
    ]);

    setLLM(llm);
    const output = await collectText(makeInput());

    expect(output).toContain("Three layers of validation were missing.");
    expect(output).toContain("Let's move to the next question.");
    expect(output).not.toContain("WRAP-UP SHOULD NOT APPEAR");
  });

  it("does run wrap-up when loop exits with only tool calls and no text", async () => {
    const llm = sequenceLLM([
      // Iteration 0: tool call only, no text
      [
        ...toolCall("tc1", "read_section", { section_id: sectionIds[0] }),
        done(),
      ],
      // Iteration 1: tool call only
      [
        ...toolCall("tc2", "update_question_response", {
          section_id: sectionIds[0], question_index: 0, response: "test",
        }),
        done(),
      ],
      // Iteration 2: tool call only
      [
        ...toolCall("tc3", "read_section", { section_id: sectionIds[0] }),
        done(),
      ],
      // Iterations 3-4: tool calls (fills up to max)
      [
        ...toolCall("tc4", "read_section", { section_id: sectionIds[0] }),
        done(),
      ],
      [
        ...toolCall("tc5", "read_section", { section_id: sectionIds[0] }),
        done(),
      ],
      // Wrap-up — SHOULD fire since no text was produced
      [
        text("Here is my summary of what I found."),
        done(),
      ],
    ]);

    setLLM(llm);
    const output = await collectText(makeInput());

    expect(output).toContain("Here is my summary of what I found.");
  });
});
