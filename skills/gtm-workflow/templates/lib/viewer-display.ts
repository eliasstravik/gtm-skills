import type { Display, Graph } from "./viewer-contract";

/** Explicit recipient projection. Never copy arbitrary metadata from authored code. */
export function publicDisplay(entry: Display, diagram: boolean) {
  return {
    id: entry.id,
    slug: entry.slug,
    title: entry.title,
    description: entry.description,
    revision: entry.revision,
    ...(diagram
      ? {
          stages: entry.stages?.map((s) => ({
            id: s.id,
            title: s.title,
            description: s.description,
            nodes: s.nodes,
          })),
          graph: entry.graph && {
            nodes: entry.graph.nodes.map((n) => ({
              id: n.id,
              type: n.type,
              data: { label: n.data.label, nodeKind: n.data.nodeKind },
            })),
            edges: entry.graph.edges.map((e) => ({
              id: e.id,
              source: e.source,
              target: e.target,
              type: e.type,
              label: e.label,
            })),
          },
        }
      : {}),
  };
}

/** Group only ordinary steps. Control nodes remain visible so decisions and loops survive. */
export function stageGraph(
  graph: Graph,
  stages: Display["stages"],
  expanded: string[] = [],
): Graph {
  if (!stages?.length) return graph;
  const owner = new Map<string, string>();
  const nodes: Graph["nodes"] = [];
  for (const stage of stages) {
    if (expanded.includes(stage.id)) continue;
    for (const id of stage.nodes) owner.set(id, stage.id);
    nodes.push({
      id: stage.id,
      type: "stage",
      data: { label: stage.title, nodeKind: "Business stage" },
    });
  }
  nodes.push(...graph.nodes.filter((n) => !owner.has(n.id)));
  const edges: Graph["edges"] = [];
  const seen = new Set<string>();
  for (const edge of graph.edges) {
    const source = owner.get(edge.source) ?? edge.source;
    const target = owner.get(edge.target) ?? edge.target;
    if (source === target && edge.type !== "loop" && !edge.label) continue;
    const key = JSON.stringify([source, target, edge.type, edge.label]);
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({ ...edge, source, target });
  }
  return { nodes, edges };
}

export function validateStages(graph: Graph, stages: Display["stages"]) {
  const ids = new Set(graph.nodes.map((n) => n.id));
  const assigned = new Set<string>();
  const stageIds = new Set<string>();
  for (const stage of stages ?? []) {
    if (
      !stage.id ||
      ids.has(stage.id) ||
      stageIds.has(stage.id) ||
      !stage.title?.trim() ||
      !stage.description?.trim() ||
      !stage.nodes?.length
    )
      throw Error(
        "Stages require unique IDs, titles, explanations and member nodes.",
      );
    stageIds.add(stage.id);
    for (const id of stage.nodes) {
      if (!ids.has(id) || assigned.has(id))
        throw Error(`Unknown or multiply assigned stage node: ${id}`);
      assigned.add(id);
    }
  }
}
