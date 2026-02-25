import { describe, it, expect, beforeEach } from "vitest";
import { app } from "../app.js";
import { setupTestDb, seedTestOrr } from "../test-helpers.js";
import { getDb } from "../db/index.js";
import * as schema from "../db/schema.js";
import { eq } from "drizzle-orm";

describe("teaching-moments routes", () => {
  let db: ReturnType<typeof getDb>;

  beforeEach(() => {
    db = setupTestDb();
    seedTestOrr(db); // creates team + user for auth stub

    // The seed data already inserts teaching moments via migrate, but they may be PUBLISHED
    // Let's verify what we have and add a known one
    const now = new Date().toISOString();
    db.insert(schema.teachingMoments)
      .values({
        id: "tm-test",
        title: "Circuit Breaker Patterns",
        content: "Circuit breakers prevent cascading failures by stopping requests to unhealthy services.",
        source: "PUBLIC",
        status: "PUBLISHED",
        tags: JSON.stringify(["resilience", "patterns"]),
        sectionTags: JSON.stringify(["Architecture"]),
        createdAt: now,
        updatedAt: now,
      })
      .run();
  });

  describe("GET /api/v1/teaching-moments", () => {
    it("lists published teaching moments", async () => {
      const res = await app.request("/api/v1/teaching-moments");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.teachingMoments.length).toBeGreaterThan(0);
      // All should be PUBLISHED
      for (const tm of body.teachingMoments) {
        expect(tm.status).toBe("PUBLISHED");
      }
    });

    it("filters by search query", async () => {
      const res = await app.request("/api/v1/teaching-moments?q=circuit+breaker");
      expect(res.status).toBe(200);
      const body = await res.json();
      const match = body.teachingMoments.find((tm: any) => tm.id === "tm-test");
      expect(match).toBeTruthy();
    });

    it("filters by source", async () => {
      const res = await app.request("/api/v1/teaching-moments?source=PUBLIC");
      expect(res.status).toBe(200);
      const body = await res.json();
      for (const tm of body.teachingMoments) {
        expect(tm.source).toBe("PUBLIC");
      }
    });

    it("filters by sectionTag", async () => {
      const res = await app.request("/api/v1/teaching-moments?sectionTag=Architecture");
      expect(res.status).toBe(200);
      const body = await res.json();
      const match = body.teachingMoments.find((tm: any) => tm.id === "tm-test");
      expect(match).toBeTruthy();
    });

    it("does not include DRAFT teaching moments", async () => {
      const now = new Date().toISOString();
      db.insert(schema.teachingMoments)
        .values({
          id: "tm-draft",
          title: "Draft Moment",
          content: "Not published",
          source: "ORG",
          status: "DRAFT",
          tags: "[]",
          sectionTags: "[]",
          createdAt: now,
          updatedAt: now,
        })
        .run();

      const res = await app.request("/api/v1/teaching-moments");
      const body = await res.json();
      const draft = body.teachingMoments.find((tm: any) => tm.id === "tm-draft");
      expect(draft).toBeUndefined();
    });
  });

  describe("GET /api/v1/teaching-moments/:id", () => {
    it("returns a single teaching moment", async () => {
      const res = await app.request("/api/v1/teaching-moments/tm-test");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.teachingMoment.title).toBe("Circuit Breaker Patterns");
    });

    it("returns 404 for non-existent teaching moment", async () => {
      const res = await app.request("/api/v1/teaching-moments/no-such");
      expect(res.status).toBe(404);
    });
  });
});

describe("template routes", () => {
  let db: ReturnType<typeof getDb>;

  beforeEach(() => {
    db = setupTestDb();
    seedTestOrr(db); // creates team + user + default template
  });

  describe("GET /api/v1/templates", () => {
    it("lists all templates", async () => {
      const res = await app.request("/api/v1/templates");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.templates.length).toBeGreaterThan(0);
    });
  });

  describe("GET /api/v1/templates/:id", () => {
    it("returns a single template", async () => {
      const res = await app.request("/api/v1/templates/test-template");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.template.name).toBe("Test Template");
    });

    it("returns 404 for non-existent template", async () => {
      const res = await app.request("/api/v1/templates/no-such");
      expect(res.status).toBe(404);
    });
  });
});
