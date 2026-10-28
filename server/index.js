import express from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { getDb, DATA_DIR } from "./db.js";
import { startWorker } from "./render/worker.js";
import { startGenerationWorker } from "./generation-worker.js";
import { mountStatic } from "./static.js";

import authRoutes from "./routes/auth.js";
import providerRoutes from "./routes/providers.js";
import projectRoutes from "./routes/projects.js";
import mediaRoutes from "./routes/media.js";
import healthRoutes from "./routes/health.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// Load .env if present (no dependency).
// On Render/Fly/Railway the platform-assigned PORT must win; locally .env wins.
try {
  const envPath = path.join(ROOT, ".env");
  if (fs.existsSync(envPath)) {
    const isPlatform =
      process.env.RENDER === "true" ||
      !!process.env.FLY_APP_NAME ||
      !!process.env.RAILWAY_ENVIRONMENT;
    for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      const key = m[1];
      const val = m[2].replace(/^["']|["']$/g, "").trim();
      if (isPlatform && key === "PORT") continue;
      process.env[key] = val;
    }
  }
} catch {}

if (!process.env.VAULT_KEY) {
  process.env.VAULT_KEY = Buffer.from("onetake-dev-vault-key-32bytes!!").toString("base64");
  console.warn("[warn] VAULT_KEY not set — using insecure dev key. Set VAULT_KEY in production.");
}

const PORT = Number(process.env.PORT) || 8787;

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "2mb" }));

// CORS for local vite dev
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (
    origin &&
    (origin.includes("localhost") || origin.includes("127.0.0.1"))
  ) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization"
    );
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET,POST,PATCH,DELETE,OPTIONS"
    );
  }
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});

// Init DB early
getDb();
console.log("[db] ready at", path.join(DATA_DIR, "app.db"));

app.use("/api/auth", authRoutes);
app.use("/api", providerRoutes);
app.use("/api", projectRoutes);
app.use("/api", mediaRoutes);
app.use("/api", healthRoutes);

mountStatic(app);

// Error handler
app.use((err, _req, res, _next) => {
  console.error("[error]", err);
  res.status(500).json({
    error: { code: "server", message: err.message || "Internal error" },
  });
});

startWorker();
startGenerationWorker();

app.listen(PORT, () => {
  console.log(`[onetake] listening on http://localhost:${PORT}`);
  console.log(`[onetake] data dir: ${DATA_DIR}`);
});

export default app;
