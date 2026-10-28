import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const CATBOX_API = "https://catbox.moe/user/api.php";
const LITTERBOX_API = "https://litterbox.catbox.moe/resources/internals/api.php";
const MAX_BYTES = 200 * 1024 * 1024;

/**
 * Multipart upload via curl (more reliable than Node FormData against Catbox).
 */
function curlUpload(url, fields, fileField, filePath) {
  return new Promise((resolve, reject) => {
    const args = ["-sS", "-A", "OneTakeStudio/1.0", "-X", "POST"];
    for (const [k, v] of Object.entries(fields)) {
      args.push("-F", `${k}=${v}`);
    }
    args.push("-F", `${fileField}=@${filePath}`);
    args.push(url);

    const proc = spawn("curl", args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    proc.stdout.on("data", (d) => (out += d));
    proc.stderr.on("data", (d) => (err += d));
    proc.on("close", (code) => {
      const text = out.trim();
      if (code !== 0) {
        reject(new Error(`curl exit ${code}: ${err || text}`.slice(0, 300)));
        return;
      }
      resolve(text);
    });
    proc.on("error", (e) => reject(e));
  });
}

/**
 * Upload a local file to Catbox (anonymous). Falls back to Litterbox (72h).
 * @param {string} filePath
 * @returns {Promise<string>} public URL
 */
export async function uploadToCatbox(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error("Catbox upload: file not found");
  }
  const stat = fs.statSync(filePath);
  if (stat.size <= 0) throw new Error("Catbox upload: empty file");
  if (stat.size > MAX_BYTES) {
    throw new Error(`Catbox upload: file too large (${stat.size} bytes)`);
  }

  const fields = { reqtype: "fileupload" };
  if (process.env.CATBOX_USERHASH) {
    fields.userhash = process.env.CATBOX_USERHASH;
  }

  // 1) Permanent Catbox
  try {
    const text = await curlUpload(CATBOX_API, fields, "fileToUpload", filePath);
    if (/^https?:\/\/\S+$/i.test(text)) return text.trim();
    throw new Error(text.slice(0, 200) || "empty response");
  } catch (e) {
    console.warn("[catbox] primary failed:", e.message);
  }

  // 2) Litterbox temporary (72h) — still streamable/downloadable
  try {
    const text = await curlUpload(
      LITTERBOX_API,
      { reqtype: "fileupload", time: "72h" },
      "fileToUpload",
      filePath
    );
    if (/^https?:\/\/\S+$/i.test(text)) {
      console.log("[catbox] used litterbox fallback (72h)");
      return text.trim();
    }
    throw new Error(text.slice(0, 200) || "empty response");
  } catch (e) {
    throw new Error(`Catbox/Litterbox upload failed: ${e.message}`);
  }
}

/**
 * Best-effort upload; returns null on failure so local file still works.
 */
export async function tryUploadToCatbox(filePath) {
  try {
    const url = await uploadToCatbox(filePath);
    console.log("[catbox] uploaded", url);
    return url;
  } catch (e) {
    console.error("[catbox] upload failed:", e.message);
    return null;
  }
}
