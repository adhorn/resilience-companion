/**
 * Security steering hooks — always active regardless of tier.
 *
 * 1. Sensitive file filter: blocks read_file on .env, .pem, credentials, etc.
 * 2. Sensitive path filter for list_directory: removes sensitive entries from results.
 * 3. search_code exclusions are handled in tools.ts via execFileSync args.
 */

import type { SteeringHook, SteeringResult } from "../steering.js";

// Patterns that match sensitive file paths
const SENSITIVE_PATTERNS = [
  /\.env($|\.)/,          // .env, .env.local, .env.production
  /\.pem$/,               // TLS certificates
  /\.key$/,               // Private keys
  /\.p12$/,               // PKCS12 keystores
  /credentials/i,         // credentials.json, etc.
  /\.aws\//,              // AWS config directory
  /\.ssh\//,              // SSH config directory
  /id_rsa/,               // SSH keys
  /id_ed25519/,           // SSH keys
  /id_ecdsa/,             // SSH keys
  /\.gnupg\//,            // GPG keys
];

// Patterns that match tokens/secrets in file paths — broader but more likely false positives
const SECRET_NAME_PATTERNS = [
  /secret/i,              // secrets.yaml, secret.json
  /token/i,              // token.json, tokens.txt
];

export function isSensitivePath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  return (
    SENSITIVE_PATTERNS.some((p) => p.test(normalized)) ||
    SECRET_NAME_PATTERNS.some((p) => p.test(normalized.split("/").pop() || ""))
  );
}

/**
 * Before-hook: block read_file calls on sensitive paths.
 * Returns corrective guidance so the LLM can pick a different file.
 */
export const sensitiveFileHook: SteeringHook = {
  name: "sensitive-file-filter",
  tools: ["read_file"],
  beforeToolCall(
    _name: string,
    args: Record<string, unknown>,
  ): SteeringResult {
    const filePath = args.file_path as string;
    if (!filePath) return { action: "proceed" };

    if (isSensitivePath(filePath)) {
      return {
        action: "guide",
        reason: `Access denied: "${filePath}" matches a sensitive file pattern (.env, credentials, keys, secrets). Choose a different file — these are excluded for security.`,
      };
    }

    return { action: "proceed" };
  },
};

/**
 * Before-hook: block list_directory from showing sensitive entries isn't needed —
 * we handle this as an after-hook in content-scan.ts instead (filter from results).
 */

export const securityHooks: SteeringHook[] = [sensitiveFileHook];
