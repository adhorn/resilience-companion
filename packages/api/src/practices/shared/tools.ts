/**
 * Shared section tools — tool definitions and executors that work
 * identically across practices, parameterized by table references.
 *
 * Each practice (ORR, incident) uses the same 8 section tools that
 * operate on different tables (sections vs incidentSections, orrs vs incidents).
 * This module eliminates that duplication.
 */
import { eq, and, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb, schema } from "../../db/index.js";
import type { LLMToolDef } from "../../llm/index.js";
import type { PracticeType } from "../../agent/practice.js";
import { safeJsonParse } from "../../validation.js";

// --- Tool definitions ---
// These are the same for every practice; only descriptions vary slightly.

export function createSharedToolDefs(practiceLabel: string): LLMToolDef[] {
  return [
    {
      type: "function",
      function: {
        name: "read_section",
        description: `Read the full content and prompts of a specific ${practiceLabel} section`,
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
          "Update the section's narrative content with cross-cutting observations. IMPORTANT: For answers to specific questions, use update_question_response instead — this tool is for general observations that span multiple questions or don't map to a single question.",
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
          "Update the depth assessment for a section based on learning indicators. SURFACE: team recites what exists but can't explain why or predict beyond documented failures. MODERATE: team retrieves specifics for known scenarios, traces paths, explains some design reasoning. DEEP: team generates predictions docs don't cover, explains why designs work, connects patterns across sections. In the rationale, cite specific indicators you observed.",
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
              description: "Brief explanation of why this depth was assessed",
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
        description:
          "Set flags on a section to highlight risks, gaps, strengths, or items needing follow-up. For RISK flags, always include severity and deadline to ensure accountability.",
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
                  note: { type: "string", description: "Brief description of the flag" },
                  severity: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"], description: "Severity level. Required for RISK flags only." },
                  deadline: { type: "string", description: "Deadline to address this risk as ISO date (YYYY-MM-DD). Required for RISK flags only." },
                },
                required: ["type", "note"],
              },
              description: "Flags to set (replaces existing flags). RISK flags must include severity and deadline.",
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
        description:
          "Search the teaching moment library for relevant industry lessons. Use when the conversation touches on a topic where there might be relevant patterns or failure modes to share.",
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
        description:
          "Search the case study library for relevant real-world incidents to reference in conversation.",
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
          "PRIMARY tool for recording answers. You MUST call this for every question the team answers — this is what makes answers visible in the UI. Maps each answer to its specific question. Use update_section_content only for cross-cutting observations. When recording findings from code exploration, set source to 'code' and include the file reference in code_ref.",
        parameters: {
          type: "object",
          properties: {
            section_id: { type: "string", description: "The section ID" },
            question_index: { type: "number", description: "0-based index of the question in the section's prompts array" },
            response: { type: "string", description: "The answer text to write for this question" },
            source: {
              type: "string",
              enum: ["team", "code"],
              description: "Where this answer came from. 'team' (default) = team provided from memory. 'code' = found by reading source code.",
            },
            code_ref: {
              type: "string",
              description: "File reference when source is 'code', e.g. 'src/retry.ts:45-92'. Omit for team-sourced answers.",
            },
          },
          required: ["section_id", "question_index", "response"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "write_session_summary",
        description:
          "Write a summary of what was covered and discovered in this session. Call this when wrapping up a session. Include discoveries — things that surprised the team, contradicted expectations, or revealed gaps between how they thought the system works and how it actually works. Also rate the session's learning quality and engagement pattern.",
        parameters: {
          type: "object",
          properties: {
            summary: { type: "string", description: "Narrative summary of the session: what was discussed, key observations, depth achieved, flags raised" },
            discoveries: {
              type: "array",
              items: { type: "string" },
              description: "List of things that surprised the team or contradicted their expectations during this session.",
            },
            learning_quality: {
              type: "string",
              enum: ["high", "moderate", "low"],
              description: "Rate this session's learning quality. HIGH: genuine discoveries, prediction errors corrected, mental models updated. MODERATE: some new understanding but mostly confirming existing knowledge. LOW: surface-level recitation, no surprises, fluency illusion suspected.",
            },
            engagement_pattern: {
              type: "string",
              enum: ["sustained_productive", "started_easy_deepened", "struggled_then_learned", "stayed_surface", "frustrated_throughout"],
              description: "The engagement arc of this session. sustained_productive: team was challenged throughout and made steady progress. started_easy_deepened: began fluently but got into real learning. struggled_then_learned: initial frustration gave way to breakthroughs. stayed_surface: conversation never got past recitation. frustrated_throughout: team hit walls and didn't break through.",
            },
          },
          required: ["summary"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "record_discovery",
        description:
          "Record a learning signal — something that surprised the team, contradicted expectations, or revealed a gap between how they thought the system works and how it actually works. Call this immediately when you detect a surprise, mental model update, or WAI-WAD gap. Be specific: not 'learned about architecture' but 'discovered retry logic has no jitter, risking thundering herd at scale'.",
        parameters: {
          type: "object",
          properties: {
            section_id: { type: "string", description: "The section this discovery relates to. Omit if it spans multiple sections." },
            text: { type: "string", description: "Specific description of what was learned or what surprised the team" },
            source: { type: "string", enum: ["conversation", "learning_command"], description: "Origin: 'conversation' for real-time discoveries during chat, 'learning_command' for retroactive extraction via /learning. Defaults to 'conversation'." },
          },
          required: ["text"],
        },
      },
    },
  ];
}

// --- Shared cross-practice tools ---
// suggest_experiment, suggest_cross_practice_action, record_action_item
// These exist in both practices with the same interface (only practiceType differs at execution time).

export const CROSS_PRACTICE_TOOL_DEFS: LLMToolDef[] = [
  {
    type: "function",
    function: {
      name: "suggest_experiment",
      description:
        "Suggest a chaos experiment, load test, or gameday based on findings. Use when the team claims resilience but hasn't validated it, when blast radius is high and failure modes are untested, or when the team uses hedging language about system behavior. Prioritize by ROI: largest blast radius + lowest confidence = highest priority.",
      parameters: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["chaos_experiment", "load_test", "gameday"],
            description: "chaos_experiment: test failure modes. load_test: validate scaling claims. gameday: exercise team response.",
          },
          title: { type: "string", description: "Short description of the experiment" },
          hypothesis: { type: "string", description: "What you expect to happen" },
          rationale: { type: "string", description: "Why this matters — reference specific findings" },
          priority: {
            type: "string",
            enum: ["critical", "high", "medium", "low"],
            description: "critical: unvalidated + large blast radius + customer-facing. high: untested failure mode with significant blast radius. medium: known gap with moderate impact. low: minor gap or partially covered.",
          },
          priority_reasoning: { type: "string", description: "Why this priority level — cite blast radius, confidence level, customer impact" },
          blast_radius_notes: { type: "string", description: "What's at stake if the hypothesis is wrong" },
          section_id: { type: "string", description: "The section that triggered this suggestion" },
        },
        required: ["type", "title", "hypothesis", "rationale", "priority", "priority_reasoning"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "suggest_cross_practice_action",
      description:
        "Suggest how a finding could inform another resilience practice (chaos engineering, load testing, ORR, incident analysis, GameDay). This builds the cross-practice learning system.",
      parameters: {
        type: "object",
        properties: {
          target_practice: {
            type: "string",
            enum: ["chaos_engineering", "load_testing", "orr", "incident_analysis", "gameday"],
            description: "Which practice this suggestion is for",
          },
          suggestion: { type: "string", description: "What to do" },
          rationale: { type: "string", description: "Why this finding suggests it" },
        },
        required: ["target_practice", "suggestion", "rationale"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "record_action_item",
      description:
        "Record a structured action item. More structured than FOLLOW_UP flags: includes owner, priority, due date. Use for concrete things that need doing.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Short description of what needs to be done" },
          owner: { type: "string", description: "Person or team responsible" },
          due_date: { type: "string", description: "Target date (YYYY-MM-DD)" },
          priority: { type: "string", enum: ["high", "medium", "low"], description: "Priority level" },
          type: {
            type: "string",
            enum: ["technical", "process", "organizational", "learning"],
            description: "Category of the action",
          },
          contributing_factor_id: { type: "string", description: "ID of contributing factor this addresses (for incidents)" },
          success_criteria: { type: "string", description: "How to know this is done" },
          backlog_link: { type: "string", description: "Link to tracking system" },
        },
        required: ["title", "priority", "type"],
      },
    },
  },
];

