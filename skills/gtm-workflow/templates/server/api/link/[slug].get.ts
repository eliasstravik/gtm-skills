import { defineHandler } from "nitro";
import { bearerOk, signLink } from "../../../lib/sign";

/** Where to look: a diagram link signed for 7 days, the runs page, the data page, and the deployed git commit (null locally). */
export default defineHandler((event) => {
  if (!bearerOk(event.req)) return new Response("Unauthorized", { status: 401 });
  const slug = event.context.params?.slug ?? "";
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const base = host ? `https://${host}` : "http://localhost:3939";
  // Hosted runs and data live in the Vercel and Turso dashboards; their addresses are pasted once as project variables.
  const runsUrl = host ? (process.env.GTM_RUNS_URL ?? null) : `${base}/_workflow`;
  const dataUrl = host ? (process.env.GTM_DATA_URL ?? null) : "https://local.drizzle.studio";
  return { diagramUrl: `${base}/gtm/${slug}?t=${signLink(slug)}`, runsUrl, dataUrl, commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null };
});
