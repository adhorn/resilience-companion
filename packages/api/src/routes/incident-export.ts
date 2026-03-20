/**
 * Incident export routes — markdown document and conversation transcript.
 */
import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";

export const incidentExportRoutes = new Hono();
incidentExportRoutes.use("*", requireAuth);

/**
 * GET /api/v1/incidents/:incidentId/export/markdown
 * Export incident analysis as structured markdown.
 */
incidentExportRoutes.get("/markdown", (c) => {
  const user = c.get("user");
  const incidentId = c.req.param("incidentId")!;
  const db = getDb();

  const incident = db.select().from(schema.incidents)
    .where(and(eq(schema.incidents.id, incidentId), eq(schema.incidents.teamId, user.teamId)))
    .get();
  if (!incident) return c.json({ error: "not_found", message: "Incident not found" }, 404);

  const team = db.select().from(schema.teams)
    .where(eq(schema.teams.id, incident.teamId))
    .get();

  const sections = db.select().from(schema.incidentSections)
    .where(eq(schema.incidentSections.incidentId, incidentId))
    .all()
    .sort((a, b) => a.position - b.position);

  const timelineEvents = db.select().from(schema.timelineEvents)
    .where(eq(schema.timelineEvents.incidentId, incidentId))
    .all()
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  const factors = db.select().from(schema.contributingFactors)
    .where(eq(schema.contributingFactors.incidentId, incidentId))
    .all();

  const actionItems = db.select().from(schema.actionItems)
    .where(and(
      eq(schema.actionItems.practiceType, "incident"),
      eq(schema.actionItems.practiceId, incidentId),
    ))
    .all();

  const lines: string[] = [];
  lines.push(`# Incident Analysis: ${incident.title}`);
  lines.push("");
  lines.push(`**Team:** ${team?.name || "Unknown"}`);
  lines.push(`**Service:** ${incident.serviceName || "N/A"}`);
  lines.push(`**Severity:** ${incident.severity || "N/A"}`);
  lines.push(`**Type:** ${incident.incidentType || "N/A"}`);
  lines.push(`**Status:** ${incident.status}`);
  if (incident.incidentDate) lines.push(`**Incident Date:** ${incident.incidentDate}`);
  if (incident.durationMinutes) lines.push(`**Duration:** ${incident.durationMinutes} minutes`);
  if (incident.detectionMethod) lines.push(`**Detection:** ${incident.detectionMethod}`);
  lines.push(`**Created:** ${incident.createdAt}`);
  lines.push(`**Last Updated:** ${incident.updatedAt}`);
  lines.push("");
  lines.push("---");
  lines.push("");

  // Coverage summary
  const covered = sections.filter((s) => s.depth !== "UNKNOWN").length;
  lines.push(`## Coverage: ${covered}/${sections.length} sections reviewed`);
  lines.push("");

  // Timeline
  if (timelineEvents.length > 0) {
    lines.push("## Timeline");
    lines.push("");
    for (const evt of timelineEvents) {
      const time = evt.timestamp ? new Date(evt.timestamp).toLocaleString() : "Unknown time";
      lines.push(`- **${time}** [${evt.eventType}] ${evt.description}${evt.actor ? ` (${evt.actor})` : ""}`);
      if (evt.evidence) lines.push(`  > ${evt.evidence}`);
    }
    lines.push("");
  }

  // Contributing factors
  if (factors.length > 0) {
    lines.push("## Contributing Factors");
    lines.push("");
    for (const f of factors) {
      const systemic = f.isSystemic ? " **[SYSTEMIC]**" : "";
      lines.push(`- **${f.category}**${systemic}: ${f.description}`);
      if (f.context) lines.push(`  > ${f.context}`);
    }
    lines.push("");
  }

  // Action items
  if (actionItems.length > 0) {
    lines.push("## Action Items");
    lines.push("");
    for (const item of actionItems) {
      const status = { done: "✅", in_progress: "🔄", open: "⬜" }[item.status] || "•";
      lines.push(`- ${status} **${item.title}** [${item.priority}/${item.type}]`);
      if (item.owner) lines.push(`  Owner: ${item.owner}`);
      if (item.successCriteria) lines.push(`  Success: ${item.successCriteria}`);
      if (item.dueDate) lines.push(`  Due: ${new Date(item.dueDate).toLocaleDateString()}`);
    }
    lines.push("");
  }

  // Sections
  for (const section of sections) {
    const depthLabel = {
      UNKNOWN: "Not reviewed", SURFACE: "Surface", MODERATE: "Moderate", DEEP: "Deep",
    }[section.depth] || "Unknown";

    lines.push(`## ${section.position}. ${section.title}`);
    lines.push("");
    lines.push(`**Depth:** ${depthLabel}`);
    if (section.depthRationale) lines.push(`**Assessment:** ${section.depthRationale}`);

    // Flags
    const flags = typeof section.flags === "string" ? JSON.parse(section.flags) : section.flags;
    if ((flags as any[]).length > 0) {
      lines.push("");
      lines.push("**Flags:**");
      for (const f of flags as Array<{ type: string; note: string }>) {
        const icon = { RISK: "⚠️", GAP: "🔴", STRENGTH: "✅", FOLLOW_UP: "📋" }[f.type] || "•";
        lines.push(`- ${icon} **${f.type}:** ${f.note}`);
      }
    }

    // Questions & responses
    const prompts = typeof section.prompts === "string" ? JSON.parse(section.prompts) : section.prompts;
    const responses = typeof section.promptResponses === "string"
      ? JSON.parse(section.promptResponses) : section.promptResponses || {};

    if ((prompts as string[]).length > 0) {
      lines.push("");
      lines.push("### Questions");
      (prompts as string[]).forEach((p, i) => {
        const resp = responses[i];
        const answer = typeof resp === "string" ? resp : resp?.answer || "";
        lines.push(`- **${p}**`);
        if (answer.trim()) lines.push(`  ${answer}`);
      });
    }

    // AI observations
    if (section.content?.trim()) {
      lines.push("");
      lines.push("### Observations");
      lines.push("");
      lines.push(section.content);
    }

    lines.push("");
    lines.push("---");
    lines.push("");
  }

  lines.push("*Generated by Resilience Companion*");

  const markdown = lines.join("\n");
  const filename = `incident-${(incident.title || "analysis").replace(/[^a-zA-Z0-9]/g, "-")}.md`;

  return new Response(markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
});

/**
 * GET /api/v1/incidents/:incidentId/export/conversation
 * Export conversation transcript across all sessions.
 */
incidentExportRoutes.get("/conversation", (c) => {
  const user = c.get("user");
  const incidentId = c.req.param("incidentId")!;
  const db = getDb();

  const incident = db.select().from(schema.incidents)
    .where(and(eq(schema.incidents.id, incidentId), eq(schema.incidents.teamId, user.teamId)))
    .get();
  if (!incident) return c.json({ error: "not_found", message: "Incident not found" }, 404);

  const team = db.select().from(schema.teams)
    .where(eq(schema.teams.id, incident.teamId))
    .get();

  const sessions = db.select().from(schema.sessions)
    .where(eq(schema.sessions.orrId, incidentId))
    .all()
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));

  const sessionIds = sessions.map((s) => s.id);
  const allMessages = sessionIds.length > 0
    ? db.select().from(schema.sessionMessages).all()
        .filter((m) => sessionIds.includes(m.sessionId))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    : [];

  const messagesBySession = new Map<string, typeof allMessages>();
  for (const msg of allMessages) {
    const list = messagesBySession.get(msg.sessionId) || [];
    list.push(msg);
    messagesBySession.set(msg.sessionId, list);
  }

  const lines: string[] = [];
  lines.push(`# Incident Analysis Conversation: ${incident.title}`);
  lines.push("");
  lines.push(`**Team:** ${team?.name || "Unknown"}`);
  lines.push(`**Sessions:** ${sessions.length}`);
  lines.push(`**Total messages:** ${allMessages.length}`);
  lines.push(`**Period:** ${sessions.length > 0 ? new Date(sessions[0].startedAt).toLocaleDateString() : "N/A"} — ${sessions.length > 0 ? new Date(sessions[sessions.length - 1].startedAt).toLocaleDateString() : "N/A"}`);
  lines.push("");
  lines.push("---");
  lines.push("");

  for (let i = 0; i < sessions.length; i++) {
    const session = sessions[i];
    const msgs = messagesBySession.get(session.id) || [];

    const dedupedMsgs = msgs.filter((msg, j) => {
      if (j === 0) return true;
      const prev = msgs[j - 1];
      return !(msg.role === "user" && prev.role === "user" && msg.content === prev.content);
    });

    if (sessions.length > 1) {
      const tokenK = Math.round(session.tokenUsage / 1000);
      lines.push(`> **Session ${i + 1}** — ${new Date(session.startedAt).toLocaleString()}${tokenK > 0 ? ` · ${tokenK}k tokens` : ""}`);
      if (session.summary) lines.push(`> *${session.summary}*`);
      lines.push("");
    }

    for (const msg of dedupedMsgs) {
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
  const filename = `incident-conversation-${(incident.title || "analysis").replace(/[^a-zA-Z0-9]/g, "-")}.md`;

  return new Response(markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
});
