import { entryFor } from "./viewer-reader";
import { configuredNames } from "./connections-contract";
export function connectionsOrigin() {
  if (process.env.GTM_VIEWER_MODE === "share") return undefined;
  try {
    const value = process.env.GTM_CONNECTIONS_ORIGIN, url = new URL(value!);
    if (url.origin !== value || url.username || url.password) return undefined;
    if (process.env.VERCEL ? url.protocol !== "https:" : url.protocol !== "http:" || url.hostname !== "127.0.0.1") return undefined;
    return process.env.VERCEL && process.env.GTM_CONNECTIONS_ENABLED === "1" ? `${url.origin}/connections` : url.origin;
  } catch { return undefined; }
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
    connectionsUrl: connectionsOrigin(),
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
