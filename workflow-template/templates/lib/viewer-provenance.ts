import registry from "#viewer-registry";
/** Display-only attributes. Workflow execution and inputs are unchanged. */
export function viewerAttributes(slug: string): Record<string, string> {
  const entry = (
    registry as { slug: string; id: string; revision: string }[]
  ).find((e) => e.slug === slug);
  return entry
    ? {
        "gtm.viewer.id": entry.id,
        "gtm.viewer.revision": entry.revision,
        "gtm.viewer.workspace":
          process.env.VERCEL_PROJECT_ID ??
          process.env.GTM_VIEWER_WORKSPACE ??
          "local",
        "gtm.viewer.environment":
          process.env.VERCEL_TARGET_ENV ?? process.env.VERCEL_ENV ?? "local",
      }
    : {};
}
