import React, { useEffect } from "react";
const names: Record<string, string> = { local: "Local", production: "Production" };
/** Which viewer this is: the one on this computer or the hosted one on Vercel. Owner pages only; a share link never shows it. */
export function EnvironmentBadge({ environment }: { environment?: string }) {
  useEffect(() => {
    if (environment) document.documentElement.dataset.environment = environment;
  }, [environment]);
  if (!environment) return null;
  const local = environment === "local";
  return (
    <span
      className="environment-badge"
      data-environment={local ? "local" : environment === "production" ? "production" : "preview"}
      title={local ? "The local viewer on this computer" : "Hosted on Vercel"}
    >
      {names[environment] ?? "Preview"}
    </span>
  );
}
