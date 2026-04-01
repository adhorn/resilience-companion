/**
 * Shared session route factory.
 *
 * Creates Hono routes for session CRUD, SSE streaming, token caps,
 * auto-renewal, and message deduplication — parameterized by practice.
 *
 * Each practice provides:
 * - How to verify ownership (verifyOwnership)
 * - The PracticeConfig for the agent loop
 * - The agent profile name
 * - An optional onSessionEnd hook (e.g. ORR snapshots on end)
 */
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { nanoid } from "nanoid";
import { eq, and, gte, sql } from "drizzle-orm";
import { MAX_SESSION_TOKENS, MAX_DAILY_TOKENS } from "@orr/shared";
import { getDb, schema } from "../../db/index.js";
import { requireAuth } from "../../middleware/auth.js";
import { runAgent } from "../../agent/loop.js";
import { getLLM } from "../../llm/index.js";
import type { LLMToolDef, LLMMessage } from "../../llm/index.js";
import type { PracticeConfig } from "../../agent/practice.js";
import { log } from "../../logger.js";
import { sendMessageSchema, validateBody, safeJsonParse } from "../../validation.js";

// --- Shared utilities ---

/**
 * Trim conversation history to fit within a token budget.
 * Keeps the most recent messages, walking backwards until the budget is exhausted.
 * Ensures we don't start mid-pair (always starts with a user message).
 */
export function trimHistory(
  messages: LLMMessage[],
  maxTokens: number,
  charsPerToken: number,
): LLMMessage[] {
  if (messages.length === 0) return messages;

  let tokenCount = 0;
  let keepFrom = messages.length;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msgTokens = Math.ceil((messages[i].content?.length || 0) / charsPerToken);
    if (tokenCount + msgTokens > maxTokens) break;
    tokenCount += msgTokens;
    keepFrom = i;
  }

  if (keepFrom < messages.length && messages[keepFrom].role === "assistant") {
    keepFrom++;
  }

  const trimmed = messages.slice(keepFrom);

  if (keepFrom > 0 && trimmed.length < messages.length) {
    log("info", "History trimmed", { kept: trimmed.length, total: messages.length, estimatedTokens: tokenCount });
  }

  return trimmed;
}

/**
 * Compute daily token usage across ALL practices for a team.
 * Sums token usage from sessions started today, joining on both orrs and incidents tables.
 */
export function getDailyTokenUsage(db: ReturnType<typeof getDb>, teamId: string): number {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayISO = todayStart.toISOString();

  const orrUsage = db
    .select({ total: sql<number>`coalesce(sum(${schema.sessions.tokenUsage}), 0)` })
    .from(schema.sessions)
    .innerJoin(schema.orrs, eq(schema.sessions.orrId, schema.orrs.id))
    .where(and(eq(schema.orrs.teamId, teamId), gte(schema.sessions.startedAt, todayISO)))
    .get();

  const incidentUsage = db
    .select({ total: sql<number>`coalesce(sum(${schema.sessions.tokenUsage}), 0)` })
    .from(schema.sessions)
    .innerJoin(schema.incidents, eq(schema.sessions.orrId, schema.incidents.id))
    .where(and(eq(schema.incidents.teamId, teamId), gte(schema.sessions.startedAt, todayISO)))
    .get();

  return (orrUsage?.total ?? 0) + (incidentUsage?.total ?? 0);
}

// --- Pre-renewal summary flush ---

/** Tool definition for write_session_summary only (used during flush). */
const FLUSH_TOOL: LLMToolDef = {
  type: "function",
  function: {
    name: "write_session_summary",
    description: "Write a summary of what was covered and discovered in this session, including learning quality assessment.",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string", description: "Narrative summary of the session" },
        discoveries: {
          type: "array",
          items: { type: "string" },
          description: "Things that surprised the team or contradicted their expectations.",
        },
        learning_quality: {
          type: "string",
          enum: ["high", "moderate", "low"],
          description: "Rate this session's learning quality. HIGH: genuine discoveries, prediction errors corrected, mental models updated. MODERATE: some new understanding but mostly confirming existing knowledge. LOW: surface-level recitation, no surprises.",
        },
        engagement_pattern: {
          type: "string",
          enum: ["sustained_productive", "started_easy_deepened", "struggled_then_learned", "stayed_surface", "frustrated_throughout"],
          description: "The engagement arc of this session.",
        },
      },
      required: ["summary"],
    },
  },
};

