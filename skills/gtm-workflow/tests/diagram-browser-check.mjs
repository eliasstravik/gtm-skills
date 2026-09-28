// Start GTM_VIEWER_FIXTURE_WORKSPACE=1 node tests/serve.mjs <runtime> first.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
const command = (...args) => {
  const result = spawnSync("agent-browser", ["--session", "gtm-diagram-acceptance", ...args], { encoding: "utf8", timeout: 40000 });
  if (result.status !== 0) throw Error(result.stderr || result.stdout);
  return result.stdout.trim();
};
const evaluate = code => JSON.parse(command("eval", code));
try {
  command("set", "viewport", "1280", "640");
  command("open", "http://127.0.0.1:3942/viewer?workflow=stable");
  command("wait", "--text", "Employer found?");
  command("wait", "1000");
  // The favicon is a same-origin SVG, so the page's content security policy allows it.
  assert.equal(evaluate('document.querySelector("link[rel=icon]").getAttribute("href")'), "/viewer-assets/favicon.svg");
  assert.equal(evaluate('fetch("/viewer-assets/favicon.svg").then(r => r.headers.get("content-type"))'), "image/svg+xml");
  // Production is green, local amber.
  assert.equal(evaluate('getComputedStyle(document.querySelector(".environment-badge")).color'), "rgb(16, 125, 50)");
  // The workflow description sits above the diagram.
  assert.match(evaluate('document.querySelector(".diagram-description").textContent'), /^Enrich people and their current employers/);
  // The whole diagram fits the canvas on first open, even in a short window.
  const outside = 'JSON.stringify((() => { const c = document.querySelector(".diagram-canvas").getBoundingClientRect(); return [...document.querySelectorAll(".react-flow__node")].filter(n => { const r = n.getBoundingClientRect(); return r.top < c.top || r.bottom > c.bottom || r.left < c.left || r.right > c.right; }).map(n => n.dataset.id); })())';
  assert.deepEqual(JSON.parse(evaluate(outside)), []);
  // Node details never cover View source.
  command("click", ".react-flow__node[data-id=people]");
  command("wait", ".node-details");
  const covered = 'const a = [...document.querySelectorAll(".diagram-actions a")].find(e => e.textContent.includes("View source")); const r = a.getBoundingClientRect(); document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest("a") === a';
  assert.equal(evaluate(covered), true, "View source stays clickable while node details are open");
  console.log("Diagram: favicon, green production badge, description, fit on open, and View source beside open node details passed.");
} finally { command("close"); }
