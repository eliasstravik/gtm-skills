// gtm-lib v15
import { defineConfig } from "nitro";

export default defineConfig({
  serverDir: "./server",
  modules: ["workflow/nitro"],
  workflow: { dirs: ["workflows"] },
  serverAssets: [
    { baseName: "workflows", dir: "./workflows", pattern: "**/*.ts" },
    { baseName: "fonts", dir: "./assets/fonts", pattern: "*.ttf" },
  ],
} as any);
