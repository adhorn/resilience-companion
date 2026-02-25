/**
 * Retry wrapper for LLM adapters.
 * Retries on transient errors (rate limits, server errors, timeouts)
 * with exponential backoff. On overload exhaustion, falls back to a
 * secondary model if configured.
 */

import type { LLMAdapter, LLMMessage, LLMToolDef, StreamChunk } from "./adapter.js";
import { log } from "../logger.js";

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000; // 2s, 4s, 8s

export interface RetryEvent {
  type: "retry";
  attempt: number;
  maxRetries: number;
  delayMs: number;
  reason: string;
}

function isOverloadError(err: unknown): boolean {
  const msg = (err as Error)?.message || String(err);
  const status = (err as any)?.status || (err as any)?.statusCode;
  return status === 529 || msg.includes("overloaded") || msg.includes("Overloaded");
}

function isRetriableError(err: unknown): { retriable: boolean; reason: string } {
  const msg = (err as Error)?.message || String(err);
  const status = (err as any)?.status || (err as any)?.statusCode;

  // Rate limited
  if (status === 429 || msg.includes("rate limit") || msg.includes("Rate limit") || msg.includes("429")) {
    return { retriable: true, reason: "Rate limited by AI provider" };
  }

  // Server errors (5xx)
  if (status >= 500 && status < 600) {
    return { retriable: true, reason: "AI provider server error" };
  }
  if (msg.includes("500") || msg.includes("502") || msg.includes("503") || msg.includes("529")) {
    return { retriable: true, reason: "AI provider server error" };
  }
  if (msg.toLowerCase().includes("internal server error") || msg.includes("api_error")) {
    return { retriable: true, reason: "AI provider server error" };
  }

  // Overloaded
  if (msg.includes("overloaded") || msg.includes("Overloaded")) {
    return { retriable: true, reason: "AI provider is overloaded" };
  }

  // Timeouts
  if (msg.includes("timeout") || msg.includes("Timeout") || msg.includes("ETIMEDOUT") || msg.includes("ECONNRESET")) {
    return { retriable: true, reason: "Connection timed out" };
  }

  // Network errors
  if (msg.includes("ECONNREFUSED") || msg.includes("ENOTFOUND") || msg.includes("fetch failed")) {
    return { retriable: true, reason: "Network error reaching AI provider" };
  }

  return { retriable: false, reason: msg };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wraps an LLM adapter with retry logic and optional model fallback.
 * On overload after retries exhausted, falls back to the secondary adapter
 * instead of failing. Yields status events so callers can inform users.
 */
export class RetryAdapter implements LLMAdapter {
  constructor(
    private inner: LLMAdapter,
    private fallback?: LLMAdapter,
    private fallbackLabel?: string,
  ) {}

  async *chat(
    messages: LLMMessage[],
    tools?: LLMToolDef[],
  ): AsyncGenerator<StreamChunk> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const stream = this.inner.chat(messages, tools);
        for await (const chunk of stream) {
          yield chunk;
        }
        return; // success
      } catch (err) {
        lastError = err;
        const { retriable, reason } = isRetriableError(err);

        if (!retriable || attempt === MAX_RETRIES) {
          break; // fall through to fallback check
        }

        const delayMs = BASE_DELAY_MS * Math.pow(2, attempt);
        log("warn", "LLM retry", { attempt: attempt + 1, maxRetries: MAX_RETRIES, reason, delayMs });

        yield {
          type: "retry",
          attempt: attempt + 1,
          maxRetries: MAX_RETRIES,
          delayMs,
          reason,
        } satisfies StreamChunk;

        await sleep(delayMs);
      }
    }

    // If we have a fallback and the error was overload/server, try it
    if (this.fallback && lastError && (isOverloadError(lastError) || isRetriableError(lastError).retriable)) {
      const label = this.fallbackLabel || "fallback model";
      log("warn", "Primary model exhausted retries, falling back", { fallbackModel: label });

      yield {
        type: "fallback",
        reason: `Primary model unavailable, using ${label}`,
      } satisfies StreamChunk;

      // Fallback gets its own retry cycle
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          const stream = this.fallback.chat(messages, tools);
          for await (const chunk of stream) {
            yield chunk;
          }
          return; // success
        } catch (err) {
          const { retriable, reason } = isRetriableError(err);
          if (!retriable || attempt === MAX_RETRIES) {
            throw err;
          }
          const delayMs = BASE_DELAY_MS * Math.pow(2, attempt);
          log("warn", "Fallback retry", { attempt: attempt + 1, maxRetries: MAX_RETRIES, reason, delayMs });
          yield {
            type: "retry",
            attempt: attempt + 1,
            maxRetries: MAX_RETRIES,
            delayMs,
            reason: `Fallback: ${reason}`,
          } satisfies StreamChunk;
          await sleep(delayMs);
        }
      }
    }

    throw lastError;
  }
}
