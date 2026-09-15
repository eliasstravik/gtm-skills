import React, { useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
} from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import "@xyflow/react/dist/style.css";
function Node({ data }: any) {
  return (
    <div className="flow-node">
      <Handle type="target" position={Position.Top} />
      <p className="node-kind">
        {data.nodeKind?.replaceAll("_", " ") ?? "Step"}
      </p>
      <strong>{data.label}</strong>
      {data.loop && <p className="muted">Repeats in loop</p>}
      {data.parallel && <p className="muted">Parallel</p>}
      {data.count > 0 && (
        <p className="node-count">
          {data.count} invocation{data.count === 1 ? "" : "s"}
          {data.status ? ` · ${data.status}` : ""}
        </p>
      )}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
const nodeTypes = { viewer: Node };
export default function Logic({
  workflow,
  useRead,
  href,
  Payload,
  runsAllowed = true,
}: any) {
  const params = new URLSearchParams(location.search);
  const run = runsAllowed ? params.get("run") : null;
  const state = useRead("run", Boolean(run));
  const detail = run ? state.data : undefined;
  const graph = detail?.graph ?? workflow.graph;
  const selected = graph?.nodes.find((n: any) => n.id === params.get("node"));
  const layout = useMemo(() => {
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: "TB", nodesep: 56, ranksep: 68 });
    g.setDefaultEdgeLabel(() => ({}));
    for (const n of graph?.nodes ?? [])
      g.setNode(n.id, { width: 230, height: 110 });
    for (const e of graph?.edges ?? [])
      if (e.type !== "loop") g.setEdge(e.source, e.target);
    dagre.layout(g);
    return {
      nodes: (graph?.nodes ?? []).map((n: any) => ({
        id: n.id,
        type: "viewer",
        position: { x: g.node(n.id).x - 115, y: g.node(n.id).y - 55 },
        data: {
          ...n.data,
          loop: n.metadata?.loopId,
          parallel: n.metadata?.parallelGroupId,
          count: detail?.mapped?.[n.id]?.length ?? 0,
          status: detail?.steps
            ?.filter((s: any) => detail.mapped?.[n.id]?.includes(s.id))
            .at(-1)?.status,
        },
        selected: n.id === selected?.id,
      })),
      edges: (graph?.edges ?? []).map((e: any) => ({
        ...e,
        type: "smoothstep",
        label:
          e.label ??
          (e.type === "loop"
            ? "Repeat"
            : e.type === "parallel"
              ? "Parallel"
              : undefined),
        animated: false,
      })),
    };
  }, [graph, detail, selected?.id]);
  const focus =
    layout.nodes.find((n: any) => n.id === (selected?.id ?? "start")) ??
    layout.nodes[0];
  const canvasWidth =
    window.innerWidth > 800 ? window.innerWidth - 340 : window.innerWidth;
  const viewport = {
    x: canvasWidth / 2 - 115 - (focus?.position.x ?? 0),
    y: 40 - (focus?.position.y ?? 0),
    zoom: 1,
  };
  const executions = selected
    ? (detail?.steps ?? []).filter((s: any) =>
        detail.mapped?.[selected.id]?.includes(s.id),
      )
    : [];
  return (
    <section>
      <div className="logic-toolbar">
        <p className="muted">
          Code-authored logic · Select a step to inspect it.
        </p>
        {runsAllowed &&
          (run ? (
            <a href={href({ view: "runs", node: undefined })}>
              Open selected run
            </a>
          ) : (
            <a href={href({ view: "runs" })}>Select a run</a>
          ))}
      </div>
      {run &&
        (state.error ? (
          <p className="notice error" role="alert">
            {state.error}
          </p>
        ) : state.loading ? (
          <p className="notice" role="status">
            Loading run…
          </p>
        ) : detail?.overlay === "unavailable" ? (
          <p className="notice">
            {detail.overlayReason} The current diagram is shown without
            execution overlays.
          </p>
        ) : (
          <p className="overlay-note">
            Showing the graph retained for this run.
          </p>
        ))}
      {!graph ? (
        <p className="notice">Diagram unavailable for this workflow.</p>
      ) : (
        <div className="logic-layout">
          <div>
            <div className="canvas" aria-label="Workflow diagram">
              <ReactFlow
                nodes={layout.nodes}
                edges={layout.edges}
                nodeTypes={nodeTypes}
                nodesDraggable={false}
                nodesConnectable={false}
                elementsSelectable
                deleteKeyCode={null}
                defaultViewport={viewport}
                minZoom={0.2}
                maxZoom={1.5}
                onNodeClick={(_e, n) => location.assign(href({ node: n.id }))}
              >
                <Background gap={20} size={1} />
                <Controls showInteractive={false} />
              </ReactFlow>
            </div>
            <details className="structure-list" open={window.innerWidth < 800}>
              <summary>Step list</summary>
              <ol role="list">
                {graph.nodes.map((n: any) => (
                  <li key={n.id}>
                    <a href={href({ node: n.id })}>{n.data.label}</a>
                  </li>
                ))}
              </ol>
            </details>
          </div>
          <aside className="inspector" aria-label="Node details">
            {selected ? (
              <>
                <p className="eyebrow">STEP DETAILS</p>
                <h2>{selected.data.label}</h2>
                <p className="muted">{selected.data.nodeKind}</p>
                {selected.metadata?.loopId && (
                  <p>Repeats within the row loop.</p>
                )}
                {selected.metadata?.parallelGroupId && (
                  <p>
                    Runs in parallel with other calls in{" "}
                    {selected.metadata.parallelGroupId}.
                  </p>
                )}
                <code>{selected.data.stepId ?? selected.id}</code>
                {!run ? (
                  <p className="notice">
                    {runsAllowed
                      ? "Select a run to inspect saved inputs, outputs, and attempts."
                      : "This link shares workflow logic."}
                  </p>
                ) : !executions.length ? (
                  <p className="notice">
                    No verified execution mapping is available for this node.
                    This does not mean it was skipped.
                  </p>
                ) : (
                  executions.map((s: any) => (
                    <details key={s.id} open={executions.length === 1}>
                      <summary>
                        {s.status} · Attempt {s.attempt}
                      </summary>
                      <Payload label="Saved input" value={s.input} />
                      <Payload label="Saved output" value={s.output} />
                      <Payload label="Saved error" value={s.error} />
                    </details>
                  ))
                )}
              </>
            ) : (
              <>
                <p className="eyebrow">INSPECTOR</p>
                <h2>Understand each step</h2>
                <p className="muted">
                  Select a node in the diagram or step list.
                </p>
              </>
            )}
          </aside>
        </div>
      )}
    </section>
  );
}
