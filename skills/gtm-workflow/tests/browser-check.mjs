// Start serve.mjs first. Requires agent-browser; saves synthetic evidence outside the checkout.
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import assert from "node:assert/strict";
const directory = resolve(process.argv[2]);
mkdirSync(directory, { recursive: true });
const command = (...args) => {
  const result = spawnSync(
    "agent-browser",
    ["--session", "gtm-viewer-acceptance", ...args],
    { encoding: "utf8", timeout: 40000, maxBuffer: 4e6 },
  );
  if (result.status !== 0)
    throw Error(`${args[0]} failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
};
const evaluate = (code) => JSON.parse(command("eval", code));
const clickText = (selector, text) =>
  evaluate(
    `[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.textContent===${JSON.stringify(text)}).click()`,
  );
const wait = (text) => command("wait", "--text", text);
const shot = (name) => {
  command("wait", "1800");
  command("screenshot", join(directory, `${name}.png`));
};
command("set", "viewport", "1440", "1000");
command(
  "record",
  "start",
  join(directory, "inspection-journey.webm"),
  "http://127.0.0.1:3942/viewer",
);
try {
  command("set", "media", "light");
  wait("10,000 people");
  shot("workflows-desktop-light");
  clickText("a", "Enrich network");
  wait("Enrich companies");
  const viewport = evaluate(
    'document.querySelector(".react-flow__viewport").style.transform',
  );
  for (let i = 1; i <= 5; i++) {
    evaluate(`document.querySelector(".stage-nav a:nth-child(${i})").click()`);
    command("wait", "250");
    assert.equal(
      evaluate(
        'document.querySelector(".react-flow__viewport").style.transform',
      ),
      viewport,
    );
  }
  command("back");
  command("forward");
  assert.equal(
    evaluate('document.querySelector(".react-flow__viewport").style.transform'),
    viewport,
  );
  clickText("button", "Expand exact steps");
  wait("Collapse exact steps");
  shot("diagram-expanded-desktop-light");
  clickText('nav[aria-label="Workflow views"] a', "Runs");
  wait("wrun_");
  evaluate('document.querySelector("tbody a").click()');
  wait("40 invocations");
  evaluate('document.querySelector(".step-list a").click()');
  wait("Completed after retry.");
  shot("run-desktop-light");
  clickText('nav[aria-label="Workflow views"] a', "Data");
  wait("10,000 matching records");
  command("fill", 'input[type="search"]', "Ada Example");
  wait("1 matching records");
  clickText("a", "View 2");
  wait("Connected to Ada Example");
  shot("related-records-desktop-light");
  command("back");
  wait("1 matching records");
  assert.equal(
    evaluate('document.querySelector("input[type=search]").value'),
    "Ada Example",
  );
  clickText("a", "Ada Example");
  wait("Record details");
  command("click", 'button[aria-label="Copy name"]');
  wait("Copied value.");
  clickText("button", "Share");
  wait("Allowed views");
  shot("sharing-desktop-light");
  command("click", 'button[aria-label="Close sharing"]');
} finally {
  command("record", "stop");
}
if (process.argv.includes("--journey-only")) process.exit(0);
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
          ? "Enrich companies"
          : view === "runs"
            ? "wrun_"
            : "10,000 matching records",
      );
      assert.equal(
        evaluate("document.documentElement.scrollWidth > innerWidth"),
        false,
        `${theme} ${width} ${view}: horizontal overflow`,
      );
      if (view === "logic" && width < 800) {
        evaluate('document.querySelector(".stage-nav a:nth-child(5)").click()');
        command("press", "Escape");
        assert.equal(
          evaluate("document.activeElement.textContent"),
          "Enrich companies",
        );
      }
      const audit = JSON.parse(command("a11y", "--json"));
      assert.equal(
        audit.data.counts.violations,
        0,
        JSON.stringify(audit.data.violations),
      );
      shot(`${view}-${width}-${theme}`);
    }
  }
}
console.log(
  "Passed: five stage selections, back/forward, run transition/retry, record relationship/back/copy, sharing dialog, 18 theme/viewport/view accessibility checks.",
);
