/**
 * Pure classifier for errors thrown by the API client.
 *
 * The API client attaches `status` (HTTP status code) and `errorCode` (the
 * `error` field from the JSON body, when present) to thrown Errors. This
 * function inspects those fields and returns a discriminated union so the
 * UI can render distinct affordances per failure mode — e.g. a banner
 * (rather than a retry button) for the daily-token-limit case.
 *
 * Kept dependency-free so it can be unit-tested without DOM setup.
 */

export type ErrorKind =
  | { kind: "token_limit"; message: string }
  | { kind: "transient"; message: string };

interface MaybeApiError {
  status?: number;
  errorCode?: string;
  message?: string;
}

export function classifyApiError(err: unknown): ErrorKind {
  const e = (err ?? {}) as MaybeApiError;
  const message =
    typeof e.message === "string" && e.message.trim().length > 0
      ? e.message
      : "Something went wrong.";

  if (e.status === 429 && e.errorCode === "token_limit") {
    return { kind: "token_limit", message };
  }

  return { kind: "transient", message };
}
