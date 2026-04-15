import { describe, it, expect, beforeEach } from "vitest";
import { app } from "../app.js";
import { setupTestDb, seedTestOrr } from "../test-helpers.js";
import { getDb } from "../db/index.js";
import * as schema from "../db/schema.js";
import { eq } from "drizzle-orm";

describe("section routes", () => {
  let db: ReturnType<typeof getDb>;
  let ids: ReturnType<typeof seedTestOrr>;

  beforeEach(() => {
    db = setupTestDb();
    ids = seedTestOrr(db);
  });

  describe("GET /api/v1/orrs/:orrId/sections", () => {
    it("lists all sections for an ORR", async () => {
      const res = await app.request(`/api/v1/orrs/${ids.orrId}/sections`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.sections).toHaveLength(3);
    });

    it("returns 404 for non-existent ORR", async () => {
      const res = await app.request("/api/v1/orrs/no-such-orr/sections");
      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/v1/orrs/:orrId/sections/:sectionId", () => {
    it("returns a single section", async () => {
      const res = await app.request(
        `/api/v1/orrs/${ids.orrId}/sections/${ids.sectionIds[0]}`,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.section.id).toBe(ids.sectionIds[0]);
      expect(body.section.title).toBe("Architecture");
    });

    it("returns 404 for non-existent section", async () => {
      const res = await app.request(
        `/api/v1/orrs/${ids.orrId}/sections/no-such-section`,
      );
      expect(res.status).toBe(404);
    });
  });

  describe("PATCH /api/v1/orrs/:orrId/sections/:sectionId", () => {
    it("updates section content", async () => {
      const res = await app.request(
        `/api/v1/orrs/${ids.orrId}/sections/${ids.sectionIds[0]}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: "Updated architecture notes" }),
        },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.section.content).toBe("Updated architecture notes");
      expect(body.section.updatedBy).toBe(ids.userId);
    });

    it("rejects update on TERMINATED ORR", async () => {
      db.update(schema.orrs)
        .set({ status: "TERMINATED" })
        .where(eq(schema.orrs.id, ids.orrId))
        .run();

      const res = await app.request(
        `/api/v1/orrs/${ids.orrId}/sections/${ids.sectionIds[0]}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: "Nope" }),
        },
      );
      expect(res.status).toBe(403);
    });

    it("returns 404 for non-existent section", async () => {
      const res = await app.request(
        `/api/v1/orrs/${ids.orrId}/sections/no-such`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: "x" }),
        },
      );
      expect(res.status).toBe(404);
    });

    it("bumps ORR updatedAt on section update", async () => {
      const before = db
        .select()
        .from(schema.orrs)
        .where(eq(schema.orrs.id, ids.orrId))
        .get()!;

      // Small delay to ensure timestamp differs
      await new Promise((r) => setTimeout(r, 10));

      await app.request(
        `/api/v1/orrs/${ids.orrId}/sections/${ids.sectionIds[0]}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: "new content" }),
        },
      );

      const after = db
        .select()
        .from(schema.orrs)
        .where(eq(schema.orrs.id, ids.orrId))
        .get()!;
      expect(after.updatedAt).not.toBe(before.updatedAt);
    });
  });

  describe("PATCH /api/v1/orrs/:orrId/sections/:sectionId/flags/:flagIndex", () => {
    beforeEach(() => {
      // Add flags to section
      const flags = [
        { type: "RISK", summary: "No rollback plan", status: "OPEN" },
        { type: "GAP", summary: "Missing monitoring", status: "OPEN" },
      ];
      db.update(schema.sections)
        .set({ flags: JSON.stringify(flags) })
        .where(eq(schema.sections.id, ids.sectionIds[0]))
        .run();
    });

    it("accepts a flag", async () => {
      const res = await app.request(
        `/api/v1/orrs/${ids.orrId}/sections/${ids.sectionIds[0]}/flags/0`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "ACCEPTED" }),
        },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.flag.status).toBe("ACCEPTED");
      expect(body.flag.resolvedBy).toBe(ids.userId);
    });

    it("resolves a flag with resolution text", async () => {
      const res = await app.request(
        `/api/v1/orrs/${ids.orrId}/sections/${ids.sectionIds[0]}/flags/1`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "RESOLVED",
            resolution: "Added Datadog monitors",
          }),
        },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.flag.status).toBe("RESOLVED");
      expect(body.flag.resolution).toBe("Added Datadog monitors");
    });

    it("returns 404 for out-of-bounds flag index", async () => {
      const res = await app.request(
        `/api/v1/orrs/${ids.orrId}/sections/${ids.sectionIds[0]}/flags/99`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "ACCEPTED" }),
        },
      );
      expect(res.status).toBe(404);
    });

    it("rejects invalid flag status", async () => {
      const res = await app.request(
        `/api/v1/orrs/${ids.orrId}/sections/${ids.sectionIds[0]}/flags/0`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "INVALID" }),
        },
      );
      expect(res.status).toBe(400);
    });

    it("rejects flag update on TERMINATED ORR", async () => {
      db.update(schema.orrs)
        .set({ status: "TERMINATED" })
        .where(eq(schema.orrs.id, ids.orrId))
        .run();

      const res = await app.request(
        `/api/v1/orrs/${ids.orrId}/sections/${ids.sectionIds[0]}/flags/0`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "ACCEPTED" }),
        },
      );
      expect(res.status).toBe(403);
    });
  });
});
