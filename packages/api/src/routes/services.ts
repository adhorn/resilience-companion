/**
 * Service Hub routes.
 * Services are the central entity connecting ORRs, incidents, and experiment suggestions.
 */
import { Hono } from "hono";
import { nanoid } from "nanoid";
import { eq, and, desc } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";

export const serviceRoutes = new Hono();
serviceRoutes.use("*", requireAuth);

/**
 * GET /api/v1/services
 * List services for the current user's team.
 */
serviceRoutes.get("/", (c) => {
  const user = c.get("user");
  const db = getDb();

  const services = db.select().from(schema.services)
    .where(eq(schema.services.teamId, user.teamId))
    .all();

  return c.json({ services });
});

/**
 * GET /api/v1/services/:id
 * Get a single service with its linked ORRs, incidents, and experiment suggestions.
 */
serviceRoutes.get("/:id", (c) => {
  const user = c.get("user");
  const db = getDb();

  const service = db.select().from(schema.services)
    .where(and(
      eq(schema.services.id, c.req.param("id")),
      eq(schema.services.teamId, user.teamId),
    ))
    .get();

  if (!service) {
    return c.json({ error: "not_found", message: "Service not found" }, 404);
  }

  const orrs = db.select().from(schema.orrs)
    .where(eq(schema.orrs.serviceId, service.id))
    .all();

  const incidents = db.select().from(schema.incidents)
    .where(eq(schema.incidents.serviceId, service.id))
    .all();

  const experiments = db.select().from(schema.experimentSuggestions)
    .where(eq(schema.experimentSuggestions.serviceId, service.id))
    .all();

  return c.json({
    service,
    orrs,
    incidents,
    experiments,
  });
});

/**
 * POST /api/v1/services
 * Create a new service explicitly (services are also auto-created by ORR/incident tools).
 */
serviceRoutes.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.json();
  const { name, description } = body;

  if (!name) {
    return c.json({ error: "validation", message: "name is required" }, 400);
  }

  const db = getDb();
  const now = new Date().toISOString();

  // Check for duplicate
  const existing = db.select().from(schema.services)
    .where(and(
      eq(schema.services.teamId, user.teamId),
      eq(schema.services.name, name),
    ))
    .get();

  if (existing) {
    return c.json({ error: "duplicate", message: "A service with this name already exists" }, 409);
  }

  const serviceId = nanoid();
  db.insert(schema.services).values({
    id: serviceId,
    name,
    teamId: user.teamId,
    description: description || null,
    createdAt: now,
    updatedAt: now,
  }).run();

  const service = db.select().from(schema.services)
    .where(eq(schema.services.id, serviceId)).get();

  return c.json({ service }, 201);
});

/**
 * PATCH /api/v1/services/:id
 * Update service metadata.
 */
serviceRoutes.patch("/:id", async (c) => {
  const user = c.get("user");
  const db = getDb();
  const body = await c.req.json();

  const service = db.select().from(schema.services)
    .where(and(
      eq(schema.services.id, c.req.param("id")),
      eq(schema.services.teamId, user.teamId),
    ))
    .get();

  if (!service) {
    return c.json({ error: "not_found", message: "Service not found" }, 404);
  }

  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;

  db.update(schema.services)
    .set(updates)
    .where(eq(schema.services.id, c.req.param("id")))
    .run();

  const updated = db.select().from(schema.services)
    .where(eq(schema.services.id, c.req.param("id"))).get();

  return c.json({ service: updated });
});

// --- Experiment Suggestions (nested under services) ---

/**
 * GET /api/v1/services/:id/experiments
 * List experiment suggestions for a service.
 */
serviceRoutes.get("/:id/experiments", (c) => {
  const user = c.get("user");
  const db = getDb();

  // Verify service belongs to team
  const service = db.select().from(schema.services)
    .where(and(
      eq(schema.services.id, c.req.param("id")),
      eq(schema.services.teamId, user.teamId),
    ))
    .get();

  if (!service) {
    return c.json({ error: "not_found", message: "Service not found" }, 404);
  }

  const experiments = db.select().from(schema.experimentSuggestions)
    .where(eq(schema.experimentSuggestions.serviceId, service.id))
    .all();

  return c.json({ experiments });
});

/**
 * PATCH /api/v1/services/:serviceId/experiments/:experimentId
 * Update experiment status (accept, schedule, complete, dismiss).
 */
serviceRoutes.patch("/:serviceId/experiments/:experimentId", async (c) => {
  const user = c.get("user");
  const db = getDb();
  const body = await c.req.json();

  // Verify service belongs to team
  const service = db.select().from(schema.services)
    .where(and(
      eq(schema.services.id, c.req.param("serviceId")),
      eq(schema.services.teamId, user.teamId),
    ))
    .get();

  if (!service) {
    return c.json({ error: "not_found", message: "Service not found" }, 404);
  }

  const experiment = db.select().from(schema.experimentSuggestions)
    .where(and(
      eq(schema.experimentSuggestions.id, c.req.param("experimentId")),
      eq(schema.experimentSuggestions.serviceId, service.id),
    ))
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
    .where(eq(schema.experimentSuggestions.id, c.req.param("experimentId")))
    .run();

  const updated = db.select().from(schema.experimentSuggestions)
    .where(eq(schema.experimentSuggestions.id, c.req.param("experimentId"))).get();

  return c.json({ experiment: updated });
});
