/**
 * Tests for the PERSIST phase — Zod schema validation, deterministic writer,
 * fuzzy dedup, and section ownership checks.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { setupTestDb, seedTestOrr, seedTestSession, seedTestIncident } from "../test-helpers.js";
import { PersistOutputSchema, executePersist } from "./persist.js";
import type { PersistOutput } from "./persist.js";
import { getDb, schema } from "../db/index.js";
import { eq, and } from "drizzle-orm";

describe("PersistOutputSchema", () => {
  it("accepts valid full output", () => {
    const input = {
      question_responses: [{ section_id: "sec-1", question_index: 0, response: "The architecture is..." }],
      depth_assessments: [{ section_id: "sec-1", depth: "MODERATE", rationale: "Team traced the path" }],
      flags: [{ section_id: "sec-1", type: "RISK", note: "No backups", severity: "HIGH", deadline: "2026-05-01" }],
      dependencies: [{ name: "Redis", type: "cache", criticality: "important" }],
      discoveries: [{ text: "Team discovered retry has no jitter" }],
      experiments: [],
      action_items: [],
      cross_practice: [],
      section_content: [],
      timeline_events: [],
      contributing_factors: [],
    };
    const result = PersistOutputSchema.parse(input);
    expect(result.question_responses).toHaveLength(1);
    expect(result.depth_assessments[0].depth).toBe("MODERATE");
  });

  it("accepts empty arrays (nothing to persist)", () => {
    const input = {};
    const result = PersistOutputSchema.parse(input);
    expect(result.question_responses).toEqual([]);
    expect(result.depth_assessments).toEqual([]);
    expect(result.flags).toEqual([]);
  });

  it("rejects invalid depth value", () => {
    const input = {
      depth_assessments: [{ section_id: "sec-1", depth: "VERY_DEEP", rationale: "test" }],
    };
    expect(() => PersistOutputSchema.parse(input)).toThrow();
  });

  it("rejects empty response in question_responses", () => {
    const input = {
      question_responses: [{ section_id: "sec-1", question_index: 0, response: "" }],
    };
    expect(() => PersistOutputSchema.parse(input)).toThrow();
  });

  it("rejects invalid flag type", () => {
    const input = {
      flags: [{ section_id: "sec-1", type: "DANGER", note: "test" }],
    };
    expect(() => PersistOutputSchema.parse(input)).toThrow();
  });

  it("accepts source and code_ref on question responses", () => {
    const input = {
      question_responses: [{
        section_id: "sec-1",
        question_index: 0,
        response: "Found in code",
        source: "code",
        code_ref: "src/retry.ts:45-92",
      }],
    };
    const result = PersistOutputSchema.parse(input);
    expect(result.question_responses[0].source).toBe("code");
    expect(result.question_responses[0].code_ref).toBe("src/retry.ts:45-92");
  });
});

describe("executePersist", () => {
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
  });

  it("writes question responses to the correct section", () => {
    const output: PersistOutput = PersistOutputSchema.parse({
      question_responses: [
        { section_id: sectionIds[0], question_index: 0, response: "Python FastAPI monolith on ECS" },
        { section_id: sectionIds[0], question_index: 1, response: "PostgreSQL and Redis" },
      ],
    });

    const result = executePersist(output, "orr", orrId, sessionId);
    expect(result.writtenItems).toBe(2);
    expect(result.errors).toHaveLength(0);

    const section = db.select().from(schema.sections)
      .where(eq(schema.sections.id, sectionIds[0]))
      .get()!;
    const responses = section.promptResponses as Record<string, string>;
    expect(responses["0"]).toBe("Python FastAPI monolith on ECS");
    expect(responses["1"]).toBe("PostgreSQL and Redis");
  });

  it("writes depth assessment", () => {
    const output: PersistOutput = PersistOutputSchema.parse({
      depth_assessments: [
        { section_id: sectionIds[0], depth: "MODERATE", rationale: "Team traced the critical path" },
      ],
    });

    executePersist(output, "orr", orrId, sessionId);

    const section = db.select().from(schema.sections)
      .where(eq(schema.sections.id, sectionIds[0]))
      .get()!;
    expect(section.depth).toBe("MODERATE");
    expect(section.depthRationale).toBe("Team traced the critical path");
  });

  it("writes flags preserving ACCEPTED/RESOLVED flags", () => {
    // Seed an existing ACCEPTED flag
    const existingFlags = [{ type: "RISK", note: "Old risk", status: "ACCEPTED", createdAt: "2026-01-01" }];
    db.update(schema.sections)
      .set({ flags: existingFlags as any })
      .where(eq(schema.sections.id, sectionIds[0]))
      .run();

    const output: PersistOutput = PersistOutputSchema.parse({
      flags: [{ section_id: sectionIds[0], type: "GAP", note: "New gap found" }],
    });

    executePersist(output, "orr", orrId, sessionId);

    const section = db.select().from(schema.sections)
      .where(eq(schema.sections.id, sectionIds[0]))
      .get()!;
    const flags = section.flags as any[];
    expect(flags).toHaveLength(2);
    expect(flags[0].status).toBe("ACCEPTED"); // preserved
    expect(flags[1].note).toBe("New gap found");
    expect(flags[1].status).toBe("OPEN");
  });

  it("rejects writes to sections from a different ORR", () => {
    const output: PersistOutput = PersistOutputSchema.parse({
      question_responses: [
        { section_id: "nonexistent-section", question_index: 0, response: "Should fail" },
      ],
    });

    const result = executePersist(output, "orr", orrId, sessionId);
    expect(result.writtenItems).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("not found");
  });

  // Dependencies, discoveries, experiments, action items, timeline events, and
  // contributing factors are no longer extracted by PERSIST — they come from
  // slash commands only. Dedup tests for those are in slash-commands.test.ts.

  it("handles empty output gracefully", () => {
    const output: PersistOutput = PersistOutputSchema.parse({});
    const result = executePersist(output, "orr", orrId, sessionId);
    expect(result.writtenItems).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  // Incident-specific fields (timeline events, contributing factors) are now
  // handled by slash commands only, not the PERSIST phase. Tests in slash-commands.test.ts.
});
