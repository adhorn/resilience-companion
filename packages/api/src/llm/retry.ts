/**
 * Retry wrapper for LLM adapters.
 * Retries on transient errors (rate limits, server errors, timeouts)
 * with exponential backoff. Emits status events so callers can inform users.
 */

import type { LLMAdapter, LLMMessage, LLMToolDef, StreamChunk } from "./adapter.js";

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000; // 2s, 4s, 8s

export interface RetryEvent {
  type: "retry";
  attempt: number;
  maxRetries: number;
  delayMs: number;
  reason: string;
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
 * Wraps an LLM adapter with retry logic.
 * Yields RetryEvent chunks between attempts so the caller can inform the user.
 */
export class RetryAdapter implements LLMAdapter {
  constructor(private inner: LLMAdapter) {}

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
          throw err; // non-retriable or exhausted retries
        }

        const delayMs = BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(`LLM retry ${attempt + 1}/${MAX_RETRIES}: ${reason} — waiting ${delayMs}ms`);

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

    throw lastError;
  }
}
