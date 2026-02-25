/**
 * Learning routes — per-section learning signals for both ORR and incident practices.
 * Mounted at /api/v1/orrs/:orrId/learning and /api/v1/incidents/:incidentId/learning
 */
import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";

// Depth enum → numeric
const DEPTH_MAP: Record<string, number> = { UNKNOWN: 0, SURFACE: 1, MODERATE: 2, DEEP: 3 };

/**
 * Build learning response from section data — shared across practices.
 */
function buildLearningResponse(
  practiceType: "orr" | "incident",
  practiceId: string,
  sectionTable: any,
  fkColumn: any,
) {
  const db = getDb();

  // Load sections
  const rawSections = db.select().from(sectionTable)
    .where(eq(fkColumn, practiceId))
    .all()
    .sort((a: any, b: any) => a.position - b.position);

  // Load discoveries from dedicated table
  const allDiscoveries = db.select().from(schema.discoveries)
    .where(and(
      eq(schema.discoveries.practiceType, practiceType),
      eq(schema.discoveries.practiceId, practiceId),
    ))
    .all();

  // Load cross-practice suggestions
  const crossPracticeLinks = db.select().from(schema.crossPracticeSuggestions)
    .where(and(
      eq(schema.crossPracticeSuggestions.sourcePracticeType, practiceType),
      eq(schema.crossPracticeSuggestions.sourcePracticeId, practiceId),
    ))
    .all();

  // Load action items
  const actionItems = db.select().from(schema.actionItems)
    .where(and(
      eq(schema.actionItems.practiceType, practiceType),
      eq(schema.actionItems.practiceId, practiceId),
    ))
    .all();

  // Load experiment suggestions
  const experiments = db.select().from(schema.experimentSuggestions)
    .where(and(
      eq(schema.experimentSuggestions.sourcePracticeType, practiceType),
      eq(schema.experimentSuggestions.sourcePracticeId, practiceId),
    ))
    .all();

  // Build per-section learning signals
  const sections = rawSections.map((s: any) => {
    const flags = (() => {
      try {
        return typeof s.flags === "string" ? JSON.parse(s.flags) : (s.flags || []);
      } catch { return []; }
    })();

    const prompts = (() => {
      try {
        return typeof s.prompts === "string" ? JSON.parse(s.prompts) : (s.prompts || []);
      } catch { return []; }
    })();

    const promptResponses = (() => {
      try {
        return typeof s.promptResponses === "string" ? JSON.parse(s.promptResponses) : (s.promptResponses || {});
      } catch { return {}; }
    })();

    // Count answered questions and code-sourced answers
    const answered = Object.entries(promptResponses).filter(([, v]: any) => {
      const text = typeof v === "string" ? v : v?.answer || "";
      return text.trim().length > 0;
    });
    const codeSourced = answered.filter(([, v]: any) => typeof v === "object" && v?.source === "code").length;

    // Risk score: count OPEN flags (RISK + GAP + FOLLOW_UP), weighted by severity
    const openFlags = flags.filter((f: any) =>
      (f.type === "RISK" || f.type === "GAP" || f.type === "FOLLOW_UP")
      && f.status !== "ACCEPTED" && f.status !== "RESOLVED"
    );
    const riskScore = openFlags.reduce((sum: number, f: any) => {
      const weight = f.severity === "HIGH" ? 3 : f.severity === "MEDIUM" ? 2 : 1;
      return sum + weight;
    }, 0);

    // Insight count: discoveries + code-sourced answers (things team didn't know)
    const sectionDiscoveries = allDiscoveries.filter((d) => d.sectionId === s.id).length;
    const insightCount = sectionDiscoveries + codeSourced;

    return {
      id: s.id,
      title: s.title,
      position: s.position,
      depth: DEPTH_MAP[s.depth] ?? 0,
      depthRationale: s.depthRationale || null,
      riskScore,
      riskCount: openFlags.length,
      insightCount,
      discoveries: sectionDiscoveries,
      codeSourced,
      questionsAnswered: answered.length,
      questionsTotal: prompts.length,
    };
  });

  // Totals
  const moderatePlus = sections.filter((s: any) => s.depth >= 2).length;
  const totals = {
    depthCoverage: `${moderatePlus}/${sections.length}`,
    totalRisks: sections.reduce((sum: number, s: any) => sum + s.riskCount, 0),
    totalInsights: sections.reduce((sum: number, s: any) => sum + s.insightCount, 0),
    crossPracticeLinks: crossPracticeLinks.length,
    experiments: experiments.length,
  };

  return {
    sections,
    discoveries: allDiscoveries.map((d) => ({
      id: d.id,
      sectionId: d.sectionId,
      text: d.text,
      createdAt: d.createdAt,
    })),
    crossPracticeLinks: crossPracticeLinks.map((l) => ({
      id: l.id,
      targetPracticeType: l.targetPracticeType,
      suggestion: l.suggestion,
      rationale: l.rationale,
      status: l.status,
      createdAt: l.createdAt,
    })),
    actionItems: actionItems.map((a) => ({
      id: a.id,
      title: a.title,
      owner: a.owner,
      dueDate: a.dueDate,
      priority: a.priority,
      type: a.type,
      status: a.status,
    })),
    totals,
  };
}

// --- ORR Learning ---

export const orrLearningRoutes = new Hono();
orrLearningRoutes.use("*", requireAuth);

orrLearningRoutes.get("/", (c) => {
  const orrId = c.req.param("orrId")!;
  const learning = buildLearningResponse(
    "orr", orrId,
    schema.sections, schema.sections.orrId,
  );
  return c.json({ learning });
});

// --- Incident Learning ---

export const incidentLearningRoutes = new Hono();
incidentLearningRoutes.use("*", requireAuth);

incidentLearningRoutes.get("/", (c) => {
  const incidentId = c.req.param("incidentId")!;
  const learning = buildLearningResponse(
    "incident", incidentId,
    schema.incidentSections, schema.incidentSections.incidentId,
  );
  return c.json({ learning });
});
