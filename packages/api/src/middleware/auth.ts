import { createMiddleware } from "hono/factory";
import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import * as schema from "../db/schema.js";

export interface JWTPayload {
  sub: string; // user ID
  email: string;
  teamId: string;
  role: string;
}

// Extend Hono context with user info
declare module "hono" {
  interface ContextVariableMap {
    user: JWTPayload;
  }
}

/**
 * Auth middleware — injects the default user into context.
 * No login required. Single-tenant, single-user for simplicity.
 */
export const requireAuth = createMiddleware(async (c, next) => {
  const db = getDb();

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
