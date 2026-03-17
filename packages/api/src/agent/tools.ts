import { eq, and } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";
import type { LLMToolDef } from "../llm/index.js";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";

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
        "PRIMARY tool for recording answers. You MUST call this for every question the team answers — this is what makes answers visible in the UI. Maps each answer to its specific question. Use update_section_content only for cross-cutting observations that don't map to a single question. When recording findings from read_file or search_code, set source to 'code' and include the file reference in code_ref.",
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
  // --- Code exploration tools (only work if ORR has repositoryPath configured) ---
  {
    type: "function",
    function: {
      name: "search_code",
      description:
        "Search the service's source code for patterns, function names, or keywords. Returns matching file paths and line snippets. Only use when the team explicitly asks for help finding something in the code (e.g. 'help me find that out'). NEVER use proactively.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Text or pattern to search for" },
          file_pattern: {
            type: "string",
            description: "Optional glob to filter files, e.g. '*.ts' or 'src/**/*.py'",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description:
        "Read the contents of a source code file. Only use when the team explicitly asks you to read code (e.g. 'ok, tell me', 'read that file'). When you record findings from this tool using update_question_response, always set source to 'code'.",
      parameters: {
        type: "object",
        properties: {
          file_path: { type: "string", description: "Path relative to repository root" },
          line_start: { type: "number", description: "Optional: start reading from this line (1-based)" },
          line_end: { type: "number", description: "Optional: stop reading at this line (inclusive)" },
        },
        required: ["file_path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_directory",
      description:
        "List files and directories at a path in the service's source code. Use to orient before reading specific files.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path relative to repository root. Use '' or '.' for root." },
        },
        required: ["path"],
      },
    },
  },
];

/**
 * Resolve and validate a file path within the ORR's repository.
 * Returns the absolute path if valid, or null if the repo isn't configured or path escapes the sandbox.
 */
function resolveRepoPath(orrId: string, relativePath: string): { absPath: string; repoRoot: string } | { error: string } {
  const db = getDb();
  const orr = db
    .select()
    .from(schema.orrs)
    .where(eq(schema.orrs.id, orrId))
    .get();

  if (!orr?.repositoryLocalPath) {
    return { error: "No repository path configured for this ORR. Ask the team to set one." };
  }

  const repoRoot = resolve(orr.repositoryLocalPath);
  if (!existsSync(repoRoot) || !statSync(repoRoot).isDirectory()) {
    return { error: `Repository path does not exist or is not a directory: ${repoRoot}` };
  }

  const absPath = resolve(repoRoot, relativePath);

  // Path traversal protection: resolved path must stay within repo root
  if (!absPath.startsWith(repoRoot + "/") && absPath !== repoRoot) {
    return { error: "Path escapes the repository root. Access denied." };
  }

  return { absPath, repoRoot };
}

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
      // Preserve existing flags that have been accepted/resolved
      const existingSection = db
        .select()
        .from(schema.sections)
        .where(
          and(
            eq(schema.sections.id, args.section_id as string),
            eq(schema.sections.orrId, orrId),
          ),
        )
        .get();

      const existingFlags: any[] = existingSection
        ? typeof existingSection.flags === "string"
          ? JSON.parse(existingSection.flags)
          : (existingSection.flags as any[]) || []
        : [];

      // Keep flags that have been accepted or resolved (don't let agent overwrite resolutions)
      const preservedFlags = existingFlags.filter(
        (f) => f.status === "ACCEPTED" || f.status === "RESOLVED",
      );

      // New flags from the agent get OPEN status
      const newFlags = (args.flags as Array<{ type: string; note: string }>).map((f) => ({
        ...f,
        status: "OPEN",
        createdAt: now,
      }));

      const flags = [...preservedFlags, ...newFlags];

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

      // Store as structured PromptResponse if source is provided, otherwise stay backward-compatible
      const source = args.source as string | undefined;
      if (source) {
        const entry: Record<string, string> = {
          answer: args.response as string,
          source,
        };
        if (args.code_ref) entry.codeRef = args.code_ref as string;
        existing[args.question_index as number] = entry;
      } else {
        existing[args.question_index as number] = args.response as string;
      }

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

    // --- Code exploration tools ---

    case "search_code": {
      const result = resolveRepoPath(orrId, ".");
      if ("error" in result) return JSON.stringify({ error: result.error });

      const query = args.query as string;
      const filePattern = args.file_pattern as string | undefined;

      try {
        const output = execSync(
          `grep -rn ${filePattern ? `--include='${filePattern.replace(/'/g, "")}'` : ""} -- ${JSON.stringify(query)} .`,
          {
            cwd: result.repoRoot,
            encoding: "utf-8",
            timeout: 10_000,
            maxBuffer: 512 * 1024,
          },
        );

        // Parse grep output into structured results, limit to 20 matches
        const lines = output.trim().split("\n").slice(0, 20);
        const matches = lines.map((line) => {
          const firstColon = line.indexOf(":");
          const secondColon = line.indexOf(":", firstColon + 1);
          return {
            file: line.slice(0, firstColon).replace(/^\.\//, ""),
            line: parseInt(line.slice(firstColon + 1, secondColon), 10),
            snippet: line.slice(secondColon + 1).trim().slice(0, 200),
          };
        });

        return JSON.stringify({ matches, truncated: output.trim().split("\n").length > 20 });
      } catch (err: any) {
        // grep exits with code 1 when no matches found
        if (err.status === 1) return JSON.stringify({ matches: [], truncated: false });
        return JSON.stringify({ error: `Search failed: ${err.message?.slice(0, 200)}` });
      }
    }

    case "read_file": {
      const filePath = args.file_path as string;
      const result = resolveRepoPath(orrId, filePath);
      if ("error" in result) return JSON.stringify({ error: result.error });

      if (!existsSync(result.absPath) || !statSync(result.absPath).isFile()) {
        return JSON.stringify({ error: `File not found: ${filePath}` });
      }

      try {
        const content = readFileSync(result.absPath, "utf-8");
        const lines = content.split("\n");
        const start = args.line_start ? Math.max(1, args.line_start as number) : 1;
        const end = args.line_end ? Math.min(lines.length, args.line_end as number) : Math.min(lines.length, start + 199);

        const slice = lines.slice(start - 1, end);
        const numbered = slice.map((l, i) => `${start + i}: ${l}`).join("\n");

        return JSON.stringify({
          file: filePath,
          startLine: start,
          endLine: start + slice.length - 1,
          totalLines: lines.length,
          content: numbered,
        });
      } catch (err: any) {
        return JSON.stringify({ error: `Could not read file: ${err.message?.slice(0, 200)}` });
      }
    }

    case "list_directory": {
      const dirPath = args.path as string || ".";
      const result = resolveRepoPath(orrId, dirPath);
      if ("error" in result) return JSON.stringify({ error: result.error });

      if (!existsSync(result.absPath) || !statSync(result.absPath).isDirectory()) {
        return JSON.stringify({ error: `Directory not found: ${dirPath}` });
      }

      try {
        const entries = readdirSync(result.absPath, { withFileTypes: true });
        const items = entries
          .filter((e) => !e.name.startsWith(".") && e.name !== "node_modules")
          .slice(0, 100)
          .map((e) => ({
            name: e.name,
            type: e.isDirectory() ? "directory" : "file",
          }));

        return JSON.stringify({
          path: dirPath,
          entries: items,
          truncated: entries.length > 100,
        });
      } catch (err: any) {
        return JSON.stringify({ error: `Could not list directory: ${err.message?.slice(0, 200)}` });
      }
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}
