import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TEST_DATA = path.join(ROOT, "data", "test-jobs");

process.env.DATA_DIR = TEST_DATA;
process.env.VAULT_KEY = Buffer.from("test-vault-key-32-bytes-long!!!!").toString("base64");
process.env.RENDER_CONCURRENCY = "1";

fs.rmSync(TEST_DATA, { recursive: true, force: true });

const { getDb, closeDb, uuid, now } = await import("../server/db.js");
const { requestCancel, getWorkerStats } = await import("../server/render/worker.js");

describe("jobs queue", () => {
  let userId, projectId, compId, jobId;

  before(() => {
    const db = getDb();
    userId = uuid();
    const t = now();
    db.prepare(
      `INSERT INTO users (id, email, name, password_hash, created_at, updated_at)
       VALUES (?, 'j@test.com', 'J', 'x', ?, ?)`
    ).run(userId, t, t);
    projectId = uuid();
    db.prepare(
      `INSERT INTO projects (id, user_id, title, prompt, settings_json, created_at, updated_at)
       VALUES (?, ?, 'P', '', '{}', ?, ?)`
    ).run(projectId, userId, t, t);
    compId = uuid();
    db.prepare(
      `INSERT INTO compositions (id, project_id, user_id, version, status, html, validation_json, created_at)
       VALUES (?, ?, ?, 1, 'ok', '<html></html>', '{"ok":true,"meta":{"dur":5}}', ?)`
    ).run(compId, projectId, userId, t);
    jobId = uuid();
    db.prepare(
      `INSERT INTO jobs (id, project_id, composition_id, user_id, status, progress, stage, resolution, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'queued', 0, 'queued', 'draft', ?, ?)`
    ).run(jobId, projectId, compId, userId, t, t);
  });

  after(() => {
    closeDb();
    fs.rmSync(TEST_DATA, { recursive: true, force: true });
  });

  it("can request cancel on queued job", () => {
    requestCancel(jobId);
    const row = getDb().prepare(`SELECT cancel_requested FROM jobs WHERE id = ?`).get(jobId);
    assert.equal(row.cancel_requested, 1);
  });

  it("exposes worker stats", () => {
    const s = getWorkerStats();
    assert.ok(typeof s.running === "number");
    assert.ok(s.concurrency >= 1);
  });
});
