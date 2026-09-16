import { build } from "esbuild";
import { mkdir, rm } from "node:fs/promises";
export async function bundleViewer({ share = false } = {}) {
  await rm("public/connections-assets", { recursive: true, force: true });
  if (!share) await build({ entryPoints: ["connections-ui/app.jsx"], outdir: "public/connections-assets", bundle: true, minify: true,
    format: "esm", platform: "browser", jsx: "automatic", loader: { ".woff2": "file" }, assetNames: "[name]-[hash]",
    define: { "process.env.NODE_ENV": '"production"' } });
  await rm("public/viewer-assets", { recursive: true, force: true });
  await mkdir("public/viewer-assets", { recursive: true });
  return build({
    entryPoints: ["viewer/app.tsx"],
    outdir: "public/viewer-assets",
    bundle: true,
    splitting: true,
    minify: true,
    format: "esm",
    platform: "browser",
    jsx: "automatic",
    loader: { ".woff2": "file" },
    assetNames: "[name]-[hash]",
    chunkNames: "[name]-[hash]",
    define: { "process.env.NODE_ENV": '"production"' },
  });
}
