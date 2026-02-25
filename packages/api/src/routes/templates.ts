import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";

export const templateRoutes = new Hono();

templateRoutes.use("*", requireAuth);

/**
 * GET /api/v1/templates
 * List all templates.
 */
templateRoutes.get("/", (c) => {
  const db = getDb();
  const rows = db.select().from(schema.templates).all();
  return c.json({ templates: rows });
});

/**
 * GET /api/v1/templates/:id
 * Get a single template with its sections.
 */
templateRoutes.get("/:id", (c) => {
  const db = getDb();
  const template = db
    .select()
    .from(schema.templates)
    .where(eq(schema.templates.id, c.req.param("id")))
    .get();

  if (!template) {
    return c.json({ error: "not_found", message: "Template not found" }, 404);
  }

  return c.json({ template });
});
