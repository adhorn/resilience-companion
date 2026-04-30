/**
 * Agent loop tests — verifies text streaming behavior across multi-iteration turns.
 *
 * The core problem: when the LLM produces text + tool calls across multiple iterations,
 * later iterations paraphrase earlier text. These tests verify that only one block of
 * text reaches the client, and that the wrap-up only fires when no text was streamed.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { setupTestDb, seedTestOrr, seedTestSession } from "../test-helpers.js";
import { setLLM, resetLLM } from "../llm/index.js";
import type { LLMAdapter, StreamChunk, LLMToolDef } from "../llm/index.js";
import { runAgent } from "./loop.js";
import type { AgentInput } from "./loop.js";
import { orrPracticeConfig } from "../practices/orr/config.js";

/**
 * Create a mock LLM that plays back a sequence of responses.
 * Each response is an array of StreamChunks representing one LLM call.
 * The mock advances through the sequence on each call to chat().
 */
function sequenceLLM(responses: StreamChunk[][]): LLMAdapter {
  let callIndex = 0;
  return {
    async *chat(_messages: any, _tools?: LLMToolDef[]) {
      const chunks = responses[callIndex] || [
        { type: "content" as const, content: "fallback" },
        { type: "done" as const, usage: { promptTokens: 10, completionTokens: 5 } },
      ];
      callIndex++;
      for (const chunk of chunks) {
        yield chunk;
      }
    },
  };
}

/** Helper: create a content chunk */
function text(content: string): StreamChunk {
  return { type: "content", content };
}

/** Helper: create tool call chunks (start + end) */
function toolCall(id: string, name: string, args: Record<string, unknown>): StreamChunk[] {
  return [
    { type: "tool_call_start", toolCallId: id, toolName: name, toolArgs: "" },
    { type: "tool_call_end", toolCallId: id, toolName: name, toolArgs: JSON.stringify(args) },
  ];
}

/** Helper: done chunk */
function done(): StreamChunk {
  return { type: "done", usage: { promptTokens: 100, completionTokens: 50 } };
}

/** Collect all content_delta text from agent events */
async function collectText(input: AgentInput): Promise<string> {
  let text = "";
  for await (const event of runAgent(input)) {
    if (event.type === "content_delta") {
      text += event.content;
    }
  }
  return text;
}

/** Count content_delta events */
async function collectEvents(input: AgentInput): Promise<Array<{ type: string; content?: string }>> {
  const events: Array<{ type: string; content?: string }> = [];
  for await (const event of runAgent(input)) {
    if (event.type === "content_delta" || event.type === "message_start" || event.type === "message_end") {
      events.push({ type: event.type, content: event.type === "content_delta" ? (event as any).content : undefined });
    }
  }
  return events;
}

describe("agent loop — text duplication prevention", () => {
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

  function makeInput(overrides?: Partial<AgentInput>): AgentInput {
    return {
      practiceConfig: orrPracticeConfig,
      practiceId: orrId,
      sessionId,
      activeSectionId: sectionIds[0],
      conversationHistory: [],
      userMessage: "Tell me about the architecture",
      sessionTokenUsage: 0,
      ...overrides,
    };
  }

  it("streams text only once when LLM produces text + tools across multiple iterations", async () => {
    // Simulate: iteration 0 produces text + tool call, iteration 1 produces paraphrased text + tool call,
    // iteration 2 produces more paraphrased text (no tools, loop exits)
    const llm = sequenceLLM([
      // Iteration 0: text + tool call
      [
        text("Good question about architecture. "),
        text("Let me look at this section."),
        ...toolCall("tc1", "read_section", { section_id: sectionIds[0] }),
        done(),
      ],
      // Iteration 1: paraphrased text + another tool call (should be suppressed)
      [
        text("So the architecture section shows... "),
        text("Let me record this observation."),
        ...toolCall("tc2", "update_question_response", {
          section_id: sectionIds[0],
          question_index: 0,
          response: "test answer",
        }),
        done(),
      ],
      // Iteration 2: final text only (should be suppressed since we already have text)
      [
        text("To summarize what we found..."),
        done(),
      ],
    ]);

    setLLM(llm);
    const output = await collectText(makeInput());

    // Should only contain text from iteration 0
    expect(output).toContain("Good question about architecture.");
    expect(output).toContain("Let me look at this section.");
    // Should NOT contain paraphrased text from later iterations
    expect(output).not.toContain("So the architecture section shows");
    expect(output).not.toContain("Let me record this observation");
    expect(output).not.toContain("To summarize what we found");
  });

  it("runs wrap-up when no text was produced (only tool calls)", async () => {
    // Simulate: iteration 0 produces only tool calls (no text), wrap-up should fire
    const llm = sequenceLLM([
      // Iteration 0: tool calls only, no text
      [
        ...toolCall("tc1", "read_section", { section_id: sectionIds[0] }),
        done(),
      ],
      // Iteration 1: more tool calls only
      [
        ...toolCall("tc2", "update_question_response", {
          section_id: sectionIds[0],
          question_index: 0,
          response: "test",
        }),
        done(),
      ],
      // Wrap-up turn: should produce text
      [
        text("Based on my review of the section, here are the key points."),
        done(),
      ],
    ]);

    setLLM(llm);
    const output = await collectText(makeInput());

    // Wrap-up text should be present since no text was streamed during the loop
    expect(output).toContain("Based on my review");
  });

  it("skips wrap-up when text was already streamed", async () => {
    // Simulate: iteration 0 produces text + tool call, loop ends at iteration limit
    const llm = sequenceLLM([
      // Iteration 0: text + tool call
      [
        text("Here is my analysis."),
        ...toolCall("tc1", "read_section", { section_id: sectionIds[0] }),
        done(),
      ],
      // Iterations 1-4: just tool calls (these consume the remaining iterations)
      ...Array(4).fill([
        ...toolCall("tc-n", "read_section", { section_id: sectionIds[0] }),
        done(),
      ]),
      // Wrap-up (should NOT fire because text was already streamed)
      [
        text("This should never appear."),
        done(),
      ],
    ]);

    setLLM(llm);
    const output = await collectText(makeInput());

    expect(output).toContain("Here is my analysis");
    expect(output).not.toContain("This should never appear");
  });

  it("single iteration with text only — no duplication possible", async () => {
    const llm = sequenceLLM([
      [
        text("This is a simple response with no tool calls."),
        done(),
      ],
    ]);

    setLLM(llm);
    const output = await collectText(makeInput());

    expect(output).toBe("This is a simple response with no tool calls.");
  });
});
