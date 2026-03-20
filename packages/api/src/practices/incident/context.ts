/**
 * Build the incident analysis context for the agent system prompt.
 * Mirrors the ORR context builder but queries incident-specific tables.
 */
import { eq } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import type {
  SectionSummary,
  ActiveSectionDetail,
  TeachingMomentSummary,
  CaseStudySummary,
} from "../../agent/system-prompt.js";

export interface IncidentContext {
  title: string;
  serviceName: string | null;
  teamName: string;
  status: string;
  severity: string | null;
  incidentType: string | null;
  incidentDate: string | null;
  sections: SectionSummary[];
  activeSectionId: string | null;
  activeSection: ActiveSectionDetail | null;
  sessionSummaries: string[];
  teachingMoments: TeachingMomentSummary[];
  caseStudies: CaseStudySummary[];
  isReturningSession: boolean;
  timelineEventCount: number;
  contributingFactorCount: number;
  actionItemCount: number;
}

// In-memory caches (shared with ORR — same data)
let tmCache: { data: Array<typeof schema.teachingMoments.$inferSelect>; loadedAt: number } | null = null;
let csCache: { data: Array<typeof schema.caseStudies.$inferSelect>; loadedAt: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

function getPublishedTeachingMoments() {
  const now = Date.now();
  if (tmCache && now - tmCache.loadedAt < CACHE_TTL_MS) return tmCache.data;
  const db = getDb();
  const data = db.select().from(schema.teachingMoments).where(eq(schema.teachingMoments.status, "PUBLISHED")).all();
  tmCache = { data, loadedAt: now };
  return data;
}

function getAllCaseStudies() {
  const now = Date.now();
  if (csCache && now - csCache.loadedAt < CACHE_TTL_MS) return csCache.data;
  const db = getDb();
  const data = db.select().from(schema.caseStudies).all();
  csCache = { data, loadedAt: now };
  return data;
}

export function buildIncidentContext(
  incidentId: string,
  activeSectionId: string | null,
): IncidentContext {
  const db = getDb();

  const incident = db.select().from(schema.incidents).where(eq(schema.incidents.id, incidentId)).get();
  if (!incident) throw new Error(`Incident ${incidentId} not found`);

  const team = db.select().from(schema.teams).where(eq(schema.teams.id, incident.teamId)).get();

  const allSections = db.select().from(schema.incidentSections).where(eq(schema.incidentSections.incidentId, incidentId)).all();

  const sections: SectionSummary[] = allSections.map((s) => {
    const flags = typeof s.flags === "string" ? JSON.parse(s.flags) : s.flags;
    return {
      id: s.id,
      position: s.position,
      title: s.title,
      depth: s.depth,
      flags: (flags as Array<{ type: string }>).map((f) => f.type),
      hasContent: s.content.length > 0,
      snippet: s.conversationSnippet,
    };
  });

  let activeSection: ActiveSectionDetail | null = null;
  if (activeSectionId) {
    const sec = allSections.find((s) => s.id === activeSectionId);
    if (sec) {
      const flags = typeof sec.flags === "string" ? JSON.parse(sec.flags) : sec.flags;
      const prompts = typeof sec.prompts === "string" ? JSON.parse(sec.prompts) : sec.prompts;
      const promptResponses = typeof sec.promptResponses === "string"
        ? JSON.parse(sec.promptResponses as string)
        : (sec.promptResponses || {});
      activeSection = {
        id: sec.id,
        title: sec.title,
        prompts: prompts as string[],
        content: sec.content,
        promptResponses: promptResponses as Record<number, string>,
        depth: sec.depth,
        depthRationale: sec.depthRationale,
        flags: flags as Array<{ type: string; note: string; severity?: string; deadline?: string }>,
        conversationSnippet: sec.conversationSnippet,
      };
    }
  }

  // Session summaries — sessions reference orrId but for incidents we'll use the same field
  // (until sessions get polymorphic practice_type/practice_id in a future migration)
  const completedSessions = db.select().from(schema.sessions)
    .where(eq(schema.sessions.orrId, incidentId))
    .all()
    .filter((s) => s.status === "COMPLETED" && s.summary);
  const sessionSummaries = completedSessions.map((s) => s.summary!);

  // Counts for structured data
  const timelineEventCount = db.select().from(schema.timelineEvents)
    .where(eq(schema.timelineEvents.incidentId, incidentId)).all().length;
  const contributingFactorCount = db.select().from(schema.contributingFactors)
    .where(eq(schema.contributingFactors.incidentId, incidentId)).all().length;
  const actionItemCount = db.select().from(schema.actionItems)
    .where(eq(schema.actionItems.practiceId, incidentId)).all()
    .filter((a) => a.practiceType === "incident").length;

  // Teaching moments and case studies
  let teachingMoments: TeachingMomentSummary[] = [];
  let caseStudies: CaseStudySummary[] = [];
  if (activeSection) {
    const matchesSection = (tags: unknown) => {
      const parsed = typeof tags === "string" ? JSON.parse(tags) : tags;
      return (parsed as string[]).some((tag) =>
        activeSection!.title.toLowerCase().includes(tag.toLowerCase()) ||
        tag.toLowerCase().includes(activeSection!.title.toLowerCase()),
      );
    };

    teachingMoments = getPublishedTeachingMoments()
      .filter((tm) => matchesSection(tm.sectionTags))
      .slice(0, 5)
      .map((tm) => ({
        title: tm.title,
        content: tm.content,
        systemPattern: tm.systemPattern,
        failureMode: tm.failureMode,
      }));

    caseStudies = getAllCaseStudies()
      .filter((cs) => matchesSection(cs.sectionTags))
      .slice(0, 3)
      .map((cs) => ({
        title: cs.title,
        company: cs.company,
        year: cs.year,
        summary: cs.summary,
        lessons: typeof cs.lessons === "string" ? JSON.parse(cs.lessons) : cs.lessons,
        failureCategory: cs.failureCategory,
      }));
  }

  return {
    title: incident.title,
    serviceName: incident.serviceName,
    teamName: team?.name || "Unknown",
    status: incident.status,
    severity: incident.severity,
    incidentType: incident.incidentType,
    incidentDate: incident.incidentDate,
    sections,
    activeSectionId,
    activeSection,
    sessionSummaries,
    teachingMoments,
    caseStudies,
    isReturningSession: completedSessions.length > 0,
    timelineEventCount,
    contributingFactorCount,
    actionItemCount,
  };
}
