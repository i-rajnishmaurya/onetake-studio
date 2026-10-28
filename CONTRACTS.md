# ONETAKE STUDIO — Shared Contracts

Standalone Node.js 22+ application delivered as a ZIP. All paths below are relative to the
project root `/tmp/onetake-studio`.

## Runtime layout

```
engine/            OneTake rendering engine (bundled, PolyForm Noncommercial — keep LICENSE)
server/            Node ESM backend (plain .js, no build step; run with `node --experimental-strip-types`? NO — plain JS only)
  index.js         Express app entry (app.createServer)
  db.js            better-sqlite3 schema + migrations (idempotent, run on startup)
  vault.js         AES-256-GCM credential encryption (key from env VAULT_KEY)
  auth.js          signup/login/logout/session middleware (bcryptjs, sessions table)
  rate-limit.js    token-bucket limiter (per IP + per user)
  routes/          express routers: auth, providers, projects, compositions, renders, media, health
  providers/       18 adapters + registry.js + errors.js (see Provider contract)
  render/          worker.js (job loop), pipeline.js (spawn python + ffmpeg), validate.js (ffprobe)
  sfx.js           builds SFX wav via engine/scripts/sfx_palette.py; music mix via ffmpeg
  generation.js    prompt building + composition extraction + validation
  static.js        serves web/dist with SPA fallback
web/               Vite + React 19 + TS SPA (build to web/dist)
tests/             node:test suites (run with `npm test`)
data/              runtime dir (gitignored): app.db, videos/, tmp/
```

## HTTP API (all JSON unless noted; base `/api`)

Auth (cookie session, HttpOnly, SameSite=Lax):
- `POST /api/auth/signup` {email,password,name} → 201 {user}
- `POST /api/auth/login` {email,password} → {user}
- `POST /api/auth/logout` → 204
- `GET  /api/auth/me` → {user|null}; user = {id,email,name,emailVerified}
- `POST /api/auth/verify-email` {token} → {ok} (token link surfaced in server console — no SMTP by default, documented)
- `POST /api/auth/request-reset` {email} → always 200 (token link in server console)
- `POST /api/auth/reset-password` {token,password} → {ok}
- `PATCH /api/auth/me` {name?,password?{current,next}} → {user}

Providers (all require session; ownership enforced):
- `GET  /api/providers` → catalog metadata (never credentials)
- `POST /api/connections` {providerId,name,credentials} → {connection} (credentials encrypted at rest, never returned)
- `GET  /api/connections` → list (masked credential summary, e.g. `{kind:"key",hint:"sk-…3f9a"}`)
- `PATCH /api/connections/:id` {name?,credentials?} → {connection}
- `DELETE /api/connections/:id` → 204
- `POST /api/connections/:id/test` → {ok, latencyMs, error?, detail?} (real network call)
- `GET  /api/connections/:id/models` → {models:[{id,label?}], fetchedAt, cached?} (real network call, cached 10 min)
- `GET  /api/connections/:id/limits` → {contextWindow?, maxOutput?, note?}

Projects & compositions:
- `GET/POST /api/projects` {title,prompt,settings,connectionId,model} → list/created (settings: {duration,aspect:"16:9"|"9:16"|"1:1",resolution:"1080p"|"2160p"? stylePreset,extraInstructions,sfx,music:{enabled}})
- `GET/PATCH/DELETE /api/projects/:id` (PATCH: title, settings)
- `POST /api/projects/:id/generate` → 202 {composition} (runs generation synchronously-ish: returns after LLM call; may take minutes — client polls)
- `GET /api/projects/:id/compositions` → versions, newest first
- `GET /api/compositions/:id` → {id,version,status,validation}
- `GET /api/compositions/:id/html` → text/html (CSP hardening; used by sandboxed preview iframe)
- `POST /api/projects/:id/regenerate` → 202 {composition} (fails preserve previous version)

