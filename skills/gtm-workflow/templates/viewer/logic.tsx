import React, { useMemo, useRef, useState, useEffect } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  MarkerType,
  BaseEdge,
  EdgeLabelRenderer,
  type ReactFlowInstance,
} from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import "@xyflow/react/dist/style.css";
import type { BusinessGraph } from "../lib/viewer-contract";
function BusinessNode({ data }: any) {
  return (
    <div className={`business-node kind-${data.kind}`}>
      <Handle type="target" position={Position.Top} />
      <div className="node-kind">{data.kind}</div>
      <div>{data.label}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
const nodeTypes = { business: BusinessNode };
function BusinessEdge({ id, data, label, markerEnd }: any) {
  const points = data.points as { x: number; y: number }[];
  const mid = points[Math.floor(points.length / 2)];
  return (
    <>
      <BaseEdge
        id={id}
        path={points.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ")}
        markerEnd={markerEnd}
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            className="graph-label"
            style={{
              transform: `translate(-50%, -50%) translate(${mid.x}px, ${mid.y}px)`,
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
const edgeTypes = { business: BusinessEdge };
export default function Logic({ workflow, destinations }: any) {
  const graph: BusinessGraph | undefined = workflow.businessGraph;
  const [selected, setSelected] = useState<string | null>(null),
    [message, setMessage] = useState("");
  const origin = useRef<HTMLElement | null>(null),
    close = useRef<HTMLButtonElement>(null);
  const diagramKey = JSON.stringify(graph);
  const layout = useMemo(() => {
    if (!graph?.nodes.length) return { nodes: [], edges: [] };
    const g = new dagre.graphlib.Graph({ multigraph: true })
      .setGraph({ rankdir: "TB", nodesep: 64, ranksep: 90 })
      .setDefaultEdgeLabel(() => ({}));
    for (const n of graph.nodes) g.setNode(n.id, { width: 240, height: 88 });
    for (const e of graph.edges) g.setEdge(e.source, e.target, {}, e.id);
    dagre.layout(g);
    return {
      nodes: graph.nodes.map((n) => ({
        id: n.id,
        type: "business",
        data: n,
        position: { x: g.node(n.id).x - 120, y: g.node(n.id).y - 44 },
        ariaLabel: n.label,
      })),
      edges: graph.edges.map((e) => ({
        ...e,
        type: "business",
        data: {
          points: g.edge({ v: e.source, w: e.target, name: e.id }).points,
        },
        markerEnd: { type: MarkerType.ArrowClosed },
      })),
    };
  }, [diagramKey]);
  const node = graph?.nodes.find((n) => n.id === selected);
  function dismiss() {
    setSelected(null);
    requestAnimationFrame(() => origin.current?.focus());
  }
  useEffect(() => {
    if (selected) close.current?.focus();
  }, [selected]);
  function initial(
    flow: ReactFlowInstance<
      (typeof layout.nodes)[number],
      (typeof layout.edges)[number]
    >,
  ) {
    const width = document.querySelector(".diagram-canvas")?.clientWidth ?? 800;
    if (layout.nodes.length <= 4)
      flow.fitView({ minZoom: 0.85, maxZoom: 1, padding: 0.2 });
    else {
      const first = layout.nodes[0];
      flow.setViewport({
        x: width / 2 - first.position.x - 120,
        y: 50 - first.position.y,
        zoom: 1,
      });
    }
  }
  return (
    <section className="diagram-pane" aria-label="Diagram">
      <div className="diagram-actions">
        {destinations?.source?.url ? (
          <a
            className="button"
            href={destinations.source.url}
            target="_blank"
            rel="noreferrer"
          >
            View source ↗
          </a>
        ) : destinations?.source?.path ? (
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(destinations.source.path);
                setMessage("File path copied.");
              } catch {
                setMessage(destinations.source.path);
              }
            }}
          >
            Copy file path
          </button>
        ) : null}
        <span role="status">{message}</span>
      </div>
      {!graph?.nodes.length ? (
        <p className="notice">
          Diagram unavailable. Ask your agent to add the business diagram.
        </p>
      ) : (
        <div className="diagram-canvas">
          <ReactFlow
            nodes={layout.nodes}
            edges={layout.edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onInit={initial}
            minZoom={0.5}
            maxZoom={1.5}
            nodesDraggable={false}
            nodesConnectable={false}
            onNodeClick={(event, n) => {
              origin.current = (event.target as Element).closest(
                ".react-flow__node",
              ) as HTMLElement;
              setSelected(n.id);
            }}
            onNodeDoubleClick={(event, n) => {
              origin.current = (event.target as Element).closest(
                ".react-flow__node",
              ) as HTMLElement;
              setSelected(n.id);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                const target = (event.target as Element).closest(
                  ".react-flow__node",
                ) as HTMLElement;
                if (target?.dataset.id) {
                  event.preventDefault();
                  origin.current = target;
                  setSelected(target.dataset.id);
                }
              }
            }}
          >
            <Background gap={24} size={1} />
            <Controls
              showInteractive={false}
              fitViewOptions={{ minZoom: 0.85, maxZoom: 1 }}
            />
          </ReactFlow>
        </div>
      )}
      {node && (
        <aside
          className="node-details"
          aria-label={node.label}
          onKeyDown={(event) => {
            if (event.key === "Escape") dismiss();
          }}
        >
          <div className="section-heading">
            <h2>{node.label}</h2>
            <button ref={close} aria-label="Close details" onClick={dismiss}>
              ×
            </button>
          </div>
          <p>{node.explanation}</p>
          {node.details && (
            <dl>
              {Object.entries(node.details)
                .filter(([, v]) => v)
                .map(([key, value]) => (
                  <div key={key}>
                    <dt>{key[0].toUpperCase() + key.slice(1)}</dt>
                    <dd>{String(value)}</dd>
                  </div>
                ))}
            </dl>
          )}
        </aside>
      )}
    </section>
  );
}
