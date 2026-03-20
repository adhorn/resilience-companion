import { describe, it, expect, beforeEach } from "vitest";
import { setupTestDb, seedTestOrr, seedTestSession } from "../test-helpers.js";
import { executeTool } from "./tools.js";
import { getDb } from "../db/connection.js";
import * as schema from "../db/schema.js";
import { eq } from "drizzle-orm";

let orrId: string;
let sessionId: string;
let sectionIds: string[];

beforeEach(() => {
  const db = setupTestDb();
  const seed = seedTestOrr(db);
  orrId = seed.orrId;
  sectionIds = seed.sectionIds;
  sessionId = seedTestSession(db, orrId, seed.userId);
});

describe("read_section", () => {
  it("returns section data", () => {
    const result = JSON.parse(executeTool("read_section", { section_id: sectionIds[0] }, orrId, sessionId));
    expect(result.title).toBe("Architecture");
    expect(result.prompts).toHaveLength(2);
    expect(result.depth).toBe("UNKNOWN");
    expect(result.content).toBe("");
  });

  it("returns error for non-existent section", () => {
    const result = JSON.parse(executeTool("read_section", { section_id: "nonexistent" }, orrId, sessionId));
    expect(result.error).toBe("Section not found");
  });
});

describe("update_section_content", () => {
  it("appends content by default", () => {
    executeTool("update_section_content", { section_id: sectionIds[0], content: "First observation." }, orrId, sessionId);
    const result = JSON.parse(executeTool("update_section_content", { section_id: sectionIds[0], content: "Second observation." }, orrId, sessionId));
    expect(result.success).toBe(true);

    const section = JSON.parse(executeTool("read_section", { section_id: sectionIds[0] }, orrId, sessionId));
    expect(section.content).toContain("First observation.");
    expect(section.content).toContain("Second observation.");
  });

  it("replaces content when append is false", () => {
    executeTool("update_section_content", { section_id: sectionIds[0], content: "Old content." }, orrId, sessionId);
    executeTool("update_section_content", { section_id: sectionIds[0], content: "New content.", append: false }, orrId, sessionId);

    const section = JSON.parse(executeTool("read_section", { section_id: sectionIds[0] }, orrId, sessionId));
    expect(section.content).toBe("New content.");
  });

  it("bumps ORR updatedAt", () => {
    const db = getDb();
    const before = db.select().from(schema.orrs).where(eq(schema.orrs.id, orrId)).get()!;
    // Small delay to ensure different timestamp
    executeTool("update_section_content", { section_id: sectionIds[0], content: "Content." }, orrId, sessionId);
    const after = db.select().from(schema.orrs).where(eq(schema.orrs.id, orrId)).get()!;
    expect(after.updatedAt).not.toBe("");
  });
});

describe("update_depth_assessment", () => {
  it("sets depth and rationale", () => {
    executeTool("update_depth_assessment", { section_id: sectionIds[0], depth: "MODERATE", rationale: "Team demonstrated understanding." }, orrId, sessionId);

    const section = JSON.parse(executeTool("read_section", { section_id: sectionIds[0] }, orrId, sessionId));
    expect(section.depth).toBe("MODERATE");
    expect(section.depthRationale).toBe("Team demonstrated understanding.");
  });
});

