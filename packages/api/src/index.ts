import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { initDb } from "./db/index.js";
import { log } from "./logger.js";

const port = Number(process.env.PORT) || 3000;

// Initialize DB (migrations + seed), then start server
await initDb();

const server = serve({ fetch: app.fetch, port }, (info) => {
  log("info", "Resilience Companion API running", { port: info.port });
});

// Graceful shutdown — ensures the process actually exits when killed
// (prevents ghost processes when concurrently or tsx watch sends SIGTERM)
function shutdown() {
  log("info", "Shutting down...");
  server.close(() => process.exit(0));
  // Force exit after 3s if server.close hangs
  setTimeout(() => process.exit(0), 3000);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
