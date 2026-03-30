import { Hono } from "hono";
import { nanoid } from "nanoid";
import { eq, and } from "drizzle-orm";
import type { TemplateSection, ChangeType } from "@orr/shared";
import { generateFeatureTemplate, FEATURE_TEMPLATE_NAME } from "@orr/shared";
import { getDb, schema } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";
import { validateGitUrl, ensureRepo, encryptToken, decryptToken } from "../git.js";
import { createOrrSchema, updateOrrSchema, terminateOrrSchema, validateBody, safeJsonParse } from "../validation.js";

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

  // Never send encrypted tokens to the client
  const sanitized = rows.map(({ repositoryToken, repositoryLocalPath, ...rest }) => ({
    ...rest,
    hasRepositoryToken: !!repositoryToken,
  }));

  return c.json({ orrs: sanitized });
});

/**
 * POST /api/v1/orrs
 * Create a new ORR with sections from template.
 */
orrRoutes.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.json();
  const v = validateBody(createOrrSchema, body);
  if (!v.success) return c.json({ error: "validation", message: v.error }, 400);
  const { serviceName, templateId, repositoryUrl, repositoryToken, orrType, parentOrrId, changeTypes, changeDescription, selectedSections } = v.data;

  // Feature ORR validation
  if (orrType === "feature" && !changeDescription) {
    return c.json({ error: "validation", message: "Change description is required for feature ORRs" }, 400);
  }

  // Validate git URL if provided
  let encryptedToken: string | null = null;
  let localPath: string | null = null;

  if (repositoryUrl) {
    const validation = validateGitUrl(repositoryUrl);
    if (!validation.valid) {
      return c.json({ error: "validation", message: validation.error }, 400);
    }

    // Encrypt token if provided
    if (repositoryToken) {
      encryptedToken = encryptToken(repositoryToken);
    }

    // Clone the repo
    const result = ensureRepo(repositoryUrl, repositoryToken || undefined);
    if ("error" in result) {
      return c.json({ error: "clone_failed", message: result.error }, 400);
    }
    localPath = result.localPath;
  }

  const db = getDb();
  const now = new Date().toISOString();

  // Validate parent ORR if provided
  if (parentOrrId) {
    const parentOrr = db.select().from(schema.orrs)
      .where(and(eq(schema.orrs.id, parentOrrId), eq(schema.orrs.teamId, user.teamId)))
      .get();
    if (!parentOrr) {
      return c.json({ error: "not_found", message: "Parent ORR not found" }, 404);
    }
  }

  // Find template
  let template;
  if (orrType === "feature") {
    // Feature ORRs use the placeholder template
    template = db.select().from(schema.templates)
      .where(eq(schema.templates.name, FEATURE_TEMPLATE_NAME))
      .get();
  } else if (templateId) {
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
      repositoryPath: repositoryUrl || null,
      repositoryToken: encryptedToken,
      repositoryLocalPath: localPath,
      orrType: orrType || "service",
      parentOrrId: parentOrrId || null,
      changeTypes: JSON.stringify(changeTypes || []),
      changeDescription: changeDescription || null,
      status: "DRAFT",
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    })
    .run();

  // Generate sections
  let templateSections: TemplateSection[];

  if (orrType === "feature") {
    if (selectedSections && selectedSections.length > 0) {
      // User customized questions in the wizard
      templateSections = selectedSections.map((s, i) => ({
        position: i + 1,
        title: s.title,
        prompts: s.prompts,
      }));
    } else {
      // Generate from change types
      const parentSections = parentOrrId
        ? db.select().from(schema.sections)
            .where(eq(schema.sections.orrId, parentOrrId))
            .all()
            .map((s) => ({ title: s.title, hasContent: !!s.content?.trim() }))
        : undefined;
      templateSections = generateFeatureTemplate(
        (changeTypes || []) as ChangeType[],
        parentSections,
      );
    }
  } else {
    templateSections = safeJsonParse<TemplateSection[]>(template.sections, []);
  }

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

  const createdOrr = db
    .select()
    .from(schema.orrs)
    .where(eq(schema.orrs.id, orrId))
    .get();

  const secs = db
    .select()
    .from(schema.sections)
    .where(eq(schema.sections.orrId, orrId))
    .all();

  const { repositoryToken: _rt, repositoryLocalPath: _rl, ...safeCreated } = createdOrr!;
  return c.json({ orr: { ...safeCreated, hasRepositoryToken: !!_rt }, sections: secs }, 201);
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

  // Strip sensitive fields
  const { repositoryToken, repositoryLocalPath, ...safeOrr } = orr;

  // For feature ORRs, include parent ORR summary
  let parentOrr = null;
  if (orr.parentOrrId) {
    const parent = db.select().from(schema.orrs).where(eq(schema.orrs.id, orr.parentOrrId)).get();
    if (parent) {
      const parentSecs = db.select().from(schema.sections)
        .where(eq(schema.sections.orrId, parent.id)).all();
      parentOrr = {
        id: parent.id,
        serviceName: parent.serviceName,
        status: parent.status,
        sections: parentSecs.map((s) => ({
          id: s.id,
          title: s.title,
          depth: s.depth,
          hasContent: !!s.content?.trim(),
        })),
      };
    }
  }

  return c.json({ orr: { ...safeOrr, hasRepositoryToken: !!repositoryToken }, sections: secs, parentOrr });
});

