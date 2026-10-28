# Roadmap — ONETAKE STUDIO (standalone Node.js ZIP)

- [x] Re-clone OneTake engine, inspect SKILL.md / render.py / template / license
- [x] Bundle engine subset into /tmp/onetake-studio/engine (2.7MB, license intact)
- [x] Shared contracts (CONTRACTS.md)
- [ ] Provider adapters (18) — subagent A
- [ ] Backend core (db, auth, vault, routes, generation, render worker, sfx) — owner: main agent
- [ ] Frontend SPA (Ideavo-inspired, responsive, light/dark) — subagent C
- [ ] Tests (adapters, auth, ownership, generation validation, job durability)
- [ ] Real render verification (python+playwright+ffmpeg present in sandbox)
- [ ] Docs (README, SETUP, DEPLOYMENT, TROUBLESHOOTING, PROVIDERS, LIMITATIONS), .env.example
- [ ] Docker + compose
- [ ] Full build + startup check + package ZIP into /mnt/documents