describe("set_flags", () => {
  it("sets flags with OPEN status", () => {
    const result = JSON.parse(executeTool("set_flags", {
      section_id: sectionIds[0],
      flags: [{ type: "RISK", note: "No failover tested", severity: "HIGH", deadline: "2026-04-01" }],
    }, orrId, sessionId));
    expect(result.success).toBe(true);
    expect(result.flagCount).toBe(1);

    const section = JSON.parse(executeTool("read_section", { section_id: sectionIds[0] }, orrId, sessionId));
    expect(section.flags[0].status).toBe("OPEN");
    expect(section.flags[0].note).toBe("No failover tested");
  });

  it("preserves ACCEPTED/RESOLVED flags", () => {
    // First set a flag and manually accept it
    executeTool("set_flags", {
      section_id: sectionIds[0],
      flags: [{ type: "GAP", note: "Missing runbook" }],
    }, orrId, sessionId);

    // Manually mark as ACCEPTED in DB
    const db = getDb();
    const sec = db.select().from(schema.sections).where(eq(schema.sections.id, sectionIds[0])).get()!;
    const flags = typeof sec.flags === "string" ? JSON.parse(sec.flags) : sec.flags;
    (flags as any[])[0].status = "ACCEPTED";
    db.update(schema.sections).set({ flags: JSON.stringify(flags) }).where(eq(schema.sections.id, sectionIds[0])).run();

    // Agent sets new flags — ACCEPTED flag should be preserved
    executeTool("set_flags", {
      section_id: sectionIds[0],
      flags: [{ type: "STRENGTH", note: "Good monitoring" }],
    }, orrId, sessionId);

    const section = JSON.parse(executeTool("read_section", { section_id: sectionIds[0] }, orrId, sessionId));
    expect(section.flags).toHaveLength(2);
    const types = section.flags.map((f: any) => f.type);
    expect(types).toContain("GAP");
    expect(types).toContain("STRENGTH");
  });
});

describe("update_question_response", () => {
  it("records a plain team response", () => {
    const result = JSON.parse(executeTool("update_question_response", {
      section_id: sectionIds[0],
      question_index: 0,
      response: "We use microservices.",
    }, orrId, sessionId));
    expect(result.success).toBe(true);

    const section = JSON.parse(executeTool("read_section", { section_id: sectionIds[0] }, orrId, sessionId));
    expect(section.promptResponses[0]).toBe("We use microservices.");
  });

  it("records a code-sourced response with ref", () => {
    executeTool("update_question_response", {
      section_id: sectionIds[0],
      question_index: 1,
      response: "PostgreSQL and Redis found in config.",
      source: "code",
      code_ref: "src/config.ts:15-30",
    }, orrId, sessionId);

    const section = JSON.parse(executeTool("read_section", { section_id: sectionIds[0] }, orrId, sessionId));
    const resp = section.promptResponses[1];
    expect(resp.answer).toBe("PostgreSQL and Redis found in config.");
    expect(resp.source).toBe("code");
    expect(resp.codeRef).toBe("src/config.ts:15-30");
  });
});

describe("record_dependency", () => {
  it("creates a new dependency", () => {
    const result = JSON.parse(executeTool("record_dependency", {
      name: "PostgreSQL",
      type: "database",
      direction: "outbound",
      criticality: "critical",
    }, orrId, sessionId));
    expect(result.success).toBe(true);
    expect(result.action).toBe("created");
  });

  it("upserts existing dependency (case-insensitive)", () => {
    executeTool("record_dependency", { name: "PostgreSQL", type: "database" }, orrId, sessionId);
    const result = JSON.parse(executeTool("record_dependency", {
      name: "postgresql",
      type: "database",
      criticality: "critical",
      notes: "Primary datastore",
    }, orrId, sessionId));
    expect(result.action).toBe("updated");

    // Verify only one dependency exists
    const db = getDb();
    const deps = db.select().from(schema.dependencies).where(eq(schema.dependencies.orrId, orrId)).all();
    expect(deps).toHaveLength(1);
    expect(deps[0].criticality).toBe("critical");
  });
});

describe("write_session_summary", () => {
  it("writes summary to session", () => {
    const result = JSON.parse(executeTool("write_session_summary", {
      summary: "Covered architecture section. Moderate depth.",
    }, orrId, sessionId));
    expect(result.success).toBe(true);

    const db = getDb();
    const session = db.select().from(schema.sessions).where(eq(schema.sessions.id, sessionId)).get()!;
    expect(session.summary).toBe("Covered architecture section. Moderate depth.");
  });
});

describe("unknown tool", () => {
  it("returns error for unknown tool", () => {
    const result = JSON.parse(executeTool("nonexistent_tool", {}, orrId, sessionId));
    expect(result.error).toContain("Unknown tool");
  });
});
