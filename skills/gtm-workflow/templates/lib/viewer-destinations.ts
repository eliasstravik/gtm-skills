import type { Display } from "./viewer-contract";

const segment = (value: string) => encodeURIComponent(value);
function safeUrl(value: string | undefined, hosts?: string[], local = false) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.username || url.password || url.hash) return undefined;
    if (
      local
        ? !["http:", "https:"].includes(url.protocol)
        : url.protocol !== "https:"
    )
      return undefined;
    if (hosts && !hosts.includes(url.hostname)) return undefined;
    return url;
  } catch {
    return undefined;
  }
}
/** Only explicit operator destinations and platform-provided revision metadata. Never fetch URLs. */
export function destinations(entry?: Display) {
  const hosted = Boolean(process.env.VERCEL);
  const repository = process.env.GTM_VIEWER_REPOSITORY;
  const commit =
    process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GTM_VIEWER_COMMIT;
  const root = process.env.GTM_VIEWER_REPOSITORY_ROOT ?? "workflows";
  const source = entry?.source && `workflows/${entry.source}.ts`;
  let sourceUrl: string | undefined;
  if (
    hosted &&
    repository &&
    /^[\w.-]+\/[\w.-]+$/.test(repository) &&
    commit &&
    /^[a-f0-9]{40}$/.test(commit) &&
    source &&
    ![root, source].some((p) => p.split("/").includes(".."))
  )
    sourceUrl = `https://github.com/${repository}/blob/${commit}/${[root, source].filter(Boolean).join("/").split("/").map(segment).join("/")}`;
  const database = hosted
    ? safeUrl(process.env.GTM_VIEWER_DATABASE_URL, ["console.neon.tech", "vercel.com"])
    : safeUrl(process.env.GTM_VIEWER_DRIZZLE_URL, undefined, true);
  return {
    runs: runsDestination(),
    source: sourceUrl
      ? { url: sourceUrl, label: "View source" }
      : !hosted && source
        ? { path: source, label: "Copy file path" }
        : undefined,
    database: database
      ? {
          url: database.href,
          label: hosted ? "Open database" : "Open in Drizzle Studio",
        }
      : undefined,
  };
}
// `npm run dev` serves the Workflow SDK's own run inspector at this path, reading the same local store.
const LOCAL_INSPECTOR = "/_workflow";
export function runsDestination() {
  if (!process.env.VERCEL)
    return { url: LOCAL_INSPECTOR, label: "Open in Workflow" };
  // An operator supplies the verified Vercel runs page including its environment selector.
  const base = safeUrl(process.env.GTM_VIEWER_VERCEL_RUNS_URL, ["vercel.com"]);
  if (!base || !/^\/[^/]+\/[^/]+\/workflows\/runs\/?$/.test(base.pathname))
    return undefined;
  return { url: base.href, label: "Open in Vercel" };
}
export function runDestination(id: string) {
  if (!/^wrun_[A-Za-z0-9]{26}$/.test(id)) return undefined;
  const destination = runsDestination();
  if (!destination) return undefined;
  if (!process.env.VERCEL)
    return { ...destination, url: `${LOCAL_INSPECTOR}/run/${segment(id)}` };
  const url = new URL(destination.url);
  url.pathname = `${url.pathname.replace(/\/$/, "")}/${segment(id)}`;
  return { ...destination, url: url.href };
}
