import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
await mkdir("public/viewer-assets", { recursive: true });
await build({
  entryPoints: ["viewer/app.tsx"],
  outfile: "public/viewer-assets/app.js",
  bundle: true,
  minify: true,
  format: "esm",
  platform: "browser",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
});
