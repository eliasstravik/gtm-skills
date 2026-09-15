import React, { useMemo, useEffect, useRef, useState } from "react";
import { stageGraph } from "../lib/viewer-display";
import { useRead, Payload, Status, time } from "./common";
import { href, navigate, shared } from "./navigation";
const viewports = new Map<string, { x: number; y: number; zoom: number }>();
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
          {data.count} loaded invocation{data.count === 1 ? "" : "s"}
          {data.status ? ` · ${data.status}` : ""}
        </p>
      )}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
const nodeTypes = { viewer: Node };
export default function Logic({ workflow, runsAllowed = true }: any) {
  const params = new URLSearchParams(location.search);
  const run = runsAllowed ? params.get("run") : null;
  const state = useRead("run", Boolean(run));
  const detail = run ? state.data : undefined;
  const source = detail?.graph ?? workflow.graph;
  const expanded = (params.get("expanded") ?? "").split(",").filter(Boolean);
  const stages = (detail?.graph ? detail.stages : workflow.stages) ?? [];
  const structure = JSON.stringify([source, stages, expanded]);
  const graph = useMemo(
    () => (source ? stageGraph(source, stages, expanded) : undefined),
    [structure],
  );
  const stage = stages.find(
    (s: any) =>
      s.id === params.get("node") || s.nodes.includes(params.get("node")),
  );
  const latest = useRead("runs", runsAllowed && !run);
  const panel = useRef<HTMLElement>(null);
  const [theme, setTheme] = useState<"light" | "dark">(
    matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
  );
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const change = () => setTheme(media.matches ? "dark" : "light");
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    if (params.get("node") && window.innerWidth < 800) panel.current?.focus();
  }, [params.get("node")]);
  const selection = params.get("node");
  const previousSelection = useRef<string | null>(null);
  useEffect(() => {
    if (!selection && previousSelection.current) {
      const previous = previousSelection.current;
      const link = [
        ...document.querySelectorAll<HTMLAnchorElement>(
          ".stage-nav a, .structure-list a",
        ),
      ].find((a) => new URL(a.href).searchParams.get("node") === previous);
      link?.focus();
    }
    previousSelection.current = selection;
    if (!selection) return;
    const escape = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        !(event.target as Element).closest("dialog")
      ) {
        event.preventDefault();
        navigate(href({ node: undefined }));
      }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [selection]);
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
        },
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
  }, [graph]);
  const nodes = useMemo(
    () =>
      layout.nodes.map((node: any) => ({
        ...node,
        selected: node.id === selected?.id,
        data: {
          ...node.data,
          count: detail?.mapped?.[node.id]?.length ?? 0,
          status: detail?.steps
            ?.filter((s: any) => detail.mapped?.[node.id]?.includes(s.id))
            .at(-1)?.status,
        },
      })),
    [layout, detail, selected?.id],
  );
  const viewportKey = `${workflow.id}:${detail?.revision ?? workflow.revision}`;
  const focus =
    layout.nodes.find((n: any) => n.id === (selected?.id ?? "start")) ??
    layout.nodes[0];
  const canvasWidth =
    window.innerWidth > 800 ? window.innerWidth - 340 : window.innerWidth;
  const viewport = viewports.get(viewportKey) ?? {
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
      {stages.length > 0 && (
        <nav className="stage-nav" aria-label="Business stages">
          {stages.map((s: any) => (
            <a
              key={s.id}
              href={href({ node: expanded.includes(s.id) ? s.nodes[0] : s.id })}
              aria-current={stage?.id === s.id ? "true" : undefined}
            >
              {s.title}
            </a>
          ))}
        </nav>
      )}
      <div className="logic-toolbar">
        <p className="muted">
          {stages.length
            ? "Business stages · Select a stage to inspect exact steps."
            : "Business overview unavailable. Showing the exact workflow structure."}
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
      {!run && runsAllowed && (
        <p className="latest-summary">
          Latest run:{" "}
          {latest.error ? (
            "History unavailable"
          ) : latest.loading ? (
            "Loading…"
          ) : latest.data?.data[0] ? (
            <a href={href({ view: "runs", run: latest.data.data[0].id })}>
              <Status value={latest.data.data[0].status} /> ·{" "}
              {time(latest.data.data[0].createdAt)} · View run
            </a>
          ) : (
            "Never run"
          )}
        </p>
      )}
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
            <div className="canvas" role="region" aria-label="Workflow diagram">
              <ReactFlow
                nodes={nodes}
                edges={layout.edges}
                nodeTypes={nodeTypes}
                nodesDraggable={false}
                nodesConnectable={false}
                elementsSelectable
                deleteKeyCode={null}
                key={viewportKey}
                colorMode={theme}
                defaultViewport={viewport}
                onMoveEnd={(_event, next) => viewports.set(viewportKey, next)}
                minZoom={0.2}
                maxZoom={1.5}
                onNodeClick={(_e, n) => navigate(href({ node: n.id }))}
                onKeyDown={(event) => {
                  const id = (event.target as Element)
                    .closest("[data-id]")
                    ?.getAttribute("data-id");
                  if (id && (event.key === "Enter" || event.key === " ")) {
                    event.preventDefault();
                    navigate(href({ node: id }));
                  }
                }}
              >
                <Background gap={20} size={1} />
                <Controls showInteractive={false} />
              </ReactFlow>
            </div>
            <details className="structure-list" open={window.innerWidth < 800}>
              <summary>
                {stages.length
                  ? "Stage outline and exact steps"
                  : "Step outline"}
              </summary>
              <ol role="list">
                {graph.nodes.map((n: any) => (
                  <li key={n.id}>
                    <a href={href({ node: n.id })}>{n.data.label}</a>
                  </li>
                ))}
              </ol>
            </details>
          </div>
          <aside
            ref={panel}
            tabIndex={-1}
            className={`inspector ${selected ? "has-selection" : ""}`}
            aria-label="Node details"
          >
            {selected && (
              <button
                className="close-details"
                onClick={() => navigate(href({ node: undefined }))}
              >
                Close details
              </button>
            )}
            {selected ? (
              <>
                <p className="eyebrow">
                  {stage ? "BUSINESS STAGE" : "STEP DETAILS"}
                </p>
                <h2>{selected.data.label}</h2>
                {stage && (
                  <>
                    <p>{stage.description}</p>
                    <button
                      onClick={() =>
                        navigate(
                          href({
                            expanded: expanded.includes(stage.id)
                              ? expanded
                                  .filter((id) => id !== stage.id)
                                  .join(",") || undefined
                              : [...expanded, stage.id].join(","),
                            node: expanded.includes(stage.id)
                              ? stage.id
                              : stage.nodes[0],
                          }),
                        )
                      }
                    >
                      {expanded.includes(stage.id)
                        ? "Collapse exact steps"
                        : "Expand exact steps"}
                    </button>
                    <ul>
                      {stage.nodes.map((id: string) => (
                        <li key={id}>
                          <a
                            href={href({
                              expanded: [
                                ...new Set([...expanded, stage.id]),
                              ].join(","),
                              node: id,
                            })}
                          >
                            {source.nodes.find((n: any) => n.id === id)?.data
                              .label ?? id}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <p className="muted">{selected.data.nodeKind}</p>
                {Boolean(selected.metadata?.loopId) && (
                  <p>Repeats within the row loop.</p>
                )}
                {Boolean(selected.metadata?.parallelGroupId) && (
                  <p>
                    Runs in parallel with other calls in{" "}
                    {String(selected.metadata?.parallelGroupId)}.
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
