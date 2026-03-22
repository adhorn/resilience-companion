import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { initDb } from "./db/index.js";
import { log } from "./logger.js";

const port = Number(process.env.PORT) || 3000;

// Initialize DB (migrations + seed), then start server
await initDb();

serve({ fetch: app.fetch, port }, (info) => {
  log("info", "Resilience Companion API running", { port: info.port });
});
