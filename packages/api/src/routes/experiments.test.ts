import { describe, it, expect, beforeEach } from "vitest";
import { app } from "../app.js";
import { setupTestDb, seedTestOrr } from "../test-helpers.js";
import { getDb } from "../db/index.js";
import * as schema from "../db/schema.js";

describe("experiment routes", () => {
  let db: ReturnType<typeof getDb>;
  let ids: ReturnType<typeof seedTestOrr>;

  beforeEach(() => {
    db = setupTestDb();
    ids = seedTestOrr(db);

    // Create a service and experiments linked to the ORR
    const now = new Date().toISOString();
    db.insert(schema.services).values({
      id: "svc-1", name: "Payment", teamId: ids.teamId, createdAt: now, updatedAt: now,
    }).run();

    db.insert(schema.experimentSuggestions).values([
      {
        id: "exp-1", serviceId: "svc-1", sourcePracticeType: "orr",
        sourcePracticeId: ids.orrId, type: "chaos_experiment", title: "Kill DB primary",
        hypothesis: "Service fails over to replica within 30s",
        rationale: "DB is single point of failure identified in ORR",
        priority: "high", priorityReasoning: "Critical path",
        status: "suggested", createdAt: now, updatedAt: now,
      },
      {
        id: "exp-2", serviceId: "svc-1", sourcePracticeType: "orr",
        sourcePracticeId: ids.orrId, type: "load_test", title: "Sustained load at 2x peak",
        hypothesis: "Service handles 2x without degradation",
        rationale: "No load testing documented",
        priority: "medium", priorityReasoning: "Nice to have",
        status: "suggested", createdAt: now, updatedAt: now,
      },
    ]).run();
  });

  describe("GET /api/v1/experiments", () => {
    it("lists experiments filtered by practiceType and practiceId", async () => {
      const res = await app.request(`/api/v1/experiments?practiceType=orr&practiceId=${ids.orrId}`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.experiments).toHaveLength(2);
      expect(body.experiments[0].sourcePracticeType).toBe("orr");
    });

    it("rejects without required query params", async () => {
      const res = await app.request("/api/v1/experiments");
      expect(res.status).toBe(400);
    });

    it("rejects with only practiceType", async () => {
      const res = await app.request("/api/v1/experiments?practiceType=orr");
      expect(res.status).toBe(400);
    });

    it("returns empty for non-matching practiceId", async () => {
      const res = await app.request("/api/v1/experiments?practiceType=orr&practiceId=no-such");
      const body = await res.json();
      expect(body.experiments).toHaveLength(0);
    });
  });

  describe("PATCH /api/v1/experiments/:id", () => {
    it("updates experiment status to completed with timestamp", async () => {
      const res = await app.request("/api/v1/experiments/exp-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed", completedNotes: "Failover took 45s, needs tuning" }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.experiment.status).toBe("completed");
      expect(body.experiment.completedAt).toBeTruthy();
      expect(body.experiment.completedNotes).toBe("Failover took 45s, needs tuning");
    });

    it("dismisses experiment with reason", async () => {
      const res = await app.request("/api/v1/experiments/exp-2", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "dismissed", dismissedReason: "Already covered by existing load tests" }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.experiment.status).toBe("dismissed");
      expect(body.experiment.dismissedReason).toBe("Already covered by existing load tests");
    });

    it("does not set completedAt for non-completed status", async () => {
      const res = await app.request("/api/v1/experiments/exp-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "accepted" }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.experiment.status).toBe("accepted");
      expect(body.experiment.completedAt).toBeNull();
    });

    it("returns 404 for non-existent experiment", async () => {
      const res = await app.request("/api/v1/experiments/no-such", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });
      expect(res.status).toBe(404);
    });
  });
});
