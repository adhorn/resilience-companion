/**
 * Tool definitions and executor for the Incident Learning Facilitator agent.
 * Shared section + cross-practice tools come from practices/shared/tools.ts.
 * Incident-specific tools: record_timeline_event, record_contributing_factor.
 */
import { eq, and, sql } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import type { LLMToolDef } from "../../llm/index.js";
import {
  createSharedToolDefs,
  createConverseToolDefs,
  CROSS_PRACTICE_TOOL_DEFS,
  executeSharedTool,
} from "../shared/tools.js";

// --- Incident-specific tool definitions ---

const INCIDENT_SPECIFIC_TOOLS: LLMToolDef[] = [
  {
    type: "function",
    function: {
      name: "record_timeline_event",
      description:
        "Record a timeline event discovered during conversation. Build the timeline incrementally as the team narrates — don't ask them to fill out a table.",
      parameters: {
        type: "object",
        properties: {
          timestamp: { type: "string", description: "ISO 8601 timestamp with timezone" },
          description: { type: "string", description: "What happened at this point" },
          evidence: { type: "string", description: "Supporting data (log line, metric, etc.)" },
          actor: { type: "string", description: "Who/what performed the action" },
          event_type: {
            type: "string",
            enum: ["detection", "escalation", "action", "communication", "resolution", "other"],
            description: "Category of the event",
          },
        },
        required: ["timestamp", "description", "event_type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "record_contributing_factor",
      description:
        "Record a contributing factor discovered during analysis. Every factor should have context explaining why it existed. Mark as systemic if it suggests a recurring pattern.",
      parameters: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: ["technical", "process", "organizational", "human_factors", "communication", "knowledge"],
            description: "Category of the contributing factor",
          },
          description: { type: "string", description: "What the factor was" },
          context: { type: "string", description: "Why it existed / what made it persist" },
          is_systemic: { type: "boolean", description: "Is this a recurring pattern, not a one-off?" },
          related_event_ids: {
            type: "array",
            items: { type: "string" },
            description: "IDs of timeline events this connects to",
          },
        },
        required: ["category", "description"],
      },
    },
  },
];

/** Read-only tools for incident CONVERSE phase: shared read only (no code exploration). */
export const INCIDENT_CONVERSE_TOOLS: LLMToolDef[] = [
  ...createConverseToolDefs("incident analysis"),
];

/** All incident tools (backwards compat for eval harness). */
export const INCIDENT_AGENT_TOOLS: LLMToolDef[] = [
  ...createSharedToolDefs("incident analysis"),
  ...CROSS_PRACTICE_TOOL_DEFS,
  ...INCIDENT_SPECIFIC_TOOLS,
];

/**
 * Execute an incident tool call.
 * Delegates shared tools to executeSharedTool, handles incident-specific tools here.
 */
export function executeIncidentTool(
  name: string,
  args: Record<string, unknown>,
  incidentId: string,
  sessionId: string,
): string {
  // Try shared tools first
  const sharedResult = executeSharedTool(name, args, "incident", incidentId, sessionId);
  if (sharedResult !== null) return sharedResult;

  // Incident-specific tools
  const db = getDb();
  const now = new Date().toISOString();

  switch (name) {
    case "record_timeline_event": {
      // Dedup: skip if event with same timestamp + description already exists
      const existingEvent = db.select().from(schema.timelineEvents)
        .where(and(
          eq(schema.timelineEvents.incidentId, incidentId),
          eq(schema.timelineEvents.timestamp, args.timestamp as string),
          eq(schema.timelineEvents.description, args.description as string),
        ))
        .get();

      if (existingEvent) {
        return JSON.stringify({ success: true, id: existingEvent.id, position: existingEvent.position, deduplicated: true });
      }

      const eventId = crypto.randomUUID();
      const existingEvents = db.select().from(schema.timelineEvents)
        .where(eq(schema.timelineEvents.incidentId, incidentId)).all();
      const position = existingEvents.length;

      db.run(sql`INSERT INTO timeline_events (id, incident_id, position, timestamp, description, evidence, actor, event_type, created_at)
        VALUES (${eventId}, ${incidentId}, ${position}, ${args.timestamp as string}, ${args.description as string}, ${(args.evidence as string) || null}, ${(args.actor as string) || null}, ${args.event_type as string}, ${now})`);

      return JSON.stringify({ success: true, id: eventId, position });
    }

    case "record_contributing_factor": {
      // Dedup
      const existingFactor = db.select().from(schema.contributingFactors)
        .where(and(
          eq(schema.contributingFactors.incidentId, incidentId),
          eq(schema.contributingFactors.description, args.description as string),
        ))
        .get();

      if (existingFactor) {
        return JSON.stringify({ success: true, id: existingFactor.id, deduplicated: true });
      }

      const factorId = crypto.randomUUID();
      db.run(sql`INSERT INTO contributing_factors (id, incident_id, category, description, context, is_systemic, created_at)
        VALUES (${factorId}, ${incidentId}, ${args.category as string}, ${args.description as string}, ${(args.context as string) || null}, ${args.is_systemic ? 1 : 0}, ${now})`);

      const relatedEventIds = args.related_event_ids as string[] | undefined;
      if (relatedEventIds && relatedEventIds.length > 0) {
        for (const eventId of relatedEventIds) {
          db.run(sql`INSERT INTO factor_event_links (factor_id, event_id) VALUES (${factorId}, ${eventId})`);
        }
      }

      return JSON.stringify({ success: true, id: factorId });
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}
