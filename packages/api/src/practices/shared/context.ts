/**
 * Shared context builder — loads section summaries, active section detail,
 * session summaries, teaching moments, and case studies.
 *
 * Each practice calls this with its own table references and then adds
 * practice-specific fields (e.g. incident adds timelineEventCount).
 */
import { eq } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import type { SectionSummary, ActiveSectionDetail, TeachingMomentSummary, CaseStudySummary } from "./system-prompt-base.js";

// In-memory caches for seed data that rarely changes.
// Shared across all practices — same data.
let tmCache: { data: Array<typeof schema.teachingMoments.$inferSelect>; loadedAt: number } | null = null;
let csCache: { data: Array<typeof schema.caseStudies.$inferSelect>; loadedAt: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

export function getPublishedTeachingMoments() {
  const now = Date.now();
  if (tmCache && now - tmCache.loadedAt < CACHE_TTL_MS) return tmCache.data;
  const db = getDb();
  const data = db.select().from(schema.teachingMoments).where(eq(schema.teachingMoments.status, "PUBLISHED")).all();
  tmCache = { data, loadedAt: now };
  return data;
}

export function getAllCaseStudies() {
  const now = Date.now();
  if (csCache && now - csCache.loadedAt < CACHE_TTL_MS) return csCache.data;
  const db = getDb();
  const data = db.select().from(schema.caseStudies).all();
  csCache = { data, loadedAt: now };
  return data;
}

/**
 * Build sections, active section detail, session summaries, teaching moments, case studies.
 * Returns a base context that practices extend with their own fields.
 */
export interface BaseContext {
  sections: SectionSummary[];
  activeSectionId: string | null;
  activeSection: ActiveSectionDetail | null;
  sessionSummaries: string[];
  teachingMoments: TeachingMomentSummary[];
  caseStudies: CaseStudySummary[];
  isReturningSession: boolean;
}

interface SectionRow {
  id: string;
  position: number;
  title: string;
  depth: string;
  flags: unknown;
  content: string;
  conversationSnippet: string | null;
  prompts: unknown;
  promptResponses: unknown;
  depthRationale: string | null;
}

export function buildBaseContext(
  practiceId: string,
  activeSectionId: string | null,
  allSectionRows: SectionRow[],
): BaseContext {
  const db = getDb();

  // Build section summaries
  const sections: SectionSummary[] = allSectionRows.map((s) => {
    const flags = typeof s.flags === "string" ? JSON.parse(s.flags) : (s.flags || []);
    const prompts = (() => {
      try { return typeof s.prompts === "string" ? JSON.parse(s.prompts as string) : (s.prompts || []); }
      catch { return []; }
    })() as string[];
    const promptResponses = (() => {
      try { return typeof s.promptResponses === "string" ? JSON.parse(s.promptResponses as string) : (s.promptResponses || {}); }
      catch { return {}; }
    })() as Record<string, any>;

    const answered = Object.entries(promptResponses).filter(([, v]) => {
      const text = typeof v === "string" ? v : (v as any)?.answer || "";
      return text.trim().length > 0;
    });
    const codeSourced = answered.filter(([, v]) => typeof v === "object" && (v as any)?.source === "code").length;

    return {
      id: s.id,
      position: s.position,
      title: s.title,
      depth: s.depth,
      depthRationale: s.depthRationale || null,
      flags: (flags as Array<{ type: string; note: string; severity?: string }>).map((f) => ({
        type: f.type,
        note: f.note,
        ...(f.severity ? { severity: f.severity } : {}),
      })),
      hasContent: s.content.length > 0,
      snippet: s.conversationSnippet,
      questionsAnswered: answered.length,
      questionsTotal: prompts.length,
      codeSourced,
    };
  });

  // Build active section detail
  let activeSection: ActiveSectionDetail | null = null;
  if (activeSectionId) {
    const sec = allSectionRows.find((s) => s.id === activeSectionId);
    if (sec) {
      const flags = typeof sec.flags === "string" ? JSON.parse(sec.flags) : sec.flags;
      const prompts = typeof sec.prompts === "string" ? JSON.parse(sec.prompts as string) : sec.prompts;
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

  // Load completed session summaries (sessions reference practiceId via orrId)
  const completedSessions = db.select().from(schema.sessions)
    .where(eq(schema.sessions.orrId, practiceId))
    .all()
    .filter((s) => s.status === "COMPLETED" && s.summary);
  const sessionSummaries = completedSessions.map((s) => s.summary!);

  // Load relevant teaching moments and case studies (match by active section tags)
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
    sections,
    activeSectionId,
    activeSection,
    sessionSummaries,
    teachingMoments,
    caseStudies,
    isReturningSession: completedSessions.length > 0,
  };
}
