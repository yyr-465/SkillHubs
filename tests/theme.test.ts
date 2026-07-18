import assert from "node:assert/strict";
import { contrastRatio, hasReadableContrast, normalizeHex, parseColor } from "../src/lib/theme.ts";

assert.equal(parseColor("#fff"), "#ffffff");
assert.equal(parseColor("#ffffff"), "#ffffff");
assert.equal(parseColor("rgb(255,255,255)"), "#ffffff");
assert.equal(parseColor("rgb(100%,0%,0%)"), "#ff0000");
assert.equal(parseColor("hsl(0,100%,50%)"), "#ff0000");
assert.equal(normalizeHex("var(--skill-bg)"), null);
assert.equal(parseColor("url(javascript:alert(1))"), null);
assert.equal(parseColor("background:red"), null);
assert.ok(contrastRatio("#000000", "#ffffff") > 20);
assert.ok(hasReadableContrast("#000000", "#ffffff"));
assert.equal(hasReadableContrast("#777777", "#ffffff"), false);
console.log("Theme parser and contrast tests passed.");
