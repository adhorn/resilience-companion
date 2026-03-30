import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";
import { updateSectionSchema, updateFlagSchema, validateBody, safeJsonParse } from "../validation.js";

export const sectionRoutes = new Hono();

sectionRoutes.use("*", requireAuth);

/**
 * GET /api/v1/orrs/:orrId/sections
 * List all sections for an ORR.
 */
sectionRoutes.get("/", (c) => {
  const user = c.get("user");
  const orrId = c.req.param("orrId")!;
  const db = getDb();

  // Verify ORR belongs to user's team
  const orr = db
    .select()
    .from(schema.orrs)
    .where(and(eq(schema.orrs.id, orrId), eq(schema.orrs.teamId, user.teamId)))
    .get();

  if (!orr) {
    return c.json({ error: "not_found", message: "ORR not found" }, 404);
  }

  const secs = db
    .select()
    .from(schema.sections)
    .where(eq(schema.sections.orrId, orrId))
    .all();

  return c.json({ sections: secs });
});

/**
 * GET /api/v1/orrs/:orrId/sections/:sectionId
 * Get a single section.
 */
sectionRoutes.get("/:sectionId", (c) => {
  const user = c.get("user");
  const orrId = c.req.param("orrId")!;
  const sectionId = c.req.param("sectionId")!;
  const db = getDb();

  const orr = db
    .select()
    .from(schema.orrs)
    .where(and(eq(schema.orrs.id, orrId), eq(schema.orrs.teamId, user.teamId)))
    .get();

  if (!orr) {
    return c.json({ error: "not_found", message: "ORR not found" }, 404);
  }

  const section = db
    .select()
    .from(schema.sections)
    .where(
      and(eq(schema.sections.id, sectionId), eq(schema.sections.orrId, orrId)),
    )
    .get();

  if (!section) {
    return c.json({ error: "not_found", message: "Section not found" }, 404);
  }

  return c.json({ section });
});

/**
 * PATCH /api/v1/orrs/:orrId/sections/:sectionId
 * Update section content and/or prompts. Last writer wins.
 */
sectionRoutes.patch("/:sectionId", async (c) => {
  const user = c.get("user");
  const orrId = c.req.param("orrId")!;
  const sectionId = c.req.param("sectionId")!;
  const body = await c.req.json();
  const db = getDb();

  const orr = db
    .select()
    .from(schema.orrs)
    .where(and(eq(schema.orrs.id, orrId), eq(schema.orrs.teamId, user.teamId)))
    .get();

  if (!orr) {
    return c.json({ error: "not_found", message: "ORR not found" }, 404);
  }

  const section = db
    .select()
    .from(schema.sections)
    .where(
      and(eq(schema.sections.id, sectionId), eq(schema.sections.orrId, orrId)),
    )
    .get();

  if (!section) {
    return c.json({ error: "not_found", message: "Section not found" }, 404);
  }

  const v = validateBody(updateSectionSchema, body);
  if (!v.success) return c.json({ error: "validation", message: v.error }, 400);
  const d = v.data;

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = {
    updatedAt: now,
    updatedBy: user.sub,
  };

  if (d.content !== undefined) updates.content = d.content;
  if (d.prompts !== undefined) updates.prompts = JSON.stringify(d.prompts);
  if (d.promptResponses !== undefined) updates.promptResponses = d.promptResponses;

  db.update(schema.sections)
    .set(updates)
    .where(eq(schema.sections.id, sectionId))
    .run();

  // Also bump ORR's updatedAt
  db.update(schema.orrs)
    .set({ updatedAt: now })
    .where(eq(schema.orrs.id, orrId))
    .run();

  const updated = db
    .select()
    .from(schema.sections)
    .where(eq(schema.sections.id, sectionId))
    .get();

  return c.json({ section: updated });
});

/**
 * PATCH /api/v1/orrs/:orrId/sections/:sectionId/flags/:flagIndex
 * Update a flag's status: accept or resolve.
 * Body: { status: "ACCEPTED" | "RESOLVED", resolution: "reason text" }
 */
sectionRoutes.patch("/:sectionId/flags/:flagIndex", async (c) => {
  const user = c.get("user");
  const orrId = c.req.param("orrId")!;
  const sectionId = c.req.param("sectionId")!;
  const flagIndex = parseInt(c.req.param("flagIndex")!, 10);
  const body = await c.req.json();
  const db = getDb();

  const orr = db
    .select()
    .from(schema.orrs)
    .where(and(eq(schema.orrs.id, orrId), eq(schema.orrs.teamId, user.teamId)))
    .get();

  if (!orr) {
    return c.json({ error: "not_found", message: "ORR not found" }, 404);
  }

  const section = db
    .select()
    .from(schema.sections)
    .where(
      and(eq(schema.sections.id, sectionId), eq(schema.sections.orrId, orrId)),
    )
    .get();

  if (!section) {
    return c.json({ error: "not_found", message: "Section not found" }, 404);
  }

  const fv = validateBody(updateFlagSchema, body);
  if (!fv.success) return c.json({ error: "validation", message: fv.error }, 400);

  const flags: any[] = safeJsonParse(section.flags, []);

  if (flagIndex < 0 || flagIndex >= flags.length) {
    return c.json({ error: "not_found", message: "Flag not found" }, 404);
  }

  const newStatus = fv.data.status;

  const now = new Date().toISOString();
  flags[flagIndex] = {
    ...flags[flagIndex],
    status: newStatus,
    resolution: newStatus === "OPEN" ? undefined : (fv.data.resolution || flags[flagIndex].resolution),
    resolvedAt: newStatus === "OPEN" ? undefined : now,
    resolvedBy: newStatus === "OPEN" ? undefined : user.sub,
  };

  db.update(schema.sections)
    .set({ flags: JSON.stringify(flags), updatedAt: now })
    .where(eq(schema.sections.id, sectionId))
    .run();

  return c.json({ flag: flags[flagIndex], flags });
});
