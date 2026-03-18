import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { nanoid } from "nanoid";
import { eq, and, gte, sql } from "drizzle-orm";
import { MAX_SESSION_TOKENS, MAX_DAILY_TOKENS } from "@orr/shared";
import { getDb, schema } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";
import { runAgent } from "../agent/loop.js";
import type { LLMMessage } from "../llm/index.js";
import { log } from "../logger.js";

/**
 * Trim conversation history to fit within a token budget.
 * Keeps the most recent messages, walking backwards until the budget is exhausted.
 * Ensures we don't start mid-pair (always starts with a user message).
 */
function trimHistory(
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

  // Don't start with an assistant message — ensure pairs stay intact
  if (keepFrom < messages.length && messages[keepFrom].role === "assistant") {
    keepFrom++;
  }

  const trimmed = messages.slice(keepFrom);

  if (keepFrom > 0 && trimmed.length < messages.length) {
    log("info", "History trimmed", { kept: trimmed.length, total: messages.length, estimatedTokens: tokenCount });
  }

  return trimmed;
}

export const sessionRoutes = new Hono();

sessionRoutes.use("*", requireAuth);

/**
 * POST /api/v1/orrs/:orrId/sessions
 * Start a new AI session for an ORR.
 */
sessionRoutes.post("/", async (c) => {
  const user = c.get("user");
  const orrId = c.req.param("orrId")!;
  const db = getDb();

  // Verify ORR belongs to user's team
  const orr = db
    .select()
    .from(schema.orrs)
    .where(and(eq(schema.orrs.id, orrId), eq(schema.orrs.teamId, user.teamId)))
    .get();

  if (!orr) {
    return c.json({ error: "not_found", message: "ORR not found" }, 404);
  }

  // End any existing active sessions for this ORR+user
  const activeSessions = db
    .select()
    .from(schema.sessions)
    .where(
      and(
        eq(schema.sessions.orrId, orrId),
        eq(schema.sessions.userId, user.sub),
        eq(schema.sessions.status, "ACTIVE"),
      ),
    )
    .all();

  const now = new Date().toISOString();
  for (const s of activeSessions) {
    db.update(schema.sessions)
      .set({ status: "COMPLETED", endedAt: now })
      .where(eq(schema.sessions.id, s.id))
      .run();
  }

  // Create new session
  const sessionId = nanoid();
  db.insert(schema.sessions)
    .values({
      id: sessionId,
      orrId,
      userId: user.sub,
      agentProfile: "REVIEW_FACILITATOR",
      summary: null,
      sectionsDiscussed: JSON.stringify([]),
      status: "ACTIVE",
      tokenUsage: 0,
      startedAt: now,
      endedAt: null,
    })
    .run();

  // Update ORR status to IN_PROGRESS if still DRAFT
  if (orr.status === "DRAFT") {
    db.update(schema.orrs)
      .set({ status: "IN_PROGRESS", updatedAt: now })
      .where(eq(schema.orrs.id, orrId))
      .run();
  }

  return c.json({ session: { id: sessionId, status: "ACTIVE", startedAt: now } }, 201);
});

/**
 * GET /api/v1/orrs/:orrId/sessions
 * List sessions for an ORR.
 */
sessionRoutes.get("/", (c) => {
  const user = c.get("user");
  const orrId = c.req.param("orrId")!;
  const db = getDb();

  const orr = db
    .select()
    .from(schema.orrs)
    .where(and(eq(schema.orrs.id, orrId), eq(schema.orrs.teamId, user.teamId)))
    .get();

  if (!orr) {
    return c.json({ error: "not_found", message: "ORR not found" }, 404);
  }

  const rows = db
    .select()
    .from(schema.sessions)
    .where(eq(schema.sessions.orrId, orrId))
    .all();

  return c.json({ sessions: rows });
});

/**
 * GET /api/v1/orrs/:orrId/sessions/:sessionId/messages
 * Get messages for a session.
 */
sessionRoutes.get("/:sessionId/messages", (c) => {
  const user = c.get("user");
  const orrId = c.req.param("orrId")!;
  const sessionId = c.req.param("sessionId")!;
  const db = getDb();

  const orr = db
    .select()
    .from(schema.orrs)
    .where(and(eq(schema.orrs.id, orrId), eq(schema.orrs.teamId, user.teamId)))
    .get();

  if (!orr) {
    return c.json({ error: "not_found", message: "ORR not found" }, 404);
  }

  const rawMessages = db
    .select()
    .from(schema.sessionMessages)
    .where(eq(schema.sessionMessages.sessionId, sessionId))
    .all();

  // Deduplicate: collapse consecutive user messages with identical content
  // (caused by retries saving the message before the agent failed)
  const messages = rawMessages.filter((msg, i) => {
    if (i === 0) return true;
    const prev = rawMessages[i - 1];
    return !(msg.role === "user" && prev.role === "user" && msg.content === prev.content);
  });

  return c.json({ messages });
});

