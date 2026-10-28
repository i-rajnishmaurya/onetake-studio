import express from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "web", "dist");

export function mountStatic(app) {
  if (fs.existsSync(DIST)) {
    app.use(express.static(DIST, { index: false, maxAge: "1h" }));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api")) return next();
      const index = path.join(DIST, "index.html");
      if (fs.existsSync(index)) {
        res.sendFile(index);
      } else {
        next();
      }
    });
  } else {
    app.get("/", (_req, res) => {
      res.type("html").send(`
        <!doctype html>
        <html><head><title>OneTake Studio</title></head>
        <body style="font-family:system-ui;background:#0a0a0a;color:#eee;padding:2rem">
          <h1>OneTake Studio</h1>
          <p>API is running. Build the frontend with <code>npm run web:build</code> to serve the SPA.</p>
          <p><a href="/api/health" style="color:#7dd3fc">/api/health</a></p>
        </body></html>
      `);
    });
  }
}
