import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { nanoid } from "nanoid";
import { eq, and } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";
import { runAgent } from "../agent/loop.js";
import type { LLMMessage } from "../llm/index.js";

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
    console.log(
      `History trimmed: kept ${trimmed.length}/${messages.length} messages (~${tokenCount} tokens est.)`,
    );
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

  const messages = db
    .select()
    .from(schema.sessionMessages)
    .where(eq(schema.sessionMessages.sessionId, sessionId))
    .all();

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

  // Save user message
  const now = new Date().toISOString();
  db.insert(schema.sessionMessages)
    .values({
      id: nanoid(),
      sessionId,
      role: "user",
      content,
      createdAt: now,
    })
    .run();

  // Track section discussed
  if (sectionId) {
    const discussed = typeof session.sectionsDiscussed === "string"
      ? JSON.parse(session.sectionsDiscussed)
      : session.sectionsDiscussed;
    if (!(discussed as string[]).includes(sectionId)) {
      (discussed as string[]).push(sectionId);
      db.update(schema.sessions)
        .set({ sectionsDiscussed: JSON.stringify(discussed) })
        .where(eq(schema.sessions.id, sessionId))
        .run();
    }
  }

  // Build conversation history from persisted messages
  const allMessages = db
    .select()
    .from(schema.sessionMessages)
    .where(eq(schema.sessionMessages.sessionId, sessionId))
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

    try {
      const agentStream = runAgent({
        orrId,
        sessionId,
        activeSectionId: sectionId || null,
        conversationHistory: history,
        userMessage: content,
      });

      for await (const event of agentStream) {
        await stream.writeSSE({
          event: event.type,
          data: JSON.stringify(event),
        });

        if (event.type === "content_delta") {
          fullResponse += event.content;
        }

        if (event.type === "message_end") {
          // Update token usage
          db.update(schema.sessions)
            .set({ tokenUsage: session.tokenUsage + (event.tokenUsage || 0) })
            .where(eq(schema.sessions.id, sessionId))
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
            sessionId,
            role: "assistant",
            content: fullResponse,
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