/**
 * POST /api/v1/orrs/:orrId/sessions/:sessionId/messages
 * Send a message and get AI response via SSE.
 */
sessionRoutes.post("/:sessionId/messages", async (c) => {
  const user = c.get("user");
  const orrId = c.req.param("orrId")!;
  const sessionId = c.req.param("sessionId")!;
  const body = await c.req.json();
  const { content, sectionId } = body;

  if (!content) {
    return c.json({ error: "validation", message: "content is required" }, 400);
  }

  const db = getDb();

  // Verify ORR + session
  const orr = db
    .select()
    .from(schema.orrs)
    .where(and(eq(schema.orrs.id, orrId), eq(schema.orrs.teamId, user.teamId)))
    .get();

  if (!orr) {
    return c.json({ error: "not_found", message: "ORR not found" }, 404);
  }

  const session = db
    .select()
    .from(schema.sessions)
    .where(
      and(eq(schema.sessions.id, sessionId), eq(schema.sessions.orrId, orrId)),
    )
    .get();

  if (!session || session.status !== "ACTIVE") {
    return c.json({ error: "bad_request", message: "Session not active" }, 400);
  }

  // Daily token cap: sum all session token usage for this team today
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const dailyUsageResult = db
    .select({ total: sql<number>`coalesce(sum(${schema.sessions.tokenUsage}), 0)` })
    .from(schema.sessions)
    .innerJoin(schema.orrs, eq(schema.sessions.orrId, schema.orrs.id))
    .where(
      and(
        eq(schema.orrs.teamId, user.teamId),
        gte(schema.sessions.startedAt, todayStart.toISOString()),
      ),
    )
    .get();

  const dailyTokens = dailyUsageResult?.total ?? 0;
  if (dailyTokens >= MAX_DAILY_TOKENS) {
    return c.json({
      error: "token_limit",
      message: `Daily token limit reached (${Math.round(dailyTokens / 1000)}k / ${Math.round(MAX_DAILY_TOKENS / 1000)}k). Resets at midnight. You can still view and edit the ORR document manually.`,
    }, 429);
  }

  // Auto-renew session if token budget exceeded
  let activeSessionId = sessionId;
  let activeTokenUsage = session.tokenUsage;
  let sessionRenewed = false;

  if (session.tokenUsage >= MAX_SESSION_TOKENS) {
    const now = new Date().toISOString();

    // Build a summary for the old session from its recent messages
    const oldMessages = db
      .select()
      .from(schema.sessionMessages)
      .where(eq(schema.sessionMessages.sessionId, sessionId))
      .all();
    const oldDiscussed = typeof session.sectionsDiscussed === "string"
      ? JSON.parse(session.sectionsDiscussed) as string[]
      : session.sectionsDiscussed as string[];
    const autoSummary = `Auto-renewed session (${Math.round(session.tokenUsage / 1000)}k tokens). ${oldMessages.length} messages exchanged. Sections discussed: ${oldDiscussed.length > 0 ? oldDiscussed.join(", ") : "none recorded"}.`;

    // End the old session with summary
    db.update(schema.sessions)
      .set({ status: "COMPLETED", endedAt: now, summary: autoSummary })
      .where(eq(schema.sessions.id, sessionId))
      .run();

    // Snapshot ORR at session boundary
    const snapshotSections = db
      .select()
      .from(schema.sections)
      .where(eq(schema.sections.orrId, orrId))
      .all();
    db.insert(schema.orrVersions)
      .values({
        id: nanoid(),
        orrId,
        snapshot: JSON.stringify({ orr, sections: snapshotSections }),
        reason: `Session auto-renewed (token limit)`,
        createdAt: now,
      })
      .run();

    // Create new session, carrying forward sectionsDiscussed
    activeSessionId = nanoid();
    db.insert(schema.sessions)
      .values({
        id: activeSessionId,
        orrId,
        userId: user.sub,
        agentProfile: "REVIEW_FACILITATOR",
        summary: null,
        sectionsDiscussed: JSON.stringify(oldDiscussed),
        status: "ACTIVE",
        tokenUsage: 0,
        startedAt: now,
        endedAt: null,
      })
      .run();

    // Carry recent conversation into the new session for continuity.
    // The system prompt already has the full ORR document state, so we only
    // need enough messages for conversational context (last ~20 messages).
    const recentMessages = oldMessages.slice(-20);
    for (const msg of recentMessages) {
      db.insert(schema.sessionMessages)
        .values({
          id: nanoid(),
          sessionId: activeSessionId,
          role: msg.role,
          content: msg.content,
          createdAt: msg.createdAt,
        })
        .run();
    }

    activeTokenUsage = 0;
    sessionRenewed = true;
    log("info", "Session auto-renewed", { oldSession: sessionId, newSession: activeSessionId, tokenUsage: session.tokenUsage, maxTokens: MAX_SESSION_TOKENS, carriedMessages: recentMessages.length });
  }

  // Save user message — but deduplicate on retry.
  // If the last message in the session is an identical user message (i.e. the
  // previous attempt failed before the agent responded), skip the insert.
  const now = new Date().toISOString();
  const lastMsg = db
    .select()
    .from(schema.sessionMessages)
    .where(eq(schema.sessionMessages.sessionId, activeSessionId))
    .all()
    .at(-1);

  const isDuplicate = lastMsg && lastMsg.role === "user" && lastMsg.content === content;
  if (!isDuplicate) {
    db.insert(schema.sessionMessages)
      .values({
        id: nanoid(),
        sessionId: activeSessionId,
        role: "user",
        content,
        createdAt: now,
      })
      .run();
  }

  // Track section discussed
  if (sectionId) {
    const activeSession = db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, activeSessionId))
      .get();
    const discussed = typeof activeSession!.sectionsDiscussed === "string"
      ? JSON.parse(activeSession!.sectionsDiscussed)
      : activeSession!.sectionsDiscussed;
    if (!(discussed as string[]).includes(sectionId)) {
      (discussed as string[]).push(sectionId);
      db.update(schema.sessions)
        .set({ sectionsDiscussed: JSON.stringify(discussed) })
        .where(eq(schema.sessions.id, activeSessionId))
        .run();
    }
  }

  // Build conversation history from persisted messages
  const allMessages = db
    .select()
    .from(schema.sessionMessages)
    .where(eq(schema.sessionMessages.sessionId, activeSessionId))
    .all();

  // Don't include the user message we just saved — it goes as the new user message
  const fullHistory: LLMMessage[] = allMessages
    .slice(0, -1)
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

  // Smart history trimming: the system prompt already contains the full ORR
  // document state (sections, content, depth, flags, session summaries), so
  // conversation history only provides conversational continuity. We keep
  // recent messages within a token budget to avoid rate limits on large models.
  const MAX_HISTORY_TOKENS = 10_000;
  const CHARS_PER_TOKEN = 4;
  const history = trimHistory(fullHistory, MAX_HISTORY_TOKENS, CHARS_PER_TOKEN);

  // Stream agent response via SSE
  return streamSSE(c, async (stream) => {
    let fullResponse = "";
    const toolCalls: Array<{ tool: string; args: unknown; result: unknown; timestamp: string }> = [];

    // Notify frontend of session renewal before agent response
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
        orrId,
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

        // Track tool calls for audit trail
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
          // Update token usage on the active session
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
          data: JSON.stringify({
            type: "error",
            message: (err as Error).message,
          }),
        });
      } catch {
        // Client may have disconnected — ignore write error
      }
    } finally {
      // Always persist assistant response, even on disconnect/error
      if (fullResponse) {
        db.insert(schema.sessionMessages)
          .values({
            id: nanoid(),
            sessionId: activeSessionId,
            role: "assistant",
            content: fullResponse,
            metadata: toolCalls.length > 0 ? JSON.stringify({ toolCalls }) : null,
            createdAt: new Date().toISOString(),
          })
          .run();
      }
    }
  });
});

