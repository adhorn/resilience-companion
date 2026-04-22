/**
 * PERSIST phase — deterministic write-back after each agent turn.
 *
 * The LLM outputs structured JSON describing what to persist.
 * This module validates the JSON against a Zod schema, checks
 * section ownership, and writes to the DB deterministically.
 * No LLM tool calls — code controls all writes.
 */

import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb, schema } from "../db/index.js";
import { getLLM } from "../llm/index.js";
import type { LLMMessage, StreamChunk } from "../llm/index.js";
import type { SSEEvent } from "@orr/shared";
import type { PracticeType } from "./practice.js";
import { safeJsonParse } from "../validation.js";
import { log, traceLog } from "../logger.js";

// --- Zod schema for PERSIST output ---

const QuestionResponseSchema = z.object({
  section_id: z.string(),
  question_index: z.number().int().min(0),
  response: z.string().min(1),
  source: z.enum(["team", "code"]).optional(),
  code_ref: z.string().optional(),
});

const SectionContentSchema = z.object({
  section_id: z.string(),
  content: z.string().min(1),
  append: z.boolean().default(true),
});

const DepthAssessmentSchema = z.object({
  section_id: z.string(),
  depth: z.enum(["SURFACE", "MODERATE", "DEEP"]),
  rationale: z.string().min(1),
});

const FlagSchema = z.object({
  section_id: z.string(),
  type: z.enum(["RISK", "GAP", "STRENGTH", "FOLLOW_UP"]),
  note: z.string().min(1),
  severity: z.enum(["HIGH", "MEDIUM", "LOW"]).optional(),
  deadline: z.string().optional(),
});

const DependencySchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  criticality: z.string().default("important"),
  direction: z.string().default("outbound"),
  has_fallback: z.boolean().default(false),
  fallback_description: z.string().optional(),
  notes: z.string().optional(),
  section_id: z.string().optional(),
});

const DiscoverySchema = z.object({
  text: z.string().min(1),
  section_id: z.string().optional(),
  source: z.enum(["conversation", "learning_command"]).default("conversation"),
});

const ExperimentSchema = z.object({
  type: z.enum(["chaos_experiment", "load_test", "gameday"]),
  title: z.string().min(1),
  hypothesis: z.string().min(1),
  rationale: z.string().min(1),
  priority: z.enum(["critical", "high", "medium", "low"]),
  priority_reasoning: z.string().optional(),
  section_id: z.string().optional(),
});

const ActionItemSchema = z.object({
  title: z.string().min(1),
  type: z.enum(["technical", "process", "organizational", "learning"]),
  owner: z.string().optional(),
  due_date: z.string().optional(),
  priority: z.enum(["high", "medium", "low"]).default("medium"),
  success_criteria: z.string().optional(),
});

const TimelineEventSchema = z.object({
  timestamp: z.string().min(1),
  description: z.string().min(1),
  evidence: z.string().optional(),
  actor: z.string().optional(),
  event_type: z.enum(["detection", "escalation", "action", "communication", "resolution", "other"]).default("other"),
});

const ContributingFactorSchema = z.object({
  category: z.enum(["technical", "process", "organizational", "human_factors", "communication", "knowledge"]),
  description: z.string().min(1),
  context: z.string().optional(),
  is_systemic: z.boolean().default(false),
});

const CrossPracticeSchema = z.object({
  target_practice: z.enum(["chaos_engineering", "load_testing", "orr", "incident_analysis", "gameday"]),
  suggestion: z.string().min(1),
  rationale: z.string().min(1),
});

/**
 * PERSIST phase only extracts the core document data on every turn:
 * - question_responses: what the team answered
 * - section_content: cross-cutting observations
 * - depth_assessments: how deep the understanding is
 * - flags: risks, gaps, strengths identified
 *
 * Everything else (experiments, action items, discoveries, dependencies,
 * cross-practice suggestions, timeline events, contributing factors)
 * comes from explicit slash commands only. This prevents the noise
 * and duplication that occurs when every turn tries to extract 11 categories.
 */
export const PersistOutputSchema = z.object({
  question_responses: z.array(QuestionResponseSchema).default([]),
  section_content: z.array(SectionContentSchema).default([]),
  depth_assessments: z.array(DepthAssessmentSchema).default([]),
  flags: z.array(FlagSchema).default([]),
});

export type PersistOutput = z.infer<typeof PersistOutputSchema>;

// --- Defensive JSON extraction ---

