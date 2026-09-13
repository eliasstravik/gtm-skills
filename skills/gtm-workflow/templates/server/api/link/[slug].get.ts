import { defineHandler } from "nitro";
import { bearerOk, signLink } from "../../../lib/sign";

/** A shareable diagram link, signed for 7 days, and the deployed git commit (null locally). */
export default defineHandler((event) => {
  if (!bearerOk(event.req)) return new Response("Unauthorized", { status: 401 });
  const slug = event.context.params?.slug ?? "";
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const base = host ? `https://${host}` : "http://localhost:3939";
  return { diagramUrl: `${base}/gtm/${slug}?t=${signLink(slug)}`, commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null };
});
