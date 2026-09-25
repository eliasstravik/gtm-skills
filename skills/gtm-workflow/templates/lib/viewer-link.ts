import { entryFor } from "./viewer-reader";
import { configuredNames } from "./connections-contract";
import { localConnectionsEnabled } from "./connections-local";
export function connectionsOrigin(req?: Request) {
  if (process.env.GTM_VIEWER_MODE === "share") return undefined;
  // Local: the viewer's own route, which finds the manager and signs the browser in at each click.
  if (localConnectionsEnabled()) return req ? new URL("/connections", req.url).href : "/connections";
  try {
    const value = process.env.GTM_CONNECTIONS_ORIGIN, url = new URL(value!);
    if (url.origin !== value || url.username || url.password) return undefined;
    if (process.env.VERCEL ? url.protocol !== "https:" : url.protocol !== "http:" || url.hostname !== "127.0.0.1") return undefined;
    return process.env.VERCEL && process.env.GTM_CONNECTIONS_ENABLED === "1" ? `${url.origin}/connections` : url.origin;
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
    keys: configuredNames(process.env),
  };
}
