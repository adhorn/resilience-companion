/**
 * Thin structured JSON logger. Replaces ad-hoc console.* calls
 * with machine-parseable output that includes trace context.
 */

export function log(level: "info" | "warn" | "error", msg: string, attrs?: Record<string, unknown>) {
  const entry = { ts: new Date().toISOString(), level, msg, ...attrs };
  console[level === "info" ? "log" : level](JSON.stringify(entry));
}