Renders:
- `POST /api/projects/:id/render` {compositionId?, resolution?: "draft"|"final"} → 202 {job} (queued)
- `GET /api/jobs/:id` → {job:{status,progress,stage,error,output?}}  (progress 0..1)
- `POST /api/jobs/:id/cancel` → 202 (cooperative cancel)
- `POST /api/jobs/:id/retry` → 202 {job}
- `GET /api/projects/:id/jobs` → list
- `GET /api/jobs/:id/download` → video/mp4 stream (403 unless owner)
- `POST /api/projects/:id/music` multipart (mp3/wav ≤20MB) → {ok}
- `GET /api/health` → {ok,db,python,ffmpeg,version}

Errors: `{error:{code,message,detail?}}`; codes: `unauthorized, forbidden, not_found, validation, provider_error, rate_limited, quota, render_error`.

## Database (better-sqlite3, WAL; single file data/app.db)

users, sessions, provider_connections (credentials_enc BLOB), provider_models_cache,
projects (settings_json), compositions (html TEXT, validation_json, status: ok|failed),
jobs (status: queued|running|succeeded|failed|canceled, progress REAL, stage TEXT,
worker_id, heartbeat_at, claimed_at, cancel_requested INT, output_path, output_meta_json,
attempts INT), usage_records (provider_id, model, prompt_tokens, completion_tokens).
Every user-scoped query includes `WHERE user_id = ?`. SQLite has no RLS — ownership is
enforced at every route (documented).

## Job durability rules

- Claim inside a transaction: `UPDATE jobs SET status='running', claimed_at=?, worker_id=?
  WHERE id=? AND status IN ('queued')` — guards duplicates.
- Worker heartbeat every 5s; startup sweep marks jobs with stale heartbeat (>60s) and no
  live process as `failed` (retryable), never silently lost.
- RENDER_CONCURRENCY (default 2) semaphores; RENDER_TIMEOUT_MS (default 1800000).
- Cancel: set cancel_requested; worker kills the python process tree (SIGTERM→SIGKILL).
- Output validated by ffprobe (h264, duration within 0.5s of meta, size>0) before `succeeded`.

## Provider adapter contract (server/providers/adapters/*.js)

```js
export default {
  id: "openai",                      // stable slug
  name: "OpenAI",
  auth: { type: "api-key"|"aws",     // aws = Bedrock (accessKeyId/secretAccessKey/region)
    fields: [{key,label,placeholder,required,secret,default?}] },
  docsUrl,                           // real documentation URL
  limitations: "…",                  // honest note when discovery/streaming/etc. unsupported
  supports: { modelDiscovery:true, streaming:false },
  contextWindow: 200000,             // documented, may be null
  async validate(credentials): {ok, errors}
  async listModels(credentials): [{id,label?}]      // real endpoint or documented fallback list
  async chat({credentials, model, system, messages, maxTokens, temperature, signal}):
      {text, usage?:{promptTokens,completionTokens}}
}
```

Rules: real endpoints only; use global fetch; throw `errors.js` `ProviderError` with the
provider's real message (status + body excerpt, secrets redacted); never log keys.

## Generation prompt contract (server/generation.js)

System prompt = condensed OneTake SKILL.md (bundled at engine/SKILL.md — load and excerpt)
+ hard output contract: single self-contained HTML file, defines `window.__seek(t)`,
`window.__meta = {dur}` (and `__motion`, `__events` where applicable), loads
`motion.js` via `<script src="motion.js">` (copied next to comp by pipeline), all CSS
sized for `W×H` passed in settings (16:9→1920×1080, 9:16→1080×1920, 1:1→1080×1080), no
external network resources (fonts/CDN/images), no fetch/XHR/WebSocket, no localStorage.
User prompt + settings + style preset appended. Response parsed: first ```html fence or
raw HTML. Validation rejects: missing __seek, external refs, >2MB, missing __meta.dur.
