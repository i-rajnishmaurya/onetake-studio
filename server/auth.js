import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { getDb, now, uuid } from "./db.js";

const SESSION_COOKIE = "onetake_session";
const SESSION_DAYS = 30;
const BCRYPT_ROUNDS = 12;

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function generateToken() {
  return crypto.randomBytes(32).toString("base64url");
}

/**
 * Create a session for a user and set the cookie on the response.
 */
export function createSession(res, userId, req) {
  const db = getDb();
  const token = generateToken();
  const tokenHash = hashToken(token);
  const id = uuid();
  const expiresAt = now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const ua = req?.headers?.["user-agent"]?.slice(0, 256) || null;
  const ip = req?.ip || req?.socket?.remoteAddress || null;

  db.prepare(
    `INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, user_agent, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, userId, tokenHash, expiresAt, now(), ua, ip);

  const isSecure = process.env.NODE_ENV === "production" || process.env.FORCE_SECURE_COOKIE === "1";
  res.setHeader(
    "Set-Cookie",
    [
      `${SESSION_COOKIE}=${token}`,
      "HttpOnly",
      "Path=/",
      "SameSite=Lax",
      `Max-Age=${SESSION_DAYS * 24 * 60 * 60}`,
      isSecure ? "Secure" : "",
    ]
      .filter(Boolean)
      .join("; ")
  );
  return { id, expiresAt };
}

export function clearSessionCookie(res) {
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`
  );
}

/**
 * Parse cookie header and return session token or null.
 */
export function parseSessionToken(req) {
  const cookie = req.headers?.cookie || "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Resolve the current user from the session cookie. Returns user row or null.
 */
export function getCurrentUser(req) {
  const token = parseSessionToken(req);
  if (!token) return null;
  const db = getDb();
  const tokenHash = hashToken(token);
  const row = db
    .prepare(
      `SELECT u.id, u.email, u.name, u.email_verified, u.created_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`
    )
    .get(tokenHash, now());
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    emailVerified: !!row.email_verified,
    createdAt: row.created_at,
  };
}

/**
 * Middleware: require authenticated user. Attaches req.user.
 */
export function requireAuth(req, res, next) {
  const user = getCurrentUser(req);
  if (!user) {
    return res.status(401).json({
      error: { code: "unauthorized", message: "Authentication required" },
    });
  }
  req.user = user;
  next();
}

/**
 * Optional auth: attaches req.user if present.
 */
export function optionalAuth(req, res, next) {
  req.user = getCurrentUser(req);
  next();
}

export async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

export function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    emailVerified: !!row.email_verified,
  };
}

export { SESSION_COOKIE };
