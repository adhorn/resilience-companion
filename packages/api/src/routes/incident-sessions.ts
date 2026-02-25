/**
 * Incident Analysis session routes.
 * Uses shared session route factory with incident-specific ownership verification.
 */
import { eq, and } from "drizzle-orm";
import { schema } from "../db/index.js";
import { incidentPracticeConfig } from "../practices/incident/config.js";
import { createSessionRoutes } from "../practices/shared/session-routes.js";
import type { getDb } from "../db/index.js";

export const incidentSessionRoutes = createSessionRoutes({
  practiceConfig: incidentPracticeConfig,
  agentProfile: "INCIDENT_LEARNING_FACILITATOR",
  practiceIdParam: "incidentId",
  practiceLabel: "Incident",

  verifyOwnership(db: ReturnType<typeof getDb>, practiceId: string, teamId: string) {
    return db.select().from(schema.incidents)
      .where(and(eq(schema.incidents.id, practiceId), eq(schema.incidents.teamId, teamId)))
      .get() || null;
  },

  markInProgress(db: ReturnType<typeof getDb>, practiceId: string, currentStatus: string) {
    if (currentStatus === "DRAFT") {
      db.update(schema.incidents)
        .set({ status: "IN_PROGRESS", updatedAt: new Date().toISOString() })
        .where(eq(schema.incidents.id, practiceId))
        .run();
    }
  },

  welcomeMessage: `Welcome! I'm your **Incident Analysis Facilitator** — I'll help you explore what happened, why it happened, and what your organization can learn from it.

**How it works:**
- Select a section from the sidebar and we'll work through it together
- I'll ask probing questions to move beyond surface explanations toward systemic understanding
- I write observations and findings directly into the document as we go

**Commands** (type \`/\` to see the menu):
- \`/timeline\` — Build the incident timeline
- \`/factors\` — Identify contributing factors
- \`/actions\` — Generate action items
- \`/summarize\` — Summarize analysis progress
- \`/depth\` — Assess current section depth
- \`/patterns\` — Look for systemic patterns
- \`/experiments\` — Suggest experiments to prevent recurrence
- \`/learning\` — Extract learning signals

Select a section and let's begin!`,

  // No snapshot on session end for incidents (ORR-specific feature)
});
