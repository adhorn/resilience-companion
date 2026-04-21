/**
 * Structured slash command handling.
 *
 * Write slash commands (/experiments, /dependencies, /learning, /actions,
 * /timeline, /factors) produce structured data. The agent returns JSON,
 * this module parses it, validates with Zod, and writes to DB.
 *
 * No second LLM call needed — the CONVERSE agent already produced the data.
 */

import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb, schema } from "../db/index.js";
import type { SlashCommandResult, WriteSlashCommand } from "@orr/shared";
import { WRITE_SLASH_COMMANDS } from "@orr/shared";
import type { PracticeType } from "./practice.js";
import { extractJson } from "./persist.js";
import { log } from "../logger.js";

// --- Zod schemas for each slash command's items ---

const ExperimentItemSchema = z.object({
  type: z.enum(["chaos_experiment", "load_test", "gameday"]),
  title: z.string().min(1),
  hypothesis: z.string().min(1),
  rationale: z.string().min(1),
  priority: z.enum(["critical", "high", "medium", "low"]),
});

const DependencyItemSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  criticality: z.string().default("important"),
  direction: z.string().optional(),
  has_fallback: z.boolean().optional(),
  notes: z.string().optional(),
});

const DiscoveryItemSchema = z.object({
  text: z.string().min(1),
  section_id: z.string().optional(),
});

const ActionItemSchema = z.object({
  title: z.string().min(1),
  type: z.enum(["technical", "process", "organizational", "learning"]),
  priority: z.enum(["high", "medium", "low"]).optional(),
  owner: z.string().optional(),
});

const TimelineEventItemSchema = z.object({
  timestamp: z.string().min(1),
  description: z.string().min(1),
  event_type: z.string().optional(),
  actor: z.string().optional(),
});

const ContributingFactorItemSchema = z.object({
  category: z.string().min(1),
  description: z.string().min(1),
  is_systemic: z.boolean().optional(),
});

const ITEM_SCHEMAS: Record<WriteSlashCommand, z.ZodType<any>> = {
  experiments: ExperimentItemSchema,
  dependencies: DependencyItemSchema,
  learning: DiscoveryItemSchema,
  actions: ActionItemSchema,
  timeline: TimelineEventItemSchema,
  factors: ContributingFactorItemSchema,
};

// --- Detection ---

export function isWriteSlashCommand(displayContent: string): boolean {
  if (!displayContent.startsWith("/")) return false;
  const command = displayContent.slice(1).toLowerCase();
  return (WRITE_SLASH_COMMANDS as readonly string[]).includes(command);
}

// --- Parsing ---

/**
 * Parse the agent's response for a write slash command.
 * Extracts JSON, validates items, filters invalid ones.
 * Returns null if no valid JSON found.
 */
export function parseSlashResponse(
  displayContent: string,
  agentResponse: string,
): SlashCommandResult | null {
  const command = displayContent.slice(1).toLowerCase() as WriteSlashCommand;
  const itemSchema = ITEM_SCHEMAS[command];
  if (!itemSchema) return null;

  // Extract JSON from the response
  const jsonStr = extractJson(agentResponse);

  let raw: any;
  try {
    raw = JSON.parse(jsonStr);
  } catch {
    log("warn", "Slash command response not valid JSON", { command, responseLength: agentResponse.length });
    return null;
  }

  // Validate structure
  if (!raw || typeof raw !== "object") return null;

  const summary = typeof raw.summary === "string" ? raw.summary : "";
  const rawItems = Array.isArray(raw.items) ? raw.items : [];

  // Filter valid items
  const items: any[] = [];
  for (const item of rawItems) {
    try {
      items.push(itemSchema.parse(item));
    } catch {
      // Skip invalid items
    }
  }

  if (items.length === 0 && !summary) return null;

  return { command, items, summary } as SlashCommandResult;
}

// --- Persistence ---

/**
 * Write slash command results to DB. Returns number of items written.
 * Deduplicates against existing data.
 */
