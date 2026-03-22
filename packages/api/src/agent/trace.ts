/**
 * OTel-compatible trace logger for agent turns.
 *
 * Emits structured JSON logs with W3C trace context (traceId, spanId,
 * parentSpanId) so they can be ingested by any OpenTelemetry collector,
 * Loki, CloudWatch, or similar observability backend.
 *
 * Same API surface as the old DB-backed TraceCollector — the agent loop
 * doesn't need to know the difference.
 */

import { randomBytes } from "node:crypto";
import { traceLog } from "../logger.js";

/** Generate a 32-hex-char trace ID (W3C format) */
function newTraceId(): string {
  return randomBytes(16).toString("hex");
}

/** Generate a 16-hex-char span ID (W3C format) */
function newSpanId(): string {
  return randomBytes(8).toString("hex");
}

interface ActiveSpan {
  spanId: string;
  type: "llm_call" | "tool_call";
  startTime: number;
  attrs: Record<string, unknown>;
}

export class TraceLogger {
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

  private activeSpans = new Map<string, ActiveSpan>();

  constructor(
    private practiceType: string,
    private practiceId: string,
    private sessionId: string,
    private messageId: string | null,
    private model: string,
  ) {
    this.traceId = newTraceId();
    this.startTime = Date.now();

    this.emitSpan("trace_start", newSpanId(), {
      "practice.type": practiceType,
      "practice.id": practiceId,
      "session.id": sessionId,
      "message.id": messageId,
      "llm.model": model,
    });
  }

  get id(): string {
    return this.traceId;
  }

  /** Emit a structured log line as an OTel-compatible span */
  private emitSpan(
    name: string,
    spanId: string,
    attrs: Record<string, unknown>,
    parentSpanId?: string,
    durationMs?: number,
    error?: string,
  ): void {
    traceLog("info", name, {
      "trace.id": this.traceId,
      "span.id": spanId,
      ...(parentSpanId ? { "parent.span.id": parentSpanId } : {}),
      ...(durationMs !== undefined ? { "duration_ms": durationMs } : {}),
      ...(error ? { "error.message": error } : {}),
      ...attrs,
    });
  }

  startLLMCall(iteration: number, model: string): string {
    const spanId = newSpanId();
    this.iterationCount = Math.max(this.iterationCount, iteration + 1);
    this.activeSpans.set(spanId, {
      spanId,
      type: "llm_call",
      startTime: Date.now(),
      attrs: { iteration, "llm.model": model },
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

    this.emitSpan("llm_call", spanId, {
      ...active.attrs,
      "llm.usage.prompt_tokens": prompt,
      "llm.usage.completion_tokens": completion,
      "llm.usage.total_tokens": prompt + completion,
    }, undefined, Date.now() - active.startTime);
  }

  errorLLMCall(spanId: string, error: string, category?: string): void {
    const active = this.activeSpans.get(spanId);
    if (!active) return;
    this.activeSpans.delete(spanId);

    this.emitSpan("llm_call", spanId, {
      ...active.attrs,
      "error.category": category || "llm_error",
    }, undefined, Date.now() - active.startTime, error);
  }

  addRetry(attempt: number, reason: string, delayMs: number): void {
    this.retryCount++;
    this.emitSpan("llm_retry", newSpanId(), {
      "retry.attempt": attempt,
      "retry.reason": reason,
      "retry.delay_ms": delayMs,
    });
  }

  addFallback(model: string, reason: string): void {
    this.fallbackUsed = true;
    this.fallbackModel = model;
    this.emitSpan("llm_fallback", newSpanId(), {
      "fallback.model": model,
      "fallback.reason": reason,
    });
  }

  startToolCall(iteration: number, name: string, args: Record<string, unknown>): string {
    const spanId = newSpanId();
    this.toolCallsCount++;
    this.activeSpans.set(spanId, {
      spanId,
      type: "tool_call",
      startTime: Date.now(),
      attrs: {
        iteration,
        "tool.name": name,
        "tool.args": JSON.stringify(args).slice(0, 2000),
        ...(args.section_id ? { "tool.section_id": args.section_id } : {}),
      },
    });
    return spanId;
  }

  endToolCall(spanId: string, resultSummary: string, error?: string): void {
    const active = this.activeSpans.get(spanId);
    if (!active) return;
    this.activeSpans.delete(spanId);

    this.emitSpan("tool_call", spanId, {
      ...active.attrs,
      "tool.result_summary": resultSummary.slice(0, 500),
    }, undefined, Date.now() - active.startTime, error);
  }

  setError(message: string, category?: string): void {
    this.error = message;
    this.errorCategory = category || null;
  }

  /** Emit final summary span with totals for the entire agent turn. */
  finalize(): void {
    const totalTokens = this.totalPromptTokens + this.totalCompletionTokens;
    this.emitSpan("trace_end", newSpanId(), {
      "practice.type": this.practiceType,
      "practice.id": this.practiceId,
      "session.id": this.sessionId,
      "message.id": this.messageId,
      "llm.model": this.model,
      ...(this.fallbackModel ? { "llm.fallback_model": this.fallbackModel } : {}),
      "llm.usage.prompt_tokens": this.totalPromptTokens,
      "llm.usage.completion_tokens": this.totalCompletionTokens,
      "llm.usage.total_tokens": totalTokens,
      "agent.iteration_count": this.iterationCount,
      "agent.tool_calls_count": this.toolCallsCount,
      "agent.retry_count": this.retryCount,
      "agent.fallback_used": this.fallbackUsed,
      ...(this.error ? { "error.message": this.error, "error.category": this.errorCategory } : {}),
    }, undefined, Date.now() - this.startTime);
  }
}
