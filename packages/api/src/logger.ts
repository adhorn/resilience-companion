/**
 * Thin structured JSON logger. Replaces ad-hoc console.* calls
 * with machine-parseable output that includes trace context.
 *
 * Trace-level logs are also appended to a JSONL file for persistence.
 */

import { appendFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/** General-purpose structured logger — writes to stdout/stderr only. */
export function log(level: "info" | "warn" | "error", msg: string, attrs?: Record<string, unknown>) {
  const entry = { ts: new Date().toISOString(), level, msg, ...attrs };
  console[level === "info" ? "log" : level](JSON.stringify(entry));
}

// --- Trace file sink ---

// Anchor to monorepo root (packages/api/src/logger.ts → ../../..)
const __dirname = dirname(fileURLToPath(import.meta.url));
const MONOREPO_ROOT = resolve(__dirname, "../../..");

const TRACE_LOG_PATH = process.env.TRACE_LOG_PATH
  ? resolve(process.env.TRACE_LOG_PATH)
  : resolve(MONOREPO_ROOT, "logs/traces.jsonl");

let traceFileReady = false;

function ensureTraceDir(): void {
  if (traceFileReady) return;
  const dir = dirname(TRACE_LOG_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  traceFileReady = true;
}

/**
 * Log a trace span — writes to both stdout and the trace JSONL file.
 * Used by TraceLogger for OTel-compatible agent observability.
 */
export function traceLog(level: "info" | "warn" | "error", msg: string, attrs?: Record<string, unknown>) {
  const entry = { ts: new Date().toISOString(), level, msg, ...attrs };
  const line = JSON.stringify(entry);

  // stdout
  console[level === "info" ? "log" : level](line);

  // file
  try {
    ensureTraceDir();
    appendFileSync(TRACE_LOG_PATH, line + "\n");
  } catch {
    // Don't crash the app if trace file write fails
  }
}
