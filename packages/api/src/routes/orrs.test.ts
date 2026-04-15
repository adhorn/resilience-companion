import { describe, it, expect, beforeEach } from "vitest";
import { app } from "../app.js";
import { setupTestDb, seedTestOrr } from "../test-helpers.js";
import { getDb } from "../db/index.js";
import * as schema from "../db/schema.js";
import { eq } from "drizzle-orm";

describe("ORR routes", () => {
  let db: ReturnType<typeof getDb>;
  let ids: ReturnType<typeof seedTestOrr>;

  beforeEach(() => {
    db = setupTestDb();
    ids = seedTestOrr(db);

    // Patch template sections to include position (required by ORR creation)
    const template = db.select().from(schema.templates).where(eq(schema.templates.isDefault, true)).get();
    if (template) {
      const sections = typeof template.sections === "string"
        ? JSON.parse(template.sections)
        : template.sections;
      const withPositions = sections.map((s: any, i: number) => ({ ...s, position: i + 1 }));
      db.update(schema.templates)
        .set({ sections: JSON.stringify(withPositions) })
        .where(eq(schema.templates.id, template.id))
        .run();
    }
  });

  describe("GET /api/v1/orrs", () => {
    it("lists ORRs for the team", async () => {
      const res = await app.request("/api/v1/orrs");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.orrs).toHaveLength(1);
      expect(body.orrs[0].serviceName).toBe("Test Service");
    });

    it("never exposes repository tokens", async () => {
      const res = await app.request("/api/v1/orrs");
      const body = await res.json();
      expect(body.orrs[0].repositoryToken).toBeUndefined();
      expect(body.orrs[0].repositoryLocalPath).toBeUndefined();
      expect(body.orrs[0]).toHaveProperty("hasRepositoryToken");
    });

    it("returns empty list for teams with no ORRs", async () => {
      // Create a second team + user and inject as default
      const now = new Date().toISOString();
      db.insert(schema.teams).values({ id: "team-2", name: "Other Team", createdAt: now }).run();
      db.insert(schema.users).values({
        id: "user-2", name: "Other User", email: "other@test.com",
        passwordHash: "n/a", teamId: "team-2", role: "MEMBER",
        authProvider: "local", createdAt: now,
      }).run();

      // Delete the original user so stub falls through to user-2
      db.delete(schema.sessions).run();
      db.delete(schema.sections).run();
      db.delete(schema.orrs).run();
      db.delete(schema.users).where(eq(schema.users.id, ids.userId)).run();

      const res = await app.request("/api/v1/orrs");
      const body = await res.json();
      expect(body.orrs).toHaveLength(0);
    });
  });

  describe("GET /api/v1/orrs/:id", () => {
    it("returns ORR with sections", async () => {
      const res = await app.request(`/api/v1/orrs/${ids.orrId}`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.orr.id).toBe(ids.orrId);
      expect(body.sections).toHaveLength(3);
    });

    it("returns 404 for non-existent ORR", async () => {
      const res = await app.request("/api/v1/orrs/non-existent");
      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/v1/orrs", () => {
    it("creates a service ORR with sections from template", async () => {
      const res = await app.request("/api/v1/orrs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceName: "New Service" }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.orr.serviceName).toBe("New Service");
      expect(body.orr.status).toBe("DRAFT");
      expect(body.orr.orrType).toBe("service");
      expect(body.sections.length).toBeGreaterThan(0);
    });

    it("rejects creation without serviceName", async () => {
      const res = await app.request("/api/v1/orrs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it("rejects feature ORR without changeDescription", async () => {
      const res = await app.request("/api/v1/orrs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceName: "Test Service",
          orrType: "feature",
          parentOrrId: ids.orrId,
        }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe("PATCH /api/v1/orrs/:id", () => {
    it("updates ORR status", async () => {
      const res = await app.request(`/api/v1/orrs/${ids.orrId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "COMPLETE" }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.orr.status).toBe("COMPLETE");
    });

    it("returns 404 for non-existent ORR", async () => {
      const res = await app.request("/api/v1/orrs/non-existent", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "COMPLETE" }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/v1/orrs/:id/terminate", () => {
    it("terminates an ORR with reason", async () => {
      const res = await app.request(`/api/v1/orrs/${ids.orrId}/terminate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Service decommissioned" }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.orr.status).toBe("TERMINATED");
      expect(body.orr.terminationReason).toBe("Service decommissioned");
    });

    it("rejects termination without reason", async () => {
      const res = await app.request(`/api/v1/orrs/${ids.orrId}/terminate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /api/v1/orrs/:id", () => {
    it("deletes a DRAFT ORR", async () => {
      // Set to DRAFT first
      db.update(schema.orrs)
        .set({ status: "DRAFT" })
        .where(eq(schema.orrs.id, ids.orrId))
        .run();

      const res = await app.request(`/api/v1/orrs/${ids.orrId}`, {
        method: "DELETE",
      });
      expect(res.status).toBe(200);

      // Verify deleted
      const check = await app.request(`/api/v1/orrs/${ids.orrId}`);
      expect(check.status).toBe(404);
    });
  });
});
