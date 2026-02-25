/**
 * Incident Section routes.
 * Mirrors the ORR sections pattern for incident-specific sections.
 */
import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";
import { updateSectionSchema, validateBody } from "../validation.js";

export const incidentSectionRoutes = new Hono();
incidentSectionRoutes.use("*", requireAuth);

/**
 * GET /api/v1/incidents/:incidentId/sections
 */
incidentSectionRoutes.get("/", (c) => {
  const user = c.get("user");
  const incidentId = c.req.param("incidentId")!;
  const db = getDb();

  const incident = db.select().from(schema.incidents)
    .where(and(eq(schema.incidents.id, incidentId), eq(schema.incidents.teamId, user.teamId)))
    .get();
  if (!incident) return c.json({ error: "not_found", message: "Incident not found" }, 404);

  const sections = db.select().from(schema.incidentSections)
    .where(eq(schema.incidentSections.incidentId, incidentId))
    .all();

  return c.json({ sections });
});

/**
 * PATCH /api/v1/incidents/:incidentId/sections/:sectionId
 * Update section content, prompts, or promptResponses. Last writer wins.
 */
incidentSectionRoutes.patch("/:sectionId", async (c) => {
  const user = c.get("user");
  const incidentId = c.req.param("incidentId")!;
  const sectionId = c.req.param("sectionId")!;
  const body = await c.req.json();
  const db = getDb();

  const incident = db.select().from(schema.incidents)
    .where(and(eq(schema.incidents.id, incidentId), eq(schema.incidents.teamId, user.teamId)))
    .get();
  if (!incident) return c.json({ error: "not_found", message: "Incident not found" }, 404);

  const section = db.select().from(schema.incidentSections)
    .where(and(eq(schema.incidentSections.id, sectionId), eq(schema.incidentSections.incidentId, incidentId)))
    .get();
  if (!section) return c.json({ error: "not_found", message: "Section not found" }, 404);

  const v = validateBody(updateSectionSchema, body);
  if (!v.success) return c.json({ error: "validation", message: v.error }, 400);
  const d = v.data;

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { updatedAt: now };

  if (d.content !== undefined) updates.content = d.content;
  if (d.prompts !== undefined) updates.prompts = JSON.stringify(d.prompts);
  if (d.promptResponses !== undefined) updates.promptResponses = d.promptResponses;

  db.update(schema.incidentSections)
    .set(updates)
    .where(eq(schema.incidentSections.id, sectionId))
    .run();

  // Bump incident updatedAt
  db.update(schema.incidents)
    .set({ updatedAt: now })
    .where(eq(schema.incidents.id, incidentId))
    .run();

  const updated = db.select().from(schema.incidentSections)
    .where(eq(schema.incidentSections.id, sectionId))
    .get();

  return c.json({ section: updated });
});
