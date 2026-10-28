import { getDb, now } from "./db.js";
import { generateComposition } from "./generation.js";

/** @type {Map<string, boolean>} */
const active = new Map();
let loopTimer = null;
const CONCURRENCY = Number(process.env.GENERATE_CONCURRENCY) || 2;

function log(...args) {
  if (process.env.LOG_LEVEL === "debug" || process.env.LOG_LEVEL === "info") {
    console.log("[generate-worker]", ...args);
  }
}

/**
 * Enqueue is just inserting a composition with status=generating.
 * This worker picks them up.
 */
export function startGenerationWorker() {
  if (loopTimer) return;
  // Mark any stuck generating rows from previous process as failed after restart
  try {
    const db = getDb();
    const cutoff = now() - 30 * 60 * 1000;
    db.prepare(
      `UPDATE compositions SET status = 'failed', error = 'interrupted (server restart)', validation_json = ?
       WHERE status = 'generating' AND created_at < ?`
    ).run(JSON.stringify({ ok: false, errors: ["interrupted"] }), cutoff);
  } catch (e) {
    console.error("[generate-worker] recovery failed", e.message);
  }
  loopTimer = setInterval(tick, 1500);
  tick();
  log("started, concurrency=", CONCURRENCY);
}

export function stopGenerationWorker() {
  if (loopTimer) {
    clearInterval(loopTimer);
    loopTimer = null;
  }
}

function tick() {
  try {
    while (active.size < CONCURRENCY) {
      const job = claim();
      if (!job) break;
      active.set(job.id, true);
      run(job).finally(() => active.delete(job.id));
    }
  } catch (e) {
    console.error("[generate-worker] tick", e);
  }
}

function claim() {
  const db = getDb();
  return db.transaction(() => {
    const row = db
      .prepare(
        `SELECT id, project_id, user_id FROM compositions
         WHERE status = 'generating' AND html IS NULL
         ORDER BY created_at ASC LIMIT 1`
      )
      .get();
    if (!row) return null;
    // Soft claim: set a sentinel so other workers skip (single process is enough)
    const r = db
      .prepare(
        `UPDATE compositions SET error = 'running' WHERE id = ? AND status = 'generating' AND (error IS NULL OR error = '')`
      )
      .run(row.id);
    if (r.changes === 0) return null;
    return row;
  })();
}

async function run(job) {
  const db = getDb();
  log("start", job.id);
  try {
    // generateComposition inserts a NEW composition version — we need a different path
    // that fills the existing pending row instead.
    const { fillPendingComposition } = await import("./generation.js");
    if (typeof fillPendingComposition === "function") {
      await fillPendingComposition(job.id, job.project_id, job.user_id);
    } else {
      // Fallback: run generate and mark pending as superseded
      await generateComposition(job.project_id, job.user_id);
      db.prepare(
        `UPDATE compositions SET status = 'failed', error = 'superseded', validation_json = ? WHERE id = ?`
      ).run(JSON.stringify({ ok: false, errors: ["superseded"] }), job.id);
    }
    log("done", job.id);
  } catch (e) {
    const msg = e?.message || String(e);
    log("fail", job.id, msg.slice(0, 200));
    db.prepare(
      `UPDATE compositions SET status = 'failed', error = ?, validation_json = ? WHERE id = ?`
    ).run(
      msg.slice(0, 2000),
      JSON.stringify({ ok: false, errors: [msg.slice(0, 500)] }),
      job.id
    );
  }
}
