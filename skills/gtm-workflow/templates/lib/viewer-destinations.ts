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
    ? safeUrl(process.env.GTM_VIEWER_DATABASE_URL, ["app.turso.tech"])
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
          label: hosted ? "Open in Turso" : "Open in Drizzle Studio",
        }
      : undefined,
  };
}
export function runsDestination() {
  if (!process.env.VERCEL) {
    // Operator confirms the inspector uses the same local store. Do not point local runs at production.
    if (process.env.GTM_VIEWER_INSPECTOR_STORE !== "local") return undefined;
    const origin = safeUrl(
      process.env.GTM_VIEWER_INSPECTOR_URL,
      undefined,
      true,
    );
    return origin
      ? {
          url: origin.href,
          label: "Open in Workflow",
        }
      : undefined;
  }
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
  const url = new URL(destination.url);
  url.pathname = process.env.VERCEL
    ? `${url.pathname.replace(/\/$/, "")}/${segment(id)}`
    : `/run/${segment(id)}`;
  return { ...destination, url: url.href };
}