/**
 * PATCH /api/v1/orrs/:id
 * Update ORR status.
 */
orrRoutes.patch("/:id", async (c) => {
  const user = c.get("user");
  const body = await c.req.json();
  const v = validateBody(updateOrrSchema, body);
  if (!v.success) return c.json({ error: "validation", message: v.error }, 400);
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
  const d = v.data;

  if (d.status) {
    updates.status = d.status;
    if (d.status === "COMPLETE") {
      updates.completedAt = now;
    }
  }
  if (d.serviceName) {
    updates.serviceName = d.serviceName;
  }
  if (d.steeringTier) {
    updates.steeringTier = d.steeringTier;
  }
  if (d.repositoryUrl !== undefined) {
    if (d.repositoryUrl) {
      const validation = validateGitUrl(d.repositoryUrl);
      if (!validation.valid) {
        return c.json({ error: "validation", message: validation.error }, 400);
      }

      // Decrypt existing token if no new one provided
      let token: string | undefined = d.repositoryToken;
      if (!token && orr.repositoryToken) {
        token = decryptToken(orr.repositoryToken) ?? undefined;
      }

      if (d.repositoryToken) {
        updates.repositoryToken = encryptToken(d.repositoryToken);
      }

      const result = ensureRepo(d.repositoryUrl, token || undefined);
      if ("error" in result) {
        return c.json({ error: "clone_failed", message: result.error }, 400);
      }

      updates.repositoryPath = d.repositoryUrl;
      updates.repositoryLocalPath = result.localPath;
    } else {
      updates.repositoryPath = null;
      updates.repositoryToken = null;
      updates.repositoryLocalPath = null;
    }
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

  const { repositoryToken: _t, repositoryLocalPath: _l, ...safeUpdated } = updated!;

  return c.json({ orr: { ...safeUpdated, hasRepositoryToken: !!_t } });
});

/**
 * POST /api/v1/orrs/:id/terminate
 * Terminate an ORR early with a required reason.
 * Can terminate from any non-terminal status (DRAFT, IN_PROGRESS).
 */
orrRoutes.post("/:id/terminate", async (c) => {
  const user = c.get("user");
  const body = await c.req.json();
  const v = validateBody(terminateOrrSchema, body);
  if (!v.success) return c.json({ error: "validation", message: v.error }, 400);
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

  if (orr.status === "COMPLETE" || orr.status === "TERMINATED" || orr.status === "ARCHIVED") {
    return c.json({
      error: "invalid_status",
      message: `Cannot terminate an ORR with status ${orr.status}`,
    }, 400);
  }

  const now = new Date().toISOString();
  db.update(schema.orrs)
    .set({
      status: "TERMINATED",
      terminationReason: v.data.reason,
      updatedAt: now,
    })
    .where(eq(schema.orrs.id, orr.id))
    .run();

  const updated = db
    .select()
    .from(schema.orrs)
    .where(eq(schema.orrs.id, orr.id))
    .get();

  const { repositoryToken: _t, repositoryLocalPath: _l, ...safeUpdated } = updated!;

  return c.json({ orr: { ...safeUpdated, hasRepositoryToken: !!_t } });
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
