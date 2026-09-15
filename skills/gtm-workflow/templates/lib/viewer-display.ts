import type { Display } from "./viewer-contract";

/** Explicit recipient projection. Never copy arbitrary metadata from authored code. */
export function publicDisplay(entry: Display, diagram: boolean, owner = false) {
  return {
    id: entry.id,
    slug: entry.slug,
    title: entry.title,
    description: entry.description,
    ...(diagram && entry.businessGraph
      ? {
          businessGraph: {
            nodes: entry.businessGraph.nodes.map((n) => ({
              id: n.id,
              label: n.label,
              kind: n.kind,
              explanation: n.explanation,
              ...(owner && n.details
                ? {
                    details: {
                      provider: n.details.provider,
                      caching: n.details.caching,
                      notes: n.details.notes,
                    },
                  }
                : {}),
            })),
            edges: entry.businessGraph.edges.map((e) => ({
              id: e.id,
              source: e.source,
              target: e.target,
              label: e.label,
            })),
          },
        }
      : {}),
  };
}