/**
 * POST /api/v1/orrs/:orrId/sessions/:sessionId/end
 * End a session. Creates an ORR version snapshot.
 */
sessionRoutes.post("/:sessionId/end", async (c) => {
  const user = c.get("user");
  const orrId = c.req.param("orrId")!;
  const sessionId = c.req.param("sessionId")!;
  const db = getDb();

  const orr = db
    .select()
    .from(schema.orrs)
    .where(and(eq(schema.orrs.id, orrId), eq(schema.orrs.teamId, user.teamId)))
    .get();

  if (!orr) {
    return c.json({ error: "not_found", message: "ORR not found" }, 404);
  }

  const session = db
    .select()
    .from(schema.sessions)
    .where(
      and(eq(schema.sessions.id, sessionId), eq(schema.sessions.orrId, orrId)),
    )
    .get();

  if (!session || session.status !== "ACTIVE") {
    return c.json({ error: "bad_request", message: "Session not active" }, 400);
  }

  const now = new Date().toISOString();

  // End session
  db.update(schema.sessions)
    .set({ status: "COMPLETED", endedAt: now })
    .where(eq(schema.sessions.id, sessionId))
    .run();

  // Create ORR version snapshot
  const sections = db
    .select()
    .from(schema.sections)
    .where(eq(schema.sections.orrId, orrId))
    .all();

  db.insert(schema.orrVersions)
    .values({
      id: nanoid(),
      orrId,
      snapshot: JSON.stringify({ orr, sections }),
      reason: `Session ended by ${user.email}`,
      createdAt: now,
    })
    .run();

  return c.json({ ended: true, versionCreated: true });
});
