import { defineConfig } from "nitro";
import "./lib/local-runtime";
import type {} from "workflow/nitro";
import vercelJson from "./vercel.json";
import { viewerWatch } from "./scripts/viewer-watch.mjs";
const share = process.env.GTM_VIEWER_MODE === "share";
export default defineConfig({
  serverDir: share ? "./share-server" : "./server",
  modules: share ? [] : ["workflow/nitro", viewerWatch],
  ...(!share
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
  vercel: {
    config: { version: 3, crons: share ? [] : vercelJson.crons },
  },
});
