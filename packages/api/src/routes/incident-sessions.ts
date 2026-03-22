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

  // No snapshot on session end for incidents (ORR-specific feature)
});
