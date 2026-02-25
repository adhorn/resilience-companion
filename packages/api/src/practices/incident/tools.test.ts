import { describe, it, expect, beforeEach } from "vitest";
import { setupTestDb } from "../../test-helpers.js";
import { executeIncidentTool } from "./tools.js";
import { getDb } from "../../db/connection.js";
import * as schema from "../../db/schema.js";
import { eq } from "drizzle-orm";
import type { Db } from "../../db/connection.js";

let db: Db;
let incidentId: string;
let sectionIds: string[];
let sessionId: string;

function seedTestIncident(db: Db) {
  const now = new Date().toISOString();
  const teamId = "test-team";
  const userId = "test-user";
  incidentId = "test-incident";
  sessionId = "test-session";

  db.insert(schema.teams).values({ id: teamId, name: "Test Team", createdAt: now }).run();
  db.insert(schema.users).values({
    id: userId, name: "Test User", email: "test@test.com",
    passwordHash: "n/a", teamId, role: "ADMIN", authProvider: "local", createdAt: now,
  }).run();

  db.insert(schema.incidents).values({
    id: incidentId, title: "Test Incident", teamId, serviceName: "TestSvc",
    steeringTier: "thorough", status: "IN_PROGRESS", createdBy: userId,
    createdAt: now, updatedAt: now,
  }).run();

  sectionIds = ["isec-1", "isec-2", "isec-3"];
  const sections = [
    { id: sectionIds[0], title: "Incident Details", prompts: ["When?", "Duration?", "Severity?", "Detection?"], position: 1 },
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

  db.insert(schema.sessions).values({
    id: sessionId, orrId: incidentId, userId, agentProfile: "INCIDENT_LEARNING_FACILITATOR",
    status: "ACTIVE", tokenUsage: 0, sectionsDiscussed: [] as any, startedAt: now,
  }).run();
}

beforeEach(() => {
  db = setupTestDb();
  seedTestIncident(db);
});

describe("incident tools - section operations", () => {
  it("read_section returns incident section", () => {
    const result = JSON.parse(executeIncidentTool("read_section", { section_id: sectionIds[0] }, incidentId, sessionId));
    expect(result.title).toBe("Incident Details");
    expect(result.prompts).toHaveLength(4);
  });

  it("update_section_content appends by default", () => {
    executeIncidentTool("update_section_content", { section_id: sectionIds[0], content: "First observation" }, incidentId, sessionId);
    executeIncidentTool("update_section_content", { section_id: sectionIds[0], content: "Second observation" }, incidentId, sessionId);

    const section = db.select().from(schema.incidentSections).where(eq(schema.incidentSections.id, sectionIds[0])).get()!;
    expect(section.content).toContain("First observation");
    expect(section.content).toContain("Second observation");
  });

  it("update_depth_assessment sets depth", () => {
    executeIncidentTool("update_depth_assessment", {
      section_id: sectionIds[0], depth: "MODERATE",
      rationale: "Team explored contributing factors but hasn't identified systemic patterns",
    }, incidentId, sessionId);

    const section = db.select().from(schema.incidentSections).where(eq(schema.incidentSections.id, sectionIds[0])).get()!;
    expect(section.depth).toBe("MODERATE");
  });

  it("set_flags preserves ACCEPTED/RESOLVED flags", () => {
    // Manually set a resolved flag
    db.update(schema.incidentSections)
      .set({ flags: [{ type: "GAP", note: "Old gap", status: "RESOLVED", createdAt: "2024-01-01" }] as any })
      .where(eq(schema.incidentSections.id, sectionIds[0]))
      .run();

    executeIncidentTool("set_flags", {
      section_id: sectionIds[0],
      flags: [{ type: "RISK", note: "New risk", severity: "HIGH" }],
    }, incidentId, sessionId);

    const section = db.select().from(schema.incidentSections).where(eq(schema.incidentSections.id, sectionIds[0])).get()!;
    const flags = typeof section.flags === "string" ? JSON.parse(section.flags) : section.flags;
    expect(flags).toHaveLength(2);
    expect(flags[0].status).toBe("RESOLVED");
    expect(flags[1].status).toBe("OPEN");
  });

  it("update_question_response records answer", () => {
    executeIncidentTool("update_question_response", {
      section_id: sectionIds[0], question_index: 0, response: "2024-03-15 at 14:30 UTC",
    }, incidentId, sessionId);

    const section = db.select().from(schema.incidentSections).where(eq(schema.incidentSections.id, sectionIds[0])).get()!;
    const responses = typeof section.promptResponses === "string" ? JSON.parse(section.promptResponses as string) : section.promptResponses;
    expect((responses as any)[0]).toBe("2024-03-15 at 14:30 UTC");
  });
});

describe("incident tools - timeline", () => {
  it("record_timeline_event creates event with position", () => {
    const result = JSON.parse(executeIncidentTool("record_timeline_event", {
      timestamp: "2024-03-15T14:30:00Z",
      description: "First alert fired",
      event_type: "detection",
      actor: "PagerDuty",
    }, incidentId, sessionId));

    expect(result.success).toBe(true);
    expect(result.position).toBe(0);

    const events = db.select().from(schema.timelineEvents).where(eq(schema.timelineEvents.incidentId, incidentId)).all();
    expect(events).toHaveLength(1);
    expect(events[0].description).toBe("First alert fired");
    expect(events[0].eventType).toBe("detection");
  });

  it("timeline events get sequential positions", () => {
    executeIncidentTool("record_timeline_event", {
      timestamp: "2024-03-15T14:30:00Z", description: "Alert fired", event_type: "detection",
    }, incidentId, sessionId);
    const r2 = JSON.parse(executeIncidentTool("record_timeline_event", {
      timestamp: "2024-03-15T14:35:00Z", description: "Engineer paged", event_type: "escalation",
    }, incidentId, sessionId));

    expect(r2.position).toBe(1);
  });
});

describe("incident tools - contributing factors", () => {
  it("record_contributing_factor creates factor", () => {
    const result = JSON.parse(executeIncidentTool("record_contributing_factor", {
      category: "technical",
      description: "Connection pool sized for normal load, not peak",
      context: "Pool size was set 2 years ago and never reviewed",
      is_systemic: false,
    }, incidentId, sessionId));

    expect(result.success).toBe(true);

    const factors = db.select().from(schema.contributingFactors).where(eq(schema.contributingFactors.incidentId, incidentId)).all();
    expect(factors).toHaveLength(1);
    expect(factors[0].category).toBe("technical");
    expect(factors[0].isSystemic).toBe(false);
  });

  it("record_contributing_factor links to timeline events", () => {
    // Create a timeline event first
    const eventResult = JSON.parse(executeIncidentTool("record_timeline_event", {
      timestamp: "2024-03-15T14:30:00Z", description: "Pool exhausted", event_type: "detection",
    }, incidentId, sessionId));

    const factorResult = JSON.parse(executeIncidentTool("record_contributing_factor", {
      category: "technical",
      description: "Connection pool too small",
      related_event_ids: [eventResult.id],
    }, incidentId, sessionId));

    const links = db.select().from(schema.factorEventLinks).all();
    expect(links).toHaveLength(1);
    expect(links[0].factorId).toBe(factorResult.id);
    expect(links[0].eventId).toBe(eventResult.id);
  });
});

describe("incident tools - action items", () => {
  it("record_action_item creates action linked to incident", () => {
    const result = JSON.parse(executeIncidentTool("record_action_item", {
      title: "Implement connection pool auto-scaling",
      priority: "high",
      type: "technical",
      owner: "Jane",
      success_criteria: "Pool scales based on load metrics",
    }, incidentId, sessionId));

    expect(result.success).toBe(true);

    const items = db.select().from(schema.actionItems).where(eq(schema.actionItems.practiceId, incidentId)).all();
    expect(items).toHaveLength(1);
    expect(items[0].practiceType).toBe("incident");
    expect(items[0].title).toBe("Implement connection pool auto-scaling");
    expect(items[0].status).toBe("open");
  });
});

describe("incident tools - deduplication", () => {
  it("deduplicates timeline events with same timestamp + description", () => {
    const args = {
      timestamp: "2024-03-15T14:30:00Z",
      description: "First alert fired",
      event_type: "detection",
      actor: "PagerDuty",
    };

    const first = JSON.parse(executeIncidentTool("record_timeline_event", args, incidentId, sessionId));
    expect(first.success).toBe(true);
    expect(first.deduplicated).toBeUndefined();

    const second = JSON.parse(executeIncidentTool("record_timeline_event", args, incidentId, sessionId));
    expect(second.success).toBe(true);
    expect(second.deduplicated).toBe(true);
    expect(second.id).toBe(first.id);

    const events = db.select().from(schema.timelineEvents).where(eq(schema.timelineEvents.incidentId, incidentId)).all();
    expect(events).toHaveLength(1);
  });

  it("deduplicates contributing factors with same description", () => {
    const args = {
      category: "technical",
      description: "Connection pool sized for normal load, not peak",
      context: "Pool size was set 2 years ago",
      is_systemic: false,
    };

    const first = JSON.parse(executeIncidentTool("record_contributing_factor", args, incidentId, sessionId));
    expect(first.success).toBe(true);
    expect(first.deduplicated).toBeUndefined();

    const second = JSON.parse(executeIncidentTool("record_contributing_factor", args, incidentId, sessionId));
    expect(second.success).toBe(true);
    expect(second.deduplicated).toBe(true);
    expect(second.id).toBe(first.id);

    const factors = db.select().from(schema.contributingFactors).where(eq(schema.contributingFactors.incidentId, incidentId)).all();
    expect(factors).toHaveLength(1);
  });

  it("deduplicates action items with same title", () => {
    const args = {
      title: "Implement connection pool auto-scaling",
      priority: "high",
      type: "technical",
    };

    const first = JSON.parse(executeIncidentTool("record_action_item", args, incidentId, sessionId));
    expect(first.success).toBe(true);
    expect(first.deduplicated).toBeUndefined();

    const second = JSON.parse(executeIncidentTool("record_action_item", args, incidentId, sessionId));
    expect(second.success).toBe(true);
    expect(second.deduplicated).toBe(true);
    expect(second.id).toBe(first.id);

    const items = db.select().from(schema.actionItems).where(eq(schema.actionItems.practiceId, incidentId)).all();
    expect(items).toHaveLength(1);
  });

  it("deduplicates experiment suggestions with same title", () => {
    const args = {
      type: "chaos_experiment",
      title: "Test connection pool exhaustion recovery",
      hypothesis: "After fix, pool exhaustion triggers graceful degradation",
      rationale: "Incident caused by pool exhaustion",
      priority: "high",
      priority_reasoning: "Affected all payments",
    };

    const first = JSON.parse(executeIncidentTool("suggest_experiment", args, incidentId, sessionId));
    expect(first.success).toBe(true);
    expect(first.deduplicated).toBeUndefined();

    const second = JSON.parse(executeIncidentTool("suggest_experiment", args, incidentId, sessionId));
    expect(second.success).toBe(true);
    expect(second.deduplicated).toBe(true);
    expect(second.experimentId).toBe(first.experimentId);

    const experiments = db.select().from(schema.experimentSuggestions).all();
    expect(experiments).toHaveLength(1);
  });

  it("allows different titles for same incident", () => {
    executeIncidentTool("record_action_item", {
      title: "Action A", priority: "high", type: "technical",
    }, incidentId, sessionId);
    executeIncidentTool("record_action_item", {
      title: "Action B", priority: "medium", type: "process",
    }, incidentId, sessionId);

    const items = db.select().from(schema.actionItems).where(eq(schema.actionItems.practiceId, incidentId)).all();
    expect(items).toHaveLength(2);
  });
});

describe("incident tools - cross-practice suggestions", () => {
  it("suggest_cross_practice_action creates suggestion", () => {
    const result = JSON.parse(executeIncidentTool("suggest_cross_practice_action", {
      target_practice: "chaos_engineering",
      suggestion: "Inject connection pool exhaustion under load",
      rationale: "This incident revealed untested failure mode under peak traffic",
    }, incidentId, sessionId));

    expect(result.success).toBe(true);

    const suggestions = db.select().from(schema.crossPracticeSuggestions).all();
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].sourcePracticeType).toBe("incident");
    expect(suggestions[0].targetPracticeType).toBe("chaos_engineering");
    expect(suggestions[0].status).toBe("suggested");
  });
});