// --- Table abstraction ---
// The section tools work on different tables depending on the practice.

interface SectionTableRef {
  table: any;
  idCol: any;
  parentIdCol: any;
  parentTable: any;
  parentIdField: any;
}

function getSectionTableRef(practiceType: PracticeType): SectionTableRef {
  if (practiceType === "incident") {
    return {
      table: schema.incidentSections,
      idCol: schema.incidentSections.id,
      parentIdCol: schema.incidentSections.incidentId,
      parentTable: schema.incidents,
      parentIdField: schema.incidents.id,
    };
  }
  return {
    table: schema.sections,
    idCol: schema.sections.id,
    parentIdCol: schema.sections.orrId,
    parentTable: schema.orrs,
    parentIdField: schema.orrs.id,
  };
}

// --- Shared tool executor ---

export function executeSharedTool(
  name: string,
  args: Record<string, unknown>,
  practiceType: PracticeType,
  practiceId: string,
  sessionId: string,
): string | null {
  const db = getDb();
  const now = new Date().toISOString();
  const ref = getSectionTableRef(practiceType);

  switch (name) {
    case "read_section": {
      const section = db.select().from(ref.table)
        .where(and(eq(ref.idCol, args.section_id as string), eq(ref.parentIdCol, practiceId)))
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
      const section = db.select().from(ref.table)
        .where(and(eq(ref.idCol, args.section_id as string), eq(ref.parentIdCol, practiceId)))
        .get();
      if (!section) return JSON.stringify({ error: "Section not found" });

      const append = args.append !== false;
      const newContent = append && section.content
        ? section.content + "\n\n" + (args.content as string)
        : (args.content as string);

      db.update(ref.table)
        .set({
          content: newContent,
          conversationSnippet: (args.content as string).slice(0, 200),
          updatedAt: now,
        })
        .where(and(eq(ref.idCol, args.section_id as string), eq(ref.parentIdCol, practiceId)))
        .run();

      db.update(ref.parentTable)
        .set({ updatedAt: now })
        .where(eq(ref.parentIdField, practiceId))
        .run();

      return JSON.stringify({ success: true, contentLength: newContent.length });
    }

    case "update_depth_assessment": {
      db.update(ref.table)
        .set({
          depth: args.depth as "UNKNOWN" | "SURFACE" | "MODERATE" | "DEEP",
          depthRationale: args.rationale as string,
          updatedAt: now,
        })
        .where(and(eq(ref.idCol, args.section_id as string), eq(ref.parentIdCol, practiceId)))
        .run();
      return JSON.stringify({ success: true, depth: args.depth });
    }

    case "set_flags": {
      const existingSection = db.select().from(ref.table)
        .where(and(eq(ref.idCol, args.section_id as string), eq(ref.parentIdCol, practiceId)))
        .get();

      const existingFlags: any[] = existingSection
        ? safeJsonParse(existingSection.flags, [])
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

      db.update(ref.table)
        .set({ flags: flags as any, updatedAt: now })
        .where(and(eq(ref.idCol, args.section_id as string), eq(ref.parentIdCol, practiceId)))
        .run();

      return JSON.stringify({ success: true, flagCount: flags.length });
    }

    case "query_teaching_moments": {
      const all = db.select().from(schema.teachingMoments).all();
      const query = (args.query as string).toLowerCase();
      const sectionTag = args.section_tag as string | undefined;

      let results = all.filter(
        (tm) =>
          tm.title.toLowerCase().includes(query) ||
          tm.content.toLowerCase().includes(query) ||
          (tm.systemPattern?.toLowerCase().includes(query) ?? false) ||
          (tm.failureMode?.toLowerCase().includes(query) ?? false),
      );

      if (sectionTag) {
        results = results.filter((tm) => {
          const tags: string[] = safeJsonParse(tm.sectionTags, []);
          return tags.some((t) => t.toLowerCase().includes(sectionTag.toLowerCase()));
        });
      }

      return JSON.stringify(
        results.slice(0, 5).map((tm) => ({
          title: tm.title, content: tm.content, systemPattern: tm.systemPattern, failureMode: tm.failureMode,
        })),
      );
    }

    case "query_case_studies": {
      const all = db.select().from(schema.caseStudies).all();
      const query = (args.query as string).toLowerCase();
      const results = all.filter(
        (cs) =>
          cs.title.toLowerCase().includes(query) ||
          cs.summary.toLowerCase().includes(query) ||
          cs.company.toLowerCase().includes(query) ||
          cs.failureCategory.toLowerCase().includes(query),
      );
      return JSON.stringify(
        results.slice(0, 5).map((cs) => ({
          title: cs.title, company: cs.company, year: cs.year, summary: cs.summary, lessons: cs.lessons,
        })),
      );
    }

    case "update_question_response": {
      const section = db.select().from(ref.table)
        .where(and(eq(ref.idCol, args.section_id as string), eq(ref.parentIdCol, practiceId)))
        .get();
      if (!section) return JSON.stringify({ error: "Section not found" });

      const existing = safeJsonParse<Record<string, any>>(section.promptResponses, {});

      const source = args.source as string | undefined;
      if (source) {
        const entry: Record<string, string> = { answer: args.response as string, source };
        if (args.code_ref) entry.codeRef = args.code_ref as string;
        existing[args.question_index as number] = entry;
      } else {
        existing[args.question_index as number] = args.response as string;
      }

      db.update(ref.table)
        .set({ promptResponses: existing, updatedAt: now })
        .where(and(eq(ref.idCol, args.section_id as string), eq(ref.parentIdCol, practiceId)))
        .run();

      db.update(ref.parentTable)
        .set({ updatedAt: now })
        .where(eq(ref.parentIdField, practiceId))
        .run();

      return JSON.stringify({
        success: true,
        questionIndex: args.question_index,
        responseLength: (args.response as string).length,
      });
    }

    case "write_session_summary": {
      const updates: Record<string, unknown> = { summary: args.summary as string };
      if (args.discoveries && Array.isArray(args.discoveries) && (args.discoveries as string[]).length > 0) {
        updates.discoveries = args.discoveries;
      }
      if (args.learning_quality) {
        updates.learningQuality = args.learning_quality as string;
      }
      if (args.engagement_pattern) {
        updates.engagementPattern = args.engagement_pattern as string;
      }
      db.update(schema.sessions)
        .set(updates)
        .where(eq(schema.sessions.id, sessionId))
        .run();
      return JSON.stringify({
        success: true,
        discoveryCount: (args.discoveries as string[] || []).length,
        learningQuality: args.learning_quality || null,
        engagementPattern: args.engagement_pattern || null,
      });
    }

    case "record_discovery": {
      const discSource = (args.source as string) === "learning_command" ? "learning_command" : "conversation";

      // Dedup by exact text (within same source)
      const existingDisc = db.select().from(schema.discoveries)
        .where(and(
          eq(schema.discoveries.practiceType, practiceType),
          eq(schema.discoveries.practiceId, practiceId),
          eq(schema.discoveries.text, args.text as string),
        ))
        .get();

      if (existingDisc) {
        return JSON.stringify({ success: true, discoveryId: existingDisc.id, deduplicated: true });
      }

      const discId = nanoid();
      db.insert(schema.discoveries).values({
        id: discId,
        practiceType,
        practiceId,
        sectionId: (args.section_id as string) || null,
        sessionId,
        text: args.text as string,
        source: discSource,
        createdAt: now,
      }).run();

      return JSON.stringify({ success: true, discoveryId: discId, text: args.text });
    }

    // --- Cross-practice tools ---

    case "suggest_experiment": {
      return executeSuggestExperiment(args, practiceType, practiceId, now);
    }

    case "suggest_cross_practice_action": {
      const suggId = nanoid();

      // Auto-link to parent ORR when a feature ORR suggests updates to its parent
      let linkedPracticeId: string | null = null;
      if (practiceType === "orr" && args.target_practice === "orr") {
        const sourceOrr = db.select({ parentOrrId: schema.orrs.parentOrrId })
          .from(schema.orrs).where(eq(schema.orrs.id, practiceId)).get();
        if (sourceOrr?.parentOrrId) {
          linkedPracticeId = sourceOrr.parentOrrId;
        }
      }

      db.insert(schema.crossPracticeSuggestions).values({
        id: suggId,
        sourcePracticeType: practiceType,
        sourcePracticeId: practiceId,
        targetPracticeType: args.target_practice as any,
        suggestion: args.suggestion as string,
        rationale: args.rationale as string,
        linkedPracticeId,
        createdAt: now,
      }).run();
      return JSON.stringify({ success: true, suggestionId: suggId, targetPractice: args.target_practice, linkedPracticeId });
    }

    case "record_action_item": {
      // Dedup by title
      const existingAction = db.select().from(schema.actionItems)
        .where(and(
          eq(schema.actionItems.practiceType, practiceType),
          eq(schema.actionItems.practiceId, practiceId),
          eq(schema.actionItems.title, args.title as string),
        ))
        .get();

      if (existingAction) {
        return JSON.stringify({ success: true, actionItemId: existingAction.id, deduplicated: true });
      }

      const actionId = nanoid();
      db.insert(schema.actionItems).values({
        id: actionId,
        practiceType,
        practiceId,
        title: args.title as string,
        owner: (args.owner as string) || null,
        dueDate: (args.due_date as string) || null,
        priority: (args.priority as "high" | "medium" | "low") || "medium",
        type: args.type as "technical" | "process" | "organizational" | "learning",
        contributingFactorId: (args.contributing_factor_id as string) || null,
        successCriteria: (args.success_criteria as string) || null,
        backlogLink: (args.backlog_link as string) || null,
        status: "open",
        createdAt: now,
      }).run();

      return JSON.stringify({ success: true, actionItemId: actionId, title: args.title });
    }

    default:
      return null; // Not a shared tool — caller should handle practice-specific tools
  }
}