export function persistSlashResult(
  result: SlashCommandResult,
  practiceType: PracticeType,
  practiceId: string,
  sessionId: string,
): number {
  const db = getDb();
  const now = new Date().toISOString();
  let written = 0;

  switch (result.command) {
    case "experiments": {
      // Need service for experiments
      let serviceId: string | null = null;
      let teamId: string;

      if (practiceType === "orr") {
        const orr = db.select().from(schema.orrs).where(eq(schema.orrs.id, practiceId)).get();
        if (!orr) break;
        serviceId = orr.serviceId;
        teamId = orr.teamId;

        if (!serviceId) {
          // Auto-create service
          const existing = db.select().from(schema.services)
            .where(and(eq(schema.services.teamId, teamId), eq(schema.services.name, orr.serviceName)))
            .get();
          if (existing) {
            serviceId = existing.id;
          } else {
            serviceId = nanoid();
            db.insert(schema.services).values({
              id: serviceId, name: orr.serviceName, teamId, createdAt: now, updatedAt: now,
            }).run();
          }
          db.update(schema.orrs).set({ serviceId }).where(eq(schema.orrs.id, practiceId)).run();
        }
      } else {
        const incident = db.select().from(schema.incidents).where(eq(schema.incidents.id, practiceId)).get();
        if (!incident) break;
        serviceId = incident.serviceId;
        teamId = incident.teamId;
      }

      if (!serviceId) break;

      // Dedup by title (fuzzy)
      const existingExps = db.select().from(schema.experimentSuggestions)
        .where(and(
          eq(schema.experimentSuggestions.sourcePracticeType, practiceType),
          eq(schema.experimentSuggestions.sourcePracticeId, practiceId),
        )).all();

      for (const exp of result.items) {
        const normNew = exp.title.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
        const isDup = existingExps.some((e) => {
          const normExisting = e.title.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
          return normExisting === normNew || normExisting.includes(normNew) || normNew.includes(normExisting);
        });
        if (isDup) continue;

        db.insert(schema.experimentSuggestions).values({
          id: nanoid(),
          serviceId,
          sourcePracticeType: practiceType,
          sourcePracticeId: practiceId,
          type: exp.type,
          title: exp.title,
          hypothesis: exp.hypothesis,
          rationale: exp.rationale,
          priority: exp.priority,
          priorityReasoning: "",
          status: "suggested",
          createdAt: now,
          updatedAt: now,
        }).run();
        written++;
      }
      break;
    }

    case "dependencies": {
      // Dedup by name (fuzzy)
      const existingDeps = db.select().from(schema.dependencies)
        .where(eq(schema.dependencies.orrId, practiceId))
        .all();

      for (const dep of result.items) {
        const normNew = dep.name.toLowerCase().replace(/\s*\([^)]*\)/g, "").trim();
        const isDup = existingDeps.some((e) => {
          const normExisting = e.name.toLowerCase().replace(/\s*\([^)]*\)/g, "").trim();
          return normExisting === normNew || normExisting.includes(normNew) || normNew.includes(normExisting);
        });
        if (isDup) continue;

        db.insert(schema.dependencies).values({
          id: nanoid(),
          orrId: practiceId,
          name: dep.name,
          type: dep.type as any,
          direction: (dep.direction as any) || "outbound",
          criticality: (dep.criticality as any) || "important",
          hasFallback: dep.has_fallback ? 1 : 0,
          notes: dep.notes || null,
          createdAt: now,
        }).run();
        written++;
      }
      break;
    }

    case "learning": {
      for (const disc of result.items) {
        // Dedup by exact text
        const existing = db.select().from(schema.discoveries)
          .where(and(
            eq(schema.discoveries.practiceType, practiceType),
            eq(schema.discoveries.practiceId, practiceId),
            eq(schema.discoveries.text, disc.text),
          )).get();
        if (existing) continue;

        db.insert(schema.discoveries).values({
          id: nanoid(),
          practiceType,
          practiceId,
          sectionId: disc.section_id || null,
          sessionId,
          text: disc.text,
          source: "learning_command",
          createdAt: now,
        }).run();
        written++;
      }
      break;
    }

    case "actions": {
      for (const ai of result.items) {
        // Dedup by title
        const existing = db.select().from(schema.actionItems)
          .where(and(
            eq(schema.actionItems.practiceType, practiceType),
            eq(schema.actionItems.practiceId, practiceId),
            eq(schema.actionItems.title, ai.title),
          )).get();
        if (existing) continue;

        db.insert(schema.actionItems).values({
          id: nanoid(),
          practiceType,
          practiceId,
          title: ai.title,
          type: ai.type,
          priority: ai.priority || "medium",
          owner: ai.owner || null,
          status: "open",
          createdAt: now,
        }).run();
        written++;
      }
      break;
    }

    case "timeline": {
      for (const te of result.items) {
        const position = db.select().from(schema.timelineEvents)
          .where(eq(schema.timelineEvents.incidentId, practiceId))
          .all().length;

        db.insert(schema.timelineEvents).values({
          id: nanoid(),
          incidentId: practiceId,
          position,
          timestamp: te.timestamp,
          description: te.description,
          eventType: (te.event_type as any) || "other",
          actor: te.actor || null,
          createdAt: now,
        }).run();
        written++;
      }
      break;
    }

    case "factors": {
      for (const cf of result.items) {
        db.insert(schema.contributingFactors).values({
          id: nanoid(),
          incidentId: practiceId,
          category: cf.category as any,
          description: cf.description,
          isSystemic: cf.is_systemic ?? false,
          createdAt: now,
        }).run();
        written++;
      }
      break;
    }
  }

  log("info", "Slash command persisted", { command: result.command, written, practiceType, practiceId });
  return written;
}
