import { describe, it, expect, beforeEach } from "vitest";
import { setupTestDb, seedTestOrr, seedTestFeatureOrr } from "../test-helpers.js";
import { buildORRContext } from "./context.js";
import { getDb } from "../db/connection.js";
import * as schema from "../db/schema.js";
import { eq } from "drizzle-orm";

let parentOrrId: string;
let featureOrrId: string;
let featureSectionIds: string[];

beforeEach(() => {
  const db = setupTestDb();
  const seed = seedTestOrr(db);
  parentOrrId = seed.orrId;
  const featureSeed = seedTestFeatureOrr(db, parentOrrId);
  featureOrrId = featureSeed.featureOrrId;
  featureSectionIds = featureSeed.featureSectionIds;
});

describe("buildORRContext for feature ORR", () => {
  it("returns feature ORR fields", () => {
    const ctx = buildORRContext(featureOrrId, null);
    expect(ctx.orrType).toBe("feature");
    expect(ctx.changeTypes).toEqual(["new_dependency", "new_endpoint"]);
    expect(ctx.changeDescription).toBe("Adding Redis cache and new /sessions endpoint");
  });

  it("loads parent context when parentOrrId is set", () => {
    const ctx = buildORRContext(featureOrrId, null);
    expect(ctx.parentContext).not.toBeNull();
    expect(ctx.parentContext!.serviceName).toBe("Test Service");
    expect(ctx.parentContext!.status).toBe("IN_PROGRESS");
    expect(ctx.parentContext!.sections).toHaveLength(3);
  });

  it("parent sections include title, depth, content, flagCount", () => {
    // Give parent a section some content
    const db = getDb();
    db.update(schema.sections)
      .set({ content: "Architecture notes here", depth: "MODERATE" })
      .where(eq(schema.sections.id, "sec-1"))
      .run();

    const ctx = buildORRContext(featureOrrId, null);
    const archSection = ctx.parentContext!.sections.find((s) => s.title === "Architecture");
    expect(archSection).toBeDefined();
    expect(archSection!.depth).toBe("MODERATE");
    expect(archSection!.content).toBe("Architecture notes here");
    expect(archSection!.flagCount).toBe(0);
  });

  it("returns null parentContext for service ORR", () => {
    const ctx = buildORRContext(parentOrrId, null);
    expect(ctx.orrType).toBe("service");
    expect(ctx.parentContext).toBeNull();
    expect(ctx.changeTypes).toEqual([]);
  });

  it("includes feature ORR sections", () => {
    const ctx = buildORRContext(featureOrrId, featureSectionIds[0]);
    expect(ctx.sections).toHaveLength(2);
    expect(ctx.activeSection).not.toBeNull();
    expect(ctx.activeSection!.title).toBe("Dependency Readiness");
  });
});
