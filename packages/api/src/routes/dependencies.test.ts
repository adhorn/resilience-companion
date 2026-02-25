import { describe, it, expect, beforeEach } from "vitest";
import { app } from "../app.js";
import { setupTestDb, seedTestOrr } from "../test-helpers.js";
import { getDb } from "../db/index.js";
import * as schema from "../db/schema.js";
import { nanoid } from "nanoid";

describe("dependency routes", () => {
  let db: ReturnType<typeof getDb>;
  let ids: ReturnType<typeof seedTestOrr>;

  beforeEach(() => {
    db = setupTestDb();
    ids = seedTestOrr(db);

    const now = new Date().toISOString();
    db.insert(schema.dependencies).values([
      {
        id: "dep-1",
        orrId: ids.orrId,
        name: "PostgreSQL",
        type: "database",
        direction: "outbound",
        criticality: "critical",
        hasFallback: 0,
        notes: "Primary data store, no replica",
        createdAt: now,
      },
      {
        id: "dep-2",
        orrId: ids.orrId,
        name: "Redis",
        type: "cache",
        direction: "outbound",
        criticality: "important",
        hasFallback: 1,
        fallbackDescription: "Service degrades to direct DB queries",
        createdAt: now,
      },
    ]).run();
  });

  describe("GET /api/v1/orrs/:orrId/dependencies", () => {
    it("lists all dependencies for an ORR", async () => {
      const res = await app.request(`/api/v1/orrs/${ids.orrId}/dependencies`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.dependencies).toHaveLength(2);
    });

    it("returns correct dependency fields", async () => {
      const res = await app.request(`/api/v1/orrs/${ids.orrId}/dependencies`);
      const body = await res.json();
      const pg = body.dependencies.find((d: any) => d.name === "PostgreSQL");
      expect(pg.type).toBe("database");
      expect(pg.criticality).toBe("critical");
      expect(pg.hasFallback).toBe(0);
      expect(pg.notes).toBe("Primary data store, no replica");

      const redis = body.dependencies.find((d: any) => d.name === "Redis");
      expect(redis.hasFallback).toBe(1);
      expect(redis.fallbackDescription).toBe("Service degrades to direct DB queries");
    });

    it("returns empty list for ORR with no dependencies", async () => {
      // Create another ORR with no deps
      const now = new Date().toISOString();
      db.insert(schema.orrs).values({
        id: "orr-2", serviceName: "Other", teamId: ids.teamId,
        templateVersion: ids.templateId, status: "DRAFT",
        steeringTier: "standard", createdAt: now, updatedAt: now,
      }).run();

      const res = await app.request("/api/v1/orrs/orr-2/dependencies");
      const body = await res.json();
      expect(body.dependencies).toHaveLength(0);
    });
  });

  describe("DELETE /api/v1/orrs/:orrId/dependencies/:depId", () => {
    it("deletes a dependency", async () => {
      const res = await app.request(`/api/v1/orrs/${ids.orrId}/dependencies/dep-1`, {
        method: "DELETE",
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.deleted).toBe(true);

      // Verify it's gone
      const listRes = await app.request(`/api/v1/orrs/${ids.orrId}/dependencies`);
      const listBody = await listRes.json();
      expect(listBody.dependencies).toHaveLength(1);
      expect(listBody.dependencies[0].name).toBe("Redis");
    });
  });
});
