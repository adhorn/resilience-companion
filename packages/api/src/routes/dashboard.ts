import { Hono } from "hono";
import { eq, gte, and, sql, inArray } from "drizzle-orm";
import { STALENESS_MONTHS, AGING_MONTHS, MAX_DAILY_TOKENS } from "@orr/shared";
import type { DashboardStats, DashboardORRSummary, ORRStatus } from "@orr/shared";
import { getDb, schema } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";

export const dashboardRoutes = new Hono();

dashboardRoutes.use("*", requireAuth);

function getStaleness(updatedAt: string): "fresh" | "aging" | "stale" {
  const updated = new Date(updatedAt);
  const now = new Date();
  const monthsAgo =
    (now.getFullYear() - updated.getFullYear()) * 12 +
    (now.getMonth() - updated.getMonth());

  if (monthsAgo >= STALENESS_MONTHS) return "stale";
  if (monthsAgo >= AGING_MONTHS) return "aging";
  return "fresh";
}

/**
 * GET /api/v1/dashboard
 * Team dashboard: ORR stats, staleness, coverage.
 */
dashboardRoutes.get("/", (c) => {
  const user = c.get("user");
  const db = getDb();

  const orrs = db
    .select()
    .from(schema.orrs)
    .where(eq(schema.orrs.teamId, user.teamId))
    .all();

  const byStatus: Record<ORRStatus, number> = {
    DRAFT: 0,
    IN_PROGRESS: 0,
    COMPLETE: 0,
    ARCHIVED: 0,
  };

  let stale = 0;
  let aging = 0;

  // Batch-load all sections for all team ORRs in one query (avoids N+1)
  const orrIds = orrs.map((o) => o.id);
  const allSections = orrIds.length > 0
    ? db.select().from(schema.sections).where(inArray(schema.sections.orrId, orrIds)).all()
    : [];
  const sectionsByOrr = new Map<string, typeof allSections>();
  for (const sec of allSections) {
    const list = sectionsByOrr.get(sec.orrId) || [];
    list.push(sec);
    sectionsByOrr.set(sec.orrId, list);
  }

  const summaries: DashboardORRSummary[] = orrs.map((orr) => {
    byStatus[orr.status as ORRStatus]++;

    const staleness = getStaleness(orr.updatedAt);
    if (staleness === "stale") stale++;
    if (staleness === "aging") aging++;

    const sections = sectionsByOrr.get(orr.id) || [];
    const covered = sections.filter((s) => s.depth !== "UNKNOWN").length;
    const coveragePercent =
      sections.length > 0 ? Math.round((covered / sections.length) * 100) : 0;

    return {
      id: orr.id,
      serviceName: orr.serviceName,
      status: orr.status as ORRStatus,
      updatedAt: orr.updatedAt,
      staleness,
      coveragePercent,
    };
  });

  // Sort by most recently updated
  summaries.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  // Total token usage across all sessions for this team's ORRs
  const allSessions = orrIds.length > 0
    ? db.select().from(schema.sessions).all().filter((s) => orrIds.includes(s.orrId))
    : [];
  const totalTokens = allSessions.reduce((sum, s) => sum + s.tokenUsage, 0);

  // Today's token usage for daily cap visibility
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const dailyUsageResult = db
    .select({ total: sql<number>`coalesce(sum(${schema.sessions.tokenUsage}), 0)` })
    .from(schema.sessions)
    .innerJoin(schema.orrs, eq(schema.sessions.orrId, schema.orrs.id))
    .where(
      and(
        eq(schema.orrs.teamId, user.teamId),
        gte(schema.sessions.startedAt, todayStart.toISOString()),
      ),
    )
    .get();
  const dailyTokens = dailyUsageResult?.total ?? 0;

  const stats: DashboardStats = {
    totalOrrs: orrs.length,
    byStatus,
    stale,
    aging,
    recentActivity: summaries,
    totalTokens,
    dailyTokens,
    dailyTokenLimit: MAX_DAILY_TOKENS,
  };

  return c.json({ dashboard: stats });
});
