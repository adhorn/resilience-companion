import { describe, it, expect, beforeEach } from "vitest";
import { app } from "../app.js";
import { setupTestDb, seedTestIncident } from "../test-helpers.js";
import { getDb } from "../db/index.js";
import * as schema from "../db/schema.js";
import { eq } from "drizzle-orm";

describe("incident section routes", () => {
  let db: ReturnType<typeof getDb>;
  let ids: ReturnType<typeof seedTestIncident>;

  beforeEach(() => {
    db = setupTestDb();
    ids = seedTestIncident(db);
  });

  describe("GET /api/v1/incidents/:incidentId/sections", () => {
    it("lists all sections for an incident", async () => {
      const res = await app.request(`/api/v1/incidents/${ids.incidentId}/sections`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.sections).toHaveLength(3);
    });

    it("returns 404 for non-existent incident", async () => {
      const res = await app.request("/api/v1/incidents/no-such/sections");
      expect(res.status).toBe(404);
    });
  });

  describe("PATCH /api/v1/incidents/:incidentId/sections/:sectionId", () => {
    it("updates section content", async () => {
      const res = await app.request(
        `/api/v1/incidents/${ids.incidentId}/sections/${ids.sectionIds[0]}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: "Updated observations about the incident timeline" }),
        },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.section.content).toBe("Updated observations about the incident timeline");
    });

    it("bumps incident updatedAt on section update", async () => {
      const before = db.select().from(schema.incidents)
        .where(eq(schema.incidents.id, ids.incidentId)).get()!;

      await new Promise((r) => setTimeout(r, 10));

      await app.request(
        `/api/v1/incidents/${ids.incidentId}/sections/${ids.sectionIds[0]}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: "New content" }),
        },
      );

      const after = db.select().from(schema.incidents)
        .where(eq(schema.incidents.id, ids.incidentId)).get()!;
      expect(after.updatedAt).not.toBe(before.updatedAt);
    });

    it("returns 404 for non-existent section", async () => {
      const res = await app.request(
        `/api/v1/incidents/${ids.incidentId}/sections/no-such`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: "x" }),
        },
      );
      expect(res.status).toBe(404);
    });

    it("returns 404 when incident doesn't exist", async () => {
      const res = await app.request(
        `/api/v1/incidents/no-such/sections/${ids.sectionIds[0]}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: "x" }),
        },
      );
      expect(res.status).toBe(404);
    });

    it("updates promptResponses", async () => {
      const res = await app.request(
        `/api/v1/incidents/${ids.incidentId}/sections/${ids.sectionIds[0]}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            promptResponses: JSON.stringify({ "0": { answer: "2024-03-15", source: "team" } }),
          }),
        },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      const responses = typeof body.section.promptResponses === "string"
        ? JSON.parse(body.section.promptResponses)
        : body.section.promptResponses;
      expect(responses["0"].answer).toBe("2024-03-15");
    });
  });
});
