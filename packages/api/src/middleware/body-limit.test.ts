import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { app } from "../app.js";
import { setupTestDb, seedTestOrr } from "../test-helpers.js";
import { MAX_REQUEST_BODY_BYTES, requestBodyLimit } from "./body-limit.js";

const json = (body: string, extra: Record<string, string> = {}) => ({
  method: "POST",
  headers: { "Content-Type": "application/json", ...extra },
  body,
});

/** A body with no Content-Length, as a chunked upload would arrive. */
function streamed(bytes: number, chunkSize = 64 * 1024) {
  let sent = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= bytes) return controller.close();
      const n = Math.min(chunkSize, bytes - sent);
      controller.enqueue(new Uint8Array(n).fill(0x20));
      sent += n;
    },
  });
  return new Request("http://localhost/echo", { method: "POST", body, duplex: "half" } as RequestInit);
}

describe("requestBodyLimit", () => {
  let handled: number;
  const limited = new Hono();
  limited.use("*", requestBodyLimit);
  limited.all("/echo", async (c) => {
    handled++;
    return c.json({ bytes: (await c.req.arrayBuffer()).byteLength });
  });

  beforeEach(() => { handled = 0; });

  it("accepts the largest real request: 27 answers of 10,000 CJK characters", async () => {
    const promptResponses = Object.fromEntries(Array.from({ length: 27 }, (_, i) => [i, "漢".repeat(10_000)]));
    const body = JSON.stringify({ promptResponses });
    const res = await limited.request("/echo", json(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ bytes: Buffer.byteLength(body) });
  });

  it("accepts a body of exactly the limit", async () => {
    const res = await limited.request("/echo", json(" ".repeat(MAX_REQUEST_BODY_BYTES)));
    expect(res.status).toBe(200);
  });

  it("rejects a body over the limit by Content-Length, before the handler runs", async () => {
    const res = await limited.request("/echo", json(" ".repeat(MAX_REQUEST_BODY_BYTES + 1)));
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "payload_too_large", message: "Request body must be at most 2 MB" });
    expect(handled).toBe(0);
  });

  it("rejects a streamed body once it passes the limit", async () => {
    const res = await limited.request(streamed(MAX_REQUEST_BODY_BYTES + 1));
    expect(res.status).toBe(413);
    expect(handled).toBe(0);
  });

  it("passes a streamed body under the limit through intact", async () => {
    const res = await limited.request(streamed(300_000));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ bytes: 300_000 });
  });

  it("leaves bodiless requests alone", async () => {
    const res = await limited.request("/echo");
    expect(res.status).toBe(200);
  });
});

describe("body limit on the API", () => {
  let ids: ReturnType<typeof seedTestOrr>;

  beforeEach(() => {
    ids = seedTestOrr(setupTestDb());
  });

  it("rejects an oversized body on an /api route with a CORS-readable 413", async () => {
    const res = await app.request(
      "/api/v1/orrs",
      json(JSON.stringify({ serviceName: "x".repeat(MAX_REQUEST_BODY_BYTES) }), { Origin: "http://localhost:5173" }),
    );
    expect(res.status).toBe(413);
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
    expect((await res.json()).error).toBe("payload_too_large");
  });

  it("still serves normal section updates", async () => {
    const res = await app.request(`/api/v1/orrs/${ids.orrId}/sections/${ids.sectionIds[0]}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ promptResponses: { 0: "an answer" } }),
    });
    expect(res.status).toBe(200);
  });
});
