// gtm-lib v14
import type { DiagramEdge, DiagramGroup, DiagramNode, DiagramStatus, WorkflowGraph } from "./diagram";

export function statusMarker(status?: DiagramStatus): string {
  if (!status) return "";
  return { done: "[x]", failed: "[!]", active: "[~]", pending: "[ ]" }[status];
}

function nodeText(node: DiagramNode): string {
  const marker = statusMarker(node.status);
  const cost = node.spentUsd !== undefined ? ` ($${node.spentUsd.toFixed(2)})` : "";
  return `${marker ? `${marker} ` : ""}${node.label}${cost}`;
}

function groupText(group: DiagramGroup): string {
  return group.completed !== undefined
    ? `${group.label}: ${group.completed} done, ${group.failed ?? 0} failed`
    : group.label;
}

function shape(node: DiagramNode, text: string): string {
  const quoted = JSON.stringify(text);
  switch (node.kind) {
    case "start":
    case "end":
      return `${node.id}([${quoted}])`;
    case "decision":
      return `${node.id}{${quoted}}`;
    case "wait":
      return `${node.id}{{${quoted}}}`;
    case "save":
      return `${node.id}[(${quoted})]`;
    default:
      return `${node.id}[${quoted}]`;
  }
}

/**
 * Nodes are emitted in graph order, opening and closing each subgraph as the walk enters and
 * leaves it, so the diagram reads top to bottom in the order the workflow body runs.
 */
export function toMermaid(graph: WorkflowGraph): string {
  const lines = ["flowchart TD"];
  const groupById = new Map(graph.groups.map((group) => [group.id, group]));
  const chain = (groupId: string | undefined): string[] =>
    groupId ? [...chain(groupById.get(groupId)?.parent), groupId] : [];
  const open: string[] = [];
  const closeTo = (depth: number) => {
    while (open.length > depth) {
      open.pop();
      lines.push(`${"  ".repeat(open.length + 1)}end`);
    }
  };
  for (const node of graph.nodes) {
    const target = chain(node.group);
    let common = 0;
    while (common < open.length && common < target.length && open[common] === target[common]) common += 1;
    closeTo(common);
    for (let index = open.length; index < target.length; index += 1) {
      const group = groupById.get(target[index])!;
      lines.push(`${"  ".repeat(index + 1)}subgraph ${group.id}[${JSON.stringify(groupText(group))}]`);
      open.push(group.id);
    }
    lines.push(`${"  ".repeat(open.length + 1)}${shape(node, nodeText(node))}`);
  }
  closeTo(0);
  for (const edge of graph.edges) lines.push(`  ${edgeText(edge)}`);
  return lines.join("\n");
}

function edgeText(edge: DiagramEdge): string {
  if (edge.back) return `${edge.from} -. ${JSON.stringify(edge.label ?? "next")} .-> ${edge.to}`;
  return edge.label ? `${edge.from} -- ${edge.label} --> ${edge.to}` : `${edge.from} --> ${edge.to}`;
}

export function toAscii(graph: WorkflowGraph): string {
  const lines: string[] = [];
  const groupById = new Map(graph.groups.map((group) => [group.id, group]));
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const chain = (groupId: string | undefined): string[] =>
    groupId ? [...chain(groupById.get(groupId)?.parent), groupId] : [];
  const open: string[] = [];
  const closeTo = (depth: number) => {
    while (open.length > depth) {
      const closing = open.pop()!;
      const back = graph.edges.find((edge) => edge.back && nodeById.get(edge.to)?.group === closing);
      if (back) lines.push(`${"  ".repeat(open.length + 1)}(${back.label ?? "next"}: ${nodeById.get(back.to)?.label})`);
    }
  };
  for (const node of graph.nodes) {
    const target = chain(node.group);
    let common = 0;
    while (common < open.length && common < target.length && open[common] === target[common]) common += 1;
    closeTo(common);
    for (let index = open.length; index < target.length; index += 1) {
      const group = groupById.get(target[index])!;
      lines.push(`${"  ".repeat(index)}[${groupText(group)}]`);
      open.push(group.id);
    }
    const incoming = graph.edges.find((edge) => edge.to === node.id && !edge.back && edge.label);
    const indent = "  ".repeat(open.length + (incoming ? 1 : 0));
    const prefix = incoming ? `${incoming.label}: ` : "";
    lines.push(`${indent}${prefix}${node.kind === "decision" ? `<${nodeText(node)}>` : nodeText(node)}`);
  }
  closeTo(0);
  return lines.join("\n");
}
