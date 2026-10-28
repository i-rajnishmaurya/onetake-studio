import { Router } from "express";
import { getDb } from "../db.js";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

function checkBin(bin) {
  return new Promise((resolve) => {
    const proc = spawn(bin, ["--version"], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    proc.stdout.on("data", (d) => (out += d));
    proc.stderr.on("data", (d) => (out += d));
    proc.on("close", (code) => resolve(code === 0 ? out.trim().split("\n")[0] : null));
    proc.on("error", () => resolve(null));
    setTimeout(() => {
      try {
        proc.kill();
      } catch {}
      resolve(null);
    }, 3000);
  });
}

router.get("/health", async (_req, res) => {
  let dbOk = false;
  try {
    getDb().prepare("SELECT 1").get();
    dbOk = true;
  } catch {}

  const [python, ffmpeg] = await Promise.all([
    checkBin(process.env.PYTHON_BIN || "python3"),
    checkBin(process.env.FFMPEG_BIN || "ffmpeg"),
  ]);

  let version = "1.0.0";
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(ROOT, "package.json"), "utf8")
    );
    version = pkg.version || version;
  } catch {}

  res.json({
    ok: dbOk,
    db: dbOk,
    python: python || false,
    ffmpeg: ffmpeg || false,
    version,
  });
});

export default router;
