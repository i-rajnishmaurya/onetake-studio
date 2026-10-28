import { describe, it } from "node:test";
import assert from "node:assert/strict";

const {
  extractHtml,
  validateComposition,
  buildSystemPrompt,
  buildUserPrompt,
} = await import("../server/generation.js");

describe("generation", () => {
  it("extracts fenced html", () => {
    const text = "Here you go:\n```html\n<html><body>hi</body></html>\n```\nThanks";
    assert.equal(extractHtml(text), "<html><body>hi</body></html>");
  });

  it("extracts raw html", () => {
    const text = '<!DOCTYPE html><html><body id="x"></body></html>';
    assert.ok(extractHtml(text).startsWith("<!DOCTYPE"));
  });

  it("validates good composition", () => {
    const html = `
<!DOCTYPE html>
<html><head><style>#canvas{width:1920px;height:1080px}</style></head>
<body>
<div id="canvas"></div>
<script src="motion.js"></script>
<script>
window.__meta = { dur: 12 };
window.__seek = function(t) { /* pure */ };
</script>
</body></html>`;
    const v = validateComposition(html);
    assert.equal(v.ok, true);
    assert.equal(v.meta.dur, 12);
  });

  it("rejects missing __seek", () => {
    const html = `<div id="canvas"></div><script>window.__meta={dur:10}</script>`;
    const v = validateComposition(html);
    assert.equal(v.ok, false);
    assert.ok(v.errors.some((e) => e.includes("__seek")));
  });

  it("builds system prompt with aspect", () => {
    const p = buildSystemPrompt({ aspect: "9:16", duration: 20 });
    assert.ok(p.includes("1080"));
    assert.ok(p.includes("1920"));
    assert.ok(p.includes("__seek"));
  });

  it("builds user prompt", () => {
    const p = buildUserPrompt(
      { prompt: "Launch a note app", title: "Notes" },
      { stylePreset: "dusk", duration: 15 }
    );
    assert.ok(p.includes("note app"));
    assert.ok(p.includes("dusk"));
  });
});
