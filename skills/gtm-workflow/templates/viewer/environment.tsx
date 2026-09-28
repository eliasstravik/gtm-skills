import React, { useEffect } from "react";
import { useRelease } from "./release";
const names: Record<string, string> = { local: "Local", production: "Production" };
/**
 * Which viewer this is: the one on this computer or the hosted one on Vercel. Owner pages only; a share link never
 * shows it. On production the same badge says whether the latest change is live: amber while it builds, red if it failed.
 */
export function EnvironmentBadge({ environment }: { environment?: string }) {
  const release = useRelease(environment);
  useEffect(() => {
    if (environment) document.documentElement.dataset.environment = environment;
  }, [environment]);
  if (!environment) return null;
  const local = environment === "local";
  const kind = local ? "local" : environment === "production" ? "production" : "preview";
  const name = names[environment] ?? "Preview";
  const common = { className: "environment-badge", "data-environment": kind };
  if (release?.state === "updating")
    return (
      <span {...common} data-state="updating" role="status" title="Production: your change goes live in about a minute">
        <span><span className="badge-name">{name} · </span>Updating…</span><span className="badge-more">live in about a minute</span>
      </span>
    );
  if (release?.state === "failed")
    return (
      <span {...common} data-state="failed" role="alert" title="Production: your last change isn't live">
        <span><span className="badge-name">{name} · </span>Update failed</span>
        {release.details && (
          <a href={release.details} target="_blank" rel="noreferrer">
            Details
          </a>
        )}
      </span>
    );
  if (release?.justLive)
    return (
      <span {...common} data-state="live" role="status" title="Production: your latest change is live">
        <span><span className="badge-name">{name} · </span>Your change is live</span>
      </span>
    );
  return (
    <span {...common} title={local ? "The local viewer on this computer" : release ? "Hosted on Vercel, running your latest change" : "Hosted on Vercel"}>
      {name}
    </span>
  );
}
