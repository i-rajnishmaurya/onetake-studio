import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DATA_DIR, ROOT } from "../db.js";
import { validateOutput } from "./validate.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PYTHON = process.env.PYTHON_BIN || "python3";
const FFMPEG = process.env.FFMPEG_BIN || "ffmpeg";
const RENDER_TIMEOUT = Number(process.env.RENDER_TIMEOUT_MS) || 1_800_000;

/**
 * Write composition HTML + copy motion.js into a temp work dir.
 */
export function prepareWorkDir(jobId, html) {
  const workDir = path.join(DATA_DIR, "tmp", `job-${jobId}`);
  fs.mkdirSync(workDir, { recursive: true });
  const compPath = path.join(workDir, "comp.html");
  fs.writeFileSync(compPath, html, "utf8");
  const motionSrc = path.join(ROOT, "engine", "lib", "motion.js");
  const motionDst = path.join(workDir, "motion.js");
  if (fs.existsSync(motionSrc)) {
    fs.copyFileSync(motionSrc, motionDst);
  }
  // also copy ui_kit if present
  const uiSrc = path.join(ROOT, "engine", "lib", "ui_kit.js");
  if (fs.existsSync(uiSrc)) {
    fs.copyFileSync(uiSrc, path.join(workDir, "ui_kit.js"));
  }
  return { workDir, compPath };
}

/**
 * Generate a simple procedural SFX score for the given duration.
 */
export function generateSfx(workDir, durationSec) {
  return new Promise((resolve, reject) => {
    const sfxPath = path.join(workDir, "sfx.wav");
    const script = path.join(ROOT, "engine", "scripts", "sfx_palette.py");
    // Build a minimal score via inline python that imports the palette
    const py = `
import sys, os
sys.path.insert(0, ${JSON.stringify(path.join(ROOT, "engine", "scripts"))})
from sfx_palette import Score, glass, wood, air, bubble, sub
dur = ${Number(durationSec) || 15}
s = Score(dur=dur)
# sparse hits so it never fights the picture
s.place(glass(659, 0.6, 0.5), t=0.12, gain=0.12, send=0.35)
s.place(wood(0.04, 0.3), t=0.8, gain=0.18)
s.place(bubble(0.08), t=2.1, gain=0.14)
if dur > 6:
    s.place(air(0.4, 180, 2800, 1.0, 0.3), t=dur*0.45, gain=0.25, send=0.4)
if dur > 10:
    s.place(sub(0.12), t=dur*0.72, gain=0.2)
s.place(wood(0.03, 0.25), t=max(0.05, dur-0.35), gain=0.15)
s.write(${JSON.stringify(sfxPath)})
print("SFX_OK")
`;
    const proc = spawn(PYTHON, ["-c", py], {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: workDir,
    });
    let err = "";
    proc.stderr.on("data", (d) => (err += d));
    proc.on("close", (code) => {
      if (code === 0 && fs.existsSync(sfxPath)) {
        resolve(sfxPath);
      } else {
        // non-fatal: render without sfx
        resolve(null);
      }
    });
    proc.on("error", () => resolve(null));
  });
}

/**
 * Mux optional music under the sfx track.
 */
