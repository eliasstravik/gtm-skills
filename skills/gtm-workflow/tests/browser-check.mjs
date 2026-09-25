// Start serve.mjs first. All identities and share tokens belong to its disposable fixture.
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import assert from "node:assert/strict";
const directory = resolve(process.argv[2]);
mkdirSync(directory, { recursive: true });
const command = (...args) => {
  console.log(`Browser: ${args[0]}`);
  const r = spawnSync(
    "agent-browser",
    ["--session", "gtm-viewer-acceptance", ...args],
    { encoding: "utf8", timeout: 40000, maxBuffer: 4e6 },
  );
  if (r.status !== 0) throw Error(`${args[0]} failed: ${r.stderr || r.stdout}`);
  return r.stdout.trim();
};
const evaluate = (code) => JSON.parse(command("eval", code));
const clickText = (selector, text) =>
  evaluate(
    `[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.textContent.trim()===${JSON.stringify(text)}).click()`,
  );
const wait = (text) => command("wait", "--text", text);
let recording = !process.argv.includes("--no-record");
// CDP screenshots and screencasts can contend. Capture stills after the recording ends.
const shot = (name) => {
  if (!recording) {
    command("wait", "500");
    command("screenshot", join(directory, `${name}.png`));
  }
};
command("set", "viewport", "1440", "1000");
if (recording)
  command(
    "record",
    "start",
    join(directory, "workflow-journey.webm"),
    "http://127.0.0.1:3942/viewer",
  );
else command("open", "http://127.0.0.1:3942/viewer");
try {
  command("set", "media", "light");
  wait("Research market 49");
  assert.equal(
    evaluate('document.querySelectorAll(".workflow-row").length'),
    50,
  );
  shot("workflows");
  command("fill", "input[type=search]", "Enrich network");
  command("wait", "500");
  assert.equal(
    evaluate('document.querySelectorAll(".workflow-row").length'),
    1,
  );
  command("click", ".workflow-row");
  wait("Employer found?");
  shot("diagram");
  command("click", ".react-flow__node[data-id=people]");
  wait("Person enrichment");
  shot("node-details");
  command("press", "Escape");
  command("wait", "--fn", "document.activeElement.dataset.id === 'people'");
  assert.equal(evaluate("document.activeElement.dataset.id"), "people");
  clickText('nav[aria-label="Workflow views"] a', "Runs");
  wait("Completed");
  assert.equal(
    evaluate('document.querySelectorAll(".step-list, .stage-nav").length'),
    0,
  );
  shot("runs");
  clickText('nav[aria-label="Workflow views"] a', "Data");
  wait("10,000 matching records");
  command("click", '[data-row="0"][data-column="0"]');
  command("press", "ArrowRight");
  command("wait", "--fn", "document.activeElement.dataset.column === '1'");
  assert.equal(evaluate("document.activeElement.dataset.column"), "1");
  clickText("button", "View value");
  wait("Cell value");
  command("click", 'button[aria-label="Close value"]');
  command("click", ".resize-handle");
  command("press", "ArrowRight");
  assert.equal(
    evaluate(
      'document.querySelector(".resize-handle").getAttribute("aria-valuenow")',
    ),
    "240",
  );
  command("fill", 'input[aria-label="Search data"]', "Ada Example");
  wait("1 matching record");
  shot("data");
  clickText("a", "View 2");
  wait("Connected to Ada Example");
  shot("related-data");
  command("back");
  wait("1 matching record");
  clickText("button", "Share");
  wait("Sharing is off");
  command("click", 'button[role="switch"]');
  wait("Sharing is on");
  // Capture the clipboard handoff without reading the operating system clipboard.
  evaluate(
    'window.copied=""; navigator.clipboard.writeText=async text=>{window.copied=text}',
  );
  clickText("button", "Copy");
  wait("Link copied.");
  const first = evaluate("window.copied");
  assert.ok(first.includes("#"));
  shot("sharing");
  command("check", "dialog label:nth-of-type(2) input");
  command("check", "dialog label:nth-of-type(3) input");
  clickText("button", "Save changes");
  wait("Changes saved.");
  assert.equal(
    evaluate('document.querySelector("input[name=share-link]").value'),
    first,
  );
  clickText("button", "Copy");
  wait("Link copied.");
  assert.equal(evaluate("window.copied"), first);
  command("click", 'button[aria-label="Close sharing"]');
  command("open", first);
  wait("Employer found?");
  assert.equal(evaluate('document.querySelectorAll("nav.tabs a").length'), 3);
  assert.equal(
    evaluate(
      'document.querySelectorAll(".workflow-header button, .diagram-actions a").length',
    ),
    0,
  );
  command("click", ".react-flow__node[data-id=people]");
  assert.equal(
    evaluate(
      'document.querySelector(".node-details").textContent.includes("Person enrichment")',
    ),
    false,
  );
  command("press", "Escape");
  shot("shared-diagram");
  clickText('nav[aria-label="Workflow views"] a', "Runs");
  wait("Completed");
  assert.equal(evaluate('document.querySelectorAll("tbody a").length'), 0);
  clickText('nav[aria-label="Workflow views"] a', "Data");
  wait("10,000 matching records");
  assert.equal(
    evaluate('document.querySelector("main").textContent.includes("PRIVATE")'),
    false,
  );
  shot("shared-data");
  command("open", "http://127.0.0.1:3942/viewer?workflow=stable");
  wait("Employer found?");
  clickText("button", "Share");
  wait("Sharing is on");
  assert.equal(
    evaluate('document.querySelector("input[name=share-link]").value'),
    first,
  );
  command("click", 'button[role="switch"]');
  wait("Sharing turned off.");
  command("open", first);
  wait("This link was revoked.");
} finally {
  if (recording) command("record", "stop");
  recording = false;
}
command("open", "http://127.0.0.1:3942/viewer");
wait("Research market 49");
shot("workflows");
for (const theme of ["light", "dark"]) {
  command("set", "media", theme, "reduced-motion");
  for (const width of [1440, 768, 390]) {
    command("set", "viewport", String(width), "1000");
    for (const view of ["logic", "runs", "data"]) {
      command(
        "open",
        `http://127.0.0.1:3942/viewer?workflow=stable&view=${view}`,
      );
      wait(
        view === "logic"
          ? "Employer found?"
          : view === "runs"
            ? "Completed"
            : "10,000 matching records",
      );
      assert.equal(
        evaluate("document.documentElement.scrollWidth > innerWidth"),
        false,
        `${theme} ${width} ${view} overflow`,
      );
      const audit = JSON.parse(command("a11y", "--json"));
      assert.equal(
        audit.data.counts.violations,
        0,
        JSON.stringify(audit.data.violations),
      );
      if (width === 390 || (theme === "dark" && width === 1440))
        shot(`${view}-${width}-${theme}`);
    }
  }
}
console.log(
  "Passed: list search, business diagram and details, metadata runs, grid keyboard/resize/value/relationships, stable share scope update, public projection and revocation, 18 responsive accessibility checks.",
);
