/**
 * Incident Analysis CRUD routes.
 * Mirrors the ORR routes pattern with incident-specific fields.
 */
import { Hono } from "hono";
import { nanoid } from "nanoid";
import { eq, and } from "drizzle-orm";
import { INCIDENT_TEMPLATE_SECTIONS } from "@orr/shared";
import { getDb, schema } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";
import { createIncidentSchema, updateIncidentSchema, validateBody } from "../validation.js";

export const incidentRoutes = new Hono();
incidentRoutes.use("*", requireAuth);

/**
 * GET /api/v1/incidents
 * List incidents for the current user's team.
 */
incidentRoutes.get("/", (c) => {
  const user = c.get("user");
  const db = getDb();

  const rows = db.select().from(schema.incidents)
    .where(eq(schema.incidents.teamId, user.teamId))
    .all();

  return c.json({ incidents: rows });
});

/**
 * POST /api/v1/incidents
 * Create a new incident analysis with sections from the incident template.
 */
incidentRoutes.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.json();
  const v = validateBody(createIncidentSchema, body);
  if (!v.success) return c.json({ error: "validation", message: v.error }, 400);
  const { title, serviceName, incidentDate, severity, incidentType } = v.data;

  const db = getDb();
  const now = new Date().toISOString();
  const incidentId = nanoid();

  // Create incident
  db.insert(schema.incidents).values({
    id: incidentId,
    title,
    teamId: user.teamId,
    serviceName: serviceName ?? null,
    incidentDate: incidentDate ?? null,
    severity: (severity as any) ?? null,
    incidentType: (incidentType as any) ?? null,
    steeringTier: "thorough",
    status: "DRAFT",
    createdBy: user.sub as string,
    createdAt: now,
    updatedAt: now,
  }).run();

  // Create sections from template
  for (const templateSection of INCIDENT_TEMPLATE_SECTIONS) {
    db.insert(schema.incidentSections).values({
      id: nanoid(),
      incidentId,
      position: templateSection.position,
      title: templateSection.title,
      prompts: templateSection.prompts as any,
      content: "",
      depth: "UNKNOWN",
      promptResponses: {} as any,
      flags: [] as any,
      updatedAt: now,
    }).run();
  }

  // Update status to IN_PROGRESS
  db.update(schema.incidents)
    .set({ status: "IN_PROGRESS", updatedAt: now })
    .where(eq(schema.incidents.id, incidentId))
    .run();

  const incident = db.select().from(schema.incidents)
    .where(eq(schema.incidents.id, incidentId)).get();

  return c.json({ incident }, 201);
});

/**
 * GET /api/v1/incidents/:id
 * Get a single incident with its sections.
 */
incidentRoutes.get("/:id", (c) => {
  const user = c.get("user");
  const db = getDb();

  const incident = db.select().from(schema.incidents)
    .where(and(
      eq(schema.incidents.id, c.req.param("id")),
      eq(schema.incidents.teamId, user.teamId),
    ))
    .get();

  if (!incident) {
    return c.json({ error: "not_found", message: "Incident not found" }, 404);
  }

  const sections = db.select().from(schema.incidentSections)
    .where(eq(schema.incidentSections.incidentId, incident.id))
    .all();

  const timelineEvents = db.select().from(schema.timelineEvents)
    .where(eq(schema.timelineEvents.incidentId, incident.id))
    .all();

  const contributingFactors = db.select().from(schema.contributingFactors)
    .where(eq(schema.contributingFactors.incidentId, incident.id))
    .all();

  const actionItems = db.select().from(schema.actionItems)
    .where(eq(schema.actionItems.practiceId, incident.id))
    .all()
    .filter((a) => a.practiceType === "incident");

  const suggestions = db.select().from(schema.crossPracticeSuggestions)
    .where(eq(schema.crossPracticeSuggestions.sourcePracticeId, incident.id))
    .all()
    .filter((s) => s.sourcePracticeType === "incident");

  return c.json({
    incident,
    sections: sections.sort((a, b) => a.position - b.position),
    timelineEvents: timelineEvents.sort((a, b) => a.position - b.position),
    contributingFactors,
    actionItems,
    suggestions,
  });
});

/**
 * PATCH /api/v1/incidents/:id
 * Update incident metadata (title, severity, status, etc.)
 */
incidentRoutes.patch("/:id", async (c) => {
  const user = c.get("user");
  const db = getDb();
  const body = await c.req.json();
  const v = validateBody(updateIncidentSchema, body);
  if (!v.success) return c.json({ error: "validation", message: v.error }, 400);
  const d = v.data;

  const incident = db.select().from(schema.incidents)
    .where(and(
      eq(schema.incidents.id, c.req.param("id")),
      eq(schema.incidents.teamId, user.teamId),
    ))
    .get();

  if (!incident) {
    return c.json({ error: "not_found", message: "Incident not found" }, 404);
  }

  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (d.title !== undefined) updates.title = d.title;
  if (d.serviceName !== undefined) updates.serviceName = d.serviceName;
  if (d.incidentDate !== undefined) updates.incidentDate = d.incidentDate;
  if (d.severity !== undefined) updates.severity = d.severity;
  if (d.incidentType !== undefined) updates.incidentType = d.incidentType;
  if (d.status !== undefined) {
    updates.status = d.status;
    if (d.status === "PUBLISHED") updates.publishedAt = new Date().toISOString();
  }
  if (d.steeringTier !== undefined) updates.steeringTier = d.steeringTier;

  db.update(schema.incidents)
    .set(updates)
    .where(eq(schema.incidents.id, c.req.param("id")))
    .run();

  const updated = db.select().from(schema.incidents)
    .where(eq(schema.incidents.id, c.req.param("id"))).get();

  return c.json({ incident: updated });
});

/**
 * DELETE /api/v1/incidents/:id
 * Delete an incident and cascade sections, events, factors.
 */
incidentRoutes.delete("/:id", (c) => {
  const user = c.get("user");
  const db = getDb();

  const incident = db.select().from(schema.incidents)
    .where(and(
      eq(schema.incidents.id, c.req.param("id")),
      eq(schema.incidents.teamId, user.teamId),
    ))
    .get();

  if (!incident) {
    return c.json({ error: "not_found", message: "Incident not found" }, 404);
  }

  db.delete(schema.incidents).where(eq(schema.incidents.id, c.req.param("id"))).run();
  return c.json({ success: true });
});
