/**
 * Tool definitions and executor for the Review Facilitator agent.
 * Shared section tools come from practices/shared/tools.ts.
 * ORR-specific tools: record_dependency, search_code, read_file, list_directory.
 */
import { eq, and, sql } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";
import type { LLMToolDef } from "../llm/index.js";
import { existsSync, readFileSync, readdirSync, statSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { ensureRepo, decryptToken } from "../git.js";
import {
  createSharedToolDefs,
  CROSS_PRACTICE_TOOL_DEFS,
  executeSharedTool,
} from "../practices/shared/tools.js";

// --- ORR-specific tool definitions ---

const ORR_SPECIFIC_TOOLS: LLMToolDef[] = [
  {
    type: "function",
    function: {
      name: "record_dependency",
      description:
        "Record a dependency discovered during conversation. Call this whenever the team mentions a service, database, API, queue, cache, or other system their service depends on (or that depends on them). Also record when you learn about fallback behavior for a dependency.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Name of the dependency (e.g. 'PostgreSQL', 'Auth Service', 'Redis', 'Stripe API')" },
          type: {
            type: "string",
            enum: ["database", "cache", "queue", "api", "storage", "cdn", "dns", "auth", "internal_service", "external_service", "infrastructure", "other"],
            description: "Category of the dependency",
          },
          direction: {
            type: "string",
            enum: ["inbound", "outbound", "both"],
            description: "outbound = we depend on it, inbound = it depends on us, both = bidirectional",
          },
          criticality: {
            type: "string",
            enum: ["critical", "important", "optional"],
            description: "critical = service fails without it, important = degraded without it, optional = nice-to-have",
          },
          has_fallback: { type: "boolean", description: "Whether there's a fallback when this dependency is unavailable" },
          fallback_description: { type: "string", description: "How the fallback works, if any" },
          notes: { type: "string", description: "Additional context about this dependency — failure modes, SLAs, ownership, etc." },
          section_id: { type: "string", description: "The section where this dependency was discussed" },
        },
        required: ["name", "type"],
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
          file_pattern: { type: "string", description: "Optional glob to filter files, e.g. '*.ts' or 'src/**/*.py'" },
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
      description: "List files and directories at a path in the service's source code. Use to orient before reading specific files.",
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

export const AGENT_TOOLS: LLMToolDef[] = [
  ...createSharedToolDefs("ORR"),
  ...CROSS_PRACTICE_TOOL_DEFS,
  ...ORR_SPECIFIC_TOOLS,
];

/**
 * Resolve and validate a file path within the ORR's repository.
 * If the local clone is missing, attempts to re-clone using the stored URL and token.
 */
function resolveRepoPath(orrId: string, relativePath: string): { absPath: string; repoRoot: string; warning?: string } | { error: string } {
  const db = getDb();
  const orr = db.select().from(schema.orrs).where(eq(schema.orrs.id, orrId)).get();

  if (!orr?.repositoryLocalPath && !orr?.repositoryPath) {
    return { error: "No repository configured for this ORR. Add a repository URL in the ORR settings to enable code exploration." };
  }

  let logicalRoot = orr.repositoryLocalPath ? resolve(orr.repositoryLocalPath) : "";
  let warning: string | undefined;

  // If local clone is missing, attempt to re-clone
  if (!logicalRoot || !existsSync(logicalRoot) || !existsSync(resolve(logicalRoot, ".git"))) {
    if (!orr.repositoryPath) {
      return { error: "The local repository clone is missing and no repository URL is stored. Re-add the repository in ORR settings." };
    }

    // Decrypt stored token
    const token = orr.repositoryToken ? decryptToken(orr.repositoryToken) ?? undefined : undefined;
    const result = ensureRepo(orr.repositoryPath, token);

    if ("error" in result) {
      return { error: result.error };
    }

    // Update the stored local path
    logicalRoot = resolve(result.localPath);
    db.update(schema.orrs)
      .set({ repositoryLocalPath: result.localPath })
      .where(eq(schema.orrs.id, orrId))
      .run();

    if (result.pullWarning) {
      warning = result.pullWarning;
    }
  }

  let realRoot: string;
  try { realRoot = realpathSync(logicalRoot); } catch { return { error: "Could not resolve repository path." }; }

  const logicalPath = resolve(logicalRoot, relativePath);
  if (!logicalPath.startsWith(logicalRoot + "/") && logicalPath !== logicalRoot) {
    return { error: "Path escapes the repository root. Access denied." };
  }

  let realPath: string;
  try { realPath = realpathSync(logicalPath); } catch {
    return { absPath: logicalPath, repoRoot: logicalRoot, warning };
  }

  if (!realPath.startsWith(realRoot + "/") && realPath !== realRoot) {
    return { error: "Path escapes the repository root via symlink. Access denied." };
  }

  return { absPath: realPath, repoRoot: realRoot, warning };
}

/**
 * Execute a tool call and return the result as a string.
 * Delegates shared tools to executeSharedTool, handles ORR-specific tools here.
 */
export function executeTool(
  name: string,
  args: Record<string, unknown>,
  orrId: string,
  sessionId: string,
): string {
  // Try shared tools first
  const sharedResult = executeSharedTool(name, args, "orr", orrId, sessionId);
  if (sharedResult !== null) return sharedResult;

  // ORR-specific tools
  const db = getDb();
  const now = new Date().toISOString();

  switch (name) {
    case "record_dependency": {
      const depName = args.name as string;
      const depType = args.type as string;

      const existing = db.select().from(schema.dependencies)
        .where(and(
          eq(schema.dependencies.orrId, orrId),
          sql`LOWER(${schema.dependencies.name}) = LOWER(${depName})`,
        ))
        .get();

      if (existing) {
        const updates: Record<string, unknown> = {};
        if (args.direction) updates.direction = args.direction;
        if (args.criticality) updates.criticality = args.criticality;
        if (args.has_fallback !== undefined) updates.hasFallback = args.has_fallback ? 1 : 0;
        if (args.fallback_description) updates.fallbackDescription = args.fallback_description;
        if (args.notes) updates.notes = existing.notes
          ? existing.notes + "\n" + (args.notes as string)
          : args.notes;
        if (args.section_id) updates.sectionId = args.section_id;

        db.update(schema.dependencies)
          .set(updates)
          .where(eq(schema.dependencies.id, existing.id))
          .run();

        return JSON.stringify({ success: true, action: "updated", name: depName });
      }

      const depId = crypto.randomUUID();
      db.run(
        sql`INSERT INTO dependencies (id, orr_id, section_id, name, type, direction, criticality, has_fallback, fallback_description, notes, created_at)
            VALUES (${depId}, ${orrId}, ${(args.section_id as string) || null}, ${depName}, ${depType}, ${(args.direction as string) || "outbound"}, ${(args.criticality as string) || "important"}, ${args.has_fallback ? 1 : 0}, ${(args.fallback_description as string) || null}, ${(args.notes as string) || null}, ${now})`,
      );

      return JSON.stringify({ success: true, action: "created", name: depName });
    }

    case "search_code": {
      const result = resolveRepoPath(orrId, ".");
      if ("error" in result) return JSON.stringify({ error: result.error });

      const query = args.query as string;
      const filePattern = args.file_pattern as string | undefined;

      const grepArgs = ["-rn", "--color=never"];
      if (filePattern) {
        if (/^[a-zA-Z0-9.*?\/\-_{}]+$/.test(filePattern)) {
          grepArgs.push(`--include=${filePattern}`);
        }
      }
      grepArgs.push("--", query, ".");

      try {
        const output = execFileSync("grep", grepArgs, {
          cwd: result.repoRoot,
          encoding: "utf-8",
          timeout: 10_000,
          maxBuffer: 512 * 1024,
        });

        const lines = output.trim().split("\n").slice(0, 20);
        const matches = lines.map((line: string) => {
          const firstColon = line.indexOf(":");
          const secondColon = line.indexOf(":", firstColon + 1);
          return {
            file: line.slice(0, firstColon).replace(/^\.\//, ""),
            line: parseInt(line.slice(firstColon + 1, secondColon), 10),
            snippet: line.slice(secondColon + 1).trim().slice(0, 200),
          };
        });

        return JSON.stringify({ matches, truncated: output.trim().split("\n").length > 20, ...(result.warning ? { warning: result.warning } : {}) });
      } catch (err: any) {
        if (err.status === 1) return JSON.stringify({ matches: [], truncated: false, ...(result.warning ? { warning: result.warning } : {}) });
        return JSON.stringify({ error: "Code search failed. The repository may be in an unexpected state." });
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
          ...(result.warning ? { warning: result.warning } : {}),
        });
      } catch (err: any) {
        return JSON.stringify({ error: "Could not read the file. It may be binary or inaccessible." });
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
          .map((e) => ({ name: e.name, type: e.isDirectory() ? "directory" : "file" }));

        return JSON.stringify({ path: dirPath, entries: items, truncated: entries.length > 100, ...(result.warning ? { warning: result.warning } : {}) });
      } catch (err: any) {
        return JSON.stringify({ error: "Could not list the directory. It may not exist or be inaccessible." });
      }
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}