/**
 * Extract a JSON object from LLM output that may include preamble text,
 * markdown fences, or trailing commentary. Tries progressively from each
 * '{' found until one produces valid JSON.
 *
 * Reusable — not specific to the persist phase.
 */
export function extractJson(raw: string): string {
  let text = raw.trim();

  // Strip markdown fences if present
  if (text.includes("```")) {
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (fenceMatch) text = fenceMatch[1].trim();
  }

  // Try parsing from each '{' found in the string
  const lastBrace = text.lastIndexOf("}");
  if (lastBrace === -1) return text; // No closing brace — return as-is, will fail at parse

  let searchFrom = 0;
  while (searchFrom < text.length) {
    const openBrace = text.indexOf("{", searchFrom);
    if (openBrace === -1 || openBrace >= lastBrace) break;

    const candidate = text.slice(openBrace, lastBrace + 1);
    try {
      JSON.parse(candidate);
      return candidate; // Valid JSON found
    } catch {
      searchFrom = openBrace + 1; // Try next '{'
    }
  }

  // Fallback: return first '{' to last '}' even if invalid — let caller handle the error
  const firstBrace = text.indexOf("{");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }

  return text;
}

/** Parse an array leniently — keep valid items, discard invalid ones. */
function filterValid<T>(arr: unknown, schema: z.ZodType<T>): T[] {
  if (!Array.isArray(arr)) return [];
  const results: T[] = [];
  for (const item of arr) {
    try {
      results.push(schema.parse(item)); // .parse() applies defaults
    } catch {
      // Invalid item — skip it
    }
  }
  return results;
}

// --- PERSIST prompt ---

export function buildPersistPrompt(
  practiceType: PracticeType,
  sectionContext: string,
): string {
  return `You are the persistence layer for a resilience review session. Extract ONLY the core document data from the conversation and output structured JSON.

## What to extract

- **question_responses**: For each question the team answered, include section_id, question_index (0-based), and the response text. If code was the source (not the team's memory), set source: "code" and include code_ref.
- **section_content**: Cross-cutting observations that span multiple questions. Use sparingly.
- **depth_assessments**: If the team answered enough questions to assess depth:
  - SURFACE: recites what exists, can't explain why or predict failures.
  - MODERATE: traces paths, explains design reasoning for known scenarios.
  - DEEP: predicts novel failures, connects patterns across sections.
  - If only 1-2 questions answered, omit — too early.
- **flags**: Risks, gaps, or strengths identified. For RISK: include severity (HIGH/MEDIUM/LOW) and deadline.

## What NOT to extract

Do NOT include experiments, action items, discoveries, dependencies, cross-practice suggestions, timeline events, or contributing factors. Those come from explicit slash commands only.

## Current Section State

${sectionContext}

## Output Format

Respond with ONLY a JSON object. No markdown, no explanation, just JSON:

{
  "question_responses": [{ "section_id": "...", "question_index": 0, "response": "..." }],
  "section_content": [{ "section_id": "...", "content": "...", "append": true }],
  "depth_assessments": [{ "section_id": "...", "depth": "MODERATE", "rationale": "..." }],
  "flags": [{ "section_id": "...", "type": "RISK", "note": "...", "severity": "HIGH", "deadline": "2026-05-01" }]
}

Use empty arrays [] for categories with nothing to persist. If nothing substantive was discussed, return all empty arrays.`;
}

/**
 * Build section context string for the persist prompt.
 * Shows current state so the LLM knows what's already persisted and what's missing.
 */
export function buildSectionContext(
  practiceType: PracticeType,
  practiceId: string,
  activeSectionId: string | null,
): string {
  const db = getDb();
  const table = practiceType === "orr" ? schema.sections : schema.incidentSections;
  const parentCol = practiceType === "orr"
    ? schema.sections.orrId
    : schema.incidentSections.incidentId;

  const sections = db.select().from(table)
    .where(eq(parentCol, practiceId))
    .all();

  let context = sections.map((s: any) => {
    const prompts: string[] = safeJsonParse(s.prompts, []);
    const responses: Record<string, unknown> = safeJsonParse(s.promptResponses, {});
    const flags: unknown[] = safeJsonParse(s.flags, []);
    const isActive = s.id === activeSectionId;

    const qStatus = prompts.map((p, i) => {
      const r = responses[String(i)];
      const answered = r && (typeof r === "string" ? r.trim().length > 0 : !!(r as any)?.answer);
      return `  Q${i}: ${answered ? "ANSWERED" : "UNANSWERED"} — ${p.slice(0, 80)}`;
    }).join("\n");

    return `### ${s.title} (${s.id})${isActive ? " [ACTIVE]" : ""}
Depth: ${s.depth} | Flags: ${flags.length}
${qStatus}`;
  }).join("\n\n");

  return context;
}

