import { Hono } from "hono";
import { eq, and, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import bcryptjs from "bcryptjs";
const { hash } = bcryptjs;
import { getDb } from "../db/index.js";
import * as schema from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { randomBytes } from "node:crypto";

const tokenRoutes = new Hono();
tokenRoutes.use("*", requireAuth);

/**
 * Generate a new PAT with format: rc_<8-char-prefix>_<32-char-secret>
 * The prefix is stored for UI identification; the full token is hashed.
 */
function generateToken(): { raw: string; prefix: string } {
  const secret = randomBytes(24).toString("base64url"); // ~32 chars
  const prefix = secret.slice(0, 8);
  const raw = `rc_${prefix}_${secret}`;
  return { raw, prefix: `rc_${prefix}` };
}

// List all tokens for the current user (never returns the hash)
tokenRoutes.get("/", (c) => {
  const user = c.get("user");
  const db = getDb();

  const tokens = db
    .select({
      id: schema.apiTokens.id,
      name: schema.apiTokens.name,
      tokenPrefix: schema.apiTokens.tokenPrefix,
      expiresAt: schema.apiTokens.expiresAt,
      lastUsedAt: schema.apiTokens.lastUsedAt,
      revokedAt: schema.apiTokens.revokedAt,
      createdAt: schema.apiTokens.createdAt,
    })
    .from(schema.apiTokens)
    .where(eq(schema.apiTokens.userId, user.sub))
    .all();

  return c.json(tokens);
});

// Create a new PAT
tokenRoutes.post("/", async (c) => {
  const user = c.get("user");
  const db = getDb();
  const body = await c.req.json();

  const name = body.name?.trim();
  if (!name) {
    return c.json({ error: "Token name is required" }, 400);
  }

  // Optional expiry in days (default: 90)
  const expiryDays = body.expiryDays ?? 90;
  const expiresAt =
    expiryDays === 0
      ? null
      : new Date(Date.now() + expiryDays * 86400000).toISOString();

  const { raw, prefix } = generateToken();
  const tokenHash = await hash(raw, 10);
  const id = nanoid();
  const now = new Date().toISOString();

  db.insert(schema.apiTokens)
    .values({
      id,
      userId: user.sub,
      name,
      tokenHash,
      tokenPrefix: prefix,
      expiresAt,
      revokedAt: null,
      lastUsedAt: null,
      createdAt: now,
    })
    .run();

  // Return the raw token ONCE — it can't be retrieved again
  return c.json(
    {
      id,
      name,
      token: raw,
      tokenPrefix: prefix,
      expiresAt,
      createdAt: now,
    },
    201,
  );
});

// Revoke a token
tokenRoutes.delete("/:tokenId", (c) => {
  const user = c.get("user");
  const db = getDb();
  const tokenId = c.req.param("tokenId");

  const existing = db
    .select()
    .from(schema.apiTokens)
    .where(
      and(
        eq(schema.apiTokens.id, tokenId),
        eq(schema.apiTokens.userId, user.sub),
      ),
    )
    .get();

  if (!existing) {
    return c.json({ error: "Token not found" }, 404);
  }

  if (existing.revokedAt) {
    return c.json({ error: "Token already revoked" }, 400);
  }

  const now = new Date().toISOString();
  db.update(schema.apiTokens)
    .set({ revokedAt: now })
    .where(eq(schema.apiTokens.id, tokenId))
    .run();

  return c.json({ ok: true });
});

export { tokenRoutes };
