import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getAdapter } from "./providers/registry.js";
import { ProviderError } from "./providers/errors.js";
import { getDb, now, uuid } from "./db.js";
import { decryptCredentials } from "./vault.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SKILL_PATH = path.join(ROOT, "engine", "SKILL.md");

let skillCache = null;

function loadSkillExcerpt() {
  if (skillCache) return skillCache;
  try {
    const full = fs.readFileSync(SKILL_PATH, "utf8");
    // Condense: take first ~8000 chars of the useful body
    const body = full.replace(/^---[\s\S]*?---\s*/, "").trim();
    skillCache = body.slice(0, 12000);
  } catch {
    skillCache = "OneTake composition engine: pure-time HTML animations with window.__seek(t).";
  }
  return skillCache;
}

const ASPECT_SIZES = {
  "16:9": { w: 1920, h: 1080 },
  "9:16": { w: 1080, h: 1920 },
  "1:1": { w: 1080, h: 1080 },
};

export function buildSystemPrompt(settings = {}) {
  const aspect = settings.aspect || "16:9";
  const size = ASPECT_SIZES[aspect] || ASPECT_SIZES["16:9"];
  const duration = Math.min(30, Math.max(10, Number(settings.duration) || 15));
  const skill = loadSkillExcerpt();

  return `You are an expert motion designer using the OneTake engine.

${skill}

## HARD OUTPUT CONTRACT (must follow exactly)

You MUST output a single self-contained HTML document (and nothing else before or after the HTML).
The HTML must:

1. Define \`window.__meta = { dur: ${duration} };\` (duration in seconds).
2. Define \`window.__seek = function(t) { ... }\` where t is seconds [0, dur]. The function must be pure: every visual value is a pure function of t. No requestAnimationFrame loops for the final look; the renderer calls __seek(t) per frame.
3. Contain a root container: \`<div id="canvas">\` sized exactly ${size.w}×${size.h} CSS pixels (width/height style or CSS).
4. Load the motion library with: \`<script src="motion.js"></script>\` (the file will be placed next to the composition by the pipeline).
5. Use only inline CSS or a <style> block. NO external network resources (no CDN fonts, no remote images, no fetch/XHR/WebSocket, no localStorage).
6. Prefer the measured moves from motion.js (springs, entrances, carries, contact, camera) so the cut has rhythm and carry instead of a slideshow.
7. Aspect ratio is ${aspect} → canvas ${size.w}×${size.h}.
8. Target duration: ${duration} seconds.

If you use kinetic type, UI rebuilds, or a hand cursor, keep causes visible.
Output ONLY the HTML (optionally wrapped in a single \`\`\`html fence). No commentary.`;
}

export function buildUserPrompt(project, settings = {}) {
  const parts = [];
  parts.push(`Create a OneTake composition for this brief:\n\n${project.prompt || project.title || "Product motion film"}`);
  if (settings.stylePreset) {
    parts.push(`\nVisual style preset: ${settings.stylePreset}`);
  }
  if (settings.extraInstructions) {
    parts.push(`\nExtra instructions: ${settings.extraInstructions}`);
  }
  parts.push(
    `\nSettings: duration=${settings.duration || 15}s, aspect=${settings.aspect || "16:9"}, resolution=${settings.resolution || "1080p"}`
  );
  return parts.join("\n");
}

/**
 * Extract HTML from LLM response (fenced or raw).
 */
export function extractHtml(text) {
  if (!text || typeof text !== "string") return null;
  const fence = text.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if (fence) return fence[1].trim();
  const htmlStart = text.search(/<!DOCTYPE\s+html|<html[\s>]/i);
  if (htmlStart >= 0) return text.slice(htmlStart).trim();
  // last resort: if it looks like HTML
  if (text.includes("<div") || text.includes("<body")) return text.trim();
  return null;
}

/**
 * Validate composition HTML.
 * @returns {{ ok: boolean, errors: string[], meta?: { dur: number } }}
 */
