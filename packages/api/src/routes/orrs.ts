import { Hono } from "hono";
import { nanoid } from "nanoid";
import { eq, and } from "drizzle-orm";
import type { TemplateSection } from "@orr/shared";
import { getDb, schema } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";

export const orrRoutes = new Hono();

// All ORR routes require auth
orrRoutes.use("*", requireAuth);

/**
 * GET /api/v1/orrs
 * List ORRs for the current user's team.
 */
orrRoutes.get("/", (c) => {
  const user = c.get("user");
  const db = getDb();

  const rows = db
    .select()
    .from(schema.orrs)
    .where(eq(schema.orrs.teamId, user.teamId))
    .all();

  return c.json({ orrs: rows });
});

/**
 * POST /api/v1/orrs
 * Create a new ORR with sections from template.
 */
orrRoutes.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.json();
  const { serviceName, templateId } = body;

  if (!serviceName) {
    return c.json({ error: "validation", message: "serviceName is required" }, 400);
  }

  const db = getDb();
  const now = new Date().toISOString();

  // Find template
  let template;
  if (templateId) {
    template = db
      .select()
      .from(schema.templates)
      .where(eq(schema.templates.id, templateId))
      .get();
  } else {
    template = db
      .select()
      .from(schema.templates)
      .where(eq(schema.templates.isDefault, true))
      .get();
  }

  if (!template) {
    return c.json({ error: "not_found", message: "Template not found" }, 404);
  }

  const orrId = nanoid();

  // Create ORR
  db.insert(schema.orrs)
    .values({
      id: orrId,
      serviceName,
      teamId: user.teamId,
      templateVersion: template.id,
      status: "DRAFT",
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    })
    .run();

  // Create sections from template
  const templateSections = (
    typeof template.sections === "string"
      ? JSON.parse(template.sections)
      : template.sections
  ) as TemplateSection[];

  for (const ts of templateSections) {
    db.insert(schema.sections)
      .values({
        id: nanoid(),
        orrId,
        position: ts.position,
        title: ts.title,
        prompts: JSON.stringify(ts.prompts),
        content: "",
        depth: "UNKNOWN",
        depthRationale: null,
        flags: JSON.stringify([]),
        conversationSnippet: null,
        updatedAt: now,
        updatedBy: null,
      })
      .run();
  }

  const orr = db
    .select()
    .from(schema.orrs)
    .where(eq(schema.orrs.id, orrId))
    .get();

  const secs = db
    .select()
    .from(schema.sections)
    .where(eq(schema.sections.orrId, orrId))
    .all();

  return c.json({ orr, sections: secs }, 201);
});

/**
 * GET /api/v1/orrs/:id
 * Get a single ORR with all sections.
 */
orrRoutes.get("/:id", (c) => {
  const user = c.get("user");
  const db = getDb();

  const orr = db
    .select()
    .from(schema.orrs)
    .where(
      and(eq(schema.orrs.id, c.req.param("id")), eq(schema.orrs.teamId, user.teamId)),
    )
    .get();

  if (!orr) {
    return c.json({ error: "not_found", message: "ORR not found" }, 404);
  }

  const secs = db
    .select()
    .from(schema.sections)
    .where(eq(schema.sections.orrId, orr.id))
    .all();

  return c.json({ orr, sections: secs });
});

/**
 * PATCH /api/v1/orrs/:id
 * Update ORR status.
 */
orrRoutes.patch("/:id", async (c) => {
  const user = c.get("user");
  const body = await c.req.json();
  const db = getDb();

  const orr = db
    .select()
    .from(schema.orrs)
    .where(
      and(eq(schema.orrs.id, c.req.param("id")), eq(schema.orrs.teamId, user.teamId)),
    )
    .get();

  if (!orr) {
    return c.json({ error: "not_found", message: "ORR not found" }, 404);
  }

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { updatedAt: now };

  if (body.status) {
    updates.status = body.status;
    if (body.status === "COMPLETE") {
      updates.completedAt = now;
    }
  }
  if (body.serviceName) {
    updates.serviceName = body.serviceName;
  }

  db.update(schema.orrs)
    .set(updates)
    .where(eq(schema.orrs.id, orr.id))
    .run();

  const updated = db
    .select()
    .from(schema.orrs)
    .where(eq(schema.orrs.id, orr.id))
    .get();

  return c.json({ orr: updated });
});

/**
 * DELETE /api/v1/orrs/:id
 * Delete an ORR and all its sections (cascade).
 */
orrRoutes.delete("/:id", (c) => {
  const user = c.get("user");
  const db = getDb();

  const orr = db
    .select()
    .from(schema.orrs)
    .where(
      and(eq(schema.orrs.id, c.req.param("id")), eq(schema.orrs.teamId, user.teamId)),
    )
    .get();

  if (!orr) {
    return c.json({ error: "not_found", message: "ORR not found" }, 404);
  }

  db.delete(schema.orrs).where(eq(schema.orrs.id, orr.id)).run();

  return c.json({ deleted: true });
});
