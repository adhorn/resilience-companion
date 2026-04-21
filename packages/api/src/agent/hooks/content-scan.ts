/**
 * Content scanning steering hooks — always active regardless of tier.
 *
 * After-tool-result hooks that:
 * 1. Redact credential patterns from read_file and search_code results
 * 2. Cap result size to prevent context window bloat
 * 3. Filter sensitive entries from list_directory results
 */

import type { SteeringHook } from "../steering.js";
import { isSensitivePath } from "./security.js";

// Patterns that indicate credentials or secrets in file content
const CREDENTIAL_PATTERNS = [
  /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----[\s\S]*?-----END/g,
  /-----BEGIN\s+CERTIFICATE-----[\s\S]*?-----END/g,
  /(?:API_KEY|APIKEY|api_key)\s*[=:]\s*.{10,}/gi,
  /(?:SECRET_KEY|SECRET|secret_key)\s*[=:]\s*.{10,}/gi,
  /(?:PASSWORD|password|passwd)\s*[=:]\s*.{5,}/gi,
  /(?:TOKEN|token)\s*[=:]\s*.{10,}/gi,
  /(?:AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY)\s*[=:]\s*.+/gi,
  /sk-[a-zA-Z0-9]{20,}/g,    // OpenAI-style API keys
  /sk-ant-[a-zA-Z0-9\-]{20,}/g, // Anthropic API keys
  /ghp_[a-zA-Z0-9]{36,}/g,   // GitHub PATs
  /glpat-[a-zA-Z0-9\-]{20,}/g, // GitLab PATs
];

const MAX_RESULT_SIZE = 10 * 1024; // 10KB

function redactCredentials(content: string): string {
  let result = content;
  for (const pattern of CREDENTIAL_PATTERNS) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    result = result.replace(pattern, "[REDACTED]");
  }
  return result;
}

/**
 * After-hook: redact credentials and cap size for code exploration results.
 */
export const codeResultScanHook: SteeringHook = {
  name: "content-scan-code",
  tools: ["read_file", "search_code"],
  afterToolResult(_name: string, _args: Record<string, unknown>, result: string): string {
    // Parse JSON first, then redact on parsed content, then re-serialize.
    // Redacting on raw JSON strings can break escape sequences.
    try {
      const parsed = JSON.parse(result);

      // Redact credentials in content fields
      if (parsed.content && typeof parsed.content === "string") {
        parsed.content = redactCredentials(parsed.content);
      }
      if (Array.isArray(parsed.matches)) {
        for (const match of parsed.matches) {
          if (match.snippet && typeof match.snippet === "string") {
            match.snippet = redactCredentials(match.snippet);
          }
        }
      }

      // Cap result size
      let processed = JSON.stringify(parsed);
      if (processed.length > MAX_RESULT_SIZE && parsed.content && typeof parsed.content === "string") {
        const truncated = parsed.content.slice(0, MAX_RESULT_SIZE - 200);
        parsed.content = truncated + "\n... [truncated — file too large, use line_start/line_end to read specific ranges]";
        processed = JSON.stringify(parsed);
      }

      return processed;
    } catch {
      // If JSON parse fails, fall back to raw string processing
      let processed = redactCredentials(result);
      if (processed.length > MAX_RESULT_SIZE) {
        processed = processed.slice(0, MAX_RESULT_SIZE) + "... [truncated]";
      }
      return processed;
    }
  },
};

/**
 * After-hook: filter sensitive file names from list_directory results.
 */
export const directoryFilterHook: SteeringHook = {
  name: "content-scan-directory",
  tools: ["list_directory"],
  afterToolResult(_name: string, args: Record<string, unknown>, result: string): string {
    try {
      const parsed = JSON.parse(result);
      if (!Array.isArray(parsed.entries)) return result;

      const basePath = (args.path as string) || ".";
      const filtered = parsed.entries.filter(
        (entry: { name: string; type: string }) =>
          !isSensitivePath(`${basePath}/${entry.name}`),
      );

      if (filtered.length !== parsed.entries.length) {
        parsed.entries = filtered;
        parsed.filteredCount = parsed.entries.length - filtered.length;
        return JSON.stringify(parsed);
      }
    } catch {
      // Can't parse, return as-is
    }
    return result;
  },
};

export const contentScanHooks: SteeringHook[] = [codeResultScanHook, directoryFilterHook];