export function validateComposition(html) {
  const errors = [];
  if (!html || typeof html !== "string") {
    return { ok: false, errors: ["empty html"] };
  }
  if (html.length > 2 * 1024 * 1024) {
    errors.push("html exceeds 2MB");
  }
  if (!/id\s*=\s*["']canvas["']/.test(html) && !/id\s*=\s*["']stage["']/.test(html)) {
    // soft: warn but some templates use other roots; still require __seek
  }
  if (!/__seek\s*=\s*function|function\s+__seek|window\.__seek\s*=/.test(html)) {
    errors.push("missing window.__seek(t)");
  }
  if (!/__meta\s*=\s*\{/.test(html) && !/window\.__meta/.test(html)) {
    errors.push("missing window.__meta");
  }
  // external resources
  if (/https?:\/\/(?!localhost)/i.test(html) && /<(script|link|img|source)[^>]+https?:\/\//i.test(html)) {
    errors.push("external network resources are not allowed");
  }
  if (/\bfetch\s*\(|XMLHttpRequest|WebSocket|localStorage/i.test(html)) {
    errors.push("fetch/XHR/WebSocket/localStorage are not allowed");
  }

  let dur = null;
  const durMatch = html.match(/__meta\s*=\s*\{[^}]*dur\s*:\s*([0-9.]+)/);
  if (durMatch) dur = parseFloat(durMatch[1]);

  if (dur == null || !Number.isFinite(dur) || dur < 1 || dur > 120) {
    errors.push("invalid or missing __meta.dur");
  }

  return {
    ok: errors.length === 0,
    errors,
    meta: dur != null ? { dur } : undefined,
  };
}

/**
 * Run generation for a project: call LLM, validate, store composition.
 */
export async function generateComposition(projectId, userId) {
  const db = getDb();
  const project = db
    .prepare(`SELECT * FROM projects WHERE id = ? AND user_id = ?`)
    .get(projectId, userId);
  if (!project) {
    const err = new Error("Project not found");
    err.code = "not_found";
    throw err;
  }

  const settings = JSON.parse(project.settings_json || "{}");
  if (!project.connection_id || !project.model) {
    const err = new Error("Project has no connection or model selected");
    err.code = "validation";
    throw err;
  }

  const conn = db
    .prepare(`SELECT * FROM connections WHERE id = ? AND user_id = ?`)
    .get(project.connection_id, userId);
  if (!conn) {
    const err = new Error("Connection not found");
    err.code = "not_found";
    throw err;
  }

  const adapter = getAdapter(conn.provider_id);
  if (!adapter) {
    const err = new Error(`Unknown provider: ${conn.provider_id}`);
    err.code = "validation";
    throw err;
  }

  let credentials;
  try {
    credentials = decryptCredentials(conn.credentials_enc);
  } catch (e) {
    const err = new Error("Failed to decrypt credentials");
    err.code = "provider_error";
    throw err;
  }

  const system = buildSystemPrompt(settings);
  const userMsg = buildUserPrompt(project, settings);

  let result;
  try {
    result = await adapter.chat({
      credentials,
      model: project.model,
      system,
      messages: [{ role: "user", content: userMsg }],
      maxTokens: 16384,
      temperature: 0.65,
    });
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    const err = new Error(e.message || "Generation failed");
    err.code = "provider_error";
    throw err;
  }

  const html = extractHtml(result.text);
  if (!html) {
    const err = new Error("Model did not return valid HTML");
    err.code = "validation";
    err.detail = result.text?.slice(0, 500);
    throw err;
  }

  const validation = validateComposition(html);
  const versionRow = db
    .prepare(
      `SELECT COALESCE(MAX(version), 0) AS v FROM compositions WHERE project_id = ?`
    )
    .get(projectId);
  const version = (versionRow?.v || 0) + 1;
  const id = uuid();
  const status = validation.ok ? "ok" : "failed";

  db.prepare(
    `INSERT INTO compositions (id, project_id, user_id, version, status, html, validation_json, error, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    projectId,
    userId,
    version,
    status,
    html,
    JSON.stringify(validation),
    validation.ok ? null : validation.errors.join("; "),
    now()
  );

  // usage
  if (result.usage) {
    db.prepare(
      `INSERT INTO usage_records (id, user_id, connection_id, provider_id, model, prompt_tokens, completion_tokens, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      uuid(),
      userId,
      conn.id,
      conn.provider_id,
      project.model,
      result.usage.promptTokens || 0,
      result.usage.completionTokens || 0,
      now()
    );
  }

  return {
    id,
    projectId,
    version,
    status,
    validation,
    createdAt: now(),
  };
}


/**
 * Create a pending composition row and return it immediately (async generation).
 */
export function enqueueGeneration(projectId, userId) {
  const db = getDb();
  const project = db
    .prepare(`SELECT * FROM projects WHERE id = ? AND user_id = ?`)
    .get(projectId, userId);
  if (!project) {
    const err = new Error("Project not found");
    err.code = "not_found";
    throw err;
  }
  if (!project.connection_id || !project.model) {
    const err = new Error("Project has no connection or model selected");
    err.code = "validation";
    throw err;
  }
  const conn = db
    .prepare(`SELECT id FROM connections WHERE id = ? AND user_id = ?`)
    .get(project.connection_id, userId);
  if (!conn) {
    const err = new Error("Connection not found");
    err.code = "not_found";
    throw err;
  }

  const versionRow = db
    .prepare(`SELECT COALESCE(MAX(version), 0) AS v FROM compositions WHERE project_id = ?`)
    .get(projectId);
  const version = (versionRow?.v || 0) + 1;
  const id = uuid();
  const t = now();
  db.prepare(
    `INSERT INTO compositions (id, project_id, user_id, version, status, html, validation_json, error, created_at)
     VALUES (?, ?, ?, ?, 'generating', NULL, NULL, NULL, ?)`
  ).run(id, projectId, userId, version, t);

  return {
    id,
    projectId,
    version,
    status: "generating",
    validation: null,
    createdAt: t,
  };
}

/**
 * Fill an existing pending composition (status=generating) with LLM output.
 */
export async function fillPendingComposition(compositionId, projectId, userId) {
  const db = getDb();
  const project = db
    .prepare(`SELECT * FROM projects WHERE id = ? AND user_id = ?`)
    .get(projectId, userId);
  if (!project) throw new Error("Project not found");

  const settings = JSON.parse(project.settings_json || "{}");
  const conn = db
    .prepare(`SELECT * FROM connections WHERE id = ? AND user_id = ?`)
    .get(project.connection_id, userId);
  if (!conn) throw new Error("Connection not found");

  const adapter = getAdapter(conn.provider_id);
  if (!adapter) throw new Error(`Unknown provider: ${conn.provider_id}`);

  let credentials;
  try {
    credentials = decryptCredentials(conn.credentials_enc);
  } catch {
    throw new Error("Failed to decrypt credentials");
  }

  const system = buildSystemPrompt(settings);
  const userMsg = buildUserPrompt(project, settings);

  let result;
  try {
    result = await adapter.chat({
      credentials,
      model: project.model,
      system,
      messages: [{ role: "user", content: userMsg }],
      maxTokens: 16384,
      temperature: 0.65,
    });
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    throw new Error(e.message || "Generation failed");
  }

  const html = extractHtml(result.text);
  if (!html) {
    const err = new Error("Model did not return valid HTML");
    err.detail = result.text?.slice(0, 500);
    throw err;
  }

  const validation = validateComposition(html);
  const status = validation.ok ? "ok" : "failed";

  db.prepare(
    `UPDATE compositions SET status = ?, html = ?, validation_json = ?, error = ? WHERE id = ? AND user_id = ?`
  ).run(
    status,
    html,
    JSON.stringify(validation),
    validation.ok ? null : validation.errors.join("; "),
    compositionId,
    userId
  );

  if (result.usage) {
    db.prepare(
      `INSERT INTO usage_records (id, user_id, connection_id, provider_id, model, prompt_tokens, completion_tokens, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      uuid(),
      userId,
      conn.id,
      conn.provider_id,
      project.model,
      result.usage.promptTokens || 0,
      result.usage.completionTokens || 0,
      now()
    );
  }

  return {
    id: compositionId,
    projectId,
    status,
    validation,
  };
}
