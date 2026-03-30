/**
 * ORR context builder.
 * Uses shared base context, adds ORR-specific fields (repository, dependencies).
 */
import { eq } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";
import { buildBaseContext } from "../practices/shared/context.js";
import type { ORRContext, ParentORRContext } from "./system-prompt.js";
import { safeJsonParse } from "../validation.js";

export function buildORRContext(
  orrId: string,
  activeSectionId: string | null,
): ORRContext {
  const db = getDb();

  const orr = db.select().from(schema.orrs).where(eq(schema.orrs.id, orrId)).get();
  if (!orr) throw new Error(`ORR ${orrId} not found`);

  const team = db.select().from(schema.teams).where(eq(schema.teams.id, orr.teamId)).get();

  const allSections = db.select().from(schema.sections)
    .where(eq(schema.sections.orrId, orrId))
    .all();

  const base = buildBaseContext(orrId, activeSectionId, allSections as any);

  // Load existing dependencies
  const existingDeps = db.select({
    name: schema.dependencies.name,
    type: schema.dependencies.type,
    criticality: schema.dependencies.criticality,
  }).from(schema.dependencies)
    .where(eq(schema.dependencies.orrId, orrId))
    .all();

  // Feature ORR: load parent context
  let parentContext: ParentORRContext | null = null;
  if (orr.parentOrrId) {
    const parentOrr = db.select().from(schema.orrs).where(eq(schema.orrs.id, orr.parentOrrId)).get();
    if (parentOrr) {
      const parentSections = db.select().from(schema.sections)
        .where(eq(schema.sections.orrId, parentOrr.id)).all();
      parentContext = {
        serviceName: parentOrr.serviceName,
        status: parentOrr.status,
        sections: parentSections.map((s) => ({
          title: s.title,
          depth: s.depth,
          content: s.content,
          flagCount: safeJsonParse<any[]>(s.flags, []).length,
        })),
      };
    }
  }

  return {
    ...base,
    serviceName: orr.serviceName,
    teamName: team?.name || "Unknown",
    status: orr.status,
    hasRepositoryPath: !!orr.repositoryPath,
    existingDependencies: existingDeps,
    orrType: orr.orrType || "service",
    changeTypes: safeJsonParse<string[]>(orr.changeTypes, []),
    changeDescription: orr.changeDescription || null,
    parentContext,
  };
}
