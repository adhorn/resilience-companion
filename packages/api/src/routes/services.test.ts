import { describe, it, expect, beforeEach } from "vitest";
import { app } from "../app.js";
import { setupTestDb, seedTestOrr } from "../test-helpers.js";
import { getDb } from "../db/index.js";
import * as schema from "../db/schema.js";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

describe("service routes", () => {
  let db: ReturnType<typeof getDb>;
  let ids: ReturnType<typeof seedTestOrr>;

  beforeEach(() => {
    db = setupTestDb();
    ids = seedTestOrr(db);
  });

  describe("GET /api/v1/services", () => {
    it("returns empty list when no services", async () => {
      const res = await app.request("/api/v1/services");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.services).toHaveLength(0);
    });

    it("lists services for the team", async () => {
      const now = new Date().toISOString();
      db.insert(schema.services)
        .values({
          id: "svc-1",
          name: "Payment Service",
          teamId: ids.teamId,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      const res = await app.request("/api/v1/services");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.services).toHaveLength(1);
      expect(body.services[0].name).toBe("Payment Service");
    });
  });

  describe("POST /api/v1/services", () => {
    it("creates a service", async () => {
      const res = await app.request("/api/v1/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Auth Service", description: "Handles auth" }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.service.name).toBe("Auth Service");
      expect(body.service.description).toBe("Handles auth");
    });

    it("rejects without name", async () => {
      const res = await app.request("/api/v1/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: "No name" }),
      });
      expect(res.status).toBe(400);
    });

    it("rejects duplicate name within team", async () => {
      const now = new Date().toISOString();
      db.insert(schema.services)
        .values({ id: "svc-x", name: "Existing", teamId: ids.teamId, createdAt: now, updatedAt: now })
        .run();

      const res = await app.request("/api/v1/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Existing" }),
      });
      expect(res.status).toBe(409);
    });
  });

  describe("GET /api/v1/services/:id", () => {
    it("returns service with linked ORRs, incidents, experiments", async () => {
      const now = new Date().toISOString();
      db.insert(schema.services)
        .values({ id: "svc-1", name: "Payment", teamId: ids.teamId, createdAt: now, updatedAt: now })
        .run();

      // Link the existing ORR to this service
      db.update(schema.orrs)
        .set({ serviceId: "svc-1" })
        .where(eq(schema.orrs.id, ids.orrId))
        .run();

      const res = await app.request("/api/v1/services/svc-1");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.service.name).toBe("Payment");
      expect(body.orrs).toHaveLength(1);
      expect(body.incidents).toBeDefined();
      expect(body.experiments).toBeDefined();
    });

    it("returns 404 for non-existent service", async () => {
      const res = await app.request("/api/v1/services/no-such");
      expect(res.status).toBe(404);
    });
  });

  describe("PATCH /api/v1/services/:id", () => {
    it("updates service metadata", async () => {
      const now = new Date().toISOString();
      db.insert(schema.services)
        .values({ id: "svc-1", name: "Old Name", teamId: ids.teamId, createdAt: now, updatedAt: now })
        .run();

      const res = await app.request("/api/v1/services/svc-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New Name", description: "Updated" }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.service.name).toBe("New Name");
      expect(body.service.description).toBe("Updated");
    });

    it("returns 404 for non-existent service", async () => {
      const res = await app.request("/api/v1/services/no-such", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "x" }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/v1/services/:id/experiments", () => {
    it("lists experiments for a service", async () => {
      const now = new Date().toISOString();
      db.insert(schema.services)
        .values({ id: "svc-1", name: "Payment", teamId: ids.teamId, createdAt: now, updatedAt: now })
        .run();

      db.insert(schema.experimentSuggestions).values({
        id: "exp-1",
        serviceId: "svc-1",
        sourcePracticeType: "orr",
        sourcePracticeId: ids.orrId,
        type: "chaos_experiment",
        title: "Kill payment DB",
        hypothesis: "Service degrades gracefully",
        rationale: "DB is single point of failure",
        priority: "high",
        priorityReasoning: "Critical path",
        status: "suggested",
        createdAt: now,
        updatedAt: now,
      }).run();

      const res = await app.request("/api/v1/services/svc-1/experiments");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.experiments).toHaveLength(1);
      expect(body.experiments[0].title).toBe("Kill payment DB");
    });

    it("returns 404 for non-existent service", async () => {
      const res = await app.request("/api/v1/services/no-such/experiments");
      expect(res.status).toBe(404);
    });
  });

  describe("PATCH /api/v1/services/:serviceId/experiments/:experimentId", () => {
    beforeEach(() => {
      const now = new Date().toISOString();
      db.insert(schema.services)
        .values({ id: "svc-1", name: "Payment", teamId: ids.teamId, createdAt: now, updatedAt: now })
        .run();
      db.insert(schema.experimentSuggestions).values({
        id: "exp-1", serviceId: "svc-1", sourcePracticeType: "orr",
        sourcePracticeId: ids.orrId, type: "chaos_experiment", title: "Kill DB",
        hypothesis: "Graceful", rationale: "SPOF", priority: "high",
        priorityReasoning: "Critical", status: "suggested",
        createdAt: now, updatedAt: now,
      }).run();
    });

    it("updates experiment status to completed", async () => {
      const res = await app.request("/api/v1/services/svc-1/experiments/exp-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed", completedNotes: "Ran successfully" }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.experiment.status).toBe("completed");
      expect(body.experiment.completedAt).toBeTruthy();
      expect(body.experiment.completedNotes).toBe("Ran successfully");
    });

    it("dismisses an experiment", async () => {
      const res = await app.request("/api/v1/services/svc-1/experiments/exp-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "dismissed", dismissedReason: "Not applicable" }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.experiment.status).toBe("dismissed");
    });

    it("returns 404 for non-existent experiment", async () => {
      const res = await app.request("/api/v1/services/svc-1/experiments/no-such", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });
      expect(res.status).toBe(404);
    });
  });
});
