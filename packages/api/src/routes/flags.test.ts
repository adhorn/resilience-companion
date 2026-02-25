import { describe, it, expect, beforeEach } from "vitest";
import { app } from "../app.js";
import { setupTestDb, seedTestOrr } from "../test-helpers.js";
import { getDb } from "../db/index.js";
import * as schema from "../db/schema.js";
import { eq } from "drizzle-orm";

describe("flags routes", () => {
  let db: ReturnType<typeof getDb>;
  let ids: ReturnType<typeof seedTestOrr>;

  beforeEach(() => {
    db = setupTestDb();
    ids = seedTestOrr(db);

    // Add flags to sections
    db.update(schema.sections)
      .set({
        flags: JSON.stringify([
          { type: "RISK", note: "No rollback plan", severity: "HIGH", status: "OPEN", createdAt: "2024-01-01" },
          { type: "GAP", note: "Missing alerts", severity: "MEDIUM", status: "OPEN", createdAt: "2024-01-02" },
        ]),
      })
      .where(eq(schema.sections.id, ids.sectionIds[0]))
      .run();

    db.update(schema.sections)
      .set({
        flags: JSON.stringify([
          { type: "STRENGTH", note: "Good test coverage", status: "OPEN", createdAt: "2024-01-03" },
        ]),
      })
      .where(eq(schema.sections.id, ids.sectionIds[1]))
      .run();
  });

  describe("GET /api/v1/flags", () => {
    it("aggregates flags across all ORRs", async () => {
      const res = await app.request("/api/v1/flags");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.summary.total).toBe(3);
      expect(body.summary.byType.RISK).toBe(1);
      expect(body.summary.byType.GAP).toBe(1);
      expect(body.summary.byType.STRENGTH).toBe(1);
      expect(body.flags).toHaveLength(3);
    });

    it("filters by type", async () => {
      const res = await app.request("/api/v1/flags?type=RISK");
      const body = await res.json();
      expect(body.flags).toHaveLength(1);
      expect(body.flags[0].type).toBe("RISK");
      // Summary should still be unfiltered
      expect(body.summary.total).toBe(3);
    });

    it("filters by severity", async () => {
      const res = await app.request("/api/v1/flags?severity=HIGH");
      const body = await res.json();
      expect(body.flags).toHaveLength(1);
      expect(body.flags[0].severity).toBe("HIGH");
    });

    it("filters by orrId", async () => {
      const res = await app.request(`/api/v1/flags?orrId=${ids.orrId}`);
      const body = await res.json();
      expect(body.flags).toHaveLength(3);
    });

    it("includes context fields on each flag", async () => {
      const res = await app.request("/api/v1/flags");
      const body = await res.json();
      const flag = body.flags[0];
      expect(flag).toHaveProperty("orrId");
      expect(flag).toHaveProperty("serviceName");
      expect(flag).toHaveProperty("sectionTitle");
      expect(flag).toHaveProperty("sectionPosition");
      expect(flag).toHaveProperty("flagIndex");
    });

    it("returns empty when no ORRs", async () => {
      db.delete(schema.sections).run();
      db.delete(schema.orrs).run();

      const res = await app.request("/api/v1/flags");
      const body = await res.json();
      expect(body.summary.total).toBe(0);
      expect(body.flags).toHaveLength(0);
    });

    it("sorts HIGH severity before MEDIUM", async () => {
      const res = await app.request("/api/v1/flags");
      const body = await res.json();
      const risks = body.flags.filter((f: any) => f.severity);
      if (risks.length >= 2) {
        const highIdx = body.flags.findIndex((f: any) => f.severity === "HIGH");
        const medIdx = body.flags.findIndex((f: any) => f.severity === "MEDIUM");
        expect(highIdx).toBeLessThan(medIdx);
      }
    });
  });
});