// --- Deterministic writer ---

interface PersistResult {
  writtenItems: number;
  sectionUpdates: Array<{ sectionId: string; field: string }>;
  dataUpdates: string[];
  errors: string[];
}

/**
 * Execute all writes from validated persist output.
 * Each write validates section ownership before executing.
 */
export function executePersist(
  output: PersistOutput,
  practiceType: PracticeType,
  practiceId: string,
  sessionId: string,
): PersistResult {
  const db = getDb();
  const now = new Date().toISOString();
  const result: PersistResult = { writtenItems: 0, sectionUpdates: [], dataUpdates: [], errors: [] };

  const table = practiceType === "orr" ? schema.sections : schema.incidentSections;
  const idCol = practiceType === "orr" ? schema.sections.id : schema.incidentSections.id;
  const parentIdCol = practiceType === "orr" ? schema.sections.orrId : schema.incidentSections.incidentId;
  const parentTable = practiceType === "orr" ? schema.orrs : schema.incidents;
  const parentIdField = practiceType === "orr" ? schema.orrs.id : schema.incidents.id;

  // Helper: validate section belongs to this practice
  function getSection(sectionId: string): any | null {
    return db.select().from(table)
      .where(and(eq(idCol, sectionId), eq(parentIdCol, practiceId)))
      .get() || null;
  }

  // --- Question responses ---
  for (const qr of output.question_responses) {
    const section = getSection(qr.section_id);
    if (!section) { result.errors.push(`Section ${qr.section_id} not found`); continue; }

    const existing = safeJsonParse<Record<string, any>>(section.promptResponses, {});
    if (qr.source) {
      const entry: Record<string, string> = { answer: qr.response, source: qr.source };
      if (qr.code_ref) entry.codeRef = qr.code_ref;
      existing[qr.question_index] = entry;
    } else {
      existing[qr.question_index] = qr.response;
    }

    db.update(table).set({ promptResponses: existing, updatedAt: now })
      .where(and(eq(idCol, qr.section_id), eq(parentIdCol, practiceId))).run();
    db.update(parentTable).set({ updatedAt: now }).where(eq(parentIdField, practiceId)).run();

    result.sectionUpdates.push({ sectionId: qr.section_id, field: "promptResponses" });
    result.writtenItems++;
  }

  // --- Section content ---
  for (const sc of output.section_content) {
    const section = getSection(sc.section_id);
    if (!section) { result.errors.push(`Section ${sc.section_id} not found`); continue; }

    const newContent = sc.append && section.content
      ? section.content + "\n\n" + sc.content
      : sc.content;

    db.update(table).set({ content: newContent, conversationSnippet: sc.content.slice(0, 200), updatedAt: now })
      .where(and(eq(idCol, sc.section_id), eq(parentIdCol, practiceId))).run();
    db.update(parentTable).set({ updatedAt: now }).where(eq(parentIdField, practiceId)).run();

    result.sectionUpdates.push({ sectionId: sc.section_id, field: "content" });
    result.writtenItems++;
  }

  // --- Depth assessments ---
  for (const da of output.depth_assessments) {
    const section = getSection(da.section_id);
    if (!section) { result.errors.push(`Section ${da.section_id} not found`); continue; }

    db.update(table).set({ depth: da.depth, depthRationale: da.rationale, updatedAt: now })
      .where(and(eq(idCol, da.section_id), eq(parentIdCol, practiceId))).run();

    result.sectionUpdates.push({ sectionId: da.section_id, field: "depth" });
    result.writtenItems++;
  }

  // --- Flags ---
  for (const flag of output.flags) {
    const section = getSection(flag.section_id);
    if (!section) { result.errors.push(`Section ${flag.section_id} not found`); continue; }

    const existingFlags: any[] = safeJsonParse(section.flags, []);
    const preservedFlags = existingFlags.filter((f) => f.status === "ACCEPTED" || f.status === "RESOLVED");
    const newFlag = { ...flag, status: "OPEN", createdAt: now };
    const flags = [...preservedFlags, newFlag];

    db.update(table).set({ flags: flags as any, updatedAt: now })
      .where(and(eq(idCol, flag.section_id), eq(parentIdCol, practiceId))).run();

    result.sectionUpdates.push({ sectionId: flag.section_id, field: "flags" });
    result.writtenItems++;
  }

  // Dependencies, discoveries, experiments, action items, cross-practice suggestions,
  // timeline events, and contributing factors are NOT extracted by the per-turn PERSIST phase.
  // They come exclusively from explicit slash commands (/experiments, /dependencies, /learning, etc.).
  // This prevents noise and duplication from every turn trying to extract 11 categories.

  traceLog("info", "Persist phase completed", {
    practiceType, practiceId, sessionId,
    writtenItems: result.writtenItems,
    sectionUpdates: result.sectionUpdates.length,
    dataUpdates: result.dataUpdates.length,
    errors: result.errors.length,
  });

  return result;
}

