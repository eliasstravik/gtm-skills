// gtm-lib v22
import { defineConfig } from "nitro";

export default defineConfig({
  serverDir: "./server",
  // Traced into the function's node_modules instead of inlined into the ESM bundle: the parser is
  // CommonJS and uses __filename, which throws in an ES module on Vercel.
  traceDeps: ["typescript-parser", "@resvg/resvg-js"],
  modules: ["workflow/nitro"],
  workflow: { dirs: ["workflows"] },
  serverAssets: [
    { baseName: "workflows", dir: "./workflows", pattern: "**/*.ts" },
    { baseName: "providers", dir: "./providers", pattern: "**/*.ts" },
    { baseName: "fonts", dir: "./assets/fonts", pattern: "*.ttf" },
  ],
} as any);
