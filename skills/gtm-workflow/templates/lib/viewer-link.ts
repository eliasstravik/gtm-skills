import { entryFor, registry } from "./viewer-reader";
import { groups } from "./viewer-groups";
import { configuredNames } from "./connections-contract";
import { localKeyNames } from "./connections-local";
import { productionOrigin } from "./connections-access";
export function connectionsOrigin(req?: Request) {
  if (process.env.GTM_VIEWER_MODE === "share") return undefined;
  // Local: the Keys page on this same server. Absolute only for /api/link callers, which need a whole address; the page
  // itself gets the relative path.
  if (!process.env.VERCEL) return req ? new URL("/connections", req.url).href : "/connections";
  try {
    const origin = productionOrigin();
    if (!origin) return undefined;
    return process.env.GTM_CONNECTIONS_ENABLED === "1" ? `${origin}/connections` : origin;
  } catch { return undefined; }
}
/** Where a webhook sender posts: the public share project relays signed events to the private runtime. Null until sharing is set up. */
export function intakeUrl(slug: string) {
  try {
    const share = new URL(process.env.GTM_VIEWER_SHARE_ORIGIN!);
    if (share.protocol !== "https:" || !/^[a-z0-9][a-z0-9-]{0,99}$/.test(slug)) return null;
    return new URL(`/api/intake/${slug}`, share.origin).href;
  } catch { return null; }
}
/** Canonical private entry. Resolves only display metadata and never imports workflow code. */
export function viewerLink(req: Request, workflow?: string) {
  const entry = workflow ? entryFor(workflow) : undefined;
  const url = new URL("/viewer", req.url);
  if (entry) url.searchParams.set("workflow", entry.id);
  const view = (name: string) => {
    const result = new URL(url);
    result.searchParams.set("view", name);
    return result.href;
  };
  return {
    viewerUrl: url.href,
    connectionsUrl: connectionsOrigin(req),
    workflowId: entry?.id,
    commit:
      process.env.VERCEL_GIT_COMMIT_SHA ??
      process.env.GTM_VIEWER_COMMIT ??
      null,
    diagramUrl: view("logic"),
    runsUrl: view("runs"),
    dataUrl: view("data"),
    keys: process.env.VERCEL ? configuredNames(process.env) : localKeyNames(),
  };
}
/** A group's private pages, for the agent to answer "how is <group> doing": its workflows, Runs and Data. */
export function groupLink(req: Request, id: string) {
  const group = groups.find((g) => g.id === id);
  if (!group) return undefined;
  const page = (view?: string) => {
    const url = new URL("/viewer", req.url);
    url.searchParams.set("group", group.id);
    if (view) url.searchParams.set("view", view);
    return url.href;
  };
  return {
    groupId: group.id,
    name: group.name,
    description: group.description,
    workflows: group.workflows.flatMap((wid) => registry.filter((e) => e.id === wid).map((e) => ({ id: e.id, slug: e.slug, title: e.title }))),
    viewerUrl: page(),
    runsUrl: page("runs"),
    dataUrl: page("data"),
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GTM_VIEWER_COMMIT ?? null,
  };
}
