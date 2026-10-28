import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TEST_DATA = path.join(ROOT, "data", "test-db");

process.env.DATA_DIR = TEST_DATA;
process.env.VAULT_KEY = Buffer.from("test-vault-key-32-bytes-long!!!!").toString("base64");

// Clean slate
fs.rmSync(TEST_DATA, { recursive: true, force: true });

const { getDb, closeDb, uuid, now } = await import("../server/db.js");

describe("db", () => {
  before(() => {
    getDb();
  });

  after(() => {
    closeDb();
    fs.rmSync(TEST_DATA, { recursive: true, force: true });
  });

  it("creates tables idempotently", () => {
    const db = getDb();
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
      .all()
      .map((r) => r.name);
    for (const t of [
      "users",
      "sessions",
      "connections",
      "projects",
      "compositions",
      "jobs",
      "media",
    ]) {
      assert.ok(tables.includes(t), `missing table ${t}`);
    }
    // second migrate should not throw
    getDb();
  });

  it("WAL mode enabled", () => {
    const mode = getDb().pragma("journal_mode", { simple: true });
    assert.equal(String(mode).toLowerCase(), "wal");
  });

  it("inserts and queries a user", () => {
    const db = getDb();
    const id = uuid();
    const t = now();
    db.prepare(
      `INSERT INTO users (id, email, name, password_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, "test@example.com", "Test", "hash", t, t);
    const row = db.prepare(`SELECT * FROM users WHERE id = ?`).get(id);
    assert.equal(row.email, "test@example.com");
  });
});
