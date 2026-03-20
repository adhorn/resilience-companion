/**
 * Tool definitions and executor for the Incident Learning Facilitator agent.
 * Includes shared section tools + incident-specific tools (timeline, factors, actions).
 */
import { eq, and, sql } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import type { LLMToolDef } from "../../llm/index.js";

// --- Shared section tools (same interface as ORR, but operates on incident_sections) ---

const SHARED_SECTION_TOOLS: LLMToolDef[] = [
  {
    type: "function",
    function: {
      name: "read_section",
      description: "Read the full content and prompts of a specific incident analysis section",
      parameters: {
        type: "object",
        properties: {
          section_id: { type: "string", description: "The section ID to read" },
        },
        required: ["section_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_section_content",
      description:
        "Update the section's narrative content with cross-cutting observations. For answers to specific questions, use update_question_response instead.",
      parameters: {
        type: "object",
        properties: {
          section_id: { type: "string", description: "The section ID to update" },
          content: { type: "string", description: "The new content to set (or append to existing)" },
          append: { type: "boolean", description: "If true, append to existing content. Default true." },
        },
        required: ["section_id", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_depth_assessment",
      description:
        "Update the depth assessment for a section. SURFACE: documented what happened but no 'why'. MODERATE: multiple contributing factors explored, some second stories, basic systemic thinking. DEEP: WAI-WAD gaps articulated, mental models updated, patterns across incidents identified, learning loops connected.",
      parameters: {
        type: "object",
        properties: {
          section_id: { type: "string", description: "The section ID" },
          depth: {
            type: "string",
            enum: ["SURFACE", "MODERATE", "DEEP"],
            description: "The assessed depth level",
          },
          rationale: {
            type: "string",
            description: "Brief explanation citing specific indicators observed",
          },
        },
        required: ["section_id", "depth", "rationale"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_flags",
      description: "Set flags on a section. For RISK flags, include severity and deadline.",
      parameters: {
        type: "object",
        properties: {
          section_id: { type: "string", description: "The section ID" },
          flags: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: { type: "string", enum: ["RISK", "GAP", "STRENGTH", "FOLLOW_UP"] },
                note: { type: "string", description: "Brief description" },
                severity: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] },
                deadline: { type: "string", description: "ISO date for RISK flags" },
              },
              required: ["type", "note"],
            },
          },
        },
        required: ["section_id", "flags"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_teaching_moments",
      description: "Search the teaching moment library for relevant industry lessons.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
          section_tag: { type: "string", description: "Optional: filter by section title" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_case_studies",
      description: "Search the case study library for relevant real-world incidents.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_question_response",
      description:
        "PRIMARY tool for recording answers. Call this for every question the team answers. Maps each answer to its specific question by 0-based index.",
      parameters: {
        type: "object",
        properties: {
          section_id: { type: "string", description: "The section ID" },
          question_index: { type: "number", description: "0-based index of the question" },
          response: { type: "string", description: "The answer text" },
        },
        required: ["section_id", "question_index", "response"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_session_summary",
      description: "Write a summary of what was covered in this session. Call when wrapping up.",
      parameters: {
        type: "object",
        properties: {
          summary: { type: "string", description: "Narrative summary of the session" },
        },
        required: ["summary"],
      },
    },
  },
];

// --- Incident-specific tools ---

const INCIDENT_TOOLS: LLMToolDef[] = [
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
  {
    type: "function",
    function: {
      name: "record_action_item",
      description:
        "Record a structured action item. Every action should trace to a contributing factor. Don't rush to actions before understanding is deep enough.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Clear description of the action" },
          owner: { type: "string", description: "Person responsible" },
          due_date: { type: "string", description: "ISO date for completion" },
          priority: { type: "string", enum: ["high", "medium", "low"] },
          type: {
            type: "string",
            enum: ["technical", "process", "organizational", "learning"],
            description: "Category of the action",
          },
          contributing_factor_id: {
            type: "string",
            description: "ID of the contributing factor this addresses",
          },
          success_criteria: { type: "string", description: "How you'll know it's done correctly" },
          backlog_link: { type: "string", description: "Link to tracking system" },
        },
        required: ["title", "priority", "type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "suggest_cross_practice_action",
      description:
        "Suggest how this incident finding could inform another resilience practice (chaos engineering, load testing, ORR, GameDay). Makes Section 13 (Learning Loops) concrete.",
      parameters: {
        type: "object",
        properties: {
          target_practice: {
            type: "string",
            enum: ["chaos_engineering", "load_testing", "orr", "incident_analysis", "gameday"],
            description: "Which practice this suggestion is for",
          },
          suggestion: { type: "string", description: "What to do" },
          rationale: { type: "string", description: "Why this incident finding suggests it" },
        },
        required: ["target_practice", "suggestion", "rationale"],
      },
    },
  },
];

export const INCIDENT_AGENT_TOOLS: LLMToolDef[] = [...SHARED_SECTION_TOOLS, ...INCIDENT_TOOLS];

/**
 * Execute an incident tool call.
 */
export function executeIncidentTool(
  name: string,
  args: Record<string, unknown>,
  incidentId: string,
  sessionId: string,
): string {
  const db = getDb();
  const now = new Date().toISOString();

  switch (name) {
    // --- Shared section tools (operate on incident_sections) ---

    case "read_section": {
      const section = db.select().from(schema.incidentSections)
        .where(and(
          eq(schema.incidentSections.id, args.section_id as string),
          eq(schema.incidentSections.incidentId, incidentId),
        ))
        .get();
      if (!section) return JSON.stringify({ error: "Section not found" });
      return JSON.stringify({
        title: section.title,
        prompts: section.prompts,
        content: section.content,
        promptResponses: section.promptResponses,
        depth: section.depth,
        depthRationale: section.depthRationale,
        flags: section.flags,
      });
    }

    case "update_section_content": {
      const section = db.select().from(schema.incidentSections)
        .where(and(
          eq(schema.incidentSections.id, args.section_id as string),
          eq(schema.incidentSections.incidentId, incidentId),
        ))
        .get();
      if (!section) return JSON.stringify({ error: "Section not found" });

      const append = args.append !== false;
      const newContent = append && section.content
        ? section.content + "\n\n" + (args.content as string)
        : (args.content as string);

      db.update(schema.incidentSections)
        .set({
          content: newContent,
          conversationSnippet: (args.content as string).slice(0, 200),
          updatedAt: now,
        })
        .where(eq(schema.incidentSections.id, args.section_id as string))
        .run();

      db.update(schema.incidents)
        .set({ updatedAt: now })
        .where(eq(schema.incidents.id, incidentId))
        .run();

      return JSON.stringify({ success: true, contentLength: newContent.length });
    }

    case "update_depth_assessment": {
      db.update(schema.incidentSections)
        .set({
          depth: args.depth as "UNKNOWN" | "SURFACE" | "MODERATE" | "DEEP",
          depthRationale: args.rationale as string,
          updatedAt: now,
        })
        .where(and(
          eq(schema.incidentSections.id, args.section_id as string),
          eq(schema.incidentSections.incidentId, incidentId),
        ))
        .run();
      return JSON.stringify({ success: true, depth: args.depth });
    }

    case "set_flags": {
      const existingSection = db.select().from(schema.incidentSections)
        .where(and(
          eq(schema.incidentSections.id, args.section_id as string),
          eq(schema.incidentSections.incidentId, incidentId),
        ))
        .get();

      const existingFlags: any[] = existingSection
        ? typeof existingSection.flags === "string"
          ? JSON.parse(existingSection.flags)
          : (existingSection.flags as any[]) || []
        : [];

      const preservedFlags = existingFlags.filter(
        (f) => f.status === "ACCEPTED" || f.status === "RESOLVED",
      );

      const newFlags = (args.flags as Array<{ type: string; note: string }>).map((f) => ({
        ...f,
        status: "OPEN",
        createdAt: now,
      }));

      const flags = [...preservedFlags, ...newFlags];

      db.update(schema.incidentSections)
        .set({ flags: flags as any, updatedAt: now })
        .where(and(
          eq(schema.incidentSections.id, args.section_id as string),
          eq(schema.incidentSections.incidentId, incidentId),
        ))
        .run();

      return JSON.stringify({ success: true, flagCount: flags.length });
    }

    case "query_teaching_moments": {
      const all = db.select().from(schema.teachingMoments).all();
      const query = (args.query as string).toLowerCase();
      const sectionTag = args.section_tag as string | undefined;

      let results = all.filter((tm) =>
        tm.title.toLowerCase().includes(query) ||
        tm.content.toLowerCase().includes(query) ||
        (tm.systemPattern?.toLowerCase().includes(query) ?? false) ||
        (tm.failureMode?.toLowerCase().includes(query) ?? false),
      );

      if (sectionTag) {
        results = results.filter((tm) => {
          const tags = typeof tm.sectionTags === "string" ? JSON.parse(tm.sectionTags) : tm.sectionTags;
          return (tags as string[]).some((t) => t.toLowerCase().includes(sectionTag.toLowerCase()));
        });
      }

      return JSON.stringify(results.slice(0, 5).map((tm) => ({
        title: tm.title, content: tm.content, systemPattern: tm.systemPattern, failureMode: tm.failureMode,
      })));
    }

    case "query_case_studies": {
      const all = db.select().from(schema.caseStudies).all();
      const query = (args.query as string).toLowerCase();
      const results = all.filter((cs) =>
        cs.title.toLowerCase().includes(query) ||
        cs.summary.toLowerCase().includes(query) ||
        cs.company.toLowerCase().includes(query) ||
        cs.failureCategory.toLowerCase().includes(query),
      );
      return JSON.stringify(results.slice(0, 5).map((cs) => ({
        title: cs.title, company: cs.company, year: cs.year, summary: cs.summary, lessons: cs.lessons,
      })));
    }

    case "update_question_response": {
      const section = db.select().from(schema.incidentSections)
        .where(and(
          eq(schema.incidentSections.id, args.section_id as string),
          eq(schema.incidentSections.incidentId, incidentId),
        ))
        .get();
      if (!section) return JSON.stringify({ error: "Section not found" });

      const existing = typeof section.promptResponses === "string"
        ? JSON.parse(section.promptResponses as string)
        : (section.promptResponses || {});
      existing[args.question_index as number] = args.response as string;

      db.update(schema.incidentSections)
        .set({ promptResponses: existing, updatedAt: now })
        .where(eq(schema.incidentSections.id, args.section_id as string))
        .run();

      db.update(schema.incidents)
        .set({ updatedAt: now })
        .where(eq(schema.incidents.id, incidentId))
        .run();

      return JSON.stringify({
        success: true,
        questionIndex: args.question_index,
        responseLength: (args.response as string).length,
      });
    }

    case "write_session_summary": {
      db.update(schema.sessions)
        .set({ summary: args.summary as string })
        .where(eq(schema.sessions.id, sessionId))
        .run();
      return JSON.stringify({ success: true });
    }

    // --- Incident-specific tools ---

    case "record_timeline_event": {
      const eventId = crypto.randomUUID();
      // Get next position
      const existingEvents = db.select().from(schema.timelineEvents)
        .where(eq(schema.timelineEvents.incidentId, incidentId)).all();
      const position = existingEvents.length;

      db.run(sql`INSERT INTO timeline_events (id, incident_id, position, timestamp, description, evidence, actor, event_type, created_at)
        VALUES (${eventId}, ${incidentId}, ${position}, ${args.timestamp as string}, ${args.description as string}, ${(args.evidence as string) || null}, ${(args.actor as string) || null}, ${args.event_type as string}, ${now})`);

      return JSON.stringify({ success: true, id: eventId, position });
    }

    case "record_contributing_factor": {
      const factorId = crypto.randomUUID();

      db.run(sql`INSERT INTO contributing_factors (id, incident_id, category, description, context, is_systemic, created_at)
        VALUES (${factorId}, ${incidentId}, ${args.category as string}, ${args.description as string}, ${(args.context as string) || null}, ${args.is_systemic ? 1 : 0}, ${now})`);

      // Link to timeline events if provided
      const relatedEventIds = args.related_event_ids as string[] | undefined;
      if (relatedEventIds && relatedEventIds.length > 0) {
        for (const eventId of relatedEventIds) {
          db.run(sql`INSERT INTO factor_event_links (factor_id, event_id) VALUES (${factorId}, ${eventId})`);
        }
      }

      return JSON.stringify({ success: true, id: factorId });
    }

    case "record_action_item": {
      const actionId = crypto.randomUUID();

      db.run(sql`INSERT INTO action_items (id, practice_type, practice_id, title, owner, due_date, priority, type, contributing_factor_id, success_criteria, backlog_link, status, created_at)
        VALUES (${actionId}, 'incident', ${incidentId}, ${args.title as string}, ${(args.owner as string) || null}, ${(args.due_date as string) || null}, ${args.priority as string}, ${args.type as string}, ${(args.contributing_factor_id as string) || null}, ${(args.success_criteria as string) || null}, ${(args.backlog_link as string) || null}, 'open', ${now})`);

      return JSON.stringify({ success: true, id: actionId });
    }

    case "suggest_cross_practice_action": {
      const suggestionId = crypto.randomUUID();

      db.run(sql`INSERT INTO cross_practice_suggestions (id, source_practice_type, source_practice_id, target_practice_type, suggestion, rationale, status, created_at)
        VALUES (${suggestionId}, 'incident', ${incidentId}, ${args.target_practice as string}, ${args.suggestion as string}, ${args.rationale as string}, 'suggested', ${now})`);

      return JSON.stringify({ success: true, id: suggestionId });
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}
