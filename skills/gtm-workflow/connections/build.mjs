import { build } from "esbuild";
import { mkdir, copyFile, access, writeFile, readFile } from "node:fs/promises";
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
// Keep the private workflow UI identical to the local manager. The share build excludes it.
try {
  await access("../templates/package.json");
  await mkdir("../templates/connections-ui", { recursive: true });
  for (const name of ["app.jsx", "transport.mjs", "style.css"]) {
    const source = await readFile(`ui/${name}`, "utf8");
    await writeFile(`../templates/connections-ui/${name}`, source.replace('"../shared/style.css"', '"../viewer/style.css"'));
  }
} catch (error) { if (error.code !== "ENOENT") throw error; }
await build({ absWorkingDir: root, entryPoints: ["shared/catalog.ts"], outfile: "dist/catalog.mjs", format: "esm", platform: "node", bundle: true });
await build({ absWorkingDir: root, entryPoints: ["ui/app.jsx"], outdir: "dist/public/assets", bundle: true, minify: true, format: "esm", platform: "browser", jsx: "automatic", loader: { ".woff2": "file" }, assetNames: "[name]-[hash]" });
await writeFile("dist/public/index.html", '<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Connections</title><link rel="stylesheet" href="/assets/app.css"><script type="module" src="/assets/app.js"></script></head><body><div id="root"></div></body></html>');
