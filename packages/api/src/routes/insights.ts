import { Hono } from "hono";
import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";

export const insightsRoutes = new Hono();

insightsRoutes.use("*", requireAuth);

/**
 * GET /api/v1/insights
 * Learning signals detail: discoveries, cross-practice suggestions, open action items.
 */
insightsRoutes.get("/", (c) => {
  const user = c.get("user");
  const db = getDb();

  // Collect all practice IDs for this team
  const orrs = db
    .select({ id: schema.orrs.id, serviceName: schema.orrs.serviceName })
    .from(schema.orrs)
    .where(eq(schema.orrs.teamId, user.teamId))
    .all();
  const incidents = db
    .select({ id: schema.incidents.id, title: schema.incidents.title, serviceName: schema.incidents.serviceName })
    .from(schema.incidents)
    .where(eq(schema.incidents.teamId, user.teamId))
    .all();

  const orrIds = orrs.map((o) => o.id);
  const incidentIds = incidents.map((i) => i.id);
  const allPracticeIds = [...orrIds, ...incidentIds];

  if (allPracticeIds.length === 0) {
    return c.json({
      discoveries: [],
      crossPracticeLinks: [],
      actionItems: [],
    });
  }

  // Build a lookup for practice names
  const practiceNames = new Map<string, string>();
  for (const o of orrs) practiceNames.set(o.id, o.serviceName);
  for (const i of incidents) practiceNames.set(i.id, i.title);

  // Discoveries: sessions with non-empty discoveries array, last 90 days
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const sessionsWithDiscoveries = db
    .select({
      id: schema.sessions.id,
      orrId: schema.sessions.orrId,
      discoveries: schema.sessions.discoveries,
      startedAt: schema.sessions.startedAt,
    })
    .from(schema.sessions)
    .where(
      sql`${schema.sessions.orrId} IN (${sql.join(allPracticeIds.map((id) => sql`${id}`), sql`, `)}) AND ${schema.sessions.discoveries} != '[]' AND ${schema.sessions.startedAt} >= ${ninetyDaysAgo.toISOString()}`,
    )
    .all();

  const discoveries = sessionsWithDiscoveries.flatMap((s) => {
    const items = (s.discoveries as string[]) || [];
    return items.map((text) => ({
      text,
      practiceId: s.orrId,
      practiceName: practiceNames.get(s.orrId) || "Unknown",
      date: s.startedAt,
    }));
  });
  discoveries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Cross-practice suggestions
  const crossLinks = db
    .select()
    .from(schema.crossPracticeSuggestions)
    .where(
      sql`${schema.crossPracticeSuggestions.sourcePracticeId} IN (${sql.join(allPracticeIds.map((id) => sql`${id}`), sql`, `)})`,
    )
    .all()
    .map((s) => ({
      id: s.id,
      sourcePracticeId: s.sourcePracticeId,
      sourcePracticeName: practiceNames.get(s.sourcePracticeId) || "Unknown",
      sourcePracticeType: s.sourcePracticeType,
      targetPracticeType: s.targetPracticeType,
      suggestion: s.suggestion,
      rationale: s.rationale,
      status: s.status,
      createdAt: s.createdAt,
    }));
  crossLinks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Open action items
  const actionItems = db
    .select()
    .from(schema.actionItems)
    .where(
      sql`${schema.actionItems.practiceId} IN (${sql.join(allPracticeIds.map((id) => sql`${id}`), sql`, `)}) AND ${schema.actionItems.status} != 'done'`,
    )
    .all()
    .map((a) => ({
      id: a.id,
      title: a.title,
      practiceId: a.practiceId,
      practiceName: practiceNames.get(a.practiceId) || "Unknown",
      practiceType: a.practiceType,
      owner: a.owner,
      dueDate: a.dueDate,
      priority: a.priority,
      type: a.type,
      status: a.status,
      successCriteria: a.successCriteria,
      createdAt: a.createdAt,
    }));
  actionItems.sort((a, b) => {
    const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
    return (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2);
  });

  return c.json({ discoveries, crossPracticeLinks: crossLinks, actionItems });
});
