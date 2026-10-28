import { Router } from "express";
import { requireAuth } from "../auth.js";
import { listProviders, getAdapter } from "../providers/registry.js";
import { getDb, now, uuid } from "../db.js";
import {
  encryptCredentials,
  decryptCredentials,
  maskSecret,
} from "../vault.js";
import { ProviderError } from "../providers/errors.js";

const router = Router();
const MODELS_CACHE_MS = 10 * 60 * 1000;

router.get("/providers", requireAuth, (_req, res) => {
  res.json({ providers: listProviders() });
});

router.get("/connections", requireAuth, (req, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, provider_id, name, credentials_enc, created_at, updated_at
       FROM connections WHERE user_id = ? ORDER BY created_at DESC`
    )
    .all(req.user.id);

  const connections = rows.map((r) => {
    let hint = { kind: "key", hint: "••••" };
    try {
      const creds = decryptCredentials(r.credentials_enc);
      const key = creds.apiKey || creds.key || Object.values(creds)[0];
      if (typeof key === "string") {
        hint = { kind: "key", hint: maskSecret(key) };
      }
    } catch {}
    return {
      id: r.id,
      providerId: r.provider_id,
      name: r.name,
      credentials: hint,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  });
  res.json({ connections });
});

router.post("/connections", requireAuth, async (req, res) => {
  try {
    const { providerId, name, credentials } = req.body || {};
    const adapter = getAdapter(providerId);
    if (!adapter) {
      return res.status(400).json({
        error: { code: "validation", message: "Unknown provider" },
      });
    }
    const v = await adapter.validate(credentials || {});
    if (!v.ok) {
      return res.status(400).json({
        error: { code: "validation", message: "Invalid credentials", detail: v.errors },
      });
    }
    const id = uuid();
    const t = now();
    const enc = encryptCredentials(credentials);
    const db = getDb();
    db.prepare(
      `INSERT INTO connections (id, user_id, provider_id, name, credentials_enc, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      req.user.id,
      providerId,
      (name || adapter.name).slice(0, 80),
      enc,
      t,
      t
    );
    res.status(201).json({
      connection: {
        id,
        providerId,
        name: name || adapter.name,
        credentials: { kind: "key", hint: maskSecret(credentials.apiKey || "") },
        createdAt: t,
        updatedAt: t,
      },
    });
  } catch (e) {
    console.error("create connection", e);
    res.status(500).json({ error: { code: "server", message: e.message } });
  }
});

router.patch("/connections/:id", requireAuth, async (req, res) => {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM connections WHERE id = ? AND user_id = ?`)
    .get(req.params.id, req.user.id);
  if (!row) {
    return res.status(404).json({ error: { code: "not_found", message: "Not found" } });
  }
  const { name, credentials } = req.body || {};
  let enc = row.credentials_enc;
  if (credentials) {
    const adapter = getAdapter(row.provider_id);
    if (adapter) {
      const v = await adapter.validate(credentials);
      if (!v.ok) {
        return res.status(400).json({
          error: { code: "validation", message: "Invalid credentials", detail: v.errors },
        });
      }
    }
    enc = encryptCredentials(credentials);
  }
  const t = now();
  db.prepare(
    `UPDATE connections SET name = COALESCE(?, name), credentials_enc = ?, updated_at = ? WHERE id = ?`
  ).run(name?.slice(0, 80) || null, enc, t, row.id);
  res.json({
    connection: {
      id: row.id,
      providerId: row.provider_id,
      name: name || row.name,
      credentials: { kind: "key", hint: "••••" },
      updatedAt: t,
    },
  });
});

router.delete("/connections/:id", requireAuth, (req, res) => {
  const db = getDb();
  const result = db
    .prepare(`DELETE FROM connections WHERE id = ? AND user_id = ?`)
    .run(req.params.id, req.user.id);
  if (!result.changes) {
    return res.status(404).json({ error: { code: "not_found", message: "Not found" } });
  }
  res.status(204).end();
});

router.post("/connections/:id/test", requireAuth, async (req, res) => {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM connections WHERE id = ? AND user_id = ?`)
    .get(req.params.id, req.user.id);
  if (!row) {
    return res.status(404).json({ error: { code: "not_found", message: "Not found" } });
  }
  const adapter = getAdapter(row.provider_id);
  if (!adapter) {
    return res.status(400).json({ error: { code: "validation", message: "Unknown provider" } });
  }
  let credentials;
  try {
    credentials = decryptCredentials(row.credentials_enc);
  } catch {
    return res.status(500).json({ error: { code: "server", message: "Decrypt failed" } });
  }
  const start = Date.now();
  try {
    // Prefer a cheap models call, else a tiny chat
    if (adapter.listModels) {
      await adapter.listModels(credentials);
    } else {
      await adapter.chat({
        credentials,
        model: "test",
        messages: [{ role: "user", content: "ping" }],
        maxTokens: 5,
      });
    }
    res.json({ ok: true, latencyMs: Date.now() - start });
  } catch (e) {
    res.json({
      ok: false,
      latencyMs: Date.now() - start,
      error: e.message,
      detail: e.detail,
    });
  }
});

router.get("/connections/:id/models", requireAuth, async (req, res) => {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM connections WHERE id = ? AND user_id = ?`)
    .get(req.params.id, req.user.id);
  if (!row) {
    return res.status(404).json({ error: { code: "not_found", message: "Not found" } });
  }
  const cached = db
    .prepare(`SELECT * FROM provider_models_cache WHERE connection_id = ?`)
    .get(row.id);
  if (cached && now() - cached.fetched_at < MODELS_CACHE_MS) {
    return res.json({
      models: JSON.parse(cached.models_json),
      fetchedAt: cached.fetched_at,
      cached: true,
    });
  }
  const adapter = getAdapter(row.provider_id);
  if (!adapter) {
    return res.status(400).json({ error: { code: "validation", message: "Unknown provider" } });
  }
  let credentials;
  try {
    credentials = decryptCredentials(row.credentials_enc);
  } catch {
    return res.status(500).json({ error: { code: "server", message: "Decrypt failed" } });
  }
  try {
    const models = await adapter.listModels(credentials);
    const t = now();
    db.prepare(
      `INSERT INTO provider_models_cache (connection_id, models_json, fetched_at)
       VALUES (?, ?, ?)
       ON CONFLICT(connection_id) DO UPDATE SET models_json = excluded.models_json, fetched_at = excluded.fetched_at`
    ).run(row.id, JSON.stringify(models), t);
    res.json({ models, fetchedAt: t, cached: false });
  } catch (e) {
    res.status(502).json({
      error: {
        code: "provider_error",
        message: e.message || "Failed to list models",
      },
    });
  }
});

router.get("/connections/:id/limits", requireAuth, (req, res) => {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM connections WHERE id = ? AND user_id = ?`)
    .get(req.params.id, req.user.id);
  if (!row) {
    return res.status(404).json({ error: { code: "not_found", message: "Not found" } });
  }
  const adapter = getAdapter(row.provider_id);
  res.json({
    contextWindow: adapter?.contextWindow ?? null,
    maxOutput: null,
    note: adapter?.limitations ?? null,
  });
});

export default router;
