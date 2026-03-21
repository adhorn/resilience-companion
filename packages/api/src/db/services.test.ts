/**
 * Tests for the services and experiment_suggestions tables.
 * Validates schema, backfill logic, and basic CRUD operations.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { eq, and } from "drizzle-orm";
import { setupTestDb, seedTestOrr, seedTestIncident } from "../test-helpers.js";
import * as schema from "./schema.js";
import { migrate } from "./migrate.js";
import type { Db } from "./connection.js";

let db: Db;

describe("services table", () => {
  beforeEach(() => {
    db = setupTestDb();
  });

  it("creates a service and reads it back", () => {
    const now = new Date().toISOString();
    // Need a team first
    db.insert(schema.teams).values({ id: "t1", name: "Team", createdAt: now }).run();

    db.insert(schema.services).values({
      id: "svc-1",
      name: "Payment Service",
      teamId: "t1",
      description: "Handles payments",
      createdAt: now,
      updatedAt: now,
    }).run();

    const [svc] = db.select().from(schema.services).where(eq(schema.services.id, "svc-1")).all();
    expect(svc.name).toBe("Payment Service");
    expect(svc.teamId).toBe("t1");
    expect(svc.description).toBe("Handles payments");
  });

  it("enforces unique (team_id, name)", () => {
    const now = new Date().toISOString();
    db.insert(schema.teams).values({ id: "t1", name: "Team", createdAt: now }).run();
    db.insert(schema.services).values({
      id: "svc-1", name: "My Service", teamId: "t1", createdAt: now, updatedAt: now,
    }).run();

    expect(() => {
      db.insert(schema.services).values({
        id: "svc-2", name: "My Service", teamId: "t1", createdAt: now, updatedAt: now,
      }).run();
    }).toThrow(); // unique index violation
  });

  it("allows same service name on different teams", () => {
    const now = new Date().toISOString();
    db.insert(schema.teams).values({ id: "t1", name: "Team 1", createdAt: now }).run();
    db.insert(schema.teams).values({ id: "t2", name: "Team 2", createdAt: now }).run();

    db.insert(schema.services).values({
      id: "svc-1", name: "API", teamId: "t1", createdAt: now, updatedAt: now,
    }).run();
    db.insert(schema.services).values({
      id: "svc-2", name: "API", teamId: "t2", createdAt: now, updatedAt: now,
    }).run();

    const all = db.select().from(schema.services).all();
    expect(all).toHaveLength(2);
  });
});

describe("orrs.service_id", () => {
  beforeEach(() => {
    db = setupTestDb();
  });

  it("ORR can have a null service_id", () => {
    const { orrId } = seedTestOrr(db);
    const [orr] = db.select().from(schema.orrs).where(eq(schema.orrs.id, orrId)).all();
    // seedTestOrr doesn't set serviceId — should be null
    expect(orr.serviceId).toBeNull();
  });

  it("ORR can link to a service", () => {
    const { orrId, teamId } = seedTestOrr(db);
    const now = new Date().toISOString();
    db.insert(schema.services).values({
      id: "svc-1", name: "Test Service", teamId, createdAt: now, updatedAt: now,
    }).run();
    db.update(schema.orrs).set({ serviceId: "svc-1" }).where(eq(schema.orrs.id, orrId)).run();

    const [orr] = db.select().from(schema.orrs).where(eq(schema.orrs.id, orrId)).all();
    expect(orr.serviceId).toBe("svc-1");
  });
});

describe("experiment_suggestions table", () => {
  beforeEach(() => {
    db = setupTestDb();
  });

  it("creates a suggestion linked to a service", () => {
    const { teamId, orrId } = seedTestOrr(db);
    const now = new Date().toISOString();

    db.insert(schema.services).values({
      id: "svc-1", name: "Test Service", teamId, createdAt: now, updatedAt: now,
    }).run();

    db.insert(schema.experimentSuggestions).values({
      id: "exp-1",
      serviceId: "svc-1",
      sourcePracticeType: "orr",
      sourcePracticeId: orrId,
      sourceSectionId: "sec-1",
      type: "chaos_experiment",
      title: "Test Stripe failover",
      hypothesis: "When Stripe is unavailable, checkout degrades to cash-only mode",
      rationale: "ORR revealed untested dependency failure mode",
      priority: "high",
      priorityReasoning: "All paying customers affected, never tested",
      blastRadiusNotes: "100% of checkout flow",
      createdAt: now,
      updatedAt: now,
    }).run();

    const [exp] = db.select().from(schema.experimentSuggestions)
      .where(eq(schema.experimentSuggestions.id, "exp-1")).all();
    expect(exp.title).toBe("Test Stripe failover");
    expect(exp.type).toBe("chaos_experiment");
    expect(exp.priority).toBe("high");
    expect(exp.status).toBe("suggested");
  });

  it("supports the full lifecycle: suggested → accepted → completed", () => {
    const { teamId, orrId } = seedTestOrr(db);
    const now = new Date().toISOString();

    db.insert(schema.services).values({
      id: "svc-1", name: "Test Service", teamId, createdAt: now, updatedAt: now,
    }).run();
    db.insert(schema.experimentSuggestions).values({
      id: "exp-1", serviceId: "svc-1", sourcePracticeType: "orr", sourcePracticeId: orrId,
      type: "load_test", title: "Load test at 3x", hypothesis: "Service handles 3x traffic",
      rationale: "Scaling claims unvalidated", priority: "medium",
      priorityReasoning: "Moderate blast radius", createdAt: now, updatedAt: now,
    }).run();

    // Accept
    db.update(schema.experimentSuggestions)
      .set({ status: "accepted" })
      .where(eq(schema.experimentSuggestions.id, "exp-1")).run();

    // Complete with notes
    db.update(schema.experimentSuggestions)
      .set({ status: "completed", completedAt: now, completedNotes: "Handled 3x fine, but DB pool saturated at 2.5x" })
      .where(eq(schema.experimentSuggestions.id, "exp-1")).run();

    const [exp] = db.select().from(schema.experimentSuggestions)
      .where(eq(schema.experimentSuggestions.id, "exp-1")).all();
    expect(exp.status).toBe("completed");
    expect(exp.completedNotes).toContain("DB pool saturated");
  });

  it("supports dismissal with reason", () => {
    const { teamId, orrId } = seedTestOrr(db);
    const now = new Date().toISOString();

    db.insert(schema.services).values({
      id: "svc-1", name: "Test Service", teamId, createdAt: now, updatedAt: now,
    }).run();
    db.insert(schema.experimentSuggestions).values({
      id: "exp-1", serviceId: "svc-1", sourcePracticeType: "orr", sourcePracticeId: orrId,
      type: "gameday", title: "DR exercise", hypothesis: "Team can recover in < 30min",
      rationale: "DR untested in 8 months", priority: "low",
      priorityReasoning: "Low blast radius", createdAt: now, updatedAt: now,
    }).run();

    db.update(schema.experimentSuggestions)
      .set({ status: "dismissed", dismissedReason: "Already covered by quarterly DR drill" })
      .where(eq(schema.experimentSuggestions.id, "exp-1")).run();

    const [exp] = db.select().from(schema.experimentSuggestions)
      .where(eq(schema.experimentSuggestions.id, "exp-1")).all();
    expect(exp.status).toBe("dismissed");
    expect(exp.dismissedReason).toBe("Already covered by quarterly DR drill");
  });

  it("queries suggestions by service", () => {
    const { teamId, orrId } = seedTestOrr(db);
    const now = new Date().toISOString();

    db.insert(schema.services).values({
      id: "svc-1", name: "Svc A", teamId, createdAt: now, updatedAt: now,
    }).run();
    db.insert(schema.services).values({
      id: "svc-2", name: "Svc B", teamId, createdAt: now, updatedAt: now,
    }).run();

    // Two suggestions for svc-1, one for svc-2
    for (const [id, svcId] of [["e1", "svc-1"], ["e2", "svc-1"], ["e3", "svc-2"]] as const) {
      db.insert(schema.experimentSuggestions).values({
        id, serviceId: svcId, sourcePracticeType: "orr", sourcePracticeId: orrId,
        type: "chaos_experiment", title: `Test ${id}`, hypothesis: "h", rationale: "r",
        priority: "medium", priorityReasoning: "pr", createdAt: now, updatedAt: now,
      }).run();
    }

    const svc1Suggestions = db.select().from(schema.experimentSuggestions)
      .where(eq(schema.experimentSuggestions.serviceId, "svc-1")).all();
    expect(svc1Suggestions).toHaveLength(2);

    const svc2Suggestions = db.select().from(schema.experimentSuggestions)
      .where(eq(schema.experimentSuggestions.serviceId, "svc-2")).all();
    expect(svc2Suggestions).toHaveLength(1);
  });
});

describe("backfill migration", () => {
  it("backfills service_id on ORRs during migration", () => {
    // seedTestOrr creates an ORR with serviceName="Test Service"
    // The migrate() call in setupTestDb should have backfilled it
    db = setupTestDb();
    seedTestOrr(db);

    // Re-run migrate to trigger backfill (simulating restart)
    migrate(db);

    const [orr] = db.select().from(schema.orrs).all();
    // Backfill should have created a service and linked it
    expect(orr.serviceId).toBeTruthy();

    // Verify the service was created
    const services = db.select().from(schema.services).all();
    expect(services.length).toBeGreaterThanOrEqual(1);
    const svc = services.find(s => s.name === "Test Service");
    expect(svc).toBeTruthy();
    expect(orr.serviceId).toBe(svc!.id);
  });
});
