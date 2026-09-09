// gtm-lib v18
export type DiagramPageInput = { path: string; label: string; search: string; origin: string };

function escape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function diagramPage(input: DiagramPageInput): string {
  const imageUrl = `${input.origin}/api/diagram-image/${input.path}${input.search}`;
  const pageUrl = `${input.origin}/gtm/diagram/${input.path}${input.search}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(input.label)} · GTM workflow</title>
<meta property="og:title" content="${escape(input.label)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${escape(pageUrl)}">
<meta property="og:image" content="${escape(imageUrl)}">
<meta name="twitter:card" content="summary_large_image">
<link rel="stylesheet" href="https://esm.sh/@xyflow/react@12.11.6/dist/style.css">
<style>
  :root { color-scheme: light; }
  html, body, #root { margin: 0; height: 100%; font-family: Inter, system-ui, sans-serif; background: #f8fafc; color: #0f172a; }
  header { position: absolute; z-index: 10; top: 12px; left: 12px; right: 12px; display: flex; gap: 12px; align-items: baseline; }
  header h1 { font-size: 16px; margin: 0; }
  header .run { font-size: 13px; color: #475569; }
  .card { width: 260px; padding: 12px 14px; border: 2px solid #cbd5e1; border-radius: 12px; background: #fff; box-shadow: 0 1px 2px rgba(15, 23, 42, .06); }
  .card.save { background: #f0fdf4; } .card.wait { background: #fefce8; } .card.decision { background: #fff7ed; border-radius: 24px; }
  .card.start, .card.end { width: 140px; text-align: center; background: #f1f5f9; border-radius: 999px; padding: 8px 12px; }
  .card .label { font-weight: 600; font-size: 14px; }
  .card .sub { margin-top: 4px; font-size: 12px; color: #64748b; }
  .group { border: 1.5px dashed #cbd5e1; border-radius: 16px; background: rgba(241, 245, 249, .6); }
  .group .title { position: absolute; top: 10px; left: 14px; font-size: 13px; font-weight: 600; color: #334155; }
</style>
</head>
<body>
<div id="root"></div>
<script type="module">
import React, { useEffect, useState } from "https://esm.sh/react@19.2.8";
import { createRoot } from "https://esm.sh/react-dom@19.2.8/client?deps=react@19.2.8";
import { Background, Controls, Handle, MarkerType, Position, ReactFlow } from "https://esm.sh/@xyflow/react@12.11.6?deps=react@19.2.8,react-dom@19.2.8";
const h = React.createElement;
const path = ${JSON.stringify(input.path)};
const STATUS = { pending: "#9ca3af", active: "#2563eb", done: "#16a34a", failed: "#dc2626" };
const ACTIVE = new Set(["running", "waiting", "cancelling"]);
function subtitle(node) {
  const parts = [];
  if (node.provider) parts.push(node.provider);
  if (node.unitCostUsd !== undefined) parts.push("$" + node.unitCostUsd.toFixed(2) + " per call");
  if (node.spentUsd !== undefined) parts.push("spent $" + node.spentUsd.toFixed(2));
  return parts.join(" · ");
}
function Card({ data }) {
  return h("div", { className: "card " + data.kind, style: { borderColor: data.status ? STATUS[data.status] : "#cbd5e1" } },
    h(Handle, { type: "target", position: Position.Top, style: { opacity: 0 } }),
    h("div", { className: "label" }, data.label),
    data.sub ? h("div", { className: "sub" }, data.sub) : null,
    h(Handle, { type: "source", position: Position.Bottom, style: { opacity: 0 } }));
}
function Group({ data }) {
  return h("div", { className: "group", style: { width: data.width, height: data.height } }, h("div", { className: "title" }, data.title));
}
const nodeTypes = { card: Card, group: Group };
function relative(box, parentId, graph) {
  if (!parentId) return { x: box.x, y: box.y };
  const parent = graph.groupBounds[parentId];
  return { x: box.x - parent.x, y: box.y - parent.y };
}
function toFlow(graph) {
  const nodes = [];
  for (const group of graph.groups) {
    const box = graph.groupBounds[group.id];
    const title = group.completed !== undefined ? group.label + ": " + group.completed + " done, " + (group.failed ?? 0) + " failed" : group.label;
    nodes.push({ id: group.id, type: "group", position: relative(box, group.parent, graph), parentId: group.parent, data: { title, width: box.width, height: box.height }, style: { width: box.width, height: box.height }, draggable: false, selectable: false });
  }
  for (const node of graph.nodes) {
    const box = graph.positions[node.id];
    nodes.push({ id: node.id, type: "card", position: relative(box, node.group, graph), parentId: node.group, data: { ...node, sub: subtitle(node) }, draggable: false });
  }
  const edges = graph.edges.map((edge, index) => ({
    id: "e" + index, source: edge.from, target: edge.to, label: edge.label,
    type: edge.back ? "smoothstep" : "default", animated: edge.back,
    markerEnd: { type: MarkerType.ArrowClosed, color: "#94a3b8" }, style: { stroke: "#94a3b8" },
  }));
  return { nodes, edges };
}
function App() {
  const [graph, setGraph] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let timer;
    let stopped = false;
    const load = async () => {
      const response = await fetch("/api/diagram/" + path + location.search, { cache: "no-store" });
      if (!response.ok) { setError("This link is no longer valid."); return; }
      const next = await response.json();
      if (stopped) return;
      setGraph(next);
      if (next.run && ACTIVE.has(next.run.status)) timer = setTimeout(load, 3000);
    };
    load();
    return () => { stopped = true; clearTimeout(timer); };
  }, []);
  if (error) return h("p", { style: { padding: 24 } }, error);
  if (!graph) return h("p", { style: { padding: 24 } }, "Loading…");
  const { nodes, edges } = toFlow(graph);
  const run = graph.run ? h("span", { className: "run" }, graph.run.status + " · " + graph.run.completed + " done, " + graph.run.failed + " failed · $" + graph.run.costUsd.toFixed(2)) : null;
  return h("div", { style: { height: "100%" } },
    h("header", null, h("h1", null, graph.workflow.label), run),
    h(ReactFlow, { nodes, edges, nodeTypes, fitView: true, nodesConnectable: false, elementsSelectable: false, proOptions: { hideAttribution: true } },
      h(Background, { gap: 24, color: "#e2e8f0" }), h(Controls, { showInteractive: false })));
}
createRoot(document.getElementById("root")).render(h(App));
</script>
</body>
</html>
`;
}
