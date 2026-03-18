/**
 * Lightweight trace collector for agent turns.
 * Writes eagerly: trace row inserted on creation, spans written as they
 * complete, trace row updated at the end with final totals.
 *
 * This means trace data survives mid-turn crashes — exactly the scenarios
 * where you most need it.
 */

import { nanoid } from "nanoid";
import { getDb, schema } from "../db/index.js";
import { eq } from "drizzle-orm";
import { log } from "../logger.js";

export interface TraceRow {
  id: string;
  orrId: string;
  sessionId: string;
  messageId: string | null;
  model: string;
  fallbackModel: string | null;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  iterationCount: number;
  toolCallsCount: number;
  retryCount: number;
  fallbackUsed: number;
  error: string | null;
  errorCategory: string | null;
  durationMs: number;
  createdAt: string;
}

export interface SpanRow {
  id: string;
  traceId: string;
  type: "llm_call" | "tool_call" | "retry" | "fallback";
  iteration: number;
  model: string | null;
  toolName: string | null;
  toolArgs: string | null;
  toolResultSummary: string | null;
  sectionId: string | null;
  promptTokens: number;
  completionTokens: number;
  durationMs: number;
  retryAttempt: number | null;
  retryReason: string | null;
  retryDelayMs: number | null;
  error: string | null;
  errorCategory: string | null;
  createdAt: string;
}

export class TraceCollector {
  private traceId: string;
  private startTime: number;
  private totalPromptTokens = 0;
  private totalCompletionTokens = 0;
  private retryCount = 0;
  private fallbackUsed = false;
  private fallbackModel: string | null = null;
  private toolCallsCount = 0;
  private iterationCount = 0;
  private error: string | null = null;
  private errorCategory: string | null = null;

  // Track in-progress spans by key
  private activeSpans = new Map<string, { span: Partial<SpanRow>; startTime: number }>();

  constructor(
    private orrId: string,
    private sessionId: string,
    private messageId: string | null,
    private model: string,
  ) {
    this.traceId = nanoid();
    this.startTime = Date.now();

    // Write trace row immediately — partial data, updated at finalize
    try {
      const db = getDb();
      db.insert(schema.agentTraces).values({
        id: this.traceId,
        orrId: this.orrId,
        sessionId: this.sessionId,
        messageId: this.messageId,
        model: this.model,
        fallbackModel: null,
        totalTokens: 0,
        promptTokens: 0,
        completionTokens: 0,
        iterationCount: 0,
        toolCallsCount: 0,
        retryCount: 0,
        fallbackUsed: 0,
        error: null,
        errorCategory: null,
        durationMs: 0,
        createdAt: new Date(this.startTime).toISOString(),
      }).run();
    } catch (err) {
      log("error", "Failed to insert initial trace row", { error: (err as Error).message });
    }
  }

  get id(): string {
    return this.traceId;
  }

  /** Write a completed span to the database immediately */
  private persistSpan(span: SpanRow): void {
    try {
      const db = getDb();
      db.insert(schema.agentSpans).values(span).run();
    } catch (err) {
      log("error", "Failed to persist span", { spanId: span.id, type: span.type, error: (err as Error).message });
    }
  }

  startLLMCall(iteration: number, model: string): string {
    const spanId = nanoid();
    this.iterationCount = Math.max(this.iterationCount, iteration + 1);
    this.activeSpans.set(spanId, {
      span: {
        id: spanId,
        traceId: this.traceId,
        type: "llm_call",
        iteration,
        model,
      },
      startTime: Date.now(),
    });
    return spanId;
  }

  endLLMCall(spanId: string, usage?: { promptTokens: number; completionTokens: number }): void {
    const active = this.activeSpans.get(spanId);
    if (!active) return;
    this.activeSpans.delete(spanId);

    const prompt = usage?.promptTokens || 0;
    const completion = usage?.completionTokens || 0;
    this.totalPromptTokens += prompt;
    this.totalCompletionTokens += completion;

    this.persistSpan({
      id: active.span.id!,
      traceId: this.traceId,
      type: "llm_call",
      iteration: active.span.iteration!,
      model: active.span.model || null,
      toolName: null,
      toolArgs: null,
      toolResultSummary: null,
      sectionId: null,
      promptTokens: prompt,
      completionTokens: completion,
      durationMs: Date.now() - active.startTime,
      retryAttempt: null,
      retryReason: null,
      retryDelayMs: null,
      error: null,
      errorCategory: null,
      createdAt: new Date(active.startTime).toISOString(),
    });
  }

