/**
 * Git repository management.
 * Clones repos to a local cache directory. Supports private repos via PAT.
 *
 * Security:
 * - URL validated against allowlist pattern (https:// only, no embedded credentials)
 * - execFileSync used instead of execSync to prevent command injection
 * - PAT encrypted at rest using AES-256-GCM derived from JWT_SECRET
 * - Clone targets are sandboxed under REPOS_DIR
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash, createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// --- Repo storage ---

// Cloned repos live in a dedicated top-level folder, separate from the DB.
// Override with REPOS_DIR env var; default is ./repos relative to CWD (monorepo root).
const REPOS_DIR = resolve(process.env.REPOS_DIR || "./repos");

/** Validate a git URL. Only HTTPS allowed, no embedded credentials. */
export function validateGitUrl(url: string): { valid: boolean; error?: string } {
  if (!url || typeof url !== "string") {
    return { valid: false, error: "URL is required" };
  }

  // Must be HTTPS
  if (!url.startsWith("https://")) {
    return { valid: false, error: "Only HTTPS git URLs are supported" };
  }

  // No embedded credentials (user:pass@ or token@)
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password) {
      return { valid: false, error: "Do not embed credentials in the URL. Use the token field instead." };
    }
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }

  // Basic path check — must have at least org/repo
  const pathParts = new URL(url).pathname.replace(/\.git$/, "").split("/").filter(Boolean);
  if (pathParts.length < 2) {
    return { valid: false, error: "URL must include organization and repository (e.g. https://github.com/org/repo)" };
  }

  return { valid: true };
}

/** Hash a git URL into a stable, filesystem-safe directory name */
function repoSlug(gitUrl: string): string {
  const hash = createHash("sha256").update(gitUrl).digest("hex").slice(0, 12);
  const readable = gitUrl
    .replace(/\.git$/, "")
    .split("/")
    .pop() || "repo";
  // Sanitize readable part — only alphanumeric, dash, underscore
  const safe = readable.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
  return `${safe}-${hash}`;
}

/** Build the authenticated clone URL (PAT injected as username, never logged) */
function authUrl(gitUrl: string, token?: string): string {
  if (!token) return gitUrl;
  const parsed = new URL(gitUrl);
  parsed.username = token;
  return parsed.toString();
}

/**
 * Clone a repo (or pull if already cloned). Returns the local path.
 * Shallow clone (depth 1) — we only need current state, not history.
 */
export type RepoResult =
  | { localPath: string; pullWarning?: string }
  | { error: string; authFailed?: boolean };

export function ensureRepo(gitUrl: string, token?: string): RepoResult {
  const validation = validateGitUrl(gitUrl);
  if (!validation.valid) return { error: validation.error! };

  mkdirSync(REPOS_DIR, { recursive: true });

  const slug = repoSlug(gitUrl);
  const localPath = resolve(REPOS_DIR, slug);
  const cloneUrl = authUrl(gitUrl, token);

  if (existsSync(resolve(localPath, ".git"))) {
    // Already cloned — pull latest
    try {
      execFileSync("git", ["pull", "--ff-only"], {
        cwd: localPath,
        timeout: 30_000,
        stdio: "pipe",
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      });
    } catch (err: any) {
      const msg = err.stderr?.toString() || err.message || "";
      const safeMsg = token ? msg.replace(new RegExp(token, "g"), "***") : msg;
      if (safeMsg.includes("Authentication failed") || safeMsg.includes("could not read Username")) {
        return { localPath, pullWarning: "Could not update repository — the access token may have expired. Code exploration will use a stale copy. Update the token in ORR settings." };
      }
      // Non-auth failures (network, merge conflict) — use stale clone with warning
      return { localPath, pullWarning: "Could not update repository. Code exploration will use a possibly stale copy." };
    }
    return { localPath };
  }

  // Fresh clone
  try {
    execFileSync("git", ["clone", "--depth", "1", cloneUrl, slug], {
      cwd: REPOS_DIR,
      timeout: 120_000,
      stdio: "pipe",
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
  } catch (err: any) {
    const msg = err.stderr?.toString() || err.message || "Unknown error";
    // Sanitize — never leak the token in error messages
    const safeMsg = token ? msg.replace(new RegExp(token, "g"), "***") : msg;
    console.error(`git clone failed for ${gitUrl}:`, safeMsg);

    if (safeMsg.includes("Authentication failed") || safeMsg.includes("could not read Username")) {
      return { error: "Authentication failed — the token may have expired or been revoked. Update the repository token in ORR settings.", authFailed: true };
    }
    if (safeMsg.includes("not found") || safeMsg.includes("does not exist")) {
      return { error: "Repository not found. Check the URL and token permissions." };
    }
    return { error: `Clone failed: ${safeMsg.slice(0, 200)}` };
  }

  return { localPath };
}

/**
 * Get the local path for a previously cloned repo.
 * Returns null if not yet cloned.
 */
export function getLocalPath(gitUrl: string): string | null {
  const slug = repoSlug(gitUrl);
  const localPath = resolve(REPOS_DIR, slug);
  if (existsSync(resolve(localPath, ".git"))) {
    return localPath;
  }
  return null;
}

// --- Token encryption ---
// AES-256-GCM using a key derived from JWT_SECRET.
// Not a substitute for a proper secrets manager, but prevents plaintext tokens in SQLite.

/**
 * Resolve the encryption secret. Priority:
 * 1. JWT_SECRET env var (if set and not the placeholder)
 * 2. Auto-generated secret persisted in the data directory
 *
 * Auto-generation means customers never need to configure this manually.
 * The secret file lives alongside the SQLite DB so it's included in
 * volume mounts and backups.
 */
function getSecretFilePath(): string {
  const monorepoRoot = resolve(import.meta.dirname, "..", "..", "..");
  const rawDbPath = process.env.DB_PATH || "./data/resilience-companion.db";
  const dbPath = rawDbPath.startsWith("/") ? rawDbPath : resolve(monorepoRoot, rawDbPath);
  return resolve(dirname(dbPath), ".encryption-key");
}

let cachedSecret: string | null = null;

function getOrCreateSecret(): string {
  if (cachedSecret) return cachedSecret;

  // 1. Explicit env var takes precedence
  const envSecret = process.env.JWT_SECRET;
  if (envSecret && envSecret !== "change-me-in-production") {
    cachedSecret = envSecret;
    return cachedSecret;
  }

  // 2. Read from persisted file, or auto-generate
  const secretPath = getSecretFilePath();
  if (existsSync(secretPath)) {
    cachedSecret = readFileSync(secretPath, "utf8").trim();
    return cachedSecret;
  }

  // Auto-generate and persist
  cachedSecret = randomBytes(32).toString("hex");
  mkdirSync(dirname(secretPath), { recursive: true });
  writeFileSync(secretPath, cachedSecret, { mode: 0o600 });
  return cachedSecret;
}

function deriveKey(): Buffer {
  const secret = getOrCreateSecret();
  return createHash("sha256").update(secret).digest(); // 32 bytes = AES-256
}

/** Encrypt a token. Returns "iv:authTag:ciphertext" in hex. */
export function encryptToken(plaintext: string): string {
  const key = deriveKey();
  const iv = randomBytes(12); // 96-bit IV for GCM
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/** Decrypt a token. Returns null if decryption fails (wrong key, tampered data). */
export function decryptToken(encrypted: string): string | null {
  try {
    const [ivHex, authTagHex, ciphertext] = encrypted.split(":");
    const key = deriveKey();
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(ciphertext, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch {
    return null;
  }
}
