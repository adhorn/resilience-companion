import { Hono } from "hono";
import { eq, and, desc, sql } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";

export const traceRoutes = new Hono();
traceRoutes.use("*", requireAuth);

// GET / — list traces for an ORR (summary, no spans)
traceRoutes.get("/", (c) => {
  const orrId = c.req.param("orrId")!!;
  const db = getDb();

  // Optional filters
  const sessionId = c.req.query("sessionId");
  const hasError = c.req.query("hasError");
  const fallbackUsed = c.req.query("fallbackUsed");

  const conditions = [eq(schema.agentTraces.orrId, orrId)];
  if (sessionId) conditions.push(eq(schema.agentTraces.sessionId, sessionId));
  if (hasError === "true") conditions.push(sql`${schema.agentTraces.error} IS NOT NULL`);
  if (fallbackUsed === "true") conditions.push(eq(schema.agentTraces.fallbackUsed, 1));

  const traces = db
    .select()
    .from(schema.agentTraces)
    .where(and(...conditions))
    .orderBy(desc(schema.agentTraces.createdAt))
    .all();

  return c.json(traces);
});

// GET /stats — aggregate stats for an ORR's traces
traceRoutes.get("/stats", (c) => {
  const orrId = c.req.param("orrId")!;
  const db = getDb();

  const traces = db
    .select()
    .from(schema.agentTraces)
    .where(eq(schema.agentTraces.orrId, orrId))
    .all();

  if (traces.length === 0) {
    return c.json({
      totalTraces: 0,
      errorCount: 0,
      fallbackCount: 0,
      avgTokens: 0,
      avgDurationMs: 0,
      totalTokens: 0,
    });
  }

  const errorCount = traces.filter((t) => t.error !== null).length;
  const fallbackCount = traces.filter((t) => t.fallbackUsed === 1).length;
  const totalTokens = traces.reduce((sum, t) => sum + t.totalTokens, 0);
  const totalDuration = traces.reduce((sum, t) => sum + t.durationMs, 0);

  // Top tools from spans
  const toolStats = db
    .select({
      toolName: schema.agentSpans.toolName,
      count: sql<number>`count(*)`,
      avgDurationMs: sql<number>`avg(${schema.agentSpans.durationMs})`,
    })
    .from(schema.agentSpans)
    .innerJoin(schema.agentTraces, eq(schema.agentSpans.traceId, schema.agentTraces.id))
    .where(
      and(
        eq(schema.agentTraces.orrId, orrId),
        eq(schema.agentSpans.type, "tool_call"),
      ),
    )
    .groupBy(schema.agentSpans.toolName)
    .orderBy(sql`count(*) DESC`)
    .all();

  return c.json({
    totalTraces: traces.length,
    errorCount,
    errorRate: errorCount / traces.length,
    fallbackCount,
    fallbackRate: fallbackCount / traces.length,
    avgTokens: Math.round(totalTokens / traces.length),
    avgDurationMs: Math.round(totalDuration / traces.length),
    totalTokens,
    toolStats,
  });
});

// GET /:traceId — full trace with all spans
traceRoutes.get("/:traceId", (c) => {
  const orrId = c.req.param("orrId")!;
  const traceId = c.req.param("traceId")!;
  const db = getDb();

  const trace = db
    .select()
    .from(schema.agentTraces)
    .where(and(eq(schema.agentTraces.id, traceId), eq(schema.agentTraces.orrId, orrId)))
    .get();

  if (!trace) return c.json({ error: "Trace not found" }, 404);

  const spans = db
    .select()
    .from(schema.agentSpans)
    .where(eq(schema.agentSpans.traceId, traceId))
    .orderBy(schema.agentSpans.createdAt)
    .all();

  return c.json({ ...trace, spans });
});
