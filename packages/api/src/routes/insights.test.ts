import { describe, it, expect, beforeEach } from "vitest";
import { app } from "../app.js";
import { setupTestDb, seedTestOrr, seedTestSession } from "../test-helpers.js";
import { getDb } from "../db/index.js";
import * as schema from "../db/schema.js";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

describe("insights routes", () => {
  let db: ReturnType<typeof getDb>;
  let ids: ReturnType<typeof seedTestOrr>;

  beforeEach(() => {
    db = setupTestDb();
    ids = seedTestOrr(db);
  });

  describe("GET /api/v1/insights", () => {
    it("returns empty insights for team with no discoveries", async () => {
      const res = await app.request("/api/v1/insights");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.discoveries).toHaveLength(0);
      expect(body.crossPracticeLinks).toHaveLength(0);
      expect(body.actionItems).toHaveLength(0);
    });

    it("returns discoveries from sessions", async () => {
      const sessionId = seedTestSession(db, ids.orrId, ids.userId);
      // Add discoveries to the session (mode: "json" auto-serializes)
      db.update(schema.sessions)
        .set({
          discoveries: ["Team lacks rollback runbook", "Cache TTL not tuned"] as any,
        })
        .where(eq(schema.sessions.id, sessionId))
        .run();

      const res = await app.request("/api/v1/insights");
      const body = await res.json();
      expect(body.discoveries).toHaveLength(2);
      expect(body.discoveries[0].practiceName).toBe("Test Service");
    });

    it("returns open action items", async () => {
      const now = new Date().toISOString();
      db.insert(schema.actionItems).values({
        id: nanoid(),
        practiceType: "orr",
        practiceId: ids.orrId,
        title: "Write rollback runbook",
        priority: "high",
        type: "documentation",
        status: "open",
        createdAt: now,
      }).run();

      const res = await app.request("/api/v1/insights");
      const body = await res.json();
      expect(body.actionItems).toHaveLength(1);
      expect(body.actionItems[0].title).toBe("Write rollback runbook");
    });

    it("excludes done action items", async () => {
      const now = new Date().toISOString();
      db.insert(schema.actionItems).values({
        id: nanoid(),
        practiceType: "orr",
        practiceId: ids.orrId,
        title: "Done item",
        priority: "low",
        type: "task",
        status: "done",
        createdAt: now,
      }).run();

      const res = await app.request("/api/v1/insights");
      const body = await res.json();
      expect(body.actionItems).toHaveLength(0);
    });

    it("returns cross-practice suggestions", async () => {
      const now = new Date().toISOString();
      db.insert(schema.crossPracticeSuggestions).values({
        id: nanoid(),
        sourcePracticeType: "orr",
        sourcePracticeId: ids.orrId,
        targetPracticeType: "incident",
        suggestion: "Review recent incidents for this service",
        rationale: "Service has no incident analyses linked",
        status: "suggested",
        createdAt: now,
      }).run();

      const res = await app.request("/api/v1/insights");
      const body = await res.json();
      expect(body.crossPracticeLinks).toHaveLength(1);
      expect(body.crossPracticeLinks[0].suggestion).toContain("Review recent incidents");
    });

    it("returns empty when no practices exist", async () => {
      db.delete(schema.sections).run();
      db.delete(schema.orrs).run();

      const res = await app.request("/api/v1/insights");
      const body = await res.json();
      expect(body.discoveries).toHaveLength(0);
      expect(body.crossPracticeLinks).toHaveLength(0);
      expect(body.actionItems).toHaveLength(0);
    });
  });
});
