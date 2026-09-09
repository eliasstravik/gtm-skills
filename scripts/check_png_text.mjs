import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { renderPng } from "../skills/gtm-workflow/templates/lib/diagram-svg.ts";

const require = createRequire(new URL("../skills/gtm-workflow/templates/package.json", import.meta.url));
const { Resvg } = require("@resvg/resvg-js");
const font = readFileSync(new URL("../skills/gtm-workflow/templates/assets/fonts/Inter-Regular.ttf", import.meta.url));
const scratchFonts = () => readdirSync(tmpdir()).filter(name => name.startsWith("gtm-diagram-font-")).sort();
const before = scratchFonts();
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="80"><rect width="300" height="80" fill="white"/><text x="10" y="40" font-family="Inter" font-size="20" fill="#0f172a">Qualify leads</text></svg>';
const png = renderPng(svg, font);
assert.equal(png.readUInt32BE(16), 1400, "Native renderer must accept the render options");
const height = png.readUInt32BE(20);
const rendered = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="${height}"><image width="1400" height="${height}" href="data:image/png;base64,${png.toString("base64")}"/></svg>`).render();
const pixels = rendered.pixels;
let ink = 0;
for (let i = 0; i < pixels.length; i += 4) {
  if (pixels[i] < 60 && pixels[i + 1] < 60 && pixels[i + 2] < 60 && pixels[i + 3] === 255) ink++;
}
assert.ok(ink > 100, `PNG must contain visible text, found ${ink} dark pixels`);
assert.deepEqual(scratchFonts(), before, "Rendering must remove its temporary font file");
assert.throws(() => renderPng("not an SVG", font));
assert.deepEqual(scratchFonts(), before, "Failed rendering must also remove its temporary font file");
console.log(`PNG text verified: ${ink} dark pixels, 1400px wide; temporary font cleanup verified.`);
