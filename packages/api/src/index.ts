import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { initDb } from "./db/index.js";

const port = Number(process.env.PORT) || 3000;

// Initialize DB (migrations + seed), then start server
await initDb();

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`ORR Companion API running at http://localhost:${info.port}`);
});
