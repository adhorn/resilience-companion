import { describe, it, expect, beforeEach } from "vitest";
import { app } from "../app.js";
import { setupTestDb, seedTestOrr, seedTestIncident } from "../test-helpers.js";
import { getDb } from "../db/index.js";
import * as schema from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";

describe("learning routes", () => {
  let db: ReturnType<typeof getDb>;
  let orrIds: ReturnType<typeof seedTestOrr>;

  beforeEach(() => {
    db = setupTestDb();
    orrIds = seedTestOrr(db);
  });

  describe("GET /api/v1/orrs/:orrId/learning", () => {
    it("returns per-section learning signals", async () => {
      const res = await app.request(`/api/v1/orrs/${orrIds.orrId}/learning`);
      expect(res.status).toBe(200);
      const body = await res.json();
      const learning = body.learning;

      expect(learning.sections).toHaveLength(3);
      expect(learning.sections[0]).toHaveProperty("depth");
      expect(learning.sections[0]).toHaveProperty("riskScore");
      expect(learning.sections[0]).toHaveProperty("riskCount");
      expect(learning.sections[0]).toHaveProperty("insightCount");
      expect(learning.sections[0]).toHaveProperty("codeSourced");
      expect(learning.sections[0]).toHaveProperty("questionsAnswered");
      expect(learning.sections[0]).toHaveProperty("questionsTotal");
    });

    it("computes depth as numeric (0=UNKNOWN, 1=SURFACE, 2=MODERATE, 3=DEEP)", async () => {
      db.update(schema.sections)
        .set({ depth: "DEEP" })
        .where(eq(schema.sections.id, orrIds.sectionIds[0]))
        .run();

      const res = await app.request(`/api/v1/orrs/${orrIds.orrId}/learning`);
      const body = await res.json();
      const archSection = body.learning.sections.find((s: any) => s.title === "Architecture");
      expect(archSection.depth).toBe(3);
    });

    it("counts gaps and strengths from flags", async () => {
      db.update(schema.sections)
        .set({
          flags: JSON.stringify([
            { type: "GAP", note: "Missing runbook" },
            { type: "GAP", note: "No alerts" },
            { type: "STRENGTH", note: "Good test coverage" },
          ]),
        })
        .where(eq(schema.sections.id, orrIds.sectionIds[0]))
        .run();

      const res = await app.request(`/api/v1/orrs/${orrIds.orrId}/learning`);
      const body = await res.json();
      const archSection = body.learning.sections.find((s: any) => s.title === "Architecture");
      // GAP flags count as risks (riskCount), STRENGTH flags are no longer tracked separately
      expect(archSection.riskCount).toBe(2);
      expect(archSection.riskScore).toBe(2); // 2 GAPs with no severity = weight 1 each
    });

    it("counts code-sourced prompt responses", async () => {
      db.update(schema.sections)
        .set({
          promptResponses: JSON.stringify({
            "0": { answer: "Microservices", source: "team" },
            "1": { answer: "Redis, Postgres", source: "code" },
          }),
        })
        .where(eq(schema.sections.id, orrIds.sectionIds[0]))
        .run();

      const res = await app.request(`/api/v1/orrs/${orrIds.orrId}/learning`);
      const body = await res.json();
      const archSection = body.learning.sections.find((s: any) => s.title === "Architecture");
      expect(archSection.questionsAnswered).toBe(2);
      expect(archSection.codeSourced).toBe(1);
    });

    it("includes discoveries from dedicated table", async () => {
      const now = new Date().toISOString();
      db.insert(schema.discoveries).values({
        id: nanoid(),
        practiceType: "orr",
        practiceId: orrIds.orrId,
        sectionId: orrIds.sectionIds[0],
        sessionId: "test-session",
        text: "Team didn't know about the timeout config",
        source: "conversation",
        createdAt: now,
      }).run();

      const res = await app.request(`/api/v1/orrs/${orrIds.orrId}/learning`);
      const body = await res.json();
      expect(body.learning.discoveries).toHaveLength(1);
      expect(body.learning.discoveries[0].text).toBe("Team didn't know about the timeout config");
      expect(body.learning.totals.totalInsights).toBe(1);
    });

    it("includes cross-practice suggestions", async () => {
      const now = new Date().toISOString();
      db.insert(schema.crossPracticeSuggestions).values({
        id: nanoid(),
        sourcePracticeType: "orr",
        sourcePracticeId: orrIds.orrId,
        targetPracticeType: "incident_analysis",
        suggestion: "Review Q3 incident for this service",
        rationale: "Similar failure mode identified",
        status: "suggested",
        createdAt: now,
      }).run();

      const res = await app.request(`/api/v1/orrs/${orrIds.orrId}/learning`);
      const body = await res.json();
      expect(body.learning.crossPracticeLinks).toHaveLength(1);
      expect(body.learning.totals.crossPracticeLinks).toBe(1);
    });

    it("includes action items", async () => {
      const now = new Date().toISOString();
      db.insert(schema.actionItems).values({
        id: nanoid(),
        practiceType: "orr",
        practiceId: orrIds.orrId,
        title: "Add circuit breakers to payment path",
        priority: "high",
        type: "technical",
        status: "open",
        createdAt: now,
      }).run();

      const res = await app.request(`/api/v1/orrs/${orrIds.orrId}/learning`);
      const body = await res.json();
      expect(body.learning.actionItems).toHaveLength(1);
      expect(body.learning.actionItems[0].title).toBe("Add circuit breakers to payment path");
    });
  });

  describe("GET /api/v1/incidents/:incidentId/learning", () => {
    it("returns learning signals for an incident", async () => {
      const incIds = seedTestIncident(db);

      const res = await app.request(`/api/v1/incidents/${incIds.incidentId}/learning`);
      expect(res.status).toBe(200);
      const body = await res.json();
      const learning = body.learning;

      expect(learning.sections).toHaveLength(3);
      expect(learning.totals).toHaveProperty("totalInsights");
      expect(learning.totals).toHaveProperty("totalRisks");
      expect(learning.totals).toHaveProperty("experiments");
    });
  });
});
