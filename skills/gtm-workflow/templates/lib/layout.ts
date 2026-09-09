// gtm-lib v18
import dagre from "@dagrejs/dagre";
import type { DiagramNode, WorkflowGraph } from "./diagram";

export type Box = { x: number; y: number; width: number; height: number };
export type LaidOutGraph = WorkflowGraph & {
  positions: Record<string, Box>;
  groupBounds: Record<string, Box>;
  size: { width: number; height: number };
};

const SIZES: Record<DiagramNode["kind"], { width: number; height: number }> = {
  start: { width: 140, height: 44 },
  end: { width: 140, height: 44 },
  step: { width: 260, height: 76 },
  save: { width: 240, height: 60 },
  wait: { width: 240, height: 60 },
  decision: { width: 240, height: 60 },
};
const PADDING = 32;

export function layoutGraph(graph: WorkflowGraph): LaidOutGraph {
  const g = new dagre.graphlib.Graph({ compound: true, multigraph: true });
  g.setGraph({ rankdir: "TB", nodesep: 48, ranksep: 56, marginx: PADDING, marginy: PADDING });
  g.setDefaultEdgeLabel(() => ({}));
  for (const group of graph.groups) {
    g.setNode(group.id, { label: group.label, clusterLabelPos: "top", paddingTop: 44, paddingBottom: 20, paddingLeft: 20, paddingRight: 20 });
    if (group.parent) g.setParent(group.id, group.parent);
  }
  for (const node of graph.nodes) {
    g.setNode(node.id, { ...SIZES[node.kind], label: node.label });
    if (node.group) g.setParent(node.id, node.group);
  }
  graph.edges.forEach((edge, index) => {
    if (edge.back) return;
    g.setEdge(edge.from, edge.to, { label: edge.label ?? "", width: edge.label ? 40 : 0, height: edge.label ? 16 : 0 }, `e${index}`);
  });
  dagre.layout(g);
  const positions: Record<string, Box> = {};
  for (const node of graph.nodes) {
    const placed = g.node(node.id);
    positions[node.id] = { x: placed.x - placed.width / 2, y: placed.y - placed.height / 2, width: placed.width, height: placed.height };
  }
  const groupBounds: Record<string, Box> = {};
  for (const group of graph.groups) {
    const placed = g.node(group.id);
    groupBounds[group.id] = { x: placed.x - placed.width / 2, y: placed.y - placed.height / 2, width: placed.width, height: placed.height };
  }
  const info = g.graph();
  return {
    ...graph,
    positions,
    groupBounds,
    size: { width: Math.ceil(info.width ?? 0), height: Math.ceil(info.height ?? 0) },
  };
}