export function muxAudio(videoPath, sfxPath, musicPath, outPath) {
  return new Promise((resolve, reject) => {
    const args = ["-y", "-i", videoPath];
    if (sfxPath && fs.existsSync(sfxPath)) args.push("-i", sfxPath);
    if (musicPath && fs.existsSync(musicPath)) args.push("-i", musicPath);

    // filter complex: mix sfx + music (if any) under video
    const hasSfx = sfxPath && fs.existsSync(sfxPath);
    const hasMusic = musicPath && fs.existsSync(musicPath);
    if (hasSfx || hasMusic) {
      let filter = "";
      const inputs = [];
      if (hasSfx) inputs.push("[1:a]");
      if (hasMusic) inputs.push(hasSfx ? "[2:a]" : "[1:a]");
      if (inputs.length === 1) {
        filter = `${inputs[0]}volume=0.85[aout]`;
      } else {
        filter = `${inputs[0]}volume=0.9[a0];${inputs[1]}volume=0.35[a1];[a0][a1]amix=inputs=2:duration=first:dropout_transition=2[aout]`;
      }
      args.push(
        "-filter_complex",
        filter,
        "-map",
        "0:v",
        "-map",
        "[aout]",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-shortest",
        outPath
      );
    } else {
      // just copy
      args.push("-c", "copy", outPath);
    }

    const proc = spawn(FFMPEG, args, { stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    proc.stderr.on("data", (d) => (err += d));
    proc.on("close", (code) => {
      if (code === 0 && fs.existsSync(outPath)) resolve(outPath);
      else reject(new Error(`ffmpeg mux failed: ${err.slice(-400)}`));
    });
    proc.on("error", (e) => reject(e));
  });
}

/**
 * Run the full render pipeline for a job.
 * @param {object} opts
 * @param {string} opts.jobId
 * @param {string} opts.html
 * @param {"draft"|"final"} opts.profile
 * @param {number} [opts.duration]
 * @param {string} [opts.musicPath]
 * @param {(p: {progress:number, stage:string}) => void} [opts.onProgress]
 * @param {AbortSignal} [opts.signal]
 */
export async function runPipeline(opts) {
  const {
    jobId,
    html,
    profile = "draft",
    duration = 15,
    musicPath = null,
    onProgress = () => {},
    signal,
  } = opts;

  const { workDir, compPath } = prepareWorkDir(jobId, html);
  const outName = profile === "final" ? "final.mp4" : "draft.mp4";
  const rawOut = path.join(workDir, "raw.mp4");
  const finalOut = path.join(DATA_DIR, "videos", `${jobId}.mp4`);

  onProgress({ progress: 0.02, stage: "preparing" });

  // SFX
  onProgress({ progress: 0.05, stage: "sfx" });
  const sfxPath = await generateSfx(workDir, duration);

  // Spawn render.py
  onProgress({ progress: 0.08, stage: "rendering" });
  const script = path.join(ROOT, "engine", "scripts", "render.py");
  const args = [script, compPath, "--out", rawOut];
  if (profile === "final") {
    args.push("--final");
  }
  if (sfxPath) {
    args.push("--sfx", sfxPath);
  }

  await new Promise((resolve, reject) => {
    const proc = spawn(PYTHON, args, {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: workDir,
      env: { ...process.env },
    });

    let killed = false;
    const onAbort = () => {
      killed = true;
      try {
        proc.kill("SIGTERM");
        setTimeout(() => {
          try {
            proc.kill("SIGKILL");
          } catch {}
        }, 3000);
      } catch {}
    };
    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    }

    const timeout = setTimeout(() => {
      onAbort();
      reject(new Error("Render timed out"));
    }, RENDER_TIMEOUT);

    let stderr = "";
    proc.stdout.on("data", (chunk) => {
      const line = chunk.toString();
      // Parse progress: "Rendering frame X/Y" or similar
      const m = line.match(/Rendering frame\s+(\d+)\s*\/\s*(\d+)/i);
      if (m) {
        const cur = parseInt(m[1], 10);
        const total = parseInt(m[2], 10) || 1;
        const p = 0.08 + 0.75 * Math.min(1, cur / total);
        onProgress({ progress: p, stage: "rendering" });
      } else if (/FFmpeg encoding/i.test(line)) {
        onProgress({ progress: 0.88, stage: "encoding" });
      }
    });
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
      const line = d.toString();
      const m = line.match(/frame\s+(\d+)\s*\/\s*(\d+)/i);
      if (m) {
        const cur = parseInt(m[1], 10);
        const total = parseInt(m[2], 10) || 1;
        const p = 0.08 + 0.75 * Math.min(1, cur / total);
        onProgress({ progress: p, stage: "rendering" });
      }
    });

    proc.on("close", (code) => {
      clearTimeout(timeout);
      if (signal) signal.removeEventListener("abort", onAbort);
      if (killed) {
        reject(new Error("canceled"));
        return;
      }
      if (code !== 0 || !fs.existsSync(rawOut)) {
        reject(new Error(`render.py exited ${code}: ${stderr.slice(-600)}`));
        return;
      }
      resolve();
    });
    proc.on("error", (e) => {
      clearTimeout(timeout);
      reject(e);
    });
  });

  onProgress({ progress: 0.92, stage: "muxing" });

  // If render.py already muxed sfx, still allow music overlay
  let videoSource = rawOut;
  if (musicPath && fs.existsSync(musicPath)) {
    const muxed = path.join(workDir, "with_music.mp4");
    try {
      await muxAudio(rawOut, sfxPath, musicPath, muxed);
      videoSource = muxed;
    } catch {
      // keep raw
    }
  }

  fs.mkdirSync(path.dirname(finalOut), { recursive: true });
  fs.copyFileSync(videoSource, finalOut);

  onProgress({ progress: 0.97, stage: "validating" });
  const validation = await validateOutput(finalOut, duration);
  if (!validation.ok) {
    throw new Error(validation.error || "output validation failed");
  }

  onProgress({ progress: 1, stage: "done" });

  // Cleanup work dir (keep for debug if env set)
  if (process.env.KEEP_RENDER_TMP !== "1") {
    try {
      fs.rmSync(workDir, { recursive: true, force: true });
    } catch {}
  }

  return {
    outputPath: finalOut,
    meta: validation.meta,
  };
}
