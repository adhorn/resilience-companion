/**
 * ORR Practice Config — wires existing ORR-specific functions into the
 * PracticeConfig interface so the generic agent loop can use them.
 */

import type { PracticeConfig, PracticeContext } from "../../agent/practice.js";
import type { SteeringTier } from "../../agent/steering.js";
import { buildORRContext } from "../../agent/context.js";
import { buildSystemPrompt } from "../../agent/system-prompt.js";
import { AGENT_TOOLS, executeTool } from "../../agent/tools.js";
import { getHooksForTier } from "../../agent/hooks/index.js";
import { getDb, schema } from "../../db/index.js";
import { eq } from "drizzle-orm";

export const orrPracticeConfig: PracticeConfig = {
  practiceType: "orr",

  buildContext(practiceId: string, activeSectionId: string | null): PracticeContext {
    const ctx = buildORRContext(practiceId, activeSectionId);
    return {
      ...ctx,
      practiceType: "orr",
      practiceId,
      activeSectionId,
    };
  },

  buildSystemPrompt(context: PracticeContext): string {
    // Strip PracticeContext wrapper — buildSystemPrompt expects ORRContext
    const { practiceType: _pt, practiceId: _pid, activeSectionId: _asid, ...orrContext } = context;
    return buildSystemPrompt(orrContext as any);
  },

  tools: AGENT_TOOLS,

  executeTool(name: string, args: Record<string, unknown>, practiceId: string, sessionId: string): string {
    return executeTool(name, args, practiceId, sessionId);
  },

  getHooks: getHooksForTier,

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
    const row = db.select({ steeringTier: schema.orrs.steeringTier })
      .from(schema.orrs)
      .where(eq(schema.orrs.id, practiceId))
      .get();
    return (row?.steeringTier as SteeringTier) || "thorough";
  },
};
