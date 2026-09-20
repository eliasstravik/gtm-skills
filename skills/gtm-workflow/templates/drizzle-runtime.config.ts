import { defineConfig } from "drizzle-kit";

// Runtime tables (schema gtm), owned by the template. Template authors run db:generate:runtime; workspaces never do.
export default defineConfig({ dialect: "postgresql", schema: "./lib/schema/*.ts", schemaFilter: ["gtm"], out: "./drizzle-runtime", dbCredentials: { url: process.env.GTM_DRIZZLE_URL ?? "" } });