// --- Helper: experiment creation (mirrors executeSuggestExperiment logic) ---

function executeExperimentFromPersist(
  exp: z.infer<typeof ExperimentSchema>,
  practiceType: PracticeType,
  practiceId: string,
  now: string,
): { success: boolean; error?: string } {
  const db = getDb();

  let serviceId: string | null = null;
  let serviceName: string | null = null;
  let teamId: string;

  if (practiceType === "orr") {
    const orr = db.select().from(schema.orrs).where(eq(schema.orrs.id, practiceId)).get();
    if (!orr) return { success: false, error: "ORR not found" };
    serviceId = orr.serviceId;
    serviceName = orr.serviceName;
    teamId = orr.teamId;
  } else {
    const incident = db.select().from(schema.incidents).where(eq(schema.incidents.id, practiceId)).get();
    if (!incident) return { success: false, error: "Incident not found" };
    serviceId = incident.serviceId;
    serviceName = incident.serviceName;
    teamId = incident.teamId;
  }

  // Auto-create service if needed
  if (!serviceId && serviceName) {
    const existing = db.select().from(schema.services)
      .where(and(eq(schema.services.teamId, teamId), eq(schema.services.name, serviceName)))
      .get();
    if (existing) {
      serviceId = existing.id;
    } else {
      serviceId = nanoid();
      db.insert(schema.services).values({ id: serviceId, name: serviceName, teamId, createdAt: now, updatedAt: now }).run();
    }
    if (practiceType === "orr") {
      db.update(schema.orrs).set({ serviceId }).where(eq(schema.orrs.id, practiceId)).run();
    } else {
      db.update(schema.incidents).set({ serviceId }).where(eq(schema.incidents.id, practiceId)).run();
    }
  }

  if (!serviceId) return { success: false, error: "No service associated" };

  // Fuzzy dedup — check if a similar experiment already exists
  const existingExps = db.select().from(schema.experimentSuggestions)
    .where(and(
      eq(schema.experimentSuggestions.sourcePracticeType, practiceType),
      eq(schema.experimentSuggestions.sourcePracticeId, practiceId),
    )).all();
  const normNewTitle = exp.title.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
  const isDuplicateExp = existingExps.some((e) => {
    const normExisting = e.title.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
    return normExisting === normNewTitle
      || normExisting.includes(normNewTitle)
      || normNewTitle.includes(normExisting);
  });
  if (isDuplicateExp) return { success: true };

  db.insert(schema.experimentSuggestions).values({
    id: nanoid(),
    serviceId,
    sourcePracticeType: practiceType,
    sourcePracticeId: practiceId,
    sourceSectionId: exp.section_id || null,
    type: exp.type,
    title: exp.title,
    hypothesis: exp.hypothesis,
    rationale: exp.rationale,
    priority: exp.priority,
    priorityReasoning: exp.priority_reasoning || "",
    status: "suggested",
    createdAt: now,
    updatedAt: now,
  }).run();

  return { success: true };
}

// --- Run the PERSIST phase ---

/**
 * Run the PERSIST phase: call LLM for structured JSON, validate, write to DB.
 * Yields SSE events for section_updated / data_updated so the UI refreshes.
 */