describe("incident tools - suggest_experiment", () => {
  it("creates experiment suggestion and auto-creates service from incident", () => {
    const result = JSON.parse(executeIncidentTool("suggest_experiment", {
      type: "chaos_experiment",
      title: "Test connection pool exhaustion recovery",
      hypothesis: "After fix, connection pool exhaustion triggers graceful degradation",
      rationale: "This incident was caused by connection pool exhaustion with no graceful handling",
      priority: "high",
      priority_reasoning: "Affected all payment processing, likely to recur under load",
      blast_radius_notes: "100% of payment transactions",
      section_id: sectionIds[2],
    }, incidentId, sessionId));

    expect(result.success).toBe(true);
    expect(result.type).toBe("chaos_experiment");

    // Verify service was auto-created from incident's serviceName
    const services = db.select().from(schema.services).all();
    expect(services.length).toBeGreaterThanOrEqual(1);
    const svc = services.find(s => s.name === "TestSvc");
    expect(svc).toBeTruthy();

    // Verify experiment links to the service
    const experiments = db.select().from(schema.experimentSuggestions).all();
    expect(experiments).toHaveLength(1);
    expect(experiments[0].serviceId).toBe(svc!.id);
    expect(experiments[0].sourcePracticeType).toBe("incident");
    expect(experiments[0].sourcePracticeId).toBe(incidentId);
  });

  it("reuses existing service when incident already linked", () => {
    const now = new Date().toISOString();

    // Pre-create service and link incident
    db.insert(schema.services).values({
      id: "existing-svc", name: "TestSvc", teamId: "test-team", createdAt: now, updatedAt: now,
    }).run();
    db.update(schema.incidents).set({ serviceId: "existing-svc" })
      .where(eq(schema.incidents.id, incidentId)).run();

    const result = JSON.parse(executeIncidentTool("suggest_experiment", {
      type: "load_test",
      title: "Load test at incident trigger level",
      hypothesis: "Service handles the load that triggered the incident",
      rationale: "Incident triggered at 1.5x normal load",
      priority: "medium",
      priority_reasoning: "Known trigger level",
    }, incidentId, sessionId));

    expect(result.success).toBe(true);

    const services = db.select().from(schema.services).all();
    expect(services).toHaveLength(1);

    const experiments = db.select().from(schema.experimentSuggestions).all();
    expect(experiments[0].serviceId).toBe("existing-svc");
  });
});

describe("incident tools - session", () => {
  it("write_session_summary updates session", () => {
    executeIncidentTool("write_session_summary", {
      summary: "Explored timeline and identified 3 contributing factors",
    }, incidentId, sessionId);

    const session = db.select().from(schema.sessions).where(eq(schema.sessions.id, sessionId)).get()!;
    expect(session.summary).toBe("Explored timeline and identified 3 contributing factors");
  });

  it("unknown tool returns error", () => {
    const result = JSON.parse(executeIncidentTool("nonexistent_tool", {}, incidentId, sessionId));
    expect(result.error).toContain("Unknown tool");
  });
});