  /** Mark an LLM call span as errored (without ending normally) */
  errorLLMCall(spanId: string, error: string, category?: string): void {
    const active = this.activeSpans.get(spanId);
    if (!active) return;
    this.activeSpans.delete(spanId);

    this.persistSpan({
      id: active.span.id!,
      traceId: this.traceId,
      type: "llm_call",
      iteration: active.span.iteration!,
      model: active.span.model || null,
      toolName: null,
      toolArgs: null,
      toolResultSummary: null,
      sectionId: null,
      promptTokens: 0,
      completionTokens: 0,
      durationMs: Date.now() - active.startTime,
      retryAttempt: null,
      retryReason: null,
      retryDelayMs: null,
      error,
      errorCategory: category || null,
      createdAt: new Date(active.startTime).toISOString(),
    });
  }

  addRetry(attempt: number, reason: string, delayMs: number): void {
    this.retryCount++;
    this.persistSpan({
      id: nanoid(),
      traceId: this.traceId,
      type: "retry",
      iteration: 0,
      model: null,
      toolName: null,
      toolArgs: null,
      toolResultSummary: null,
      sectionId: null,
      promptTokens: 0,
      completionTokens: 0,
      durationMs: delayMs,
      retryAttempt: attempt,
      retryReason: reason,
      retryDelayMs: delayMs,
      error: null,
      errorCategory: null,
      createdAt: new Date().toISOString(),
    });
  }

  addFallback(model: string, reason: string): void {
    this.fallbackUsed = true;
    this.fallbackModel = model;
    this.persistSpan({
      id: nanoid(),
      traceId: this.traceId,
      type: "fallback",
      iteration: 0,
      model,
      toolName: null,
      toolArgs: null,
      toolResultSummary: null,
      sectionId: null,
      promptTokens: 0,
      completionTokens: 0,
      durationMs: 0,
      retryAttempt: null,
      retryReason: null,
      retryDelayMs: null,
      error: null,
      errorCategory: null,
      createdAt: new Date().toISOString(),
    });
  }

  startToolCall(iteration: number, name: string, args: Record<string, unknown>): string {
    const spanId = nanoid();
    this.toolCallsCount++;
    const sectionId = (args.section_id as string) || null;
    this.activeSpans.set(spanId, {
      span: {
        id: spanId,
        traceId: this.traceId,
        type: "tool_call",
        iteration,
        toolName: name,
        toolArgs: JSON.stringify(args).slice(0, 2000),
        sectionId,
      },
      startTime: Date.now(),
    });
    return spanId;
  }

  endToolCall(spanId: string, resultSummary: string, error?: string): void {
    const active = this.activeSpans.get(spanId);
    if (!active) return;
    this.activeSpans.delete(spanId);

    this.persistSpan({
      id: active.span.id!,
      traceId: this.traceId,
      type: "tool_call",
      iteration: active.span.iteration!,
      model: null,
      toolName: active.span.toolName || null,
      toolArgs: active.span.toolArgs || null,
      toolResultSummary: resultSummary.slice(0, 2000),
      sectionId: active.span.sectionId || null,
      promptTokens: 0,
      completionTokens: 0,
      durationMs: Date.now() - active.startTime,
      retryAttempt: null,
      retryReason: null,
      retryDelayMs: null,
      error: error || null,
      errorCategory: error ? "tool_error" : null,
      createdAt: new Date(active.startTime).toISOString(),
    });
  }

  setError(message: string, category?: string): void {
    this.error = message;
    this.errorCategory = category || null;
  }

  /** Update the trace row with final totals. Spans are already persisted. */
  finalize(): void {
    const now = Date.now();
    const totalTokens = this.totalPromptTokens + this.totalCompletionTokens;

    try {
      const db = getDb();
      db.update(schema.agentTraces)
        .set({
          fallbackModel: this.fallbackModel,
          totalTokens,
          promptTokens: this.totalPromptTokens,
          completionTokens: this.totalCompletionTokens,
          iterationCount: this.iterationCount,
          toolCallsCount: this.toolCallsCount,
          retryCount: this.retryCount,
          fallbackUsed: this.fallbackUsed ? 1 : 0,
          error: this.error,
          errorCategory: this.errorCategory,
          durationMs: now - this.startTime,
        })
        .where(eq(schema.agentTraces.id, this.traceId))
        .run();
    } catch (err) {
      log("error", "Failed to finalize trace", { traceId: this.traceId, error: (err as Error).message });
    }
  }
}
