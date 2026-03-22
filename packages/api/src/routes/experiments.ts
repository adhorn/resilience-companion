/**
 * Experiment suggestion routes.
 * Provides access to experiments by source practice (ORR or incident).
 */
import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";

export const experimentRoutes = new Hono();
experimentRoutes.use("*", requireAuth);

/**
 * GET /api/v1/experiments?practiceType=orr&practiceId=xxx
 * List experiment suggestions for a specific practice instance.
 */
experimentRoutes.get("/", (c) => {
  const practiceType = c.req.query("practiceType");
  const practiceId = c.req.query("practiceId");

  if (!practiceType || !practiceId) {
    return c.json({ error: "validation", message: "practiceType and practiceId are required" }, 400);
  }

  const db = getDb();
  const experiments = db.select().from(schema.experimentSuggestions)
    .where(and(
      eq(schema.experimentSuggestions.sourcePracticeType, practiceType as "orr" | "incident"),
      eq(schema.experimentSuggestions.sourcePracticeId, practiceId),
    ))
    .all();

  return c.json({ experiments });
});

/**
 * PATCH /api/v1/experiments/:id
 * Update experiment status.
 */
experimentRoutes.patch("/:id", async (c) => {
  const db = getDb();
  const body = await c.req.json();

  const experiment = db.select().from(schema.experimentSuggestions)
    .where(eq(schema.experimentSuggestions.id, c.req.param("id")))
    .get();

  if (!experiment) {
    return c.json({ error: "not_found", message: "Experiment not found" }, 404);
  }

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { updatedAt: now };

  if (body.status !== undefined) {
    updates.status = body.status;
    if (body.status === "completed") {
      updates.completedAt = now;
    }
  }
  if (body.completedNotes !== undefined) updates.completedNotes = body.completedNotes;
  if (body.dismissedReason !== undefined) updates.dismissedReason = body.dismissedReason;

  db.update(schema.experimentSuggestions)
    .set(updates)
    .where(eq(schema.experimentSuggestions.id, c.req.param("id")))
    .run();

  const updated = db.select().from(schema.experimentSuggestions)
    .where(eq(schema.experimentSuggestions.id, c.req.param("id"))).get();

  return c.json({ experiment: updated });
});
