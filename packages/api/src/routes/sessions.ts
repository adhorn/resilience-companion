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
  terminalStatuses: ["TERMINATED", "ARCHIVED"],

  welcomeMessage: `Welcome! I'm your **Review Facilitator** — I'll guide you through this operational readiness review using Socratic questioning to uncover risks, gaps, and assumptions.

**How it works:**
- Select a section from the sidebar, then ask me to review it — or just tell me what's on your mind
- I'll probe for depth, write observations to the document, and flag risks as we go
- Depth scale: Surface → Discussed → Examined → Probed → Verified

**Commands** (type \`/\` to see the menu):
- \`/summarize\` — Review progress so far
- \`/depth\` — Assess current section depth
- \`/status\` — Overall ORR status
- \`/risks\` — Identified risks and gaps
- \`/dependencies\` — Map all dependencies
- \`/incidents\` — Find relevant real-world incidents
- \`/experiments\` — Suggest chaos experiments or load tests
- \`/learning\` — Extract learning signals

Select a section and let's begin!`,

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