export async function* runPersistPhase(
  conversationMessages: LLMMessage[],
  practiceType: PracticeType,
  practiceId: string,
  sessionId: string,
  activeSectionId: string | null,
): AsyncGenerator<SSEEvent & { persistTokens?: number }> {
  traceLog("info", "runPersistPhase entered", { practiceType, practiceId, sessionId, activeSectionId });
  const llm = getLLM();
  const sectionContext = buildSectionContext(practiceType, practiceId, activeSectionId);
  const systemPrompt = buildPersistPrompt(practiceType, sectionContext);

  // Build messages: system prompt + the conversation to extract from
  // Include the full conversation — the persist LLM needs to see everything
  // that was discussed to extract it. Truncating loses experiment details,
  // question answers, and other substantive content.
  // Cap total context at 30k chars (~7.5k tokens) to stay within budget.
  const MAX_CONVERSE_CONTEXT = 30_000;
  const allMessages = conversationMessages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => `${m.role}: ${m.content || ""}`);

  // If total exceeds budget, keep the most recent messages
  let conversationText = allMessages.join("\n\n");
  if (conversationText.length > MAX_CONVERSE_CONTEXT) {
    // Walk backwards from most recent, keeping messages that fit
    let kept: string[] = [];
    let totalLen = 0;
    for (let i = allMessages.length - 1; i >= 0; i--) {
      if (totalLen + allMessages[i].length + 2 > MAX_CONVERSE_CONTEXT) break;
      kept.unshift(allMessages[i]);
      totalLen += allMessages[i].length + 2;
    }
    conversationText = kept.join("\n\n");
  }

  const messages: LLMMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: `Here is the conversation from this turn. Extract everything that should be persisted. Respond with ONLY a JSON object — no preamble, no explanation.\n\n${conversationText}` },
  ];

  yield { type: "status", message: "Recording observations..." } as SSEEvent & { persistTokens?: number };

  let jsonContent = "";
  let persistTokens = 0;

  try {
    const stream = llm.chat(messages, []); // No tools — text only
    for await (const chunk of stream) {
      if (chunk.type === "content" && chunk.content) {
        jsonContent += chunk.content;
      }
      if (chunk.type === "done" && chunk.usage) {
        persistTokens = chunk.usage.promptTokens + chunk.usage.completionTokens;
      }
    }
  } catch (err) {
    const errMsg = (err as Error).message || "Unknown error";
    traceLog("error", "Persist phase LLM call failed", { practiceId, error: errMsg });
    // Don't crash the turn — persist failure is logged but the conversation still happened
    return;
  }

  // Extract JSON from response — the LLM often adds preamble text before the JSON.
  let cleanJson = extractJson(jsonContent);

  traceLog("info", "Persist phase LLM response", {
    practiceId,
    rawLength: jsonContent.length,
    rawPreview: cleanJson.slice(0, 1000),
  });

  // Parse and validate — leniently. Filter out invalid items instead of rejecting everything.
  let parsed: PersistOutput;
  try {
    const raw = JSON.parse(cleanJson);

    // Try strict parse first
    const strictResult = PersistOutputSchema.safeParse(raw);
    if (strictResult.success) {
      parsed = strictResult.data;
    } else {
      // Lenient: parse each array field individually, filtering out invalid items
      traceLog("warn", "Persist phase strict validation failed, falling back to lenient parsing", {
        practiceId,
        error: strictResult.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      });

      parsed = {
        question_responses: filterValid(raw.question_responses, QuestionResponseSchema),
        section_content: filterValid(raw.section_content, SectionContentSchema),
        depth_assessments: filterValid(raw.depth_assessments, DepthAssessmentSchema),
        flags: filterValid(raw.flags, FlagSchema),
      } as PersistOutput;
    }
  } catch (err) {
    traceLog("error", "Persist phase JSON parse failed", {
      practiceId,
      error: (err as Error).message,
      rawLength: jsonContent.length,
      rawPreview: jsonContent.slice(0, 500),
    });
    return;
  }

  traceLog("info", "Persist phase parsed output", {
    practiceId,
    questionResponses: parsed.question_responses.length,
    sectionContent: parsed.section_content.length,
    depthAssessments: parsed.depth_assessments.length,
    flags: parsed.flags.length,
  });

  // Execute deterministic writes
  const result = executePersist(parsed, practiceType, practiceId, sessionId);

  // Yield SSE events for UI refresh
  const seenSections = new Set<string>();
  for (const su of result.sectionUpdates) {
    if (!seenSections.has(su.sectionId + su.field)) {
      seenSections.add(su.sectionId + su.field);
      yield { type: "section_updated", sectionId: su.sectionId, field: su.field } as SSEEvent & { persistTokens?: number };
    }
  }

  const seenData = new Set<string>();
  for (const du of result.dataUpdates) {
    if (!seenData.has(du)) {
      seenData.add(du);
      yield { type: "data_updated", tool: du } as SSEEvent & { persistTokens?: number };
    }
  }

  // Return token usage for the caller to accumulate
  yield { type: "status", message: `Recorded ${result.writtenItems} observations.`, persistTokens } as SSEEvent & { persistTokens?: number };
}
