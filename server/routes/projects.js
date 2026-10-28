import { Router } from "express";
import { requireAuth } from "../auth.js";
import { getDb, now, uuid } from "../db.js";
import { generateComposition } from "../generation.js";
import { ProviderError } from "../providers/errors.js";
import { requestCancel } from "../render/worker.js";
import path from "node:path";
import fs from "node:fs";
import { DATA_DIR } from "../db.js";

const router = Router();

function projectPublic(row) {
  return {
    id: row.id,
    title: row.title,
    prompt: row.prompt,
    settings: JSON.parse(row.settings_json || "{}"),
    connectionId: row.connection_id,
    model: row.model,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

router.get("/projects", requireAuth, (req, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM projects WHERE user_id = ? ORDER BY updated_at DESC`
    )
    .all(req.user.id);
  res.json({ projects: rows.map(projectPublic) });
});

router.post("/projects", requireAuth, (req, res) => {
  const { title, prompt, settings, connectionId, model } = req.body || {};
  if (!title || typeof title !== "string") {
    return res.status(400).json({
      error: { code: "validation", message: "title required" },
    });
  }
  const id = uuid();
  const t = now();
  const db = getDb();
  if (connectionId) {
    const c = db
      .prepare(`SELECT id FROM connections WHERE id = ? AND user_id = ?`)
      .get(connectionId, req.user.id);
    if (!c) {
      return res.status(400).json({
        error: { code: "validation", message: "Invalid connectionId" },
      });
    }
  }
  db.prepare(
    `INSERT INTO projects (id, user_id, title, prompt, settings_json, connection_id, model, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    req.user.id,
    title.slice(0, 200),
    (prompt || "").slice(0, 20000),
    JSON.stringify(settings || {}),
    connectionId || null,
    model || null,
    t,
    t
  );
  const row = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id);
  res.status(201).json({ project: projectPublic(row) });
});

router.get("/projects/:id", requireAuth, (req, res) => {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM projects WHERE id = ? AND user_id = ?`)
    .get(req.params.id, req.user.id);
  if (!row) {
    return res.status(404).json({ error: { code: "not_found", message: "Not found" } });
  }
  res.json({ project: projectPublic(row) });
});

router.patch("/projects/:id", requireAuth, (req, res) => {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM projects WHERE id = ? AND user_id = ?`)
    .get(req.params.id, req.user.id);
  if (!row) {
    return res.status(404).json({ error: { code: "not_found", message: "Not found" } });
  }
  const { title, prompt, settings, connectionId, model } = req.body || {};
  const t = now();
  db.prepare(
    `UPDATE projects SET
      title = COALESCE(?, title),
      prompt = COALESCE(?, prompt),
      settings_json = COALESCE(?, settings_json),
      connection_id = COALESCE(?, connection_id),
      model = COALESCE(?, model),
      updated_at = ?
     WHERE id = ?`
  ).run(
    title?.slice(0, 200) ?? null,
    prompt != null ? String(prompt).slice(0, 20000) : null,
    settings != null ? JSON.stringify(settings) : null,
    connectionId ?? null,
    model ?? null,
    t,
    row.id
  );
  const updated = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(row.id);
  res.json({ project: projectPublic(updated) });
});

router.delete("/projects/:id", requireAuth, (req, res) => {
  const db = getDb();
  const result = db
    .prepare(`DELETE FROM projects WHERE id = ? AND user_id = ?`)
    .run(req.params.id, req.user.id);
  if (!result.changes) {
    return res.status(404).json({ error: { code: "not_found", message: "Not found" } });
  }
  res.status(204).end();
});

router.post("/projects/:id/generate", requireAuth, async (req, res) => {
  try {
    const composition = await generateComposition(req.params.id, req.user.id);
    res.status(202).json({ composition });
  } catch (e) {
    const code = e.code || (e instanceof ProviderError ? "provider_error" : "server");
    const status =
      code === "not_found" ? 404 : code === "validation" ? 400 : code === "provider_error" ? 502 : 500;
    res.status(status).json({
      error: { code, message: e.message, detail: e.detail },
    });
  }
});

