import { describe, it } from "node:test";
import assert from "node:assert/strict";

process.env.VAULT_KEY = Buffer.from("test-vault-key-32-bytes-long!!!!").toString("base64");

const { encrypt, decrypt, encryptCredentials, decryptCredentials, maskSecret } =
  await import("../server/vault.js");

describe("vault", () => {
  it("round-trips a string", () => {
    const plain = "sk-secret-api-key-value-12345";
    const enc = encrypt(plain);
    assert.ok(enc.includes(":"));
    const parts = enc.split(":");
    assert.equal(parts.length, 3);
    assert.equal(decrypt(enc), plain);
  });

  it("round-trips credentials object", () => {
    const creds = { apiKey: "sk-abc123xyz", region: "us-east-1" };
    const enc = encryptCredentials(creds);
    const out = decryptCredentials(enc);
    assert.deepEqual(out, creds);
  });

  it("produces different ciphertext each time", () => {
    const a = encrypt("same");
    const b = encrypt("same");
    assert.notEqual(a, b);
  });

  it("masks secrets", () => {
    assert.ok(maskSecret("sk-1234567890abcdef").includes("…"));
    assert.equal(maskSecret(""), "••••");
  });

  it("rejects bad payload", () => {
    assert.throws(() => decrypt("not-valid"));
  });
});
