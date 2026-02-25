import { describe, it, expect, beforeEach } from "vitest";
import { setupTestDb, seedTestOrr, seedTestSession } from "../test-helpers.js";
import { buildORRContext } from "./context.js";
import { getDb } from "../db/connection.js";
import * as schema from "../db/schema.js";
import { eq } from "drizzle-orm";

let orrId: string;
let sectionIds: string[];
let userId: string;

beforeEach(() => {
  const db = setupTestDb();
  const seed = seedTestOrr(db);
  orrId = seed.orrId;
  sectionIds = seed.sectionIds;
  userId = seed.userId;
});

describe("buildORRContext", () => {
  it("returns correct shape for fresh ORR", () => {
    const ctx = buildORRContext(orrId, null);
    expect(ctx.serviceName).toBe("Test Service");
    expect(ctx.teamName).toBe("Test Team");
    expect(ctx.status).toBe("IN_PROGRESS");
    expect(ctx.sections).toHaveLength(3);
    expect(ctx.activeSection).toBeNull();
    expect(ctx.sessionSummaries).toHaveLength(0);
    expect(ctx.isReturningSession).toBe(false);
  });

  it("includes active section detail when specified", () => {
    const ctx = buildORRContext(orrId, sectionIds[0]);
    expect(ctx.activeSection).not.toBeNull();
    expect(ctx.activeSection!.title).toBe("Architecture");
    expect(ctx.activeSection!.prompts).toHaveLength(2);
    expect(ctx.activeSection!.depth).toBe("UNKNOWN");
  });

  it("marks isReturningSession when completed sessions exist", () => {
    const sessionId = seedTestSession(getDb(), orrId, userId);
    // End the session with a summary
    const db = getDb();
    db.update(schema.sessions)
      .set({ status: "COMPLETED", summary: "Session 1 summary", endedAt: new Date().toISOString() })
      .where(eq(schema.sessions.id, sessionId))
      .run();

    const ctx = buildORRContext(orrId, null);
    expect(ctx.isReturningSession).toBe(true);
    expect(ctx.sessionSummaries).toHaveLength(1);
    expect(ctx.sessionSummaries[0]).toBe("Session 1 summary");
  });

  it("throws for unknown ORR", () => {
    expect(() => buildORRContext("nonexistent", null)).toThrow("ORR nonexistent not found");
  });
});
