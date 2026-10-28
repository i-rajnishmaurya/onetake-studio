import { describe, it } from "node:test";
import assert from "node:assert/strict";

const { listProviders, getAdapter } = await import("../server/providers/registry.js");

describe("providers registry", () => {
  it("lists 18 providers", () => {
    const list = listProviders();
    assert.equal(list.length, 18);
    const ids = list.map((p) => p.id).sort();
    assert.ok(ids.includes("openai"));
    assert.ok(ids.includes("anthropic"));
    assert.ok(ids.includes("chutes"));
    assert.ok(ids.includes("tokenrouter"));
    assert.ok(ids.includes("opencode_zen"));
  });

  it("each adapter has required surface", () => {
    for (const meta of listProviders()) {
      const a = getAdapter(meta.id);
      assert.ok(a, meta.id);
      assert.equal(a.id, meta.id);
      assert.ok(a.name);
      assert.ok(a.auth);
      assert.equal(typeof a.validate, "function");
      assert.equal(typeof a.listModels, "function");
      assert.equal(typeof a.chat, "function");
    }
  });

  it("openai validate rejects empty key", async () => {
    const a = getAdapter("openai");
    const v = await a.validate({});
    assert.equal(v.ok, false);
  });

  it("openai validate accepts key", async () => {
    const a = getAdapter("openai");
    const v = await a.validate({ apiKey: "sk-test" });
    assert.equal(v.ok, true);
  });
});
