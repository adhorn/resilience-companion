import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";

export const exportRoutes = new Hono();

exportRoutes.use("*", requireAuth);

/**
 * GET /api/v1/orrs/:orrId/export/markdown
 * Export ORR as structured markdown document.
 */
/**
 * GET /api/v1/orrs/:orrId/export/conversation
 * Export the full conversation across all sessions as markdown.
 * Sessions are stitched chronologically into one continuous thread.
 */
exportRoutes.get("/conversation", (c) => {
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

  const team = db
    .select()
    .from(schema.teams)
    .where(eq(schema.teams.id, orr.teamId))
    .get();

  // Load all sessions ordered by start time
  const sessions = db
    .select()
    .from(schema.sessions)
    .where(eq(schema.sessions.orrId, orrId))
    .all()
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));

  // Load all messages across all sessions
  const sessionIds = sessions.map((s) => s.id);
  const allMessages = sessionIds.length > 0
    ? db.select().from(schema.sessionMessages).all()
        .filter((m) => sessionIds.includes(m.sessionId))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    : [];

  // Group messages by session
  const messagesBySession = new Map<string, typeof allMessages>();
  for (const msg of allMessages) {
    const list = messagesBySession.get(msg.sessionId) || [];
    list.push(msg);
    messagesBySession.set(msg.sessionId, list);
  }

  // Build markdown
  const lines: string[] = [];
  lines.push(`# ORR Conversation: ${orr.serviceName}`);
  lines.push("");
  lines.push(`**Team:** ${team?.name || "Unknown"}`);
  lines.push(`**Sessions:** ${sessions.length}`);
  lines.push(`**Total messages:** ${allMessages.length}`);
  lines.push(`**Period:** ${sessions.length > 0 ? new Date(sessions[0].startedAt).toLocaleDateString() : "N/A"} — ${sessions.length > 0 ? new Date(sessions[sessions.length - 1].startedAt).toLocaleDateString() : "N/A"}`);
  lines.push("");
  lines.push("---");
  lines.push("");

  let messageNum = 0;
  for (let i = 0; i < sessions.length; i++) {
    const session = sessions[i];
    const msgs = messagesBySession.get(session.id) || [];

    // Deduplicate consecutive identical user messages (retry artifacts)
    const dedupedMsgs = msgs.filter((msg, j) => {
      if (j === 0) return true;
      const prev = msgs[j - 1];
      return !(msg.role === "user" && prev.role === "user" && msg.content === prev.content);
    });

    // Session header (subtle, doesn't break the conversation flow)
    if (sessions.length > 1) {
      const tokenK = Math.round(session.tokenUsage / 1000);
      lines.push(`> **Session ${i + 1}** — ${new Date(session.startedAt).toLocaleString()}${tokenK > 0 ? ` · ${tokenK}k tokens` : ""}`);
      if (session.summary) {
        lines.push(`> *${session.summary}*`);
      }
      lines.push("");
    }

    for (const msg of dedupedMsgs) {
      messageNum++;
      const role = msg.role === "user" ? "**You**" : "**AI**";
      lines.push(`### ${role}`);
      lines.push("");
      lines.push(msg.content);
      lines.push("");
    }
  }

  lines.push("---");
  lines.push(`*Exported from Resilience Companion — ${new Date().toLocaleDateString()}*`);

  const markdown = lines.join("\n");

  return new Response(markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="orr-conversation-${orr.serviceName.replace(/[^a-zA-Z0-9]/g, "-")}.md"`,
    },
  });
});

exportRoutes.get("/markdown", (c) => {
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

  const sections = db
    .select()
    .from(schema.sections)
    .where(eq(schema.sections.orrId, orrId))
    .all()
    .sort((a, b) => a.position - b.position);

  const team = db
    .select()
    .from(schema.teams)
    .where(eq(schema.teams.id, orr.teamId))
    .get();

  // Build markdown
  const lines: string[] = [];
  lines.push(`# Operational Readiness Review: ${orr.serviceName}`);
  lines.push("");
  lines.push(`**Team:** ${team?.name || "Unknown"}`);
  lines.push(`**Status:** ${orr.status}`);
  lines.push(`**Created:** ${orr.createdAt}`);
  lines.push(`**Last Updated:** ${orr.updatedAt}`);
  if (orr.completedAt) {
    lines.push(`**Completed:** ${orr.completedAt}`);
  }
  lines.push("");
  lines.push("---");
  lines.push("");

  // Coverage summary
  const covered = sections.filter((s) => s.depth !== "UNKNOWN").length;
  lines.push(`## Coverage: ${covered}/${sections.length} sections reviewed`);
  lines.push("");

  for (const section of sections) {
    const depthLabel = {
      UNKNOWN: "Not reviewed",
      SURFACE: "Surface",
      MODERATE: "Moderate",
      DEEP: "Deep",
    }[section.depth] || "Unknown";

    lines.push(`## ${section.position}. ${section.title}`);
    lines.push("");
    lines.push(`**Depth:** ${depthLabel}`);
    if (section.depthRationale) {
      lines.push(`**Assessment:** ${section.depthRationale}`);
    }

    // Flags
    const flags = typeof section.flags === "string"
      ? JSON.parse(section.flags)
      : section.flags;
    if ((flags as Array<{ type: string; note: string }>).length > 0) {
      lines.push("");
      lines.push("**Flags:**");
      for (const f of flags as Array<{ type: string; note: string }>) {
        const icon = { RISK: "⚠️", GAP: "🔴", STRENGTH: "✅", FOLLOW_UP: "📋" }[f.type] || "•";
        lines.push(`- ${icon} **${f.type}:** ${f.note}`);
      }
    }

    // Prompts
    const prompts = typeof section.prompts === "string"
      ? JSON.parse(section.prompts)
      : section.prompts;
    lines.push("");
    lines.push("### Prompts");
    for (const p of prompts as string[]) {
      lines.push(`- ${p}`);
    }

    // Content
    if (section.content) {
      lines.push("");
      lines.push("### Responses & Observations");
      lines.push("");
      lines.push(section.content);
    }

    lines.push("");
    lines.push("---");
    lines.push("");
  }

  lines.push("*Generated by Resilience Companion*");

  const markdown = lines.join("\n");

  return new Response(markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="orr-${orr.serviceName.replace(/[^a-zA-Z0-9]/g, "-")}.md"`,
    },
  });
});
