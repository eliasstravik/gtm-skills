import { defineHandler } from "nitro";
import { bearerOk, signLink } from "../../../lib/sign";
import { workflows } from "../../../workflows";

/** The Edit Data page of a Turso database created from the Vercel marketplace, read off its address: `<db>-<org>.<region>.turso.io` with a `vercel-icfg-…` organization. Null for any other host. */
export function tursoDataUrl(databaseUrl: string | undefined): string | null {
  const host = databaseUrl?.match(/^[a-z]+:\/\/([^/?#]+)/)?.[1];
  const m = host?.match(/^(.+)-(vercel-icfg-[a-z0-9]+)\./);
  return m ? `https://app.turso.tech/${m[2]}/databases/${m[1]}/data` : null;
}

/** Where to look: a diagram link signed for 7 days, the runs page, the data page, the deployed git commit (null locally), and the names of the keys this copy has. */
export default defineHandler((event) => {
  if (!bearerOk(event.req)) return new Response("Unauthorized", { status: 401 });
  const slug = event.context.params?.slug ?? "";
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const base = host ? `https://${host}` : "http://localhost:3939";
  // Hosted runs live in the Vercel dashboard, whose address the setup script writes as GTM_RUNS_URL (doctor --fix adds it to older projects).
  const runsUrl = host ? (process.env.GTM_RUNS_URL ?? null) : `${base}/_workflow`;
  // Hosted data is the database's Edit Data page in Turso, derived from the database address; GTM_DATA_URL overrides it.
  const entry = Object.hasOwn(workflows, slug) ? workflows[slug as keyof typeof workflows] : undefined;
  const hasView = entry && "data" in entry && entry.data;
  const dataUrl = hasView
    ? `${base}/gtm/${slug}/data?t=${signLink(`data:${slug}`)}`
    : host ? (process.env.GTM_DATA_URL ?? tursoDataUrl(process.env.TURSO_DATABASE_URL)) : "https://local.drizzle.studio";
  // Names only, never values: the agent learns which gateway keys this copy has without reading the project's settings.
  const keys = Object.keys(process.env).filter((k) => k.endsWith("_API_KEY")).sort();
  return { diagramUrl: `${base}/gtm/${slug}?t=${signLink(slug)}`, runsUrl, dataUrl, commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null, keys };
});
