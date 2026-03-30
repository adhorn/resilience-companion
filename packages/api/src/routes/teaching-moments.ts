import { Hono } from "hono";
import { eq, like, or } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";
import { safeJsonParse } from "../validation.js";

export const teachingMomentRoutes = new Hono();

teachingMomentRoutes.use("*", requireAuth);

/**
 * GET /api/v1/teaching-moments
 * Browse teaching moments. Supports search and filtering.
 * Query params: q (search), source (ORG|PUBLIC), sectionTag
 */
teachingMomentRoutes.get("/", (c) => {
  const db = getDb();
  const q = c.req.query("q");
  const source = c.req.query("source");
  const sectionTag = c.req.query("sectionTag");

  let query = db.select().from(schema.teachingMoments).$dynamic();

  // Only show published teaching moments
  query = query.where(eq(schema.teachingMoments.status, "PUBLISHED"));

  const rows = query.all();

  // Apply filters in JS (simpler than building complex SQL for MVP)
  let results = rows;

  if (q) {
    const lower = q.toLowerCase();
    results = results.filter(
      (tm) =>
        tm.title.toLowerCase().includes(lower) ||
        tm.content.toLowerCase().includes(lower),
    );
  }

  if (source) {
    results = results.filter((tm) => tm.source === source);
  }

  if (sectionTag) {
    results = results.filter((tm) => {
      const tags: string[] = safeJsonParse(tm.sectionTags, []);
      return tags.includes(sectionTag);
    });
  }

  return c.json({ teachingMoments: results });
});

/**
 * GET /api/v1/teaching-moments/:id
 */
teachingMomentRoutes.get("/:id", (c) => {
  const db = getDb();
  const tm = db
    .select()
    .from(schema.teachingMoments)
    .where(eq(schema.teachingMoments.id, c.req.param("id")))
    .get();

  if (!tm) {
    return c.json({ error: "not_found", message: "Teaching moment not found" }, 404);
  }

  return c.json({ teachingMoment: tm });
});
