import { defineConfig } from "nitro";
import type {} from "workflow/nitro"; // loads the `workflow` config key's types
import vercelJson from "./vercel.json";

export default defineConfig({
  serverDir: "./server",
  modules: ["workflow/nitro"],
  workflow: { dirs: ["workflows", "lib"] },
  // The diagram page reads each workflow's source text from this asset, locally and on Vercel.
  serverAssets: [{ baseName: "workflows", dir: "./workflows", pattern: "**/*.ts" }],
  // vercel.json is the only file the agent edits for schedules; this mirrors its crons into the build output as a fallback.
  vercel: { config: { version: 3, crons: vercelJson.crons } },
});
