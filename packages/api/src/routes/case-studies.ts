import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";
import { safeJsonParse } from "../validation.js";

export const caseStudyRoutes = new Hono();

caseStudyRoutes.use("*", requireAuth);

/**
 * GET /api/v1/case-studies
 * Browse case studies. Supports search and filtering.
 * Query params: q (search), failureCategory, sectionTag
 */
caseStudyRoutes.get("/", (c) => {
  const db = getDb();
  const q = c.req.query("q");
  const failureCategory = c.req.query("failureCategory");
  const sectionTag = c.req.query("sectionTag");

  const rows = db.select().from(schema.caseStudies).all();

  let results = rows;

  if (q) {
    const lower = q.toLowerCase();
    results = results.filter(
      (cs) =>
        cs.title.toLowerCase().includes(lower) ||
        cs.summary.toLowerCase().includes(lower) ||
        cs.company.toLowerCase().includes(lower),
    );
  }

  if (failureCategory) {
    const lower = failureCategory.toLowerCase();
    results = results.filter((cs) =>
      cs.failureCategory.toLowerCase().includes(lower),
    );
  }

  if (sectionTag) {
    results = results.filter((cs) => {
      const tags: string[] = safeJsonParse(cs.sectionTags, []);
      return tags.includes(sectionTag);
    });
  }

  return c.json({ caseStudies: results });
});

/**
 * GET /api/v1/case-studies/:id
 */
caseStudyRoutes.get("/:id", (c) => {
  const db = getDb();
  const cs = db
    .select()
    .from(schema.caseStudies)
    .where(eq(schema.caseStudies.id, c.req.param("id")))
    .get();

  if (!cs) {
    return c.json({ error: "not_found", message: "Case study not found" }, 404);
  }

  return c.json({ caseStudy: cs });
});
