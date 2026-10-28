import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getKey() {
  const raw = process.env.VAULT_KEY;
  if (!raw || !raw.trim()) {
    throw new Error("VAULT_KEY environment variable is required (32-byte key, base64 or hex)");
  }
  let key;
  // Support base64 or hex
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, "hex");
  } else {
    key = Buffer.from(raw, "base64");
  }
  if (key.length !== 32) {
    // Try utf8 if length is wrong
    key = Buffer.from(raw, "utf8");
    if (key.length < 32) {
      key = Buffer.concat([key, Buffer.alloc(32 - key.length)]);
    } else if (key.length > 32) {
      key = key.subarray(0, 32);
    }
  }
  return key;
}

/**
 * Encrypt a plaintext string. Returns `iv:authTag:ciphertext` (all hex).
 * @param {string} plaintext
 * @returns {string}
 */
export function encrypt(plaintext) {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    iv.toString("hex"),
    authTag.toString("hex"),
    encrypted.toString("hex"),
  ].join(":");
}

/**
 * Decrypt a vault string of the form `iv:authTag:ciphertext`.
 * @param {string} payload
 * @returns {string}
 */
export function decrypt(payload) {
  if (!payload || typeof payload !== "string") {
    throw new Error("Invalid vault payload");
  }
  const parts = payload.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid vault payload format");
  }
  const [ivHex, authTagHex, ciphertextHex] = parts;
  const key = getKey();
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const ciphertext = Buffer.from(ciphertextHex, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

/**
 * Encrypt credentials object (JSON).
 * @param {Record<string, unknown>} credentials
 * @returns {string}
 */
export function encryptCredentials(credentials) {
  return encrypt(JSON.stringify(credentials));
}

/**
 * Decrypt credentials to object.
 * @param {string} payload
 * @returns {Record<string, unknown>}
 */
export function decryptCredentials(payload) {
  const text = decrypt(payload);
  return JSON.parse(text);
}

/**
 * Mask a secret for display, e.g. sk-…3f9a
 * @param {string} value
 * @param {number} keep
 * @returns {string}
 */
export function maskSecret(value, keep = 4) {
  if (!value || typeof value !== "string") return "••••";
  if (value.length <= keep * 2) return "•".repeat(Math.min(8, value.length));
  return value.slice(0, Math.min(3, value.length)) + "…" + value.slice(-keep);
}
