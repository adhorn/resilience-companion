/**
 * Integration tests for the PERSIST phase — full chain from LLM response to DB writes.
 *
 * These test with mock LLM responses that include the messy output real LLMs produce:
 * preamble text, markdown fences, commentary mixed with JSON. This is what caught
 * the original bug where "Looking at the dependencies..." broke JSON.parse.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { setupTestDb, seedTestOrr, seedTestSession } from "../test-helpers.js";
import { setLLM, resetLLM } from "../llm/index.js";
import type { LLMAdapter, StreamChunk } from "../llm/index.js";
import { runPersistPhase } from "./persist.js";
import { getDb, schema } from "../db/index.js";
import { eq } from "drizzle-orm";

/** Create a mock LLM that returns the given text as content chunks. */
function mockLLM(responseText: string): LLMAdapter {
  return {
    async *chat() {
      yield { type: "content" as const, content: responseText };
      yield { type: "done" as const, usage: { promptTokens: 100, completionTokens: 50 } };
    },
  };
}

describe("PERSIST integration — LLM response to DB writes", () => {
  let db: ReturnType<typeof setupTestDb>;
  let orrId: string;
  let sectionIds: string[];
  let sessionId: string;

  beforeEach(() => {
    db = setupTestDb();
    const seed = seedTestOrr(db);
    orrId = seed.orrId;
    sectionIds = seed.sectionIds;
    sessionId = seedTestSession(db, orrId, seed.userId);
    resetLLM();
  });

  async function runPersist(llmResponse: string) {
    setLLM(mockLLM(llmResponse));
    const events: any[] = [];
    for await (const event of runPersistPhase(
      [{ role: "user", content: "test" }, { role: "assistant", content: "test response" }],
      "orr",
      orrId,
      sessionId,
      sectionIds[0],
    )) {
      events.push(event);
    }
    return events;
  }

  it("handles clean JSON response", async () => {
    const events = await runPersist(`{
      "question_responses": [
        {"section_id": "${sectionIds[0]}", "question_index": 0, "response": "Node.js Hono API"}
      ],
      "depth_assessments": [],
      "flags": [],
      "dependencies": [],
      "discoveries": [],
      "experiments": [],
      "action_items": [],
      "cross_practice": [],
      "section_content": [],
      "timeline_events": [],
      "contributing_factors": []
    }`);

    const section = db.select().from(schema.sections).where(eq(schema.sections.id, sectionIds[0])).get()!;
    const responses = section.promptResponses as Record<string, string>;
    expect(responses["0"]).toBe("Node.js Hono API");
  });

  it("handles LLM preamble before JSON", async () => {
    const events = await runPersist(`
Looking at the conversation, the team described their architecture clearly.

Here's what should be persisted:

{
  "question_responses": [
    {"section_id": "${sectionIds[0]}", "question_index": 0, "response": "Python FastAPI on ECS"}
  ],
  "depth_assessments": [],
  "flags": [],
  "dependencies": [],
  "discoveries": [],
  "experiments": [],
  "action_items": [],
  "cross_practice": [],
  "section_content": [],
  "timeline_events": [],
  "contributing_factors": []
}

That covers everything discussed.`);

    const section = db.select().from(schema.sections).where(eq(schema.sections.id, sectionIds[0])).get()!;
    const responses = section.promptResponses as Record<string, string>;
    expect(responses["0"]).toBe("Python FastAPI on ECS");
  });

  it("handles markdown-fenced JSON", async () => {
    const events = await runPersist(`
Here's the extraction:

\`\`\`json
{
  "question_responses": [
    {"section_id": "${sectionIds[0]}", "question_index": 1, "response": "PostgreSQL and Redis"}
  ],
  "depth_assessments": [],
  "flags": [],
  "dependencies": [],
  "discoveries": [],
  "experiments": [],
  "action_items": [],
  "cross_practice": [],
  "section_content": [],
  "timeline_events": [],
  "contributing_factors": []
}
\`\`\``);

    const section = db.select().from(schema.sections).where(eq(schema.sections.id, sectionIds[0])).get()!;
    const responses = section.promptResponses as Record<string, string>;
    expect(responses["1"]).toBe("PostgreSQL and Redis");
  });

  it("writes multiple items in one persist call", async () => {
    const events = await runPersist(`{
      "question_responses": [
        {"section_id": "${sectionIds[0]}", "question_index": 0, "response": "Three-tier architecture"},
        {"section_id": "${sectionIds[0]}", "question_index": 1, "response": "Hono API, React, SQLite"}
      ],
      "depth_assessments": [
        {"section_id": "${sectionIds[0]}", "depth": "MODERATE", "rationale": "Team traced the path"}
      ],
      "flags": [
        {"section_id": "${sectionIds[0]}", "type": "GAP", "note": "No backup strategy"}
      ],
      "dependencies": [
        {"name": "Redis", "type": "cache", "criticality": "important"}
      ],
      "discoveries": [
        {"text": "Team discovered retry has no jitter"}
      ],
      "experiments": [],
      "action_items": [],
      "cross_practice": [],
      "section_content": [],
      "timeline_events": [],
      "contributing_factors": []
    }`);

    // Check question responses
    const section = db.select().from(schema.sections).where(eq(schema.sections.id, sectionIds[0])).get()!;
    const responses = section.promptResponses as Record<string, string>;
    expect(responses["0"]).toBe("Three-tier architecture");
    expect(responses["1"]).toBe("Hono API, React, SQLite");

    // Check depth
    expect(section.depth).toBe("MODERATE");

    // Check flags
    const flags = section.flags as any[];
    expect(flags.some((f: any) => f.note === "No backup strategy")).toBe(true);

    // Check dependency
    const deps = db.select().from(schema.dependencies).where(eq(schema.dependencies.orrId, orrId)).all();
    expect(deps.some((d) => d.name === "Redis")).toBe(true);

    // Check discovery
    const discoveries = db.select().from(schema.discoveries).all();
    expect(discoveries.some((d) => d.text === "Team discovered retry has no jitter")).toBe(true);

    // Check SSE events were emitted
    const sectionUpdates = events.filter((e) => e.type === "section_updated");
    expect(sectionUpdates.length).toBeGreaterThan(0);
  });

  it("handles empty output gracefully", async () => {
    const events = await runPersist(`{
      "question_responses": [],
      "depth_assessments": [],
      "flags": [],
      "dependencies": [],
      "discoveries": [],
      "experiments": [],
      "action_items": [],
      "cross_practice": [],
      "section_content": [],
      "timeline_events": [],
      "contributing_factors": []
    }`);

    // No section_updated events for empty output
    const sectionUpdates = events.filter((e) => e.type === "section_updated");
    expect(sectionUpdates).toHaveLength(0);
  });

  it("rejects invalid section_id without crashing", async () => {
    const events = await runPersist(`{
      "question_responses": [
        {"section_id": "nonexistent", "question_index": 0, "response": "Should fail"}
      ],
      "depth_assessments": [],
      "flags": [],
      "dependencies": [],
      "discoveries": [],
      "experiments": [],
      "action_items": [],
      "cross_practice": [],
      "section_content": [],
      "timeline_events": [],
      "contributing_factors": []
    }`);

    // Should not crash, should not write
    const section = db.select().from(schema.sections).where(eq(schema.sections.id, sectionIds[0])).get()!;
    const responses = section.promptResponses as Record<string, string>;
    expect(responses["0"]).toBeUndefined();
  });

  it("handles completely invalid LLM response without crashing", async () => {
    const events = await runPersist("I can't produce JSON right now, sorry!");
    // Should not crash — just no writes
    expect(events.some((e) => e.type === "section_updated")).toBe(false);
  });
});
