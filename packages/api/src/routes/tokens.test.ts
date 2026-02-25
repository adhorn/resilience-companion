import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, setTestDb } from "../db/connection.js";
import { migrate } from "../db/migrate.js";
import { seed } from "../db/seed.js";
import { app } from "../app.js";

describe("token routes", () => {
  beforeEach(async () => {
    const db = createTestDb();
    setTestDb(db);
    migrate(db);
    await seed(db);
  });

  it("creates a token and lists it", async () => {
    // Create
    const createRes = await app.request("/api/v1/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test token", expiryDays: 30 }),
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    expect(created.token).toMatch(/^rc_/);
    expect(created.name).toBe("Test token");
    expect(created.tokenPrefix).toMatch(/^rc_/);
    expect(created.expiresAt).toBeTruthy();

    // List
    const listRes = await app.request("/api/v1/tokens");
    expect(listRes.status).toBe(200);
    const tokens = await listRes.json();
    expect(tokens).toHaveLength(1);
    expect(tokens[0].name).toBe("Test token");
    expect(tokens[0].tokenPrefix).toBe(created.tokenPrefix);
    // Hash should NOT be returned
    expect(tokens[0].tokenHash).toBeUndefined();
  });

  it("revokes a token", async () => {
    const createRes = await app.request("/api/v1/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "To revoke" }),
    });
    const created = await createRes.json();

    const revokeRes = await app.request(`/api/v1/tokens/${created.id}`, {
      method: "DELETE",
    });
    expect(revokeRes.status).toBe(200);

    // List should show revokedAt
    const listRes = await app.request("/api/v1/tokens");
    const tokens = await listRes.json();
    expect(tokens[0].revokedAt).toBeTruthy();
  });

  it("authenticates with a valid PAT", async () => {
    // Create a token
    const createRes = await app.request("/api/v1/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Auth test" }),
    });
    const { token } = await createRes.json();

    // Use the token to list tokens (self-referential but proves auth works)
    const authRes = await app.request("/api/v1/tokens", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(authRes.status).toBe(200);
    const tokens = await authRes.json();
    expect(tokens).toHaveLength(1);
  });

  it("rejects a revoked PAT", async () => {
    const createRes = await app.request("/api/v1/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Will revoke" }),
    });
    const { id, token } = await createRes.json();

    // Revoke it
    await app.request(`/api/v1/tokens/${id}`, { method: "DELETE" });

    // Try to use it
    const authRes = await app.request("/api/v1/tokens", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(authRes.status).toBe(401);
  });

  it("rejects an invalid token", async () => {
    const res = await app.request("/api/v1/tokens", {
      headers: { Authorization: "Bearer rc_invalid_token123" },
    });
    expect(res.status).toBe(401);
  });

  it("creates a token with no expiry when expiryDays=0", async () => {
    const res = await app.request("/api/v1/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "No expiry", expiryDays: 0 }),
    });
    const created = await res.json();
    expect(created.expiresAt).toBeNull();
  });
});
