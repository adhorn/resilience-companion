/**
 * ORR session routes.
 * Uses shared session route factory with ORR-specific ownership verification and snapshot hooks.
 */
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { schema } from "../db/index.js";
import { orrPracticeConfig } from "../practices/orr/config.js";
import { createSessionRoutes } from "../practices/shared/session-routes.js";
import type { getDb } from "../db/index.js";

export const sessionRoutes = createSessionRoutes({
  practiceConfig: orrPracticeConfig,
  agentProfile: "REVIEW_FACILITATOR",
  practiceIdParam: "orrId",
  practiceLabel: "ORR",

  verifyOwnership(db: ReturnType<typeof getDb>, practiceId: string, teamId: string) {
    return db.select().from(schema.orrs)
      .where(and(eq(schema.orrs.id, practiceId), eq(schema.orrs.teamId, teamId)))
      .get() || null;
  },

  markInProgress(db: ReturnType<typeof getDb>, practiceId: string, currentStatus: string) {
    if (currentStatus === "DRAFT") {
      db.update(schema.orrs)
        .set({ status: "IN_PROGRESS", updatedAt: new Date().toISOString() })
        .where(eq(schema.orrs.id, practiceId))
        .run();
    }
  },

  onSessionEnd(db: ReturnType<typeof getDb>, practiceId: string, practice: any, user: any) {
    // Create ORR version snapshot
    const now = new Date().toISOString();
    const sections = db.select().from(schema.sections)
      .where(eq(schema.sections.orrId, practiceId))
      .all();

    db.insert(schema.orrVersions).values({
      id: nanoid(),
      orrId: practiceId,
      snapshot: JSON.stringify({ orr: practice, sections }),
      reason: `Session ended by ${user.email}`,
      createdAt: now,
    }).run();
  },

  onSessionRenew(db: ReturnType<typeof getDb>, practiceId: string, practice: any) {
    // Snapshot ORR at session boundary
    const now = new Date().toISOString();
    const sections = db.select().from(schema.sections)
      .where(eq(schema.sections.orrId, practiceId))
      .all();

    db.insert(schema.orrVersions).values({
      id: nanoid(),
      orrId: practiceId,
      snapshot: JSON.stringify({ orr: practice, sections }),
      reason: "Session auto-renewed (token limit)",
      createdAt: now,
    }).run();
  },
});
