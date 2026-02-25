import { describe, it, expect, beforeEach } from "vitest";
import { setupTestDb } from "../../test-helpers.js";
import { buildIncidentContext } from "./context.js";
import { getDb } from "../../db/connection.js";
import * as schema from "../../db/schema.js";
import { eq } from "drizzle-orm";
import type { Db } from "../../db/connection.js";

let db: Db;
let incidentId: string;
let sectionIds: string[];
let userId: string;

function seedTestIncident(db: Db) {
  const now = new Date().toISOString();
  const teamId = "test-team";
  userId = "test-user";
  incidentId = "test-incident";

  db.insert(schema.teams).values({ id: teamId, name: "Incident Team", createdAt: now }).run();
  db.insert(schema.users).values({
    id: userId, name: "Test User", email: "test@test.com",
    passwordHash: "n/a", teamId, role: "ADMIN", authProvider: "local", createdAt: now,
  }).run();

  db.insert(schema.incidents).values({
    id: incidentId, title: "DB Connection Exhaustion", teamId,
    serviceName: "Payment Service", severity: "HIGH",
    incidentType: "DEGRADATION", incidentDate: "2024-03-15T14:30:00Z",
    steeringTier: "thorough", status: "IN_PROGRESS", createdBy: userId,
    createdAt: now, updatedAt: now,
  }).run();

  sectionIds = ["isec-1", "isec-2", "isec-3"];
  const sections = [
    { id: sectionIds[0], title: "Incident Details", prompts: ["When?", "Duration?"], position: 1 },
    { id: sectionIds[1], title: "Timeline", prompts: ["Walk me through it"], position: 9 },
    { id: sectionIds[2], title: "Contributing Factors", prompts: ["What happened?"], position: 10 },
  ];

  for (const s of sections) {
    db.insert(schema.incidentSections).values({
      id: s.id, incidentId, position: s.position, title: s.title,
      prompts: s.prompts as any, content: "", depth: "UNKNOWN",
      promptResponses: {} as any, flags: [] as any, updatedAt: now,
    }).run();
  }
}

beforeEach(() => {
  db = setupTestDb();
  seedTestIncident(db);
});

describe("buildIncidentContext", () => {
  it("returns correct shape for fresh incident", () => {
    const ctx = buildIncidentContext(incidentId, null);
    expect(ctx.title).toBe("DB Connection Exhaustion");
    expect(ctx.serviceName).toBe("Payment Service");
    expect(ctx.teamName).toBe("Incident Team");
    expect(ctx.status).toBe("IN_PROGRESS");
    expect(ctx.severity).toBe("HIGH");
    expect(ctx.incidentType).toBe("DEGRADATION");
    expect(ctx.sections).toHaveLength(3);
    expect(ctx.activeSection).toBeNull();
    expect(ctx.sessionSummaries).toHaveLength(0);
    expect(ctx.isReturningSession).toBe(false);
    expect(ctx.timelineEventCount).toBe(0);
    expect(ctx.contributingFactorCount).toBe(0);
    expect(ctx.actionItemCount).toBe(0);
  });

  it("includes active section detail when specified", () => {
    const ctx = buildIncidentContext(incidentId, sectionIds[0]);
    expect(ctx.activeSection).not.toBeNull();
    expect(ctx.activeSection!.title).toBe("Incident Details");
    expect(ctx.activeSection!.prompts).toHaveLength(2);
  });

  it("counts structured data correctly", () => {
    const now = new Date().toISOString();
    // Add timeline events
    db.insert(schema.timelineEvents).values({
      id: "evt-1", incidentId, position: 0, timestamp: now,
      description: "Alert", eventType: "detection", createdAt: now,
    }).run();
    // Add contributing factor
    db.insert(schema.contributingFactors).values({
      id: "cf-1", incidentId, category: "technical",
      description: "Pool too small", isSystemic: false, createdAt: now,
    }).run();
    // Add action item
    db.insert(schema.actionItems).values({
      id: "ai-1", practiceType: "incident", practiceId: incidentId,
      title: "Fix pool", priority: "high", type: "technical",
      status: "open", createdAt: now,
    }).run();

    const ctx = buildIncidentContext(incidentId, null);
    expect(ctx.timelineEventCount).toBe(1);
    expect(ctx.contributingFactorCount).toBe(1);
    expect(ctx.actionItemCount).toBe(1);
  });

  it("throws for unknown incident", () => {
    expect(() => buildIncidentContext("nonexistent", null)).toThrow("Incident nonexistent not found");
  });
});
