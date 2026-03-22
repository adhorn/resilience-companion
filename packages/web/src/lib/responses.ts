/** Parse a single prompt response value — may be a plain string (legacy) or { answer, source, codeRef } */
export function getResponseText(val: any): string {
  if (!val) return "";
  if (typeof val === "string") return val;
  if (typeof val === "object" && val.answer) return val.answer;
  return "";
}

export function getResponseSource(val: any): "team" | "code" | null {
  if (!val || typeof val === "string") return null;
  return val.source || null;
}

export function getResponseCodeRef(val: any): string | null {
  if (!val || typeof val === "string") return null;
  return val.codeRef || null;
}

/** Parse promptResponses from a section (handles string or object) */
export function parseResponses(section: any): Record<number, any> {
  if (!section?.promptResponses) return {};
  const raw = typeof section.promptResponses === "string"
    ? JSON.parse(section.promptResponses)
    : section.promptResponses;
  return raw || {};
}

/** Parse a JSON field that might be a string or already an array/object */
export function parseJsonField<T>(value: any, fallback: T): T {
  if (!value) return fallback;
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch { return fallback; }
  }
  return value;
}

/** Count answered questions in a section */
export function answeredCount(section: any): number {
  const responses = parseResponses(section);
  return Object.values(responses).filter((v) => getResponseText(v).trim().length > 0).length;
}

/** Count code-sourced answers in a section */
export function codeSourcedCount(section: any): number {
  const responses = parseResponses(section);
  return Object.values(responses).filter((v) => getResponseSource(v) === "code").length;
}

/** Count total questions in a section */
export function totalQuestions(section: any): number {
  const prompts = parseJsonField(section.prompts, []);
  return prompts.length;
}
