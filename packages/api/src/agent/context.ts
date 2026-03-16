import { eq } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";
import type {
  ORRContext,
  SectionSummary,
  ActiveSectionDetail,
  TeachingMomentSummary,
} from "./system-prompt.js";

/**
 * Build the ORR context for the agent system prompt.
 * Loads: ORR details, all section summaries, active section in full,
 * previous session summaries, and relevant teaching moments.
 */
export function buildORRContext(
  orrId: string,
  activeSectionId: string | null,
): ORRContext {
  const db = getDb();

  // Load ORR
  const orr = db
    .select()
    .from(schema.orrs)
    .where(eq(schema.orrs.id, orrId))
    .get();

  if (!orr) throw new Error(`ORR ${orrId} not found`);

  // Load team
  const team = db
    .select()
    .from(schema.teams)
    .where(eq(schema.teams.id, orr.teamId))
    .get();

  // Load all sections
  const allSections = db
    .select()
    .from(schema.sections)
    .where(eq(schema.sections.orrId, orrId))
    .all();

  // Build section summaries
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

  // Build active section detail
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

  // Load completed session summaries
  const completedSessions = db
    .select()
    .from(schema.sessions)
    .where(eq(schema.sessions.orrId, orrId))
    .all()
    .filter((s) => s.status === "COMPLETED" && s.summary);

  const sessionSummaries = completedSessions.map(
    (s) => s.summary!,
  );

  // Load relevant teaching moments (match by active section tags)
  let teachingMoments: TeachingMomentSummary[] = [];
  if (activeSection) {
    const allTM = db
      .select()
      .from(schema.teachingMoments)
      .where(eq(schema.teachingMoments.status, "PUBLISHED"))
      .all();

    teachingMoments = allTM
      .filter((tm) => {
        const tags = typeof tm.sectionTags === "string"
          ? JSON.parse(tm.sectionTags)
          : tm.sectionTags;
        return (tags as string[]).some((tag) =>
          activeSection!.title.toLowerCase().includes(tag.toLowerCase()) ||
          tag.toLowerCase().includes(activeSection!.title.toLowerCase())
        );
      })
      .slice(0, 5)
      .map((tm) => ({
        title: tm.title,
        content: tm.content,
        systemPattern: tm.systemPattern,
        failureMode: tm.failureMode,
      }));
  }

  return {
    serviceName: orr.serviceName,
    teamName: team?.name || "Unknown",
    status: orr.status,
    sections,
    activeSectionId,
    activeSection,
    sessionSummaries,
    teachingMoments,
    isReturningSession: completedSessions.length > 0,
  };
}
