/**
 * Test helpers for Resilience Companion API tests.
 * Sets up an in-memory SQLite DB with migrations and minimal seed data.
 */
import { createTestDb, setTestDb, type Db } from "./db/connection.js";
import { migrate } from "./db/migrate.js";
import * as schema from "./db/schema.js";

/**
 * Create a fresh in-memory test DB with migrations applied.
 * Injects it as the singleton so getDb() returns it.
 */
export function setupTestDb(): Db {
  const db = createTestDb();
  migrate(db);
  setTestDb(db);
  return db;
}

/**
 * Seed a minimal ORR with team, user, template, ORR, and 3 sections.
 * Returns all IDs needed for tool tests.
 */
export function seedTestOrr(db: Db) {
  const now = new Date().toISOString();
  const teamId = "test-team";
  const userId = "test-user";
  const templateId = "test-template";
  const orrId = "test-orr";
  const sectionIds = ["sec-1", "sec-2", "sec-3"];

  // Team
  db.insert(schema.teams).values({ id: teamId, name: "Test Team", createdAt: now }).run();

  // User
  db.insert(schema.users).values({
    id: userId,
    name: "Test User",
    email: "test@test.com",
    passwordHash: "n/a",
    teamId,
    role: "ADMIN",
    authProvider: "local",
    createdAt: now,
  }).run();

  // Template
  db.insert(schema.templates).values({
    id: templateId,
    name: "Test Template",
    isDefault: true,
    sections: [
      { title: "Architecture", prompts: ["What is the architecture?", "What are the dependencies?"] },
      { title: "Monitoring", prompts: ["How do you monitor?"] },
      { title: "Testing", prompts: ["How do you test?", "What is your test coverage?", "Do you do chaos testing?"] },
    ] as any,
    createdAt: now,
  }).run();

  // ORR
  db.insert(schema.orrs).values({
    id: orrId,
    serviceName: "Test Service",
    teamId,
    templateVersion: templateId,
    status: "IN_PROGRESS",
    steeringTier: "thorough",
    createdAt: now,
    updatedAt: now,
  }).run();

  // Sections
  const sectionData = [
    { id: sectionIds[0], title: "Architecture", prompts: ["What is the architecture?", "What are the dependencies?"], position: 0 },
    { id: sectionIds[1], title: "Monitoring", prompts: ["How do you monitor?"], position: 1 },
    { id: sectionIds[2], title: "Testing", prompts: ["How do you test?", "What is your test coverage?", "Do you do chaos testing?"], position: 2 },
  ];

  for (const s of sectionData) {
    db.insert(schema.sections).values({
      id: s.id,
      orrId,
      position: s.position,
      title: s.title,
      prompts: s.prompts as any,
      content: "",
      depth: "UNKNOWN",
      promptResponses: {} as any,
      flags: [] as any,
      updatedAt: now,
    }).run();
  }

  return { teamId, userId, templateId, orrId, sectionIds };
}

/**
 * Seed a feature ORR linked to an existing parent ORR.
 * Requires seedTestOrr() to have run first.
 */
export function seedTestFeatureOrr(db: Db, parentOrrId: string) {
  const now = new Date().toISOString();
  const featureOrrId = "test-feature-orr";
  const featureSectionIds = ["fsec-1", "fsec-2"];

  const featureTemplateId = "test-feature-template";
  db.insert(schema.templates).values({
    id: featureTemplateId,
    name: "Feature ORR Template",
    isDefault: false,
    sections: [] as any,
    createdAt: now,
  }).run();

  db.insert(schema.orrs).values({
    id: featureOrrId,
    serviceName: "Test Service",
    teamId: "test-team",
    templateVersion: featureTemplateId,
    status: "DRAFT",
    steeringTier: "thorough",
    orrType: "feature",
    parentOrrId,
    changeTypes: JSON.stringify(["new_dependency", "new_endpoint"]),
    changeDescription: "Adding Redis cache and new /sessions endpoint",
    createdAt: now,
    updatedAt: now,
  }).run();

  const sectionData = [
    { id: featureSectionIds[0], title: "Dependency Readiness", prompts: ["Describe the dependency"], position: 1 },
    { id: featureSectionIds[1], title: "General Readiness", prompts: ["Rollback plan?"], position: 2 },
  ];

  for (const s of sectionData) {
    db.insert(schema.sections).values({
      id: s.id,
      orrId: featureOrrId,
      position: s.position,
      title: s.title,
      prompts: s.prompts as any,
      content: "",
      depth: "UNKNOWN",
      promptResponses: {} as any,
      flags: [] as any,
      updatedAt: now,
    }).run();
  }

  return { featureOrrId, featureSectionIds, featureTemplateId };
}

/**
 * Seed a minimal incident with team, user, incident, and 3 sections.
 * Returns all IDs needed for incident tool tests.
 */
export function seedTestIncident(db: Db) {
  const now = new Date().toISOString();
  const teamId = "test-team";
  const userId = "test-user";
  const incidentId = "test-incident";
  const sectionIds = ["isec-1", "isec-2", "isec-3"];

  // Team + User (skip if already seeded)
  const existingTeam = db.select().from(schema.teams).all();
  if (existingTeam.length === 0) {
    db.insert(schema.teams).values({ id: teamId, name: "Test Team", createdAt: now }).run();
    db.insert(schema.users).values({
      id: userId, name: "Test User", email: "test@test.com",
      passwordHash: "n/a", teamId, role: "ADMIN", authProvider: "local", createdAt: now,
    }).run();
  }

  db.insert(schema.incidents).values({
    id: incidentId, title: "DB Connection Exhaustion", teamId,
    serviceName: "Payment Service", severity: "HIGH",
    incidentType: "DEGRADATION", incidentDate: "2024-03-15T14:30:00Z",
    steeringTier: "thorough", status: "IN_PROGRESS", createdBy: userId,
    createdAt: now, updatedAt: now,
  }).run();

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

  return { teamId, userId, incidentId, sectionIds };
}

/**
 * Seed an active session for the given practice and user.
 */
export function seedTestSession(db: Db, orrId: string, userId: string) {
  const sessionId = "test-session";
  db.insert(schema.sessions).values({
    id: sessionId,
    orrId,
    userId,
    agentProfile: "REVIEW_FACILITATOR",
    status: "ACTIVE",
    tokenUsage: 0,
    sectionsDiscussed: [] as any,
    startedAt: new Date().toISOString(),
  }).run();
  return sessionId;
}
