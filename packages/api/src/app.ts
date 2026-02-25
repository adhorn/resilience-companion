import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { orrRoutes } from "./routes/orrs.js";
import { sectionRoutes } from "./routes/sections.js";
import { templateRoutes } from "./routes/templates.js";
import { teachingMomentRoutes } from "./routes/teaching-moments.js";
import { caseStudyRoutes } from "./routes/case-studies.js";
import { sessionRoutes } from "./routes/sessions.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { flagsRoutes } from "./routes/flags.js";
import { exportRoutes } from "./routes/export.js";
import { dependencyRoutes } from "./routes/dependencies.js";
import { incidentRoutes } from "./routes/incidents.js";
import { incidentSectionRoutes } from "./routes/incident-sections.js";
import { incidentSessionRoutes } from "./routes/incident-sessions.js";
import { incidentExportRoutes } from "./routes/incident-export.js";
import { serviceRoutes } from "./routes/services.js";
import { experimentRoutes } from "./routes/experiments.js";
import { insightsRoutes } from "./routes/insights.js";
import { orrLearningRoutes, incidentLearningRoutes } from "./routes/learning.js";
import { tokenRoutes } from "./routes/tokens.js";

export const app = new Hono();

app.use("*", logger());

// Security headers
app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
});

// CORS — configurable via CORS_ORIGINS env var (comma-separated)
const defaultOrigins = ["http://localhost:5173", "http://localhost:3000"];
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((o) => o.trim())
  : defaultOrigins;
app.use(
  "/api/*",
  cors({
    origin: corsOrigins,
    credentials: true,
  }),
);

// Health check
app.get("/api/health", (c) => c.json({ status: "ok" }));

// Routes
app.route("/api/v1/orrs", orrRoutes);
app.route("/api/v1/orrs/:orrId/sections", sectionRoutes);
app.route("/api/v1/templates", templateRoutes);
app.route("/api/v1/teaching-moments", teachingMomentRoutes);
app.route("/api/v1/case-studies", caseStudyRoutes);
app.route("/api/v1/orrs/:orrId/sessions", sessionRoutes);
app.route("/api/v1/dashboard", dashboardRoutes);
app.route("/api/v1/flags", flagsRoutes);
app.route("/api/v1/orrs/:orrId/export", exportRoutes);
app.route("/api/v1/orrs/:orrId/dependencies", dependencyRoutes);
app.route("/api/v1/incidents", incidentRoutes);
app.route("/api/v1/incidents/:incidentId/sections", incidentSectionRoutes);
app.route("/api/v1/incidents/:incidentId/sessions", incidentSessionRoutes);
app.route("/api/v1/incidents/:incidentId/export", incidentExportRoutes);
app.route("/api/v1/services", serviceRoutes);
app.route("/api/v1/experiments", experimentRoutes);
app.route("/api/v1/insights", insightsRoutes);
app.route("/api/v1/orrs/:orrId/learning", orrLearningRoutes);
app.route("/api/v1/incidents/:incidentId/learning", incidentLearningRoutes);
app.route("/api/v1/tokens", tokenRoutes);

// Serve frontend — either built static files or proxy to Vite dev server
const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, "../public");
if (existsSync(publicDir)) {
  // Production: serve built assets
  const indexHtml = readFileSync(resolve(publicDir, "index.html"), "utf-8");

  app.get("/assets/*", async (c) => {
    const filePath = resolve(publicDir, c.req.path.slice(1));
    if (existsSync(filePath)) {
      const content = readFileSync(filePath);
      const ext = filePath.split(".").pop();
      const types: Record<string, string> = {
        js: "application/javascript",
        css: "text/css",
        html: "text/html",
        json: "application/json",
        png: "image/png",
        jpg: "image/jpeg",
        svg: "image/svg+xml",
      };
      return new Response(content, {
        headers: { "Content-Type": types[ext || ""] || "application/octet-stream" },
      });
    }
    return c.notFound();
  });

  app.get("*", (c) => c.html(indexHtml));
} else {
  // Dev: reverse-proxy non-API requests to Vite dev server
  const VITE_URL = "http://localhost:5173";

  app.all("*", async (c) => {
    const url = new URL(c.req.url);
    const target = `${VITE_URL}${url.pathname}${url.search}`;
    try {
      const resp = await fetch(target, {
        method: c.req.method,
        headers: c.req.raw.headers,
      });
      return new Response(resp.body, {
        status: resp.status,
        headers: resp.headers,
      });
    } catch {
      return c.text("Vite dev server not ready", 502);
    }
  });
}
