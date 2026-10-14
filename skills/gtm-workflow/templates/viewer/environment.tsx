import React, { useEffect } from "react";
import { useRelease } from "./release";
const names: Record<string, string> = { local: "Local", production: "Production" };
/**
 * Which viewer this is: the one on this computer or the hosted one on Vercel. Owner pages and the Keys page only; a
 * share link never shows it. The same badge says whether the latest change is in use: amber while production builds
 * or the local server reloads with a saved key, red if that failed. `override` is the Keys page's own word on the
 * update a save started: building, or could not begin.
 */
export function EnvironmentBadge({ environment, override }: { environment?: string; override?: "updating" | "failed" }) {
  const watched = useRelease(environment);
  // A failed build's own answer keeps its Details link, and a build still going live is not failed yet.
  const release = override && watched?.state !== "failed" && !(override === "failed" && watched?.state === "updating")
    ? { state: override, justLive: false, details: undefined }
    : watched;
  useEffect(() => {
    if (environment) document.documentElement.dataset.environment = environment;
  }, [environment]);
  if (!environment) return null;
  const local = environment === "local";
  const kind = local ? "local" : environment === "production" ? "production" : "preview";
  const name = names[environment] ?? "Preview";
  const common = { className: "environment-badge", "data-environment": kind };
  if (release?.state === "updating") {
    const soon = local ? "ready in a few seconds" : "live in about a minute";
    return (
      <span {...common} data-state="updating" role="status" title={local ? "Local: loading your change, ready in a few seconds" : "Production: your change goes live in about a minute"}>
        <span><span className="badge-name">{name} · </span>Updating…</span><span className="badge-more">{soon}</span>
      </span>
    );
  }
  if (release?.state === "failed")
    return (
      <span {...common} data-state="failed" role="alert" title={local ? "Local: your change isn't in use. Ask your agent to restart the workflows app." : "Production: your last change isn't live"}>
        <span><span className="badge-name">{name} · </span>Update failed</span>
        {local && <span className="badge-more">ask your agent to restart the workflows app</span>}
        {release.details && (
          <a href={release.details} target="_blank" rel="noreferrer">
            Details
          </a>
        )}
      </span>
    );
  if (release?.justLive)
    return (
      <span {...common} data-state="live" role="status" title={local ? "Local: your change is in use" : "Production: your latest change is live"}>
        <span><span className="badge-name">{name} · </span>{local ? "Your change is ready" : "Your change is live"}</span>
      </span>
    );
  return (
    <span {...common} title={local ? "The local viewer on this computer" : release ? "Hosted on Vercel, running your latest change" : "Hosted on Vercel"}>
      {name}
    </span>
  );
}
