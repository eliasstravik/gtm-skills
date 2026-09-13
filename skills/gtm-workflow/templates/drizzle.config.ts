import { existsSync, mkdirSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// Three ways to pick the database: GTM_STUDIO=turso (read-only Studio), VERCEL (hosted build), else the local file.
if (existsSync(".env")) process.loadEnvFile(".env");
const studio = process.env.GTM_STUDIO === "turso";
const url = studio ? process.env.TURSO_STUDIO_URL : process.env.VERCEL ? process.env.TURSO_DATABASE_URL : "file:./data/gtm.db";
const authToken = studio ? process.env.TURSO_STUDIO_TOKEN : process.env.VERCEL ? process.env.TURSO_AUTH_TOKEN : undefined;
if (!url) throw new Error(studio ? "Set TURSO_STUDIO_URL and TURSO_STUDIO_TOKEN in .env" : "Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN on the Vercel project");
if (url.startsWith("file:")) mkdirSync("data", { recursive: true });

export default defineConfig({ dialect: "turso", schema: "./db/tables/index.ts", out: "./drizzle", dbCredentials: { url, authToken } });
