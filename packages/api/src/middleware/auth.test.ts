import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import bcryptjs from "bcryptjs";
const { hash } = bcryptjs;
import { setupTestDb, seedTestOrr } from "../test-helpers.js";
import { getDb } from "../db/index.js";
import * as schema from "../db/schema.js";
import { requireAuth } from "./auth.js";
import { nanoid } from "nanoid";

// Minimal app that uses requireAuth and returns the user context
function createTestApp() {
  const app = new Hono();
  app.use("*", requireAuth);
  app.get("/test", (c) => {
    const user = c.get("user");
    return c.json(user);
  });
  return app;
}

describe("auth middleware", () => {
  let db: ReturnType<typeof getDb>;
  let userId: string;
  let teamId: string;

  beforeEach(() => {
    db = setupTestDb();
    const ids = seedTestOrr(db);
    userId = ids.userId;
    teamId = ids.teamId;
  });

  describe("tier 3: stub fallback", () => {
    it("injects the first user from DB when no auth header", async () => {
      const app = createTestApp();
      const res = await app.request("/test");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.sub).toBe(userId);
      expect(body.teamId).toBe(teamId);
      expect(body.email).toBe("test@test.com");
    });

    it("returns 500 when no users exist", async () => {
      // Clear users
      db.delete(schema.sessions).run();
      db.delete(schema.sections).run();
      db.delete(schema.orrs).run();
      db.delete(schema.users).run();

      const app = createTestApp();
      const res = await app.request("/test");
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toContain("No default user");
    });
  });

  describe("tier 2: PAT authentication", () => {
    let rawToken: string;
    let tokenId: string;

    beforeEach(async () => {
      // Create a test token
      const secret = "test-secret-value-12345678901234";
      rawToken = `rc_abcd1234_${secret}`;
      const tokenHash = await hash(rawToken, 10);
      tokenId = nanoid();
      const now = new Date().toISOString();

      db.insert(schema.apiTokens).values({
        id: tokenId,
        userId,
        name: "Test Token",
        tokenHash,
        tokenPrefix: "rc_abcd1234",
        expiresAt: null,
        revokedAt: null,
        lastUsedAt: null,
        createdAt: now,
      }).run();
    });

    it("authenticates with a valid PAT", async () => {
      const app = createTestApp();
      const res = await app.request("/test", {
        headers: { Authorization: `Bearer ${rawToken}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.sub).toBe(userId);
    });

    it("updates last_used_at on successful auth", async () => {
      const app = createTestApp();
      const res = await app.request("/test", {
        headers: { Authorization: `Bearer ${rawToken}` },
      });
      expect(res.status).toBe(200);

      const { eq } = await import("drizzle-orm");
      const token = db.select().from(schema.apiTokens)
        .where(eq(schema.apiTokens.id, tokenId))
        .get();
      expect(token!.lastUsedAt).toBeTruthy();
    });

    it("rejects an invalid token with 401", async () => {
      const app = createTestApp();
      const res = await app.request("/test", {
        headers: { Authorization: "Bearer rc_badtoken_invalid" },
      });
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toContain("Invalid or expired");
    });

    it("rejects a revoked token", async () => {
      const { eq } = await import("drizzle-orm");
      db.update(schema.apiTokens)
        .set({ revokedAt: new Date().toISOString() })
        .where(eq(schema.apiTokens.id, tokenId))
        .run();

      const app = createTestApp();
      const res = await app.request("/test", {
        headers: { Authorization: `Bearer ${rawToken}` },
      });
      expect(res.status).toBe(401);
    });

    it("rejects an expired token", async () => {
      // Set expiry to the past
      const { eq } = await import("drizzle-orm");
      db.update(schema.apiTokens)
        .set({ expiresAt: "2020-01-01T00:00:00Z" })
        .where(eq(schema.apiTokens.id, tokenId))
        .run();

      const app = createTestApp();
      const res = await app.request("/test", {
        headers: { Authorization: `Bearer ${rawToken}` },
      });
      expect(res.status).toBe(401);
    });
  });

  describe("tier 1: proxy auth headers", () => {
    const originalEnv = process.env.TRUST_PROXY_AUTH;

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.TRUST_PROXY_AUTH;
      } else {
        process.env.TRUST_PROXY_AUTH = originalEnv;
      }
    });

    it("ignores proxy headers when TRUST_PROXY_AUTH is not set", async () => {
      delete process.env.TRUST_PROXY_AUTH;
      const app = createTestApp();
      const res = await app.request("/test", {
        headers: { "X-Forwarded-Email": "proxy@example.com" },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      // Should fall through to stub — not proxy user
      expect(body.email).toBe("test@test.com");
    });

    it("authenticates existing user via proxy header", async () => {
      process.env.TRUST_PROXY_AUTH = "true";
      const app = createTestApp();
      const res = await app.request("/test", {
        headers: { "X-Forwarded-Email": "test@test.com" },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.email).toBe("test@test.com");
      expect(body.sub).toBe(userId);
    });

    it("auto-creates user from proxy header on first request", async () => {
      process.env.TRUST_PROXY_AUTH = "true";
      const app = createTestApp();
      const res = await app.request("/test", {
        headers: {
          "X-Forwarded-Email": "newuser@example.com",
          "X-Forwarded-User": "New User",
        },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.email).toBe("newuser@example.com");
      expect(body.role).toBe("MEMBER");

      // Verify user was created in DB
      const { eq } = await import("drizzle-orm");
      const created = db.select().from(schema.users)
        .where(eq(schema.users.email, "newuser@example.com"))
        .get();
      expect(created).toBeTruthy();
      expect(created!.name).toBe("New User");
      expect(created!.authProvider).toBe("oidc");
    });

    it("uses email prefix as name when X-Forwarded-User is absent", async () => {
      process.env.TRUST_PROXY_AUTH = "true";
      const app = createTestApp();
      await app.request("/test", {
        headers: { "X-Forwarded-Email": "jane.doe@corp.com" },
      });

      const { eq } = await import("drizzle-orm");
      const created = db.select().from(schema.users)
        .where(eq(schema.users.email, "jane.doe@corp.com"))
        .get();
      expect(created!.name).toBe("jane.doe");
    });

    it("proxy takes priority over PAT when both present", async () => {
      process.env.TRUST_PROXY_AUTH = "true";
      const app = createTestApp();
      const res = await app.request("/test", {
        headers: {
          "X-Forwarded-Email": "test@test.com",
          Authorization: "Bearer rc_badtoken_invalid",
        },
      });
      // Proxy wins — should succeed even though the Bearer token is invalid
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.email).toBe("test@test.com");
    });
  });
});
