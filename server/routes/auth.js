import { Router } from "express";
import {
  createSession,
  clearSessionCookie,
  getCurrentUser,
  hashPassword,
  verifyPassword,
  publicUser,
  requireAuth,
} from "../auth.js";
import { getDb, now, uuid } from "../db.js";
import crypto from "node:crypto";

const router = Router();

function validateEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

router.post("/signup", async (req, res) => {
  try {
    const { email, password, name } = req.body || {};
    if (!validateEmail(email)) {
      return res.status(400).json({
        error: { code: "validation", message: "Valid email required" },
      });
    }
    if (!password || String(password).length < 8) {
      return res.status(400).json({
        error: { code: "validation", message: "Password must be at least 8 characters" },
      });
    }
    const displayName = (name || email.split("@")[0] || "User").slice(0, 80);
    const db = getDb();
    const existing = db
      .prepare(`SELECT id FROM users WHERE email = ? COLLATE NOCASE`)
      .get(email.trim());
    if (existing) {
      return res.status(409).json({
        error: { code: "validation", message: "Email already registered" },
      });
    }
    const id = uuid();
    const passwordHash = await hashPassword(String(password));
    const verifyToken = crypto.randomBytes(24).toString("base64url");
    const t = now();
    db.prepare(
      `INSERT INTO users (id, email, name, password_hash, email_verified, verify_token, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, ?, ?)`
    ).run(id, email.trim().toLowerCase(), displayName, passwordHash, verifyToken, t, t);

    console.log(
      `[auth] Email verification link: ${process.env.PUBLIC_URL || "http://localhost:8787"}/api/auth/verify-email?token=${verifyToken}`
    );

    createSession(res, id, req);
    const user = publicUser({
      id,
      email: email.trim().toLowerCase(),
      name: displayName,
      email_verified: 0,
    });
    res.status(201).json({ user });
  } catch (e) {
    console.error("signup", e);
    res.status(500).json({ error: { code: "server", message: "Signup failed" } });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({
        error: { code: "validation", message: "Email and password required" },
      });
    }
    const db = getDb();
    const row = db
      .prepare(`SELECT * FROM users WHERE email = ? COLLATE NOCASE`)
      .get(String(email).trim());
    if (!row || !(await verifyPassword(String(password), row.password_hash))) {
      return res.status(401).json({
        error: { code: "unauthorized", message: "Invalid email or password" },
      });
    }
    createSession(res, row.id, req);
    res.json({ user: publicUser(row) });
  } catch (e) {
    console.error("login", e);
    res.status(500).json({ error: { code: "server", message: "Login failed" } });
  }
});

router.post("/logout", (req, res) => {
  const token = req.headers.cookie?.match(/onetake_session=([^;]+)/)?.[1];
  if (token) {
    const db = getDb();
    const hash = crypto.createHash("sha256").update(decodeURIComponent(token)).digest("hex");
    db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(hash);
  }
  clearSessionCookie(res);
  res.status(204).end();
});

router.get("/me", (req, res) => {
  const user = getCurrentUser(req);
  res.json({ user: user ? publicUser(user) : null });
});

router.post("/verify-email", (req, res) => {
  const token = req.body?.token || req.query?.token;
  if (!token) {
    return res.status(400).json({ error: { code: "validation", message: "token required" } });
  }
  const db = getDb();
  const row = db.prepare(`SELECT id FROM users WHERE verify_token = ?`).get(token);
  if (!row) {
    return res.status(400).json({ error: { code: "validation", message: "Invalid token" } });
  }
  db.prepare(
    `UPDATE users SET email_verified = 1, verify_token = NULL, updated_at = ? WHERE id = ?`
  ).run(now(), row.id);
  res.json({ ok: true });
});

router.post("/request-reset", (req, res) => {
  const email = req.body?.email;
  const db = getDb();
  const row = email
    ? db.prepare(`SELECT id FROM users WHERE email = ? COLLATE NOCASE`).get(String(email).trim())
    : null;
  if (row) {
    const token = crypto.randomBytes(24).toString("base64url");
    const expires = now() + 3600_000;
    db.prepare(
      `UPDATE users SET reset_token = ?, reset_expires = ?, updated_at = ? WHERE id = ?`
    ).run(token, expires, now(), row.id);
    console.log(
      `[auth] Password reset link: ${process.env.PUBLIC_URL || "http://localhost:8787"}/reset?token=${token}`
    );
  }
  res.json({ ok: true });
});

router.post("/reset-password", async (req, res) => {
  const { token, password } = req.body || {};
  if (!token || !password || String(password).length < 8) {
    return res.status(400).json({
      error: { code: "validation", message: "token and password (8+) required" },
    });
  }
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id FROM users WHERE reset_token = ? AND reset_expires > ?`
    )
    .get(token, now());
  if (!row) {
    return res.status(400).json({ error: { code: "validation", message: "Invalid or expired token" } });
  }
  const hash = await hashPassword(String(password));
  db.prepare(
    `UPDATE users SET password_hash = ?, reset_token = NULL, reset_expires = NULL, updated_at = ? WHERE id = ?`
  ).run(hash, now(), row.id);
  res.json({ ok: true });
});

router.patch("/me", requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const { name, password } = req.body || {};
    if (name && typeof name === "string") {
      db.prepare(`UPDATE users SET name = ?, updated_at = ? WHERE id = ?`).run(
        name.slice(0, 80),
        now(),
        req.user.id
      );
    }
    if (password?.current && password?.next) {
      const row = db.prepare(`SELECT password_hash FROM users WHERE id = ?`).get(req.user.id);
      if (!(await verifyPassword(password.current, row.password_hash))) {
        return res.status(400).json({
          error: { code: "validation", message: "Current password incorrect" },
        });
      }
      if (String(password.next).length < 8) {
        return res.status(400).json({
          error: { code: "validation", message: "New password must be 8+ characters" },
        });
      }
      const hash = await hashPassword(password.next);
      db.prepare(`UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`).run(
        hash,
        now(),
        req.user.id
      );
    }
    const updated = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id);
    res.json({ user: publicUser(updated) });
  } catch (e) {
    res.status(500).json({ error: { code: "server", message: "Update failed" } });
  }
});

export default router;
