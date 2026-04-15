import { describe, it, expect, beforeEach } from "vitest";
import { app } from "../app.js";
import { setupTestDb, seedTestIncident } from "../test-helpers.js";
import { getDb } from "../db/index.js";
import * as schema from "../db/schema.js";
import { eq } from "drizzle-orm";

describe("incident routes", () => {
  let db: ReturnType<typeof getDb>;
  let ids: ReturnType<typeof seedTestIncident>;

  beforeEach(() => {
    db = setupTestDb();
    ids = seedTestIncident(db);
  });

  describe("GET /api/v1/incidents", () => {
    it("lists incidents for the team", async () => {
      const res = await app.request("/api/v1/incidents");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.incidents).toHaveLength(1);
      expect(body.incidents[0].title).toBe("DB Connection Exhaustion");
    });
  });

  describe("POST /api/v1/incidents", () => {
    it("creates an incident with sections from template", async () => {
      const res = await app.request("/api/v1/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "CDN Outage",
          serviceName: "Frontend",
          severity: "CRITICAL",
        }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.incident.title).toBe("CDN Outage");
      expect(body.incident.status).toBe("IN_PROGRESS");
    });

    it("rejects creation without title", async () => {
      const res = await app.request("/api/v1/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/v1/incidents/:id", () => {
    it("returns incident with sections and related data", async () => {
      const res = await app.request(`/api/v1/incidents/${ids.incidentId}`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.incident.id).toBe(ids.incidentId);
      expect(body.sections.length).toBeGreaterThan(0);
      expect(body.timelineEvents).toBeDefined();
      expect(body.contributingFactors).toBeDefined();
      expect(body.actionItems).toBeDefined();
    });

    it("returns 404 for non-existent incident", async () => {
      const res = await app.request("/api/v1/incidents/no-such");
      expect(res.status).toBe(404);
    });
  });

  describe("PATCH /api/v1/incidents/:id", () => {
    it("updates incident metadata", async () => {
      const res = await app.request(`/api/v1/incidents/${ids.incidentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ severity: "CRITICAL", title: "Updated Title" }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.incident.severity).toBe("CRITICAL");
      expect(body.incident.title).toBe("Updated Title");
    });

    it("sets publishedAt when status changes to PUBLISHED", async () => {
      const res = await app.request(`/api/v1/incidents/${ids.incidentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "PUBLISHED" }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.incident.status).toBe("PUBLISHED");
      expect(body.incident.publishedAt).toBeTruthy();
    });

    it("returns 404 for non-existent incident", async () => {
      const res = await app.request("/api/v1/incidents/no-such", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "x" }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /api/v1/incidents/:id", () => {
    it("deletes an incident", async () => {
      const res = await app.request(`/api/v1/incidents/${ids.incidentId}`, {
        method: "DELETE",
      });
      expect(res.status).toBe(200);

      // Verify deleted
      const check = await app.request(`/api/v1/incidents/${ids.incidentId}`);
      expect(check.status).toBe(404);
    });

    it("returns 404 for non-existent incident", async () => {
      const res = await app.request("/api/v1/incidents/no-such", {
        method: "DELETE",
      });
      expect(res.status).toBe(404);
    });
  });
});
