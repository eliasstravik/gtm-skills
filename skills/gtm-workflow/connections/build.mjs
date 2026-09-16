import { build } from "esbuild";
import { mkdir, copyFile, access, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root = dirname(fileURLToPath(import.meta.url));
process.chdir(root);
await mkdir("shared", { recursive: true });
for (const [source, target] of [["lib/connections-contract.ts", "catalog.ts"], ["viewer/style.css", "style.css"]]) {
  try { await access(`../templates/${source}`); await copyFile(`../templates/${source}`, `shared/${target}`); }
  catch { await access(`shared/${target}`); }
}
await mkdir("dist/public/assets", { recursive: true });
await build({ entryPoints: ["shared/catalog.ts"], outfile: "dist/catalog.mjs", format: "esm", platform: "node", bundle: true });
await build({ entryPoints: ["ui/app.jsx"], outdir: "dist/public/assets", bundle: true, minify: true, format: "esm", platform: "browser", jsx: "automatic", loader: { ".woff2": "file" }, assetNames: "[name]-[hash]" });
await writeFile("dist/public/index.html", '<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Connections</title><link rel="stylesheet" href="/assets/app.css"><script type="module" src="/assets/app.js"></script></head><body><div id="root"></div></body></html>');