router.post("/projects/:id/regenerate", requireAuth, async (req, res) => {
  try {
    const composition = await generateComposition(req.params.id, req.user.id);
    res.status(202).json({ composition });
  } catch (e) {
    const code = e.code || "server";
    res.status(code === "not_found" ? 404 : 500).json({
      error: { code, message: e.message },
    });
  }
});

router.get("/projects/:id/compositions", requireAuth, (req, res) => {
  const db = getDb();
  const project = db
    .prepare(`SELECT id FROM projects WHERE id = ? AND user_id = ?`)
    .get(req.params.id, req.user.id);
  if (!project) {
    return res.status(404).json({ error: { code: "not_found", message: "Not found" } });
  }
  const rows = db
    .prepare(
      `SELECT id, project_id, version, status, validation_json, error, created_at
       FROM compositions WHERE project_id = ? ORDER BY version DESC`
    )
    .all(req.params.id);
  res.json({
    compositions: rows.map((r) => ({
      id: r.id,
      projectId: r.project_id,
      version: r.version,
      status: r.status,
      validation: r.validation_json ? JSON.parse(r.validation_json) : null,
      error: r.error,
      createdAt: r.created_at,
    })),
  });
});

router.get("/compositions/:id", requireAuth, (req, res) => {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM compositions WHERE id = ? AND user_id = ?`)
    .get(req.params.id, req.user.id);
  if (!row) {
    return res.status(404).json({ error: { code: "not_found", message: "Not found" } });
  }
  res.json({
    composition: {
      id: row.id,
      projectId: row.project_id,
      version: row.version,
      status: row.status,
      validation: row.validation_json ? JSON.parse(row.validation_json) : null,
      error: row.error,
      createdAt: row.created_at,
    },
  });
});

router.get("/compositions/:id/html", requireAuth, (req, res) => {
  const db = getDb();
  const row = db
    .prepare(`SELECT html FROM compositions WHERE id = ? AND user_id = ?`)
    .get(req.params.id, req.user.id);
  if (!row) {
    return res.status(404).json({ error: { code: "not_found", message: "Not found" } });
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline' 'self'; img-src data: blob:; media-src 'none'; connect-src 'none'; frame-ancestors 'self';"
  );
  res.send(row.html || "");
});

router.post("/projects/:id/render", requireAuth, (req, res) => {
  const db = getDb();
  const project = db
    .prepare(`SELECT * FROM projects WHERE id = ? AND user_id = ?`)
    .get(req.params.id, req.user.id);
  if (!project) {
    return res.status(404).json({ error: { code: "not_found", message: "Not found" } });
  }
  const { compositionId, resolution } = req.body || {};
  let compId = compositionId;
  if (!compId) {
    const latest = db
      .prepare(
        `SELECT id FROM compositions WHERE project_id = ? AND status = 'ok' ORDER BY version DESC LIMIT 1`
      )
      .get(project.id);
    if (!latest) {
      return res.status(400).json({
        error: { code: "validation", message: "No successful composition to render" },
      });
    }
    compId = latest.id;
  } else {
    const c = db
      .prepare(`SELECT id FROM compositions WHERE id = ? AND project_id = ?`)
      .get(compId, project.id);
    if (!c) {
      return res.status(400).json({
        error: { code: "validation", message: "Invalid compositionId" },
      });
    }
  }
  const id = uuid();
  const t = now();
  const resProfile = resolution === "final" ? "final" : "draft";
  db.prepare(
    `INSERT INTO jobs (id, project_id, composition_id, user_id, status, progress, stage, resolution, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'queued', 0, 'queued', ?, ?, ?)`
  ).run(id, project.id, compId, req.user.id, resProfile, t, t);
  const job = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(id);
  res.status(202).json({
    job: {
      id: job.id,
      projectId: job.project_id,
      compositionId: job.composition_id,
      status: job.status,
      progress: job.progress,
      stage: job.stage,
      resolution: job.resolution,
      createdAt: job.created_at,
    },
  });
});

router.get("/projects/:id/jobs", requireAuth, (req, res) => {
  const db = getDb();
  const project = db
    .prepare(`SELECT id FROM projects WHERE id = ? AND user_id = ?`)
    .get(req.params.id, req.user.id);
  if (!project) {
    return res.status(404).json({ error: { code: "not_found", message: "Not found" } });
  }
  const rows = db
    .prepare(
      `SELECT * FROM jobs WHERE project_id = ? ORDER BY created_at DESC`
    )
    .all(req.params.id);
  res.json({
    jobs: rows.map((j) => ({
      id: j.id,
      status: j.status,
      progress: j.progress,
      stage: j.stage,
      error: j.error,
      resolution: j.resolution,
      output: j.output_path
        ? { path: j.output_path, meta: j.output_meta_json ? JSON.parse(j.output_meta_json) : null }
        : null,
      createdAt: j.created_at,
      updatedAt: j.updated_at,
    })),
  });
});

router.get("/jobs/:id", requireAuth, (req, res) => {
  const db = getDb();
  const j = db
    .prepare(`SELECT * FROM jobs WHERE id = ? AND user_id = ?`)
    .get(req.params.id, req.user.id);
  if (!j) {
    return res.status(404).json({ error: { code: "not_found", message: "Not found" } });
  }
  res.json({
    job: {
      id: j.id,
      projectId: j.project_id,
      status: j.status,
      progress: j.progress,
      stage: j.stage,
      error: j.error,
      resolution: j.resolution,
      output: j.output_path
        ? { path: j.output_path, meta: j.output_meta_json ? JSON.parse(j.output_meta_json) : null }
        : null,
      createdAt: j.created_at,
      updatedAt: j.updated_at,
    },
  });
});

router.post("/jobs/:id/cancel", requireAuth, (req, res) => {
  const db = getDb();
  const j = db
    .prepare(`SELECT * FROM jobs WHERE id = ? AND user_id = ?`)
    .get(req.params.id, req.user.id);
  if (!j) {
    return res.status(404).json({ error: { code: "not_found", message: "Not found" } });
  }
  requestCancel(j.id);
  res.status(202).json({ ok: true });
});

router.post("/jobs/:id/retry", requireAuth, (req, res) => {
  const db = getDb();
  const j = db
    .prepare(`SELECT * FROM jobs WHERE id = ? AND user_id = ?`)
    .get(req.params.id, req.user.id);
  if (!j) {
    return res.status(404).json({ error: { code: "not_found", message: "Not found" } });
  }
  if (!["failed", "canceled"].includes(j.status)) {
    return res.status(400).json({
      error: { code: "validation", message: "Only failed/canceled jobs can be retried" },
    });
  }
  const id = uuid();
  const t = now();
  db.prepare(
    `INSERT INTO jobs (id, project_id, composition_id, user_id, status, progress, stage, resolution, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'queued', 0, 'queued', ?, ?, ?)`
  ).run(id, j.project_id, j.composition_id, req.user.id, j.resolution, t, t);
  const job = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(id);
  res.status(202).json({
    job: {
      id: job.id,
      status: job.status,
      progress: 0,
      stage: "queued",
      resolution: job.resolution,
      createdAt: t,
    },
  });
});

router.get("/jobs/:id/download", requireAuth, (req, res) => {
  const db = getDb();
  const j = db
    .prepare(`SELECT * FROM jobs WHERE id = ? AND user_id = ?`)
    .get(req.params.id, req.user.id);
  if (!j) {
    return res.status(404).json({ error: { code: "not_found", message: "Not found" } });
  }
  if (j.status !== "succeeded" || !j.output_path || !fs.existsSync(j.output_path)) {
    return res.status(404).json({ error: { code: "not_found", message: "Video not ready" } });
  }
  res.setHeader("Content-Type", "video/mp4");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="onetake-${j.id.slice(0, 8)}.mp4"`
  );
  fs.createReadStream(j.output_path).pipe(res);
});

export default router;
