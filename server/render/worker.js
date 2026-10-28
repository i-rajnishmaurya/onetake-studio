import { getDb, now, uuid } from "../db.js";
import { runPipeline } from "./pipeline.js";
import path from "node:path";
import fs from "node:fs";
import { DATA_DIR } from "../db.js";

const CONCURRENCY = Number(process.env.RENDER_CONCURRENCY) || 2;
const HEARTBEAT_MS = 5000;
const STALE_MS = 60_000;

/** @type {Map<string, {controller: AbortController, jobId: string}>} */
const active = new Map();
let running = 0;
let loopTimer = null;
const workerId = `w-${process.pid}-${Date.now().toString(36)}`;

function log(...args) {
  if (process.env.LOG_LEVEL === "debug" || process.env.LOG_LEVEL === "info") {
    console.log("[render-worker]", ...args);
  }
}

export function startWorker() {
  if (loopTimer) return;
  // Recover stale jobs
  try {
    const db = getDb();
    const cutoff = now() - STALE_MS;
    const stale = db
      .prepare(
        `UPDATE jobs SET status = 'failed', error = 'stale worker', updated_at = ?
         WHERE status = 'running' AND (heartbeat_at IS NULL OR heartbeat_at < ?)`
      )
      .run(now(), cutoff);
    if (stale.changes) log("marked stale jobs failed:", stale.changes);
  } catch (e) {
    console.error("stale sweep failed", e);
  }

  loopTimer = setInterval(tick, 1500);
  tick();
  log("started, concurrency=", CONCURRENCY);
}

export function stopWorker() {
  if (loopTimer) {
    clearInterval(loopTimer);
    loopTimer = null;
  }
  for (const [, entry] of active) {
    entry.controller.abort();
  }
}

function tick() {
  try {
    const db = getDb();
    // Heartbeat active jobs
    for (const [jobId] of active) {
      db.prepare(
        `UPDATE jobs SET heartbeat_at = ?, updated_at = ? WHERE id = ? AND status = 'running'`
      ).run(now(), now(), jobId);
    }

    while (running < CONCURRENCY) {
      const job = claimJob(db);
      if (!job) break;
      running++;
      processJob(job).finally(() => {
        running--;
        active.delete(job.id);
      });
    }
  } catch (e) {
    console.error("[render-worker] tick error", e);
  }
}

function claimJob(db) {
  const tx = db.transaction(() => {
    const row = db
      .prepare(
        `SELECT * FROM jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1`
      )
      .get();
    if (!row) return null;
    const result = db
      .prepare(
        `UPDATE jobs SET status = 'running', claimed_at = ?, worker_id = ?, heartbeat_at = ?, updated_at = ?, attempts = attempts + 1
         WHERE id = ? AND status = 'queued'`
      )
      .run(now(), workerId, now(), now(), row.id);
    if (result.changes === 0) return null;
    return db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(row.id);
  });
  return tx();
}

async function processJob(job) {
  const db = getDb();
  const controller = new AbortController();
  active.set(job.id, { controller, jobId: job.id });

  // Check cancel before start
  const fresh = db.prepare(`SELECT cancel_requested FROM jobs WHERE id = ?`).get(job.id);
  if (fresh?.cancel_requested) {
    db.prepare(
      `UPDATE jobs SET status = 'canceled', updated_at = ?, stage = 'canceled' WHERE id = ?`
    ).run(now(), job.id);
    return;
  }

  try {
    const comp = job.composition_id
      ? db.prepare(`SELECT * FROM compositions WHERE id = ?`).get(job.composition_id)
      : db
          .prepare(
            `SELECT * FROM compositions WHERE project_id = ? AND status = 'ok' ORDER BY version DESC LIMIT 1`
          )
          .get(job.project_id);

    if (!comp || !comp.html) {
      throw new Error("No valid composition to render");
    }

    let duration = 15;
    try {
      const v = JSON.parse(comp.validation_json || "{}");
      if (v.meta?.dur) duration = v.meta.dur;
    } catch {}

    // Optional music for project
    const music = db
      .prepare(
        `SELECT path FROM media WHERE project_id = ? AND kind = 'music' ORDER BY created_at DESC LIMIT 1`
      )
      .get(job.project_id);

    const result = await runPipeline({
      jobId: job.id,
      html: comp.html,
      profile: job.resolution === "final" ? "final" : "draft",
      duration,
      musicPath: music?.path || null,
      signal: controller.signal,
      onProgress: ({ progress, stage }) => {
        // Cooperative cancel check
        const j = db.prepare(`SELECT cancel_requested FROM jobs WHERE id = ?`).get(job.id);
        if (j?.cancel_requested) {
          controller.abort();
          return;
        }
        db.prepare(
          `UPDATE jobs SET progress = ?, stage = ?, heartbeat_at = ?, updated_at = ? WHERE id = ?`
        ).run(progress, stage, now(), now(), job.id);
      },
    });

    db.prepare(
      `UPDATE jobs SET status = 'succeeded', progress = 1, stage = 'done', output_path = ?, output_meta_json = ?, updated_at = ?, heartbeat_at = ?
       WHERE id = ?`
    ).run(
      result.outputPath,
      JSON.stringify(result.meta || {}),
      now(),
      now(),
      job.id
    );
    log("job succeeded", job.id);
  } catch (e) {
    const msg = e?.message || String(e);
    const canceled = msg === "canceled" || controller.signal.aborted;
    db.prepare(
      `UPDATE jobs SET status = ?, error = ?, stage = ?, updated_at = ? WHERE id = ?`
    ).run(
      canceled ? "canceled" : "failed",
      msg.slice(0, 2000),
      canceled ? "canceled" : "error",
      now(),
      job.id
    );
    log("job failed", job.id, msg.slice(0, 200));
  }
}

export function requestCancel(jobId) {
  const db = getDb();
  db.prepare(
    `UPDATE jobs SET cancel_requested = 1, updated_at = ? WHERE id = ? AND status IN ('queued','running')`
  ).run(now(), jobId);
  const entry = active.get(jobId);
  if (entry) entry.controller.abort();
}

export function getWorkerStats() {
  return { running, concurrency: CONCURRENCY, active: [...active.keys()], workerId };
}
