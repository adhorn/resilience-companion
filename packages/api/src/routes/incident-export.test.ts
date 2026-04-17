import { describe, it, expect, beforeEach } from "vitest";
import { app } from "../app.js";
import { setupTestDb, seedTestIncident } from "../test-helpers.js";
import { getDb } from "../db/index.js";
import * as schema from "../db/schema.js";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

describe("incident export routes", () => {
  let db: ReturnType<typeof getDb>;
  let ids: ReturnType<typeof seedTestIncident>;

  beforeEach(() => {
    db = setupTestDb();
    ids = seedTestIncident(db);
  });

  describe("GET /api/v1/incidents/:incidentId/export/markdown", () => {
    it("exports incident as markdown with header metadata", async () => {
      const res = await app.request(`/api/v1/incidents/${ids.incidentId}/export/markdown`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/markdown");

      const text = await res.text();
      expect(text).toContain("# Incident Analysis: DB Connection Exhaustion");
      expect(text).toContain("**Severity:** HIGH");
      expect(text).toContain("**Service:** Payment Service");
    });

    it("includes timeline events in export", async () => {
      const now = new Date().toISOString();
      db.insert(schema.timelineEvents).values({
        id: nanoid(),
        incidentId: ids.incidentId,
        position: 1,
        timestamp: "2024-03-15T14:30:00Z",
        description: "Alert fires for connection pool exhaustion",
        eventType: "detection",
        actor: "PagerDuty",
        createdAt: now,
      }).run();

      const res = await app.request(`/api/v1/incidents/${ids.incidentId}/export/markdown`);
      const text = await res.text();
      expect(text).toContain("## Timeline");
      expect(text).toContain("Alert fires for connection pool exhaustion");
      expect(text).toContain("PagerDuty");
    });

    it("includes contributing factors with systemic flag", async () => {
      const now = new Date().toISOString();
      db.insert(schema.contributingFactors).values({
        id: nanoid(),
        incidentId: ids.incidentId,
        category: "technical",
        description: "No connection pooling limits",
        context: "Service uses unbounded connection pool, common across 3 services",
        isSystemic: true,
        createdAt: now,
      }).run();

      const res = await app.request(`/api/v1/incidents/${ids.incidentId}/export/markdown`);
      const text = await res.text();
      expect(text).toContain("## Contributing Factors");
      expect(text).toContain("[SYSTEMIC]");
      expect(text).toContain("No connection pooling limits");
    });

    it("includes action items with status icons", async () => {
      const now = new Date().toISOString();
      db.insert(schema.actionItems).values({
        id: nanoid(),
        practiceType: "incident",
        practiceId: ids.incidentId,
        title: "Add connection pool limits",
        owner: "Platform Team",
        priority: "high",
        type: "technical",
        status: "open",
        successCriteria: "Pool size capped at 50",
        createdAt: now,
      }).run();

      const res = await app.request(`/api/v1/incidents/${ids.incidentId}/export/markdown`);
      const text = await res.text();
      expect(text).toContain("## Action Items");
      expect(text).toContain("Add connection pool limits");
      expect(text).toContain("Platform Team");
      expect(text).toContain("Pool size capped at 50");
    });

    it("includes section content and depth", async () => {
      db.update(schema.incidentSections)
        .set({
          content: "The DB ran out of connections under load",
          depth: "MODERATE",
          depthRationale: "Good timeline, needs deeper factor analysis",
        })
        .where(eq(schema.incidentSections.id, ids.sectionIds[0]))
        .run();

      const res = await app.request(`/api/v1/incidents/${ids.incidentId}/export/markdown`);
      const text = await res.text();
      expect(text).toContain("Moderate");
      expect(text).toContain("Good timeline, needs deeper factor analysis");
      expect(text).toContain("The DB ran out of connections under load");
    });

    it("returns 404 for non-existent incident", async () => {
      const res = await app.request("/api/v1/incidents/no-such/export/markdown");
      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/v1/incidents/:incidentId/export/conversation", () => {
    it("exports conversation with session messages", async () => {
      const now = new Date().toISOString();
      const sessionId = nanoid();
      db.insert(schema.sessions).values({
        id: sessionId,
        orrId: ids.incidentId,
        userId: ids.userId,
        agentProfile: "INCIDENT_LEARNING_FACILITATOR",
        status: "ACTIVE",
        tokenUsage: 0,
        sectionsDiscussed: "[]",
        startedAt: now,
      }).run();

      db.insert(schema.sessionMessages).values([
        { id: nanoid(), sessionId, role: "user", content: "Walk me through the timeline", createdAt: now },
        { id: nanoid(), sessionId, role: "assistant", content: "Let's start from when the first alert fired.", createdAt: now },
      ]).run();

      const res = await app.request(`/api/v1/incidents/${ids.incidentId}/export/conversation`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/markdown");

      const text = await res.text();
      expect(text).toContain("# Incident Analysis Conversation: DB Connection Exhaustion");
      expect(text).toContain("Walk me through the timeline");
      expect(text).toContain("Let's start from when the first alert fired.");
    });

    it("deduplicates consecutive identical user messages (retry artifacts)", async () => {
      const now = new Date().toISOString();
      const sessionId = nanoid();
      db.insert(schema.sessions).values({
        id: sessionId, orrId: ids.incidentId, userId: ids.userId,
        agentProfile: "INCIDENT_LEARNING_FACILITATOR", status: "ACTIVE",
        tokenUsage: 0, sectionsDiscussed: "[]", startedAt: now,
      }).run();

      db.insert(schema.sessionMessages).values([
        { id: nanoid(), sessionId, role: "user", content: "What happened?", createdAt: now },
        { id: nanoid(), sessionId, role: "user", content: "What happened?", createdAt: now }, // retry duplicate
        { id: nanoid(), sessionId, role: "assistant", content: "The DB connections ran out.", createdAt: now },
      ]).run();

      const res = await app.request(`/api/v1/incidents/${ids.incidentId}/export/conversation`);
      const text = await res.text();
      // Should only appear once in the export
      const matches = text.match(/What happened\?/g);
      expect(matches).toHaveLength(1);
    });

    it("returns 404 for non-existent incident", async () => {
      const res = await app.request("/api/v1/incidents/no-such/export/conversation");
      expect(res.status).toBe(404);
    });
  });
});
