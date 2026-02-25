/**
 * Incident context builder.
 * Uses shared base context, adds incident-specific fields (timeline, factors, actions).
 */
import { eq } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { buildBaseContext } from "../shared/context.js";
import type {
  SectionSummary,
  ActiveSectionDetail,
  TeachingMomentSummary,
  CaseStudySummary,
} from "../shared/system-prompt-base.js";

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

export function buildIncidentContext(
  incidentId: string,
  activeSectionId: string | null,
): IncidentContext {
  const db = getDb();

  const incident = db.select().from(schema.incidents).where(eq(schema.incidents.id, incidentId)).get();
  if (!incident) throw new Error(`Incident ${incidentId} not found`);

  const team = db.select().from(schema.teams).where(eq(schema.teams.id, incident.teamId)).get();

  const allSections = db.select().from(schema.incidentSections)
    .where(eq(schema.incidentSections.incidentId, incidentId))
    .all();

  const base = buildBaseContext(incidentId, activeSectionId, allSections as any);

  // Counts for structured data
  const timelineEventCount = db.select().from(schema.timelineEvents)
    .where(eq(schema.timelineEvents.incidentId, incidentId)).all().length;
  const contributingFactorCount = db.select().from(schema.contributingFactors)
    .where(eq(schema.contributingFactors.incidentId, incidentId)).all().length;
  const actionItemCount = db.select().from(schema.actionItems)
    .where(eq(schema.actionItems.practiceId, incidentId)).all()
    .filter((a) => a.practiceType === "incident").length;

  return {
    ...base,
    title: incident.title,
    serviceName: incident.serviceName,
    teamName: team?.name || "Unknown",
    status: incident.status,
    severity: incident.severity,
    incidentType: incident.incidentType,
    incidentDate: incident.incidentDate,
    timelineEventCount,
    contributingFactorCount,
    actionItemCount,
  };
}
