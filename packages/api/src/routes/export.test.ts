import { describe, it, expect, beforeEach } from "vitest";
import { app } from "../app.js";
import { setupTestDb, seedTestOrr, seedTestSession } from "../test-helpers.js";
import { getDb } from "../db/index.js";
import * as schema from "../db/schema.js";
import { eq } from "drizzle-orm";

describe("export routes", () => {
  let db: ReturnType<typeof getDb>;
  let ids: ReturnType<typeof seedTestOrr>;

  beforeEach(() => {
    db = setupTestDb();
    ids = seedTestOrr(db);

    // Add some content to sections for meaningful export
    db.update(schema.sections)
      .set({
        content: "The service uses a microservices architecture with 3 main components.",
        depth: "MODERATE",
        depthRationale: "Discussed architecture at moderate depth",
        flags: JSON.stringify([{ type: "RISK", note: "No circuit breakers", severity: "HIGH" }]),
      })
      .where(eq(schema.sections.id, ids.sectionIds[0]))
      .run();
  });

  describe("GET /api/v1/orrs/:orrId/export/markdown", () => {
    it("exports ORR as markdown", async () => {
      const res = await app.request(`/api/v1/orrs/${ids.orrId}/export/markdown`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/markdown");
      expect(res.headers.get("content-disposition")).toContain("attachment");

      const text = await res.text();
      expect(text).toContain("# Operational Readiness Review: Test Service");
      expect(text).toContain("**Status:** IN_PROGRESS");
      expect(text).toContain("microservices architecture");
      expect(text).toContain("RISK");
      expect(text).toContain("No circuit breakers");
    });

    it("returns 404 for non-existent ORR", async () => {
      const res = await app.request("/api/v1/orrs/no-such/export/markdown");
      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/v1/orrs/:orrId/export/conversation", () => {
    it("exports conversation across sessions", async () => {
      const sessionId = seedTestSession(db, ids.orrId, ids.userId);

      // Add messages
      const now = new Date().toISOString();
      db.insert(schema.sessionMessages).values([
        { id: "msg-1", sessionId, role: "user", content: "Let's review the architecture", createdAt: now },
        { id: "msg-2", sessionId, role: "assistant", content: "Great choice! Tell me about the components.", createdAt: now },
      ]).run();

      const res = await app.request(`/api/v1/orrs/${ids.orrId}/export/conversation`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/markdown");

      const text = await res.text();
      expect(text).toContain("# ORR Conversation: Test Service");
      expect(text).toContain("Let's review the architecture");
      expect(text).toContain("Great choice!");
    });

    it("exports empty conversation when no sessions", async () => {
      const res = await app.request(`/api/v1/orrs/${ids.orrId}/export/conversation`);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain("# ORR Conversation: Test Service");
      expect(text).toContain("**Sessions:** 0");
    });

    it("returns 404 for non-existent ORR", async () => {
      const res = await app.request("/api/v1/orrs/no-such/export/conversation");
      expect(res.status).toBe(404);
    });
  });
});
