import { Hono } from "hono";
import { eq, sql, inArray } from "drizzle-orm";
import type { DashboardStats, DashboardPracticeSummary, ORRStatus, IncidentStatus } from "@orr/shared";
import { getDb, schema } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";

export const dashboardRoutes = new Hono();

dashboardRoutes.use("*", requireAuth);

/** Compute coverage: % of sections with depth != UNKNOWN */
function computeCoverage(sections: { depth: string | null }[]): number {
  if (sections.length === 0) return 0;
  const covered = sections.filter((s) => s.depth !== "UNKNOWN").length;
  return Math.round((covered / sections.length) * 100);
}

/**
 * GET /api/v1/dashboard
 * Unified dashboard: ORR + Incident stats + learning signals.
 */
dashboardRoutes.get("/", (c) => {
  const user = c.get("user");
  const db = getDb();

  // --- ORR practice ---

  const orrs = db
    .select()
    .from(schema.orrs)
    .where(eq(schema.orrs.teamId, user.teamId))
    .all();

  const orrsByStatus: Record<ORRStatus, number> = {
    DRAFT: 0,
    IN_PROGRESS: 0,
    COMPLETE: 0,
    TERMINATED: 0,
    ARCHIVED: 0,
  };

  const orrIds = orrs.map((o) => o.id);

  // Batch-load ORR sections for coverage
  const allOrrSections = orrIds.length > 0
    ? db.select().from(schema.sections).where(inArray(schema.sections.orrId, orrIds)).all()
    : [];
  const sectionsByOrr = new Map<string, typeof allOrrSections>();
  for (const sec of allOrrSections) {
    const list = sectionsByOrr.get(sec.orrId) || [];
    list.push(sec);
    sectionsByOrr.set(sec.orrId, list);
  }

  const recentOrrs: DashboardPracticeSummary[] = orrs.map((orr) => {
    orrsByStatus[orr.status as ORRStatus]++;
    return {
      id: orr.id,
      title: orr.serviceName,
      serviceName: orr.serviceName,
      status: orr.status,
      updatedAt: orr.updatedAt,
      coveragePercent: computeCoverage(sectionsByOrr.get(orr.id) || []),
    };
  });

  recentOrrs.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  // --- Incident practice ---

  const incidents = db
    .select()
    .from(schema.incidents)
    .where(eq(schema.incidents.teamId, user.teamId))
    .all();

  const incidentsByStatus: Record<IncidentStatus, number> = {
    DRAFT: 0,
    IN_PROGRESS: 0,
    IN_REVIEW: 0,
    PUBLISHED: 0,
    ARCHIVED: 0,
  };

  const incidentIds = incidents.map((i) => i.id);

  // Batch-load incident sections for coverage
  const allIncSections = incidentIds.length > 0
    ? db.select().from(schema.incidentSections).where(inArray(schema.incidentSections.incidentId, incidentIds)).all()
    : [];
  const sectionsByIncident = new Map<string, typeof allIncSections>();
  for (const sec of allIncSections) {
    const list = sectionsByIncident.get(sec.incidentId) || [];
    list.push(sec);
    sectionsByIncident.set(sec.incidentId, list);
  }

  const recentIncidents: DashboardPracticeSummary[] = incidents.map((inc) => {
    incidentsByStatus[inc.status as IncidentStatus]++;
    return {
      id: inc.id,
      title: inc.title,
      serviceName: inc.serviceName ?? "Unknown service",
      status: inc.status,
      updatedAt: inc.updatedAt,
      coveragePercent: computeCoverage(sectionsByIncident.get(inc.id) || []),
      severity: inc.severity,
    };
  });

  recentIncidents.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  // --- Learning signals ---

  const allPracticeIds = [...orrIds, ...incidentIds];

  // Open action items across both practices
  const openActionResult = allPracticeIds.length > 0
    ? db
        .select({ count: sql<number>`count(*)` })
        .from(schema.actionItems)
        .where(
          sql`${schema.actionItems.practiceId} IN (${sql.join(allPracticeIds.map(id => sql`${id}`), sql`, `)}) AND ${schema.actionItems.status} != 'done'`,
        )
        .get()
    : null;
  const openActionItems = openActionResult?.count ?? 0;

  // Experiment suggestions (suggested status, scoped to team's services)
  const teamServices = db
    .select({ id: schema.services.id })
    .from(schema.services)
    .where(eq(schema.services.teamId, user.teamId))
    .all();
  const serviceIds = teamServices.map((s) => s.id);

  const expResult = serviceIds.length > 0
    ? db
        .select({ count: sql<number>`count(*)` })
        .from(schema.experimentSuggestions)
        .where(
          sql`${schema.experimentSuggestions.serviceId} IN (${sql.join(serviceIds.map(id => sql`${id}`), sql`, `)}) AND ${schema.experimentSuggestions.status} = 'suggested'`,
        )
        .get()
    : null;
  const experimentSuggestions = expResult?.count ?? 0;

  // Cross-practice suggestions scoped to team
  const crossResult = allPracticeIds.length > 0
    ? db
        .select({ count: sql<number>`count(*)` })
        .from(schema.crossPracticeSuggestions)
        .where(
          sql`${schema.crossPracticeSuggestions.sourcePracticeId} IN (${sql.join(allPracticeIds.map(id => sql`${id}`), sql`, `)})`,
        )
        .get()
    : null;
  const crossPracticeLinks = crossResult?.count ?? 0;

  // Sessions with discoveries in last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const discoveryResult = allPracticeIds.length > 0
    ? db
        .select({ count: sql<number>`count(*)` })
        .from(schema.sessions)
        .where(
          sql`${schema.sessions.orrId} IN (${sql.join(allPracticeIds.map(id => sql`${id}`), sql`, `)}) AND ${schema.sessions.discoveries} != '[]' AND ${schema.sessions.startedAt} >= ${thirtyDaysAgo.toISOString()}`,
        )
        .get()
    : null;
  const recentDiscoveries = discoveryResult?.count ?? 0;

  // --- Assemble response ---

  const stats: DashboardStats = {
    totalOrrs: orrs.length,
    orrsByStatus,
    recentOrrs: recentOrrs.slice(0, 10),
    totalIncidents: incidents.length,
    incidentsByStatus,
    recentIncidents: recentIncidents.slice(0, 10),
    openActionItems,
    experimentSuggestions,
    crossPracticeLinks,
    recentDiscoveries,
  };

  return c.json({ dashboard: stats });
});
