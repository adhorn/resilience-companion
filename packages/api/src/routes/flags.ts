import { Hono } from "hono";
import { eq, inArray, notInArray, and } from "drizzle-orm";
import type { SectionFlag, RiskSeverity, FlagWithContext, FlagsSummary, ORRStatus } from "@orr/shared";
import { getDb, schema } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";
import { safeJsonParse } from "../validation.js";

export const flagsRoutes = new Hono();

flagsRoutes.use("*", requireAuth);

/**
 * GET /api/v1/flags
 * Aggregate all flags across team ORRs.
 * Query params filter the flags array (summary is always unfiltered).
 */
flagsRoutes.get("/", (c) => {
  const user = c.get("user");
  const db = getDb();

  // Get active ORRs for team (exclude terminated/archived)
  const orrs = db
    .select()
    .from(schema.orrs)
    .where(and(
      eq(schema.orrs.teamId, user.teamId),
      notInArray(schema.orrs.status, ["TERMINATED", "ARCHIVED"]),
    ))
    .all();

  if (orrs.length === 0) {
    return c.json({
      summary: {
        total: 0,
        byType: { RISK: 0, GAP: 0, STRENGTH: 0, FOLLOW_UP: 0 },
        bySeverity: { HIGH: 0, MEDIUM: 0, LOW: 0 },
        overdueCount: 0,
      },
      flags: [],
    });
  }

  // Build ORR lookup
  const orrMap = new Map(orrs.map((o) => [o.id, o]));
  const orrIds = orrs.map((o) => o.id);

  // Get all sections for these ORRs
  const sections = db
    .select()
    .from(schema.sections)
    .where(inArray(schema.sections.orrId, orrIds))
    .all();

  // Extract and enrich flags
  const today = new Date().toISOString().slice(0, 10);
  const allFlags: FlagWithContext[] = [];

  for (const section of sections) {
    const flags: any[] = safeJsonParse(section.flags, []);

    const orr = orrMap.get(section.orrId)!;

    for (const f of flags) {
      const isOverdue = f.type === "RISK" && f.deadline && f.deadline < today;
      allFlags.push({
        type: f.type,
        note: f.note,
        severity: f.severity || undefined,
        deadline: f.deadline || undefined,
        status: f.status || "OPEN",
        resolution: f.resolution || undefined,
        resolvedAt: f.resolvedAt || undefined,
        resolvedBy: f.resolvedBy || undefined,
        createdAt: f.createdAt,
        orrId: orr.id,
        serviceName: orr.serviceName,
        orrStatus: orr.status as ORRStatus,
        sectionId: section.id,
        sectionTitle: section.title,
        sectionPosition: section.position,
        isOverdue: !!isOverdue,
        flagIndex: flags.indexOf(f),
      });
    }
  }

  // Compute summary from full unfiltered set
  const summary: FlagsSummary = {
    total: allFlags.length,
    byType: { RISK: 0, GAP: 0, STRENGTH: 0, FOLLOW_UP: 0 },
    bySeverity: { HIGH: 0, MEDIUM: 0, LOW: 0 },
    overdueCount: allFlags.filter((f) => f.isOverdue).length,
  };

  for (const f of allFlags) {
    summary.byType[f.type as SectionFlag] = (summary.byType[f.type as SectionFlag] || 0) + 1;
    if (f.severity) {
      summary.bySeverity[f.severity as RiskSeverity] = (summary.bySeverity[f.severity as RiskSeverity] || 0) + 1;
    }
  }

  // Apply filters to the flags array
  const typeFilter = c.req.query("type");
  const severityFilter = c.req.query("severity");
  const orrIdFilter = c.req.query("orrId");
  const overdueFilter = c.req.query("overdue");
  const statusFilter = c.req.query("status");

  let filtered = allFlags;
  if (typeFilter) filtered = filtered.filter((f) => f.type === typeFilter);
  if (severityFilter) filtered = filtered.filter((f) => f.severity === severityFilter);
  if (orrIdFilter) filtered = filtered.filter((f) => f.orrId === orrIdFilter);
  if (overdueFilter === "true") filtered = filtered.filter((f) => f.isOverdue);
  if (statusFilter) filtered = filtered.filter((f) => f.status === statusFilter);

  // Sort: overdue first, then HIGH→MEDIUM→LOW, then newest
  const severityOrder: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  filtered.sort((a, b) => {
    if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
    const sa = severityOrder[a.severity || ""] ?? 3;
    const sb = severityOrder[b.severity || ""] ?? 3;
    if (sa !== sb) return sa - sb;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return c.json({ summary, flags: filtered });
});