// --- Helper: suggest_experiment (shared logic, parameterized by practiceType) ---

function executeSuggestExperiment(
  args: Record<string, unknown>,
  practiceType: PracticeType,
  practiceId: string,
  now: string,
): string {
  const db = getDb();

  // Resolve service for this practice instance
  let serviceId: string | null = null;
  let serviceName: string | null = null;
  let teamId: string;

  if (practiceType === "orr") {
    const orr = db.select().from(schema.orrs).where(eq(schema.orrs.id, practiceId)).get();
    if (!orr) return JSON.stringify({ error: "ORR not found" });
    serviceId = orr.serviceId;
    serviceName = orr.serviceName;
    teamId = orr.teamId;
  } else {
    const incident = db.select().from(schema.incidents).where(eq(schema.incidents.id, practiceId)).get();
    if (!incident) return JSON.stringify({ error: "Incident not found" });
    serviceId = incident.serviceId;
    serviceName = incident.serviceName;
    teamId = incident.teamId;
  }

  // Auto-create service if not linked yet
  if (!serviceId && serviceName) {
    const existing = db.select().from(schema.services)
      .where(and(eq(schema.services.teamId, teamId), eq(schema.services.name, serviceName)))
      .get();

    if (existing) {
      serviceId = existing.id;
    } else {
      serviceId = nanoid();
      db.insert(schema.services).values({
        id: serviceId,
        name: serviceName,
        teamId,
        createdAt: now,
        updatedAt: now,
      }).run();
    }

    // Link the practice instance to the service
    if (practiceType === "orr") {
      db.update(schema.orrs).set({ serviceId }).where(eq(schema.orrs.id, practiceId)).run();
    } else {
      db.update(schema.incidents).set({ serviceId }).where(eq(schema.incidents.id, practiceId)).run();
    }
  }

  if (!serviceId) {
    return JSON.stringify({ error: `No service associated with this ${practiceType}. Cannot create experiment suggestion.` });
  }

  // Dedup
  const existingExp = db.select().from(schema.experimentSuggestions)
    .where(and(
      eq(schema.experimentSuggestions.sourcePracticeType, practiceType),
      eq(schema.experimentSuggestions.sourcePracticeId, practiceId),
      eq(schema.experimentSuggestions.title, args.title as string),
    ))
    .get();

  if (existingExp) {
    return JSON.stringify({
      success: true, experimentId: existingExp.id, type: existingExp.type,
      priority: existingExp.priority, title: existingExp.title, deduplicated: true,
    });
  }

  const expId = nanoid();
  db.insert(schema.experimentSuggestions).values({
    id: expId,
    serviceId,
    sourcePracticeType: practiceType,
    sourcePracticeId: practiceId,
    sourceSectionId: (args.section_id as string) || null,
    type: args.type as "chaos_experiment" | "load_test" | "gameday",
    title: args.title as string,
    hypothesis: args.hypothesis as string,
    rationale: args.rationale as string,
    priority: args.priority as "critical" | "high" | "medium" | "low",
    priorityReasoning: args.priority_reasoning as string,
    blastRadiusNotes: (args.blast_radius_notes as string) || null,
    createdAt: now,
    updatedAt: now,
  }).run();

  return JSON.stringify({
    success: true, experimentId: expId, type: args.type, priority: args.priority, title: args.title,
  });
}
