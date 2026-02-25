import { describe, it, expect, beforeEach } from "vitest";
import { app } from "../app.js";
import { setupTestDb, seedTestOrr, seedTestIncident } from "../test-helpers.js";
import { getDb } from "../db/index.js";
import * as schema from "../db/schema.js";
import { eq } from "drizzle-orm";

describe("dashboard routes", () => {
  let db: ReturnType<typeof getDb>;
  let ids: ReturnType<typeof seedTestOrr>;

  beforeEach(() => {
    db = setupTestDb();
    ids = seedTestOrr(db);
  });

  describe("GET /api/v1/dashboard", () => {
    it("returns dashboard stats with ORR data", async () => {
      const res = await app.request("/api/v1/dashboard");
      expect(res.status).toBe(200);
      const body = await res.json();
      const d = body.dashboard;

      expect(d.totalOrrs).toBe(1);
      expect(d.orrsByStatus.IN_PROGRESS).toBe(1);
      expect(d.recentOrrs).toHaveLength(1);
      expect(d.recentOrrs[0].title).toBe("Test Service");
      expect(d.recentOrrs[0].coveragePercent).toBe(0); // all UNKNOWN
    });

    it("computes ORR coverage percent", async () => {
      // Mark 2 of 3 sections as reviewed
      db.update(schema.sections)
        .set({ depth: "MODERATE" })
        .where(eq(schema.sections.id, ids.sectionIds[0]))
        .run();
      db.update(schema.sections)
        .set({ depth: "DEEP" })
        .where(eq(schema.sections.id, ids.sectionIds[1]))
        .run();

      const res = await app.request("/api/v1/dashboard");
      const body = await res.json();
      // 2/3 = 67%
      expect(body.dashboard.recentOrrs[0].coveragePercent).toBe(67);
    });

    it("includes incident stats when incidents exist", async () => {
      seedTestIncident(db); // adds incident to same team

      const res = await app.request("/api/v1/dashboard");
      const body = await res.json();
      expect(body.dashboard.totalIncidents).toBe(1);
      expect(body.dashboard.incidentsByStatus.IN_PROGRESS).toBe(1);
      expect(body.dashboard.recentIncidents).toHaveLength(1);
    });

    it("returns learning signal counts", async () => {
      const res = await app.request("/api/v1/dashboard");
      const body = await res.json();
      expect(body.dashboard).toHaveProperty("openActionItems");
      expect(body.dashboard).toHaveProperty("experimentSuggestions");
      expect(body.dashboard).toHaveProperty("crossPracticeLinks");
      expect(body.dashboard).toHaveProperty("recentDiscoveries");
      expect(body.dashboard).toHaveProperty("learningQuality");
      expect(body.dashboard).toHaveProperty("engagementPatterns");
    });

    it("returns empty dashboard for team with no practices", async () => {
      // Delete the ORR and its sections
      db.delete(schema.sections).run();
      db.delete(schema.orrs).run();

      const res = await app.request("/api/v1/dashboard");
      const body = await res.json();
      expect(body.dashboard.totalOrrs).toBe(0);
      expect(body.dashboard.totalIncidents).toBe(0);
    });
  });
});