/**
 * Run a single LLM call to generate a session summary before auto-renewal.
 * This is the "pre-compaction flush" — it captures the agent's understanding
 * of the session before context is lost. Returns true if summary was written.
 */
export async function flushSessionSummary(
  practiceConfig: PracticeConfig,
  practiceId: string,
  sessionId: string,
  recentMessages: Array<{ role: string; content: string }>,
): Promise<boolean> {
  const llm = getLLM();

  // Build a compact conversation for the flush call
  const last10 = recentMessages.slice(-10);
  const conversationSample = last10
    .map((m) => `${m.role}: ${m.content.slice(0, 300)}`)
    .join("\n\n");

  const flushMessages: LLMMessage[] = [
    {
      role: "system",
      content: `You are a session summarizer. A review session is about to auto-renew because it reached its token budget. Your ONLY job is to call write_session_summary with a good summary, discoveries, and learning quality assessment before the session closes.

Summarize: what sections were discussed, key observations and depth assessments, flags raised, and anything that surprised the team. Be concise but thorough — this summary will be the only record of this session's conversation.

Also rate the session's learning quality based on: discoveries made, prediction accuracy, depth achieved, and whether the team was genuinely challenged or just reciting known answers. And describe the engagement pattern — was the team productively challenged throughout, did they start easy and deepen, did they struggle then learn, did they stay at the surface, or were they frustrated throughout?`,
    },
    {
      role: "user",
      content: `Here is the recent conversation from this session. Write a session summary now.\n\n${conversationSample}`,
    },
  ];

  try {
    const stream = llm.chat(flushMessages, [FLUSH_TOOL]);

    let toolCallId = "";
    let toolArgs = "";
    let calledSummary = false;

    for await (const chunk of stream) {
      switch (chunk.type) {
        case "tool_call_start":
          if (chunk.toolName === "write_session_summary") {
            toolCallId = chunk.toolCallId || "";
            toolArgs = "";
            calledSummary = true;
          }
          break;
        case "tool_call_args":
          if (calledSummary) toolArgs += chunk.toolArgs || "";
          break;
        case "tool_call_end":
          if (calledSummary && chunk.toolArgs) toolArgs = chunk.toolArgs;
          break;
      }
    }

    if (calledSummary && toolArgs) {
      const args = JSON.parse(toolArgs);
      // Execute the tool via the practice's executor (writes to DB)
      practiceConfig.executeTool("write_session_summary", args, practiceId, sessionId);
      log("info", "Pre-renewal summary flush succeeded", { sessionId, summaryLength: args.summary?.length });
      return true;
    }

    log("info", "Pre-renewal flush: LLM did not call write_session_summary", { sessionId });
    return false;
  } catch (err) {
    log("error", "Pre-renewal summary flush failed", { sessionId, error: (err as Error).message });
    return false;
  }
}

// --- Route factory ---

export interface SessionRouteOptions {
  /** The PracticeConfig for the agent loop */
  practiceConfig: PracticeConfig;

  /** The agent profile to use (e.g. REVIEW_FACILITATOR) */
  agentProfile: string;

  /** URL param name for the practice ID (e.g. "orrId" or "incidentId") */
  practiceIdParam: string;

  /** Label for error messages (e.g. "ORR" or "Incident") */
  practiceLabel: string;

  /**
   * Verify the practice instance belongs to the user's team.
   * Returns the practice record or null if not found.
   */
  verifyOwnership(db: ReturnType<typeof getDb>, practiceId: string, teamId: string): any | null;

  /** Update the practice instance status to IN_PROGRESS if still DRAFT */
  markInProgress(db: ReturnType<typeof getDb>, practiceId: string, currentStatus: string): void;

  /** Optional hook called when a session ends (e.g. ORR version snapshot) */
  onSessionEnd?(db: ReturnType<typeof getDb>, practiceId: string, practice: any, user: any): void;

