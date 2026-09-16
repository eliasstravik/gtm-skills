import { entryFor } from "./viewer-reader";
import { configuredNames } from "./connections-contract";
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
