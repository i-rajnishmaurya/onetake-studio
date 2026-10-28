# ONETAKE STUDIO

An AI video creation platform: connect your preferred LLM provider (BYOK - Bring Your Own Key), describe what you want, and let the bundled OneTake engine generate and render MP4 motion videos locally on your machine.

---

## What is Inside This Package

1. **`engine/`**: The bundled OneTake rendering engine (PolyForm Noncommercial license, see `engine/LICENSE`). Includes:
   - `scripts/render.py`: Playwright + Chromium frame recording & FFmpeg rendering pipeline (Draft 1080p30 / Final 4K60).
   - `scripts/sfx_palette.py`: Procedural sound effects generator.
   - `lib/motion.js` & `lib/ui_kit.js`: Motion graphic runtime and design system.
   - `templates/comp.html`: Motion video composition HTML template.
   - `SKILL.md`: Detailed composition prompt and generation guide.

2. **`web/`**: Complete Vite + React 19 + TypeScript Single Page Application (Ideavo.ai-inspired aesthetic):
   - `src/App.tsx`: Full studio UI (Landing page, Auth, Workspace, Projects, Provider Vault, Video Render Monitor, Settings).
   - `src/index.css`: Complete styling with light/dark theme support.
   - `src/lib/api.ts`: API client with error envelopes matching backend contracts.

3. **`CONTRACTS.md`**: Complete architectural contract covering all API endpoints, database schemas, provider adapters, error responses, and the generation pipeline.

4. **`roadmap.md`**: Tracked status of completed and pending milestones.

5. **`REMAINING_TASKS_AND_PROMPT.md`**: Step-by-step instructions and the ready-to-use AI prompt to complete the backend core and 18 provider adapters.

---

## Quick Start (Once Backend is Complete)

```bash
# Install root and frontend dependencies
npm install

# Set up environment variables
cp .env.example .env

# Run development server
npm run dev
```

---

## Deploy on Render (backend + frontend, one service)

This repo is a **single Node app**: Express serves the API under `/api` and the built React SPA from `web/dist`.

### Option A — Blueprint (`render.yaml`)

1. Push this repo to GitHub/GitLab.
2. In [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint** → select the repo.
3. Render will read `render.yaml` and create:
   - One **Web Service** (Node 22)
   - A **persistent disk** mounted at `/var/data` (SQLite + rendered MP4s)
4. Set **Public URL** in the service env to your Render URL, e.g. `https://onetake-studio.onrender.com`.
5. Deploy. Health check: `GET /api/health`.

### Option B — Manual Web Service

| Setting | Value |
|--------|--------|
| Runtime | Node |
| Build Command | `npm install --no-audit --no-fund && npm run web:build` |
| Start Command | `node server/index.js` |
| Instance | Free or Starter |
| Disk | Mount `/var/data` (1 GB+) |

**Environment variables (required):**

```
NODE_ENV=production
PORT=10000
PUBLIC_URL=https://YOUR-SERVICE.onrender.com
VAULT_KEY=<openssl rand -base64 32>
SESSION_SECRET=<openssl rand -base64 32>
DATA_DIR=/var/data
RENDER_CONCURRENCY=1
```

### Option C — Docker

```bash
docker build -t onetake-studio .
docker run -p 10000:10000 \
  -e VAULT_KEY=... -e SESSION_SECRET=... -e PUBLIC_URL=http://localhost:10000 \
  -v onetake-data:/var/data \
  onetake-studio
```

### Notes for production video renders

- Full MP4 renders need **Python 3 + Playwright + FFmpeg** on the host.
- Free Render instances sleep and have limited CPU/RAM — draft 1080p30 may work; 4K final is heavy.
- For serious rendering, use a paid instance or offload the worker to a machine with GPU/CPU and mount the same disk / object storage.

### Local development

```bash
cp .env.example .env   # fill VAULT_KEY + SESSION_SECRET
npm install
npm run web:build      # optional; without it API still runs, SPA placeholder is served
npm start              # http://localhost:8787
```

API health: http://localhost:8787/api/health  
