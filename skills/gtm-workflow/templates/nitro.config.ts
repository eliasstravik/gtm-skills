// gtm-lib v10
import { defineConfig } from "nitro";

export default defineConfig({
  serverDir: "./server",
  modules: ["workflow/nitro"],
  workflow: { dirs: ["workflows"] },
} as any);
