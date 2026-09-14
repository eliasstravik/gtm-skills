import { existsSync, mkdirSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// Two ways to pick the database: VERCEL (hosted build, Turso), else the local file.
if (existsSync(".env")) process.loadEnvFile(".env");
const url = process.env.VERCEL ? process.env.TURSO_DATABASE_URL : "file:./data/gtm.db";
const authToken = process.env.VERCEL ? process.env.TURSO_AUTH_TOKEN : undefined;
if (!url) throw new Error("Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN on the Vercel project");
if (url.startsWith("file:")) mkdirSync("data", { recursive: true });

export default defineConfig({ dialect: "turso", schema: "./db/tables/index.ts", out: "./drizzle", dbCredentials: { url, authToken } });
