// Local only: while the dev server runs, a change under workflows/ or lib/ rebuilds the viewer registry, which Nitro
// then reloads, so an open viewer shows a new, changed or removed workflow without a restart. Hosted, the registry is
// built with each deployment and a new deployment reloads open pages.
import { watch } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";

/** The folders scripts/build-viewer.mjs reads to make the registry. */
const SOURCES = ["workflows", "lib"];

export const viewerWatch = {
  name: "gtm-viewer-watch",
  setup(nitro) {
    if (!nitro.options.dev) return;
    const cwd = nitro.options.rootDir;
    let child, queued = false, timer;
    const build = () => {
      if (child) return void (queued = true);
      queued = false;
      let output = "";
      child = spawn(process.execPath, ["scripts/build-viewer.mjs"], { cwd, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
      child.stdout.on("data", (chunk) => (output += chunk));
      child.stderr.on("data", (chunk) => (output += chunk));
      child.on("close", (code) => {
        child = undefined;
        // A half-written file fails the build; the viewer keeps the last good registry until the next save.
        if (code) console.error(`[gtm] Viewer registry not rebuilt; still showing the last good one.\n${output.trim().split("\n").slice(-5).join("\n")}`);
        else console.log("[gtm] Viewer registry rebuilt");
        if (queued) build();
      });
    };
    const watchers = SOURCES.map((dir) =>
      watch(join(cwd, dir), { recursive: true }, (_event, file) => {
        if (!file || !/\.tsx?$/.test(file)) return;
        clearTimeout(timer);
        timer = setTimeout(build, 300);
      }),
    );
    nitro.hooks.hook("close", () => {
      clearTimeout(timer);
      watchers.forEach((w) => w.close());
      child?.kill();
    });
  },
};