  /** Optional hook called when a session auto-renews (e.g. ORR version snapshot) */
  onSessionRenew?(db: ReturnType<typeof getDb>, practiceId: string, practice: any): void;

  /** Statuses that prevent new sessions and messages (e.g. ["TERMINATED", "ARCHIVED"]) */
  terminalStatuses?: string[];

  /** Optional welcome message inserted as the first assistant message when a session starts */
  welcomeMessage?: string;
}

export function createSessionRoutes(opts: SessionRouteOptions): Hono {
  const routes = new Hono();
  routes.use("*", requireAuth);

  // POST / — Start a new session
  routes.post("/", async (c) => {
    const user = c.get("user");
    const practiceId = c.req.param(opts.practiceIdParam)!;
    const db = getDb();

    const practice = opts.verifyOwnership(db, practiceId, user.teamId);
    if (!practice) {
      return c.json({ error: "not_found", message: `${opts.practiceLabel} not found` }, 404);
    }

    if (opts.terminalStatuses?.includes(practice.status)) {
      return c.json({ error: "forbidden", message: `Cannot start a session on a ${practice.status.toLowerCase()} ${opts.practiceLabel}` }, 403);
    }

    // End any existing active sessions for this practice+user
    const activeSessions = db.select().from(schema.sessions)
      .where(and(
        eq(schema.sessions.orrId, practiceId),
        eq(schema.sessions.userId, user.sub),
        eq(schema.sessions.status, "ACTIVE"),
      ))
      .all();

    const now = new Date().toISOString();
    for (const s of activeSessions) {
      db.update(schema.sessions)
        .set({ status: "COMPLETED", endedAt: now })
        .where(eq(schema.sessions.id, s.id))
        .run();
    }

    const sessionId = nanoid();
    db.insert(schema.sessions).values({
      id: sessionId,
      orrId: practiceId,
      userId: user.sub,
      agentProfile: opts.agentProfile as any,
      summary: null,
      sectionsDiscussed: JSON.stringify([]),
      status: "ACTIVE",
      tokenUsage: 0,
      startedAt: now,
      endedAt: null,
    }).run();

    opts.markInProgress(db, practiceId, practice.status);

    // Insert welcome message if configured
    let welcomeMsg: string | null = null;
    if (opts.welcomeMessage) {
      welcomeMsg = opts.welcomeMessage;
      db.insert(schema.sessionMessages).values({
        id: nanoid(),
        sessionId,
        role: "assistant",
        content: welcomeMsg,
        createdAt: now,
      }).run();
    }

    return c.json({ session: { id: sessionId, status: "ACTIVE", startedAt: now, welcomeMessage: welcomeMsg } }, 201);
  });

  // GET / — List sessions
  routes.get("/", (c) => {
    const user = c.get("user");
    const practiceId = c.req.param(opts.practiceIdParam)!;
    const db = getDb();

    const practice = opts.verifyOwnership(db, practiceId, user.teamId);
    if (!practice) {
      return c.json({ error: "not_found", message: `${opts.practiceLabel} not found` }, 404);
    }

    const rows = db.select().from(schema.sessions)
      .where(eq(schema.sessions.orrId, practiceId))
      .all();
    return c.json({ sessions: rows });
  });

  // GET /all-messages — Deduplicated messages across session renewals
  routes.get("/all-messages", (c) => {
    const user = c.get("user");
    const practiceId = c.req.param(opts.practiceIdParam)!;
    const db = getDb();

    const practice = opts.verifyOwnership(db, practiceId, user.teamId);
    if (!practice) {
      return c.json({ error: "not_found", message: `${opts.practiceLabel} not found` }, 404);
    }

    const sessions = db.select().from(schema.sessions)
      .where(eq(schema.sessions.orrId, practiceId))
      .all()
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt));

    const allMessages: Array<{ role: string; content: string; sessionId: string; createdAt: string }> = [];
    let prevSessionTail: Array<{ role: string; content: string }> = [];

    for (const session of sessions) {
      const rawMessages = db.select().from(schema.sessionMessages)
        .where(eq(schema.sessionMessages.sessionId, session.id))
        .all();

      const messages = rawMessages.filter((msg, i) => {
        if (i === 0) return true;
        const prev = rawMessages[i - 1];
        return !(msg.role === "user" && prev.role === "user" && msg.content === prev.content);
      });

      let skipCount = 0;
      if (prevSessionTail.length > 0 && messages.length > 0) {
        for (let prefixLen = Math.min(messages.length, prevSessionTail.length); prefixLen > 0; prefixLen--) {
          const suffixStart = prevSessionTail.length - prefixLen;
          let matches = true;
          for (let j = 0; j < prefixLen; j++) {
            if (messages[j].role !== prevSessionTail[suffixStart + j].role ||
                messages[j].content !== prevSessionTail[suffixStart + j].content) {
              matches = false;
              break;
            }
          }
          if (matches) { skipCount = prefixLen; break; }
        }
      }

      for (let i = skipCount; i < messages.length; i++) {
        allMessages.push({
          role: messages[i].role,
          content: messages[i].content,
          sessionId: session.id,
          createdAt: messages[i].createdAt,
        });
      }

      prevSessionTail = messages.map((m) => ({ role: m.role, content: m.content }));
    }

    return c.json({ messages: allMessages });
  });

  // GET /:sessionId/messages — Get messages for a session
  routes.get("/:sessionId/messages", (c) => {
    const user = c.get("user");
    const practiceId = c.req.param(opts.practiceIdParam)!;
    const sessionId = c.req.param("sessionId")!;
    const db = getDb();

    const practice = opts.verifyOwnership(db, practiceId, user.teamId);
    if (!practice) {
      return c.json({ error: "not_found", message: `${opts.practiceLabel} not found` }, 404);
    }

    const rawMessages = db.select().from(schema.sessionMessages)
      .where(eq(schema.sessionMessages.sessionId, sessionId))
      .all();

    const messages = rawMessages.filter((msg, i) => {
      if (i === 0) return true;
      const prev = rawMessages[i - 1];
      return !(msg.role === "user" && prev.role === "user" && msg.content === prev.content);
    });

    return c.json({ messages });
  });

  // POST /:sessionId/messages — Send message, get SSE response
  routes.post("/:sessionId/messages", async (c) => {
    const user = c.get("user");
    const practiceId = c.req.param(opts.practiceIdParam)!;
    const sessionId = c.req.param("sessionId")!;
    const body = await c.req.json();
    const mv = validateBody(sendMessageSchema, body);
    if (!mv.success) return c.json({ error: "validation", message: mv.error }, 400);
    const { content, sectionId, displayContent } = mv.data;

    const db = getDb();

    const practice = opts.verifyOwnership(db, practiceId, user.teamId);
    if (!practice) {
      return c.json({ error: "not_found", message: `${opts.practiceLabel} not found` }, 404);
    }

    if (opts.terminalStatuses?.includes(practice.status)) {
      return c.json({ error: "forbidden", message: `Cannot send messages to a ${practice.status.toLowerCase()} ${opts.practiceLabel}` }, 403);
    }

    const session = db.select().from(schema.sessions)
      .where(and(eq(schema.sessions.id, sessionId), eq(schema.sessions.orrId, practiceId)))
      .get();

    if (!session || session.status !== "ACTIVE") {
      return c.json({ error: "bad_request", message: "Session not active" }, 400);
    }

    // Daily token cap
    const dailyTokens = getDailyTokenUsage(db, user.teamId);
    if (dailyTokens >= MAX_DAILY_TOKENS) {
      return c.json({
        error: "token_limit",
        message: `Daily token limit reached (${Math.round(dailyTokens / 1000)}k / ${Math.round(MAX_DAILY_TOKENS / 1000)}k). Resets at midnight. You can still view and edit the ${opts.practiceLabel.toLowerCase()} document manually.`,
      }, 429);
    }

    // Auto-renew session if token budget exceeded
    let activeSessionId = sessionId;
    let activeTokenUsage = session.tokenUsage;
    let sessionRenewed = false;

    if (session.tokenUsage >= MAX_SESSION_TOKENS) {
      const now = new Date().toISOString();

      const oldMessages = db.select().from(schema.sessionMessages)
        .where(eq(schema.sessionMessages.sessionId, sessionId))
        .all();
      const oldDiscussed = safeJsonParse<string[]>(session.sectionsDiscussed, []);

      // Pre-renewal flush: try to get the LLM to write a proper summary
      // before we close this session. Only if no summary exists yet
      // (agent may have already written one via the budget warning nudge).
      if (!session.summary) {
        const msgForFlush = oldMessages.map((m) => ({ role: m.role, content: m.content }));
        await flushSessionSummary(opts.practiceConfig, practiceId, sessionId, msgForFlush);
      }

      // Re-read session in case flush wrote a summary
      const refreshed = db.select().from(schema.sessions)
        .where(eq(schema.sessions.id, sessionId))
        .get();
      const finalSummary = refreshed?.summary
        || `Auto-renewed session (${Math.round(session.tokenUsage / 1000)}k tokens). ${oldMessages.length} messages exchanged. Sections discussed: ${oldDiscussed.length > 0 ? oldDiscussed.join(", ") : "none recorded"}.`;

      db.update(schema.sessions)
        .set({ status: "COMPLETED", endedAt: now, summary: finalSummary })
        .where(eq(schema.sessions.id, sessionId))
        .run();

      // Practice-specific renewal hook (e.g. ORR snapshot)
      if (opts.onSessionRenew) {
        opts.onSessionRenew(db, practiceId, practice);
      }

      activeSessionId = nanoid();
      db.insert(schema.sessions).values({
        id: activeSessionId,
        orrId: practiceId,
        userId: user.sub,
        agentProfile: opts.agentProfile as any,
        summary: null,
        sectionsDiscussed: JSON.stringify(oldDiscussed),
        status: "ACTIVE",
        tokenUsage: 0,
        startedAt: now,
        endedAt: null,
      }).run();

      const recentMessages = oldMessages.slice(-20);
      for (const msg of recentMessages) {
        db.insert(schema.sessionMessages).values({
          id: nanoid(),
          sessionId: activeSessionId,
          role: msg.role,
          content: msg.content,
          createdAt: msg.createdAt,
        }).run();
      }

      activeTokenUsage = 0;
      sessionRenewed = true;
      log("info", "Session auto-renewed", {
        oldSession: sessionId, newSession: activeSessionId,
        tokenUsage: session.tokenUsage, maxTokens: MAX_SESSION_TOKENS,
        carriedMessages: recentMessages.length,
      });
    }

    // Save user message — deduplicate on retry
    const now = new Date().toISOString();
    const lastMsg = db.select().from(schema.sessionMessages)
      .where(eq(schema.sessionMessages.sessionId, activeSessionId))
      .all()
      .at(-1);

    // Store the display-friendly version (e.g. "/learning") for chat history,
    // but send the full prompt to the LLM
    const storedContent = displayContent || content;

    // When /learning runs, clear previous learning_command discoveries so they're replaced fresh
    if (displayContent === "/learning") {
      db.delete(schema.discoveries)
        .where(and(
          eq(schema.discoveries.practiceType, opts.practiceConfig.practiceType),
          eq(schema.discoveries.practiceId, practiceId),
          eq(schema.discoveries.source, "learning_command"),
        ))
        .run();
    }

    const isDuplicate = lastMsg && lastMsg.role === "user" && lastMsg.content === storedContent;
    if (!isDuplicate) {
      db.insert(schema.sessionMessages).values({
        id: nanoid(),
        sessionId: activeSessionId,
        role: "user",
        content: storedContent,
        createdAt: now,
      }).run();
    }

    // Track section discussed
    if (sectionId) {
      const activeSession = db.select().from(schema.sessions)
        .where(eq(schema.sessions.id, activeSessionId))
        .get();
      const discussed = safeJsonParse<string[]>(activeSession!.sectionsDiscussed, []);
      if (!(discussed as string[]).includes(sectionId)) {
        (discussed as string[]).push(sectionId);
        db.update(schema.sessions)
          .set({ sectionsDiscussed: JSON.stringify(discussed) })
          .where(eq(schema.sessions.id, activeSessionId))
          .run();
      }
    }

    // Build conversation history
    const allMessages = db.select().from(schema.sessionMessages)
      .where(eq(schema.sessionMessages.sessionId, activeSessionId))
      .all();

    const fullHistory: LLMMessage[] = allMessages
      .slice(0, -1)
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    const MAX_HISTORY_TOKENS = 10_000;
    const CHARS_PER_TOKEN = 4;
    const history = trimHistory(fullHistory, MAX_HISTORY_TOKENS, CHARS_PER_TOKEN);

    // Stream agent response via SSE
    return streamSSE(c, async (stream) => {
      let fullResponse = "";
      const toolCalls: Array<{ tool: string; args: unknown; result: unknown; timestamp: string }> = [];

      if (sessionRenewed) {
        await stream.writeSSE({
          event: "session_renewed",
          data: JSON.stringify({
            type: "session_renewed",
            oldSessionId: sessionId,
            newSessionId: activeSessionId,
          }),
        });
      }

      try {
        const agentStream = runAgent({
          practiceConfig: opts.practiceConfig,
          practiceId,
          sessionId: activeSessionId,
          activeSectionId: sectionId || null,
          conversationHistory: history,
          userMessage: content,
          sessionTokenUsage: activeTokenUsage,
        });

        let pendingToolCall: { tool: string; args: unknown } | null = null;

        for await (const event of agentStream) {
          await stream.writeSSE({
            event: event.type,
            data: JSON.stringify(event),
          });

          if (event.type === "content_delta") {
            fullResponse += event.content;
          }

          // On retry/fallback, reset accumulated state — the LLM starts fresh
          if (event.type === "status" && (event.message?.includes("Retrying") || event.message?.includes("Response quality"))) {
            fullResponse = "";
            toolCalls.length = 0;
            pendingToolCall = null;
          }

          if (event.type === "tool_call") {
            pendingToolCall = { tool: event.tool!, args: event.args };
          }
          if (event.type === "tool_result" && pendingToolCall) {
            toolCalls.push({
              ...pendingToolCall,
              result: event.result,
              timestamp: new Date().toISOString(),
            });
            pendingToolCall = null;
          }

          if (event.type === "message_end") {
            db.update(schema.sessions)
              .set({ tokenUsage: activeTokenUsage + (event.tokenUsage || 0) })
              .where(eq(schema.sessions.id, activeSessionId))
              .run();
          }
        }
      } catch (err) {
        try {
          await stream.writeSSE({
            event: "error",
            data: JSON.stringify({ type: "error", message: (err as Error).message }),
          });
        } catch {
          // Client may have disconnected
        }
      } finally {
        if (fullResponse) {
          db.insert(schema.sessionMessages).values({
            id: nanoid(),
            sessionId: activeSessionId,
            role: "assistant",
            content: fullResponse,
            metadata: toolCalls.length > 0 ? JSON.stringify({ toolCalls }) : null,
            createdAt: new Date().toISOString(),
          }).run();
        }
      }
    });
  });

  // POST /:sessionId/end — End a session
  routes.post("/:sessionId/end", async (c) => {
    const user = c.get("user");
    const practiceId = c.req.param(opts.practiceIdParam)!;
    const sessionId = c.req.param("sessionId")!;
    const db = getDb();

    const practice = opts.verifyOwnership(db, practiceId, user.teamId);
    if (!practice) {
      return c.json({ error: "not_found", message: `${opts.practiceLabel} not found` }, 404);
    }

    const session = db.select().from(schema.sessions)
      .where(and(eq(schema.sessions.id, sessionId), eq(schema.sessions.orrId, practiceId)))
      .get();

    if (!session || session.status !== "ACTIVE") {
      return c.json({ error: "bad_request", message: "Session not active" }, 400);
    }

    db.update(schema.sessions)
      .set({ status: "COMPLETED", endedAt: new Date().toISOString() })
      .where(eq(schema.sessions.id, sessionId))
      .run();

    // Practice-specific end hook (e.g. ORR version snapshot)
    if (opts.onSessionEnd) {
      opts.onSessionEnd(db, practiceId, practice, user);
    }

    return c.json({ ended: true, versionCreated: !!opts.onSessionEnd });
  });

  return routes;
}
