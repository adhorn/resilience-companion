import { eq, and } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";
import type { LLMToolDef } from "../llm/index.js";

/**
 * Tool definitions for the Review Facilitator agent.
 * 7 tools that let the agent read/write the ORR document.
 */
export const AGENT_TOOLS: LLMToolDef[] = [
  {
    type: "function",
    function: {
      name: "read_section",
      description: "Read the full content and prompts of a specific ORR section",
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
        "Update the depth assessment for a section based on learning indicators. SURFACE: team recites what exists but can't explain why or predict beyond documented failures (fluency illusion). MODERATE: team retrieves specifics for known scenarios, traces paths, explains some design reasoning, but hasn't predicted novel failures or made cross-section connections. DEEP: team generates predictions docs don't cover, explains why designs work, connects patterns across sections, identifies own blind spots. In the rationale, cite specific indicators you observed (e.g. 'traced failover path accurately but couldn't explain timeout value').",
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
                type: {
                  type: "string",
                  enum: ["RISK", "GAP", "STRENGTH", "FOLLOW_UP"],
                },
                note: { type: "string", description: "Brief description of the flag" },
                severity: {
                  type: "string",
                  enum: ["HIGH", "MEDIUM", "LOW"],
                  description: "Severity level. Required for RISK flags only.",
                },
                deadline: {
                  type: "string",
                  description: "Deadline to address this risk as ISO date (YYYY-MM-DD). Required for RISK flags only.",
                },
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
          section_tag: {
            type: "string",
            description: "Optional: filter by section title",
          },
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
        "PRIMARY tool for recording answers. You MUST call this for every question the team answers — this is what makes answers visible in the UI. Maps each answer to its specific question. Use update_section_content only for cross-cutting observations that don't map to a single question.",
      parameters: {
        type: "object",
        properties: {
          section_id: { type: "string", description: "The section ID" },
          question_index: {
            type: "number",
            description: "0-based index of the question in the section's prompts array",
          },
          response: {
            type: "string",
            description: "The answer text to write for this question",
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
        "Write a summary of what was covered and discovered in this session. Call this when wrapping up a session.",
      parameters: {
        type: "object",
        properties: {
          summary: {
            type: "string",
            description: "Narrative summary of the session: what was discussed, key observations, depth achieved, flags raised",
          },
        },
        required: ["summary"],
      },
    },
  },
];

/**
 * Execute a tool call and return the result as a string.
 */
export function executeTool(
  name: string,
  args: Record<string, unknown>,
  orrId: string,
  sessionId: string,
): string {
  const db = getDb();
  const now = new Date().toISOString();

  switch (name) {
    case "read_section": {
      const section = db
        .select()
        .from(schema.sections)
        .where(
          and(
            eq(schema.sections.id, args.section_id as string),
            eq(schema.sections.orrId, orrId),
          ),
        )
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
      const section = db
        .select()
        .from(schema.sections)
        .where(
          and(
            eq(schema.sections.id, args.section_id as string),
            eq(schema.sections.orrId, orrId),
          ),
        )
        .get();

      if (!section) return JSON.stringify({ error: "Section not found" });

      const append = args.append !== false; // default true
      const newContent = append && section.content
        ? section.content + "\n\n" + (args.content as string)
        : (args.content as string);

      db.update(schema.sections)
        .set({
          content: newContent,
          conversationSnippet: (args.content as string).slice(0, 200),
          updatedAt: now,
        })
        .where(eq(schema.sections.id, args.section_id as string))
        .run();

      // Bump ORR updatedAt
      db.update(schema.orrs)
        .set({ updatedAt: now })
        .where(eq(schema.orrs.id, orrId))
        .run();

      return JSON.stringify({ success: true, contentLength: newContent.length });
    }

    case "update_depth_assessment": {
      db.update(schema.sections)
        .set({
          depth: args.depth as "UNKNOWN" | "SURFACE" | "MODERATE" | "DEEP",
          depthRationale: args.rationale as string,
          updatedAt: now,
        })
        .where(
          and(
            eq(schema.sections.id, args.section_id as string),
            eq(schema.sections.orrId, orrId),
          ),
        )
        .run();

      return JSON.stringify({ success: true, depth: args.depth });
    }

    case "set_flags": {
      const flags = (args.flags as Array<{ type: string; note: string }>).map((f) => ({
        ...f,
        createdAt: now,
      }));

      db.update(schema.sections)
        .set({
          flags: JSON.stringify(flags),
          updatedAt: now,
        })
        .where(
          and(
            eq(schema.sections.id, args.section_id as string),
            eq(schema.sections.orrId, orrId),
          ),
        )
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
          const tags = typeof tm.sectionTags === "string"
            ? JSON.parse(tm.sectionTags)
            : tm.sectionTags;
          return (tags as string[]).some((t) =>
            t.toLowerCase().includes(sectionTag.toLowerCase()),
          );
        });
      }

      return JSON.stringify(
        results.slice(0, 5).map((tm) => ({
          title: tm.title,
          content: tm.content,
          systemPattern: tm.systemPattern,
          failureMode: tm.failureMode,
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
          title: cs.title,
          company: cs.company,
          year: cs.year,
          summary: cs.summary,
          lessons: cs.lessons,
        })),
      );
    }

    case "update_question_response": {
      const section = db
        .select()
        .from(schema.sections)
        .where(
          and(
            eq(schema.sections.id, args.section_id as string),
            eq(schema.sections.orrId, orrId),
          ),
        )
        .get();

      if (!section) return JSON.stringify({ error: "Section not found" });

      const existing = typeof section.promptResponses === "string"
        ? JSON.parse(section.promptResponses as string)
        : (section.promptResponses || {});
      existing[args.question_index as number] = args.response as string;

      db.update(schema.sections)
        .set({
          promptResponses: existing,
          updatedAt: now,
        })
        .where(eq(schema.sections.id, args.section_id as string))
        .run();

      // Bump ORR updatedAt
      db.update(schema.orrs)
        .set({ updatedAt: now })
        .where(eq(schema.orrs.id, orrId))
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

    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}
