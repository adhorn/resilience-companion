import { describe, it, expect, beforeEach } from "vitest";
import { app } from "../app.js";
import { setupTestDb, seedTestOrr } from "../test-helpers.js";
import { getDb } from "../db/index.js";
import * as schema from "../db/schema.js";

describe("case-studies routes", () => {
  let db: ReturnType<typeof getDb>;

  beforeEach(() => {
    db = setupTestDb();
    seedTestOrr(db); // creates team + user for auth stub

    const now = new Date().toISOString();
    db.insert(schema.caseStudies).values([
      {
        id: "cs-1",
        title: "Knight Capital Trading Loss",
        company: "Knight Capital",
        year: 2012,
        summary: "A deployment of dead code triggered $440M in erroneous trades in 45 minutes.",
        failureCategory: "Deployment",
        sectionTags: JSON.stringify(["Architecture", "Testing"]),
        lessons: JSON.stringify(["Dead code is live risk", "Kill switches matter"]),
        createdAt: now,
      },
      {
        id: "cs-2",
        title: "AWS S3 Outage",
        company: "Amazon",
        year: 2017,
        summary: "A typo in a command removed more S3 servers than intended, cascading across US-EAST-1.",
        failureCategory: "Operational Error",
        sectionTags: JSON.stringify(["Monitoring"]),
        lessons: JSON.stringify(["Blast radius controls on admin tools"]),
        createdAt: now,
      },
    ]).run();
  });

  describe("GET /api/v1/case-studies", () => {
    it("lists all case studies", async () => {
      const res = await app.request("/api/v1/case-studies");
      expect(res.status).toBe(200);
      const body = await res.json();
      // Seed data includes 12 case studies from migration + 2 we added
      expect(body.caseStudies.length).toBeGreaterThanOrEqual(2);
    });

    it("searches by title", async () => {
      const res = await app.request("/api/v1/case-studies?q=knight+capital");
      const body = await res.json();
      const match = body.caseStudies.find((cs: any) => cs.id === "cs-1");
      expect(match).toBeTruthy();
      expect(match.title).toContain("Knight Capital");
    });

    it("searches by company name", async () => {
      const res = await app.request("/api/v1/case-studies?q=amazon");
      const body = await res.json();
      const match = body.caseStudies.find((cs: any) => cs.id === "cs-2");
      expect(match).toBeTruthy();
    });

    it("searches by summary content", async () => {
      const res = await app.request("/api/v1/case-studies?q=erroneous+trades");
      const body = await res.json();
      const match = body.caseStudies.find((cs: any) => cs.id === "cs-1");
      expect(match).toBeTruthy();
    });

    it("filters by failureCategory", async () => {
      const res = await app.request("/api/v1/case-studies?failureCategory=Deployment");
      const body = await res.json();
      for (const cs of body.caseStudies) {
        expect(cs.failureCategory.toLowerCase()).toContain("deployment");
      }
    });

    it("filters by sectionTag", async () => {
      const res = await app.request("/api/v1/case-studies?sectionTag=Architecture");
      const body = await res.json();
      const match = body.caseStudies.find((cs: any) => cs.id === "cs-1");
      expect(match).toBeTruthy();
      // cs-2 doesn't have Architecture tag
      const noMatch = body.caseStudies.find((cs: any) => cs.id === "cs-2");
      expect(noMatch).toBeUndefined();
    });

    it("returns empty for non-matching search", async () => {
      const res = await app.request("/api/v1/case-studies?q=xyznonexistent");
      const body = await res.json();
      expect(body.caseStudies).toHaveLength(0);
    });
  });

  describe("GET /api/v1/case-studies/:id", () => {
    it("returns a single case study", async () => {
      const res = await app.request("/api/v1/case-studies/cs-1");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.caseStudy.title).toContain("Knight Capital");
      expect(body.caseStudy.year).toBe(2012);
    });

    it("returns 404 for non-existent case study", async () => {
      const res = await app.request("/api/v1/case-studies/no-such");
      expect(res.status).toBe(404);
    });
  });
});
