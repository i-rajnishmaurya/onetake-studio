import { Router } from "express";
import { requireAuth } from "../auth.js";
import { getDb, now, uuid, DATA_DIR } from "../db.js";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

const router = Router();
const MAX_MUSIC_BYTES = 20 * 1024 * 1024;

/**
 * Minimal multipart parser for a single file field named "file" or "music".
 * Avoids extra dependencies.
 */
async function parseMultipart(req) {
  const contentType = req.headers["content-type"] || "";
  const m = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!m) throw new Error("multipart boundary missing");
  const boundary = m[1] || m[2];
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const buf = Buffer.concat(chunks);
  if (buf.length > MAX_MUSIC_BYTES + 64 * 1024) {
    throw new Error("File too large");
  }
  const sep = Buffer.from(`--${boundary}`);
  const parts = [];
  let start = buf.indexOf(sep) + sep.length;
  while (start < buf.length) {
    if (buf[start] === 45 && buf[start + 1] === 45) break; // --
    if (buf[start] === 13) start += 2; // \r\n
    const next = buf.indexOf(sep, start);
    if (next < 0) break;
    let part = buf.subarray(start, next - 2); // strip trailing \r\n
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd >= 0) {
      const header = part.subarray(0, headerEnd).toString("utf8");
      const body = part.subarray(headerEnd + 4);
      const nameMatch = header.match(/name="([^"]+)"/);
      const fileMatch = header.match(/filename="([^"]+)"/);
      const typeMatch = header.match(/Content-Type:\s*([^\r\n]+)/i);
      parts.push({
        name: nameMatch?.[1],
        filename: fileMatch?.[1],
        mime: typeMatch?.[1]?.trim(),
        data: body,
      });
    }
    start = next + sep.length;
  }
  return parts;
}

router.post("/projects/:id/music", requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const project = db
      .prepare(`SELECT id FROM projects WHERE id = ? AND user_id = ?`)
      .get(req.params.id, req.user.id);
    if (!project) {
      return res.status(404).json({ error: { code: "not_found", message: "Not found" } });
    }

    const parts = await parseMultipart(req);
    const file = parts.find((p) => p.filename && (p.name === "file" || p.name === "music" || !p.name));
    if (!file || !file.data?.length) {
      return res.status(400).json({
        error: { code: "validation", message: "music file required (mp3/wav ≤20MB)" },
      });
    }
    if (file.data.length > MAX_MUSIC_BYTES) {
      return res.status(400).json({
        error: { code: "validation", message: "File exceeds 20MB" },
      });
    }
    const ext = (file.filename || "").toLowerCase().endsWith(".wav")
      ? ".wav"
      : (file.filename || "").toLowerCase().endsWith(".mp3")
        ? ".mp3"
        : ".bin";
    const id = uuid();
    const dir = path.join(DATA_DIR, "media", req.user.id);
    fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, `${id}${ext}`);
    fs.writeFileSync(dest, file.data);

    db.prepare(
      `INSERT INTO media (id, user_id, project_id, kind, filename, path, mime, size, created_at)
       VALUES (?, ?, ?, 'music', ?, ?, ?, ?, ?)`
    ).run(
      id,
      req.user.id,
      project.id,
      file.filename || `music${ext}`,
      dest,
      file.mime || "application/octet-stream",
      file.data.length,
      now()
    );

    res.json({ ok: true, mediaId: id });
  } catch (e) {
    console.error("music upload", e);
    res.status(400).json({
      error: { code: "validation", message: e.message || "Upload failed" },
    });
  }
});

export default router;
