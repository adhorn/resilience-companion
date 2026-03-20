/**
 * Incident Analysis Practice Config — wires incident-specific functions
 * into the PracticeConfig interface so the generic agent loop can use them.
 */
import type { PracticeConfig, PracticeContext } from "../../agent/practice.js";
import type { SteeringTier } from "../../agent/steering.js";
import { buildIncidentContext } from "./context.js";
import { buildIncidentSystemPrompt } from "./system-prompt.js";
import { INCIDENT_AGENT_TOOLS, executeIncidentTool } from "./tools.js";
import { getIncidentHooksForTier } from "./hooks.js";
import { getDb, schema } from "../../db/index.js";
import { eq } from "drizzle-orm";

export const incidentPracticeConfig: PracticeConfig = {
  practiceType: "incident",

  buildContext(practiceId: string, activeSectionId: string | null): PracticeContext {
    const ctx = buildIncidentContext(practiceId, activeSectionId);
    return {
      ...ctx,
      practiceType: "incident",
      practiceId,
      activeSectionId,
    };
  },

  buildSystemPrompt(context: PracticeContext): string {
    const { practiceType: _pt, practiceId: _pid, activeSectionId: _asid, ...incidentContext } = context;
    return buildIncidentSystemPrompt(incidentContext as any);
  },

  tools: INCIDENT_AGENT_TOOLS,

  executeTool(name: string, args: Record<string, unknown>, practiceId: string, sessionId: string): string {
    return executeIncidentTool(name, args, practiceId, sessionId);
  },

  getHooks: getIncidentHooksForTier,

  sectionUpdateTools: [
    "update_section_content",
    "update_depth_assessment",
    "set_flags",
    "update_question_response",
  ],

  sectionUpdateFieldMap: {
    update_section_content: "content",
    update_depth_assessment: "depth",
    set_flags: "flags",
    update_question_response: "promptResponses",
  },

  loadSteeringTier(practiceId: string): SteeringTier {
    const db = getDb();
    const row = db.select({ steeringTier: schema.incidents.steeringTier })
      .from(schema.incidents)
      .where(eq(schema.incidents.id, practiceId))
      .get();
    return (row?.steeringTier as SteeringTier) || "thorough";
  },
};
