# ONETAKE STUDIO — Remaining Tasks & Ready-to-Use Agent Prompt

This document provides the exact status of the build and a complete prompt you can paste into any AI coding assistant (Lovable, Cursor, Claude Code, ChatGPT, Codex) to complete the project from this exact point.

---

## Current Status

### ✅ Completed:
- **OneTake Engine**: Bundled in `engine/` with all scripts, libraries, motion templates, and license.
- **Frontend SPA**: Completely implemented in `web/` (React 19 + TypeScript + Vite + Tailwind CSS) with Ideavo.ai-inspired design, dark/light theme, authentication views, video creation studio, provider key manager, and live render progress bars.
- **Specification & Contracts**: Defined in `CONTRACTS.md` with every route, schema, and interface.

### ⏳ Pending (To Be Built):
1. **Backend Core (`server/`)**:
   - `db.js`: SQLite initialization with `better-sqlite3` (users, sessions, connections, projects, compositions, jobs, media).
   - `vault.js`: AES-256-GCM encryption/decryption for user API keys using `VAULT_KEY`.
   - `auth.js`: Session-based authentication with bcryptjs and secure cookies.
   - `routes/`: Express routers for auth, connections, projects, compositions, jobs, and media.
   - `generation.js`: Prompt construction following `engine/SKILL.md` to instruct connected LLMs to output valid HTML compositions.
   - `render/worker.js` & `render/pipeline.js`: Background job queue executing `python3 engine/scripts/render.py` and tracking frame progress.
   - `sfx.js`: Procedural audio generation using `engine/scripts/sfx_palette.py` and audio muxing with FFmpeg.
2. **Provider Adapters (`server/providers/adapters/`)**:
   - Implement the 18 BYOK providers defined in `CONTRACTS.md` (OpenAI, Anthropic, Google Gemini, Groq, Mistral, Together, OpenRouter, DeepSeek, Fireworks, Cohere, Perplexity, Cerebras, Sambanova, Chutes, Hyperbolic, Novita, TokenRouter, OpenCode Zen).
3. **Tests & Packaging**:
   - Automated test suite (`tests/`) and end-to-end render verification.

---

## Prompt to Copy-Paste to Continue the Build

```markdown
You are working on the ONETAKE STUDIO codebase located in this directory.
The OneTake rendering engine is in `engine/`, the complete React frontend SPA is in `web/`, and the shared architectural specifications are in `CONTRACTS.md`.

Your objective is to implement the backend core and provider adapters so the application is 100% functional, tested, and can render real MP4 videos.

### Required Implementations:

1. **Database Layer (`server/db.js`)**:
   - Use `better-sqlite3` to create an embedded SQLite database in `data/app.db`.
   - Create idempotent tables: `users`, `sessions`, `connections`, `projects`, `compositions`, `jobs`, `media`.
   - Implement index creation and WAL mode (`pragma journal_mode = WAL`).

2. **Credential Vault (`server/vault.js`)**:
   - Implement AES-256-GCM encryption and decryption for user API keys using `process.env.VAULT_KEY` (32 bytes).
   - Store encrypted payloads as `iv:authTag:ciphertext` in hex or base64.
   - Never expose raw credentials in logs or API responses.

3. **Authentication (`server/auth.js`)**:
   - Cookie-based session authentication (`onetake_session` cookie, HttpOnly, SameSite=Lax).
   - Password hashing with `bcryptjs`.
   - Implement endpoints: `/api/auth/signup`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`.

4. **18 Provider Adapters (`server/providers/`)**:
   - Implement `server/providers/registry.js` to manage the catalog.
   - Implement adapters in `server/providers/adapters/<providerId>.js` for:
     openai, anthropic, google, groq, mistral, together, openrouter, deepseek, fireworks, cohere, perplexity, cerebras, sambanova, chutes, hyperbolic, novita, tokenrouter, opencode_zen.
   - Note known provider endpoints:
     - Chutes: `https://llm.chutes.ai/v1`
     - TokenRouter: `https://api.tokenrouter.io/v1`
     - OpenCode Zen: `https://opencode.ai/zen/v1`
   - Each adapter must export: `id`, `name`, `authConfig`, `testConnection(credentials)`, `listModels(credentials)`, `generate(credentials, model, messages, options)`.

5. **Composition Generation (`server/generation.js`)**:
   - Read instructions from `engine/SKILL.md`.
   - Format system prompt and user prompt based on user's project settings (aspect ratio, duration, resolution, style preset).
   - Validate returned HTML composition (ensuring it contains proper `gsap` / motion syntax and `<div id="canvas">`).

6. **Render Worker & Pipeline (`server/render/`)**:
   - `server/render/pipeline.js`: Spawns `python3 engine/scripts/render.py <comp_path> <output_mp4> --profile <draft|final>`.
   - Parses stdout progress (`Rendering frame X/Y`, `FFmpeg encoding...`) and updates job progress (0.0 to 1.0).
   - Handles optional audio generation via `engine/scripts/sfx_palette.py` and multiplexes background music with FFmpeg.
   - `server/render/worker.js`: In-process background queue with concurrency limit (default 1).

7. **Express Server (`server/index.js`)**:
   - Bind all API routes under `/api`.
   - Serve static assets from `web/dist` with SPA fallback.
   - Healthcheck route at `/health`.

8. **Verification**:
   - Write and run unit tests under `tests/` verifying DB operations, vault encryption/decryption, provider adapter contracts, and render worker queuing.
   - Verify local end-to-end run.
```
