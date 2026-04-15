import { describe, it, expect, beforeEach } from "vitest";
import { app } from "../app.js";
import { setupTestDb, seedTestOrr, seedTestSession } from "../test-helpers.js";
import { getDb } from "../db/index.js";
import * as schema from "../db/schema.js";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

describe("session lifecycle routes", () => {
  let db: ReturnType<typeof getDb>;
  let ids: ReturnType<typeof seedTestOrr>;

  beforeEach(() => {
    db = setupTestDb();
    ids = seedTestOrr(db);
  });

  describe("POST /api/v1/orrs/:orrId/sessions (create session)", () => {
    it("creates a new session", async () => {
      const res = await app.request(`/api/v1/orrs/${ids.orrId}/sessions`, {
        method: "POST",
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.session.status).toBe("ACTIVE");
      expect(body.session.id).toBeTruthy();
    });

    it("includes welcome message in response", async () => {
      const res = await app.request(`/api/v1/orrs/${ids.orrId}/sessions`, {
        method: "POST",
      });
      const body = await res.json();
      expect(body.session.welcomeMessage).toContain("Review Facilitator");
    });

    it("inserts welcome message as assistant message in DB", async () => {
      const res = await app.request(`/api/v1/orrs/${ids.orrId}/sessions`, {
        method: "POST",
      });
      const body = await res.json();
      const sessionId = body.session.id;

      const messages = db.select().from(schema.sessionMessages)
        .where(eq(schema.sessionMessages.sessionId, sessionId))
        .all();
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe("assistant");
      expect(messages[0].content).toContain("Review Facilitator");
    });

    it("marks DRAFT ORR as IN_PROGRESS", async () => {
      db.update(schema.orrs)
        .set({ status: "DRAFT" })
        .where(eq(schema.orrs.id, ids.orrId))
        .run();

      await app.request(`/api/v1/orrs/${ids.orrId}/sessions`, { method: "POST" });

      const orr = db.select().from(schema.orrs)
        .where(eq(schema.orrs.id, ids.orrId)).get()!;
      expect(orr.status).toBe("IN_PROGRESS");
    });

    it("ends existing active sessions for same user", async () => {
      // Create first session
      const res1 = await app.request(`/api/v1/orrs/${ids.orrId}/sessions`, { method: "POST" });
      const firstId = (await res1.json()).session.id;

      // Create second session
      await app.request(`/api/v1/orrs/${ids.orrId}/sessions`, { method: "POST" });

      // First session should be COMPLETED
      const first = db.select().from(schema.sessions)
        .where(eq(schema.sessions.id, firstId)).get()!;
      expect(first.status).toBe("COMPLETED");
      expect(first.endedAt).toBeTruthy();
    });

    it("rejects session on TERMINATED ORR", async () => {
      db.update(schema.orrs)
        .set({ status: "TERMINATED" })
        .where(eq(schema.orrs.id, ids.orrId))
        .run();

      const res = await app.request(`/api/v1/orrs/${ids.orrId}/sessions`, { method: "POST" });
      expect(res.status).toBe(403);
    });

    it("returns 404 for non-existent ORR", async () => {
      const res = await app.request("/api/v1/orrs/no-such/sessions", { method: "POST" });
      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/v1/orrs/:orrId/sessions (list sessions)", () => {
    it("lists all sessions for an ORR", async () => {
      seedTestSession(db, ids.orrId, ids.userId);

      const res = await app.request(`/api/v1/orrs/${ids.orrId}/sessions`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.sessions).toHaveLength(1);
    });

    it("returns 404 for non-existent ORR", async () => {
      const res = await app.request("/api/v1/orrs/no-such/sessions");
      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/v1/orrs/:orrId/sessions/:sessionId/messages", () => {
    it("returns messages for a session", async () => {
      const sessionId = seedTestSession(db, ids.orrId, ids.userId);
      const now = new Date().toISOString();
      db.insert(schema.sessionMessages).values([
        { id: nanoid(), sessionId, role: "user", content: "Hello", createdAt: now },
        { id: nanoid(), sessionId, role: "assistant", content: "Hi there!", createdAt: now },
      ]).run();

      const res = await app.request(`/api/v1/orrs/${ids.orrId}/sessions/${sessionId}/messages`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.messages).toHaveLength(2);
    });

    it("deduplicates consecutive identical user messages", async () => {
      const sessionId = seedTestSession(db, ids.orrId, ids.userId);
      const now = new Date().toISOString();
      db.insert(schema.sessionMessages).values([
        { id: nanoid(), sessionId, role: "user", content: "Tell me about monitoring", createdAt: now },
        { id: nanoid(), sessionId, role: "user", content: "Tell me about monitoring", createdAt: now }, // retry
        { id: nanoid(), sessionId, role: "assistant", content: "Sure, let's discuss monitoring.", createdAt: now },
      ]).run();

      const res = await app.request(`/api/v1/orrs/${ids.orrId}/sessions/${sessionId}/messages`);
      const body = await res.json();
      // Should deduplicate the retry
      expect(body.messages).toHaveLength(2);
    });
  });

  describe("GET /api/v1/orrs/:orrId/sessions/all-messages", () => {
    it("stitches messages across multiple sessions with dedup", async () => {
      const now = new Date().toISOString();
      const later = new Date(Date.now() + 1000).toISOString();

      // Session 1
      const s1 = "session-1";
      db.insert(schema.sessions).values({
        id: s1, orrId: ids.orrId, userId: ids.userId,
        agentProfile: "REVIEW_FACILITATOR", status: "COMPLETED",
        tokenUsage: 0, sectionsDiscussed: "[]", startedAt: now, endedAt: later,
      }).run();
      db.insert(schema.sessionMessages).values([
        { id: nanoid(), sessionId: s1, role: "user", content: "msg-1", createdAt: now },
        { id: nanoid(), sessionId: s1, role: "assistant", content: "msg-2", createdAt: now },
      ]).run();

      // Session 2 — carries over msg-1, msg-2 from session 1 (renewal overlap)
      const s2 = "session-2";
      db.insert(schema.sessions).values({
        id: s2, orrId: ids.orrId, userId: ids.userId,
        agentProfile: "REVIEW_FACILITATOR", status: "ACTIVE",
        tokenUsage: 0, sectionsDiscussed: "[]", startedAt: later,
      }).run();
      db.insert(schema.sessionMessages).values([
        { id: nanoid(), sessionId: s2, role: "user", content: "msg-1", createdAt: now },
        { id: nanoid(), sessionId: s2, role: "assistant", content: "msg-2", createdAt: now },
        { id: nanoid(), sessionId: s2, role: "user", content: "msg-3", createdAt: later },
      ]).run();

      const res = await app.request(`/api/v1/orrs/${ids.orrId}/sessions/all-messages`);
      expect(res.status).toBe(200);
      const body = await res.json();

      // Should deduplicate the overlap: msg-1, msg-2 only appear once, then msg-3
      const contents = body.messages.map((m: any) => m.content);
      expect(contents).toEqual(["msg-1", "msg-2", "msg-3"]);
    });
  });

  describe("POST /api/v1/orrs/:orrId/sessions/:sessionId/end", () => {
    it("ends an active session", async () => {
      const sessionId = seedTestSession(db, ids.orrId, ids.userId);

      const res = await app.request(
        `/api/v1/orrs/${ids.orrId}/sessions/${sessionId}/end`,
        { method: "POST" },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ended).toBe(true);
      expect(body.versionCreated).toBe(true); // ORR sessions create version snapshots

      // Verify session status
      const session = db.select().from(schema.sessions)
        .where(eq(schema.sessions.id, sessionId)).get()!;
      expect(session.status).toBe("COMPLETED");
      expect(session.endedAt).toBeTruthy();
    });

    it("creates ORR version snapshot on session end", async () => {
      const sessionId = seedTestSession(db, ids.orrId, ids.userId);

      await app.request(
        `/api/v1/orrs/${ids.orrId}/sessions/${sessionId}/end`,
        { method: "POST" },
      );

      const versions = db.select().from(schema.orrVersions)
        .where(eq(schema.orrVersions.orrId, ids.orrId))
        .all();
      expect(versions).toHaveLength(1);
      expect(versions[0].reason).toContain("Session ended");

      const snapshot = JSON.parse(versions[0].snapshot);
      expect(snapshot.orr.id).toBe(ids.orrId);
      expect(snapshot.sections).toHaveLength(3);
    });

    it("rejects ending an already completed session", async () => {
      const sessionId = seedTestSession(db, ids.orrId, ids.userId);
      db.update(schema.sessions)
        .set({ status: "COMPLETED" })
        .where(eq(schema.sessions.id, sessionId))
        .run();

      const res = await app.request(
        `/api/v1/orrs/${ids.orrId}/sessions/${sessionId}/end`,
        { method: "POST" },
      );
      expect(res.status).toBe(400);
    });

    it("returns 404 for non-existent ORR", async () => {
      const res = await app.request(
        "/api/v1/orrs/no-such/sessions/any-session/end",
        { method: "POST" },
      );
      expect(res.status).toBe(404);
    });
  });
});
