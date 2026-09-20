import { defineConfig } from "drizzle-kit";

// Workspace result tables (schema public). Static on purpose: db:generate needs no database, and db:studio passes the URL in.
export default defineConfig({ dialect: "postgresql", schema: "./db/tables/*.ts", schemaFilter: ["public"], out: "./drizzle", dbCredentials: { url: process.env.GTM_DRIZZLE_URL ?? "" } });
