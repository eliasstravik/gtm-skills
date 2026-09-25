import { defineConfig } from "nitro";
import "./lib/local-runtime";
import type {} from "workflow/nitro";
import vercelJson from "./vercel.json";
import { viewerWatch } from "./scripts/viewer-watch.mjs";
const mode = process.env.GTM_VIEWER_MODE;
const share = mode === "share";
const local = mode === "local";
export default defineConfig({
  serverDir: share ? "./share-server" : local ? "./viewer-server" : "./server",
  modules: share ? [] : local ? [viewerWatch] : ["workflow/nitro", viewerWatch],
  ...(!share && !local
    ? {
        workflow: { dirs: ["workflows", "lib"] },
        serverAssets: [
          { baseName: "workflows", dir: "./workflows", pattern: "**/*.ts" },
        ],
      }
    : {}),
  alias: share
    ? {}
    : { "#viewer-registry": "./node_modules/.gtm-viewer/registry.json" },
  ...(local
    ? {
        output: {
          dir: ".output/viewer",
          serverDir: ".output/viewer/server",
          publicDir: ".output/viewer/public",
        },
      }
    : {}),
  vercel: {
    config: { version: 3, crons: share || local ? [] : vercelJson.crons },
  },
});
