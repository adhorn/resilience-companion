import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";

const app = new Hono();
app.use("*", requireAuth);

// GET / — list dependencies for an ORR
app.get("/", (c) => {
  const orrId = c.req.param("orrId")!;
  const db = getDb();

  const deps = db
    .select()
    .from(schema.dependencies)
    .where(eq(schema.dependencies.orrId, orrId))
    .all();

  return c.json({ dependencies: deps });
});

// DELETE /:depId — remove a dependency
app.delete("/:depId", (c) => {
  const depId = c.req.param("depId")!;
  const db = getDb();

  db.delete(schema.dependencies)
    .where(eq(schema.dependencies.id, depId))
    .run();

  return c.json({ deleted: true });
});

export const dependencyRoutes = app;
