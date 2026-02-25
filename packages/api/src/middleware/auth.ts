import { createMiddleware } from "hono/factory";
import { eq, and, isNull } from "drizzle-orm";
import { getDb } from "../db/index.js";
import * as schema from "../db/schema.js";
import bcryptjs from "bcryptjs";
const { compare } = bcryptjs;
import { nanoid } from "nanoid";

export interface AuthIdentity {
  sub: string; // user ID
  email: string;
  teamId: string;
  role: string;
}

// Extend Hono context with user info
declare module "hono" {
  interface ContextVariableMap {
    user: AuthIdentity;
  }
}

/**
 * Auth middleware — three-tier priority chain:
 *
 * 1. Proxy headers (X-Forwarded-User / X-Forwarded-Email) — trusted reverse proxy
 * 2. PAT (Authorization: Bearer <token>) — programmatic clients (Slack, MCP, scripts)
 * 3. Stub fallback — first user in DB, for backward compat on trusted networks
 *
 * Proxy headers are only trusted when TRUST_PROXY_AUTH=true is set.
 */
export const requireAuth = createMiddleware(async (c, next) => {
  const db = getDb();

  // --- Tier 1: Proxy auth headers ---
  if (process.env.TRUST_PROXY_AUTH === "true") {
    const proxyEmail = c.req.header("x-forwarded-email");
    const proxyUser = c.req.header("x-forwarded-user");

    if (proxyEmail) {
      const user = await resolveOrCreateProxyUser(db, proxyEmail, proxyUser);
      if (user) {
        c.set("user", user);
        await next();
        return;
      }
    }
  }

  // --- Tier 2: PAT (Bearer token) ---
  const authHeader = c.req.header("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const identity = await resolveTokenIdentity(db, token);
    if (identity) {
      c.set("user", identity);
      await next();
      return;
    }
    return c.json({ error: "Invalid or expired token" }, 401);
  }

  // --- Tier 3: Stub fallback (first user in DB) ---
  const user = db
    .select()
    .from(schema.users)
    .limit(1)
    .get();

  if (!user) {
    return c.json({ error: "No default user found. Database may not be seeded." }, 500);
  }

  c.set("user", {
    sub: user.id,
    email: user.email,
    teamId: user.teamId,
    role: user.role,
  });

  await next();
});

/**
 * Resolve a proxy-authenticated user by email. Auto-creates the user
 * if they don't exist yet (assigned to the first team, as MEMBER).
 */
async function resolveOrCreateProxyUser(
  db: ReturnType<typeof getDb>,
  email: string,
  displayName?: string | null,
): Promise<AuthIdentity | null> {
  const existing = db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .get();

  if (existing) {
    return {
      sub: existing.id,
      email: existing.email,
      teamId: existing.teamId,
      role: existing.role,
    };
  }

  // Auto-create: assign to the first team
  const team = db.select().from(schema.teams).limit(1).get();
  if (!team) return null;

  const userId = nanoid();
  const now = new Date().toISOString();
  db.insert(schema.users)
    .values({
      id: userId,
      name: displayName || email.split("@")[0],
      email,
      passwordHash: "proxy-auth",
      teamId: team.id,
      role: "MEMBER",
      authProvider: "oidc",
      createdAt: now,
    })
    .run();

  return { sub: userId, email, teamId: team.id, role: "MEMBER" };
}

/**
 * Validate a PAT and return the owning user's identity.
 * Updates last_used_at on successful validation.
 */
async function resolveTokenIdentity(
  db: ReturnType<typeof getDb>,
  rawToken: string,
): Promise<AuthIdentity | null> {
  // Token format: rc_<prefix>_<secret>
  // We store the hash of the full token and the prefix for UI display
  const prefix = rawToken.slice(0, 11); // "rc_" + first 8 chars

  // Find non-revoked tokens matching this prefix
  const candidates = db
    .select()
    .from(schema.apiTokens)
    .where(
      and(
        eq(schema.apiTokens.tokenPrefix, prefix),
        isNull(schema.apiTokens.revokedAt),
      ),
    )
    .all();

  for (const candidate of candidates) {
    // Check expiry
    if (candidate.expiresAt && new Date(candidate.expiresAt) < new Date()) {
      continue;
    }

    // Verify hash
    const valid = await compare(rawToken, candidate.tokenHash);
    if (!valid) continue;

    // Update last_used_at (fire and forget — don't block the request)
    const now = new Date().toISOString();
    db.update(schema.apiTokens)
      .set({ lastUsedAt: now })
      .where(eq(schema.apiTokens.id, candidate.id))
      .run();

    // Look up the user
    const user = db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, candidate.userId))
      .get();

    if (!user) continue;

    return {
      sub: user.id,
      email: user.email,
      teamId: user.teamId,
      role: user.role,
    };
  }

  return null;
}
