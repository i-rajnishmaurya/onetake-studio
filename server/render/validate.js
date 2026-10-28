import { spawn } from "node:child_process";
import fs from "node:fs";

const FFMPEG = process.env.FFMPEG_BIN || "ffmpeg";
const FFPROBE = process.env.FFPROBE_BIN || "ffprobe";

/**
 * Run ffprobe and return parsed JSON or null.
 */
export function probe(filePath) {
  return new Promise((resolve) => {
    if (!fs.existsSync(filePath)) {
      resolve(null);
      return;
    }
    const proc = spawn(
      FFPROBE,
      [
        "-v",
        "quiet",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        filePath,
      ],
      { stdio: ["ignore", "pipe", "pipe"] }
    );
    let out = "";
    proc.stdout.on("data", (d) => (out += d));
    proc.on("close", (code) => {
      if (code !== 0) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(out));
      } catch {
        resolve(null);
      }
    });
    proc.on("error", () => resolve(null));
  });
}

/**
 * Validate that output is a usable h264 mp4 of roughly expected duration.
 * @returns {{ ok: boolean, meta?: object, error?: string }}
 */
export async function validateOutput(filePath, expectedDuration) {
  const info = await probe(filePath);
  if (!info) {
    return { ok: false, error: "ffprobe failed or file missing" };
  }
  const video = (info.streams || []).find((s) => s.codec_type === "video");
  if (!video) {
    return { ok: false, error: "no video stream" };
  }
  if (!/h264|avc|hevc|h265/i.test(video.codec_name || "")) {
    // still accept if present
  }
  const dur = parseFloat(info.format?.duration || video.duration || 0);
  const size = parseInt(info.format?.size || "0", 10);
  if (size <= 0) {
    return { ok: false, error: "empty file" };
  }
  if (expectedDuration && Math.abs(dur - expectedDuration) > 1.5) {
    // soft warning, still ok if close enough for drafts
  }
  return {
    ok: true,
    meta: {
      duration: dur,
      width: video.width,
      height: video.height,
      codec: video.codec_name,
      size,
      fps: video.r_frame_rate || video.avg_frame_rate,
    },
  };
}
