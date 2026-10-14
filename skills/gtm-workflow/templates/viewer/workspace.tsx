import React, { useEffect, useState } from "react";
import { ArrowRightIcon, ChevronRightIcon } from "@heroicons/react/16/solid";
import { href, navigate, query } from "./navigation";
import { Search, State, useRead } from "./common";
import Data from "./data";
import Runs from "./runs";
import { EnvironmentBadge } from "./environment";
import {
  active, ago, flatten, lastRun, matches, passes, rollUp, sections,
  type Group, type LastRuns, type ListedWorkflow, type Node,
} from "./groups";

/**
 * Which sections and pipelines are open, remembered in this browser only. Groups start open and pipelines closed, so
 * the page opens on what can be started; a key that holds the exceptions keeps new groups and pipelines at the default.
 */
function useToggles(key: string | undefined) {
  const [ids, setIds] = useState<Set<string>>(() => {
    try { return new Set(key ? JSON.parse(localStorage.getItem(key) ?? "[]") : []); } catch { return new Set(); }
  });
  const toggle = (id: string) => setIds((previous) => {
    const next = new Set(previous);
    if (!next.delete(id)) next.add(id);
    try { if (key) localStorage.setItem(key, JSON.stringify([...next])); } catch {}
    return next;
  });
  return [ids, toggle] as const;
}

const STATUS: Record<string, string> = { failed: "Failed", running: "Running", pending: "Queued", cancelled: "Cancelled", completed: "Completed" };

/**
 * The last run's status as a dot before the name: the only thing a row says besides its name. Its time is in the
 * tooltip; the history is on Runs.
 */
function Dot({ runs, id }: { runs?: LastRuns; id: string }) {
  const run = lastRun(runs, id);
  const status = !runs ? "loading" : run ? run.status : "never";
  const label = run ? `Last run ${STATUS[run.status]?.toLowerCase() ?? run.status} ${ago(run.createdAt)}`
    : runs ? (runs[id] === "unknown" ? "No recent run" : "Never run") : "";
  return <span className={`wf-dot wf-dot-${status}`} role={label ? "img" : undefined} aria-label={label || undefined} title={label || undefined} />;
}

type Row = { node: Node; depth: number; guides: boolean[]; last: boolean };
/** The visible rows, depth first; `guides` says, per ancestor level, whether its tree line runs on past this row. */
function visibleRows(nodes: Node[], isOpen: (id: string) => boolean, depth = 0, guides: boolean[] = []): Row[] {
  return nodes.flatMap((node, i) => {
    const last = i === nodes.length - 1;
    const row = { node, depth, guides, last };
    return node.stages.length && isOpen(node.workflow.id)
      ? [row, ...visibleRows(node.stages, isOpen, depth + 1, depth ? [...guides, !last] : guides)]
      : [row];
  });
}

/**
 * Workflows as a tree: a dot and a name each, a pipeline's stages under it on a tree line. The name opens the workflow;
 * the chevron before a pipeline shows or hides its stages, and a hidden stage's failure shows on the pipeline's line.
 * Without `toggle` (while a search or filter is on) every pipeline stays open.
 */
function WorkflowTree({ nodes, runs, isOpen, toggle, id }: {
  nodes: Node[]; runs?: LastRuns; isOpen: (id: string) => boolean; toggle?: (id: string) => void; id?: string;
}) {
  return <ul role="list" className="wf-rows" id={id}>
    {visibleRows(nodes, isOpen).map(({ node, depth, guides, last }) => {
      const w = node.workflow, open = node.stages.length > 0 && isOpen(w.id);
      const stages = flatten(node.stages);
      const failing = !open ? stages.filter((s) => lastRun(runs, s.id)?.status === "failed").length : 0;
      const running = !open ? stages.filter((s) => active(lastRun(runs, s.id))).length : 0;
      const count = node.stages.length > 0 && <span className="wf-stages">
        {stages.length} {stages.length === 1 ? "stage" : "stages"}
        {failing > 0 && <span className="wf-word wf-word-failed"> · {failing} failed</span>}
        {!failing && running > 0 && <span className="wf-word wf-word-running"> · {running} running</span>}
      </span>;
      return <li key={w.id} className={node.context ? "wf-row wf-context" : "wf-row"} data-depth={depth} data-last={last || undefined} data-open={open || undefined}
        style={{ "--depth": depth } as React.CSSProperties}>
        {guides.map((on, level) => on && <span key={level} className="wf-guide" aria-hidden="true" style={{ "--level": level + 1 } as React.CSSProperties} />)}
        <span className="wf-main">
          <span className="wf-lead">
            {node.stages.length > 0
              ? <button type="button" className="wf-toggle" aria-expanded={open} disabled={!toggle} onClick={() => toggle?.(w.id)}
                  aria-label={`${open ? "Hide" : "Show"} the ${stages.length === 1 ? "stage" : `${stages.length} stages`} of ${w.title}`}>
                  <ChevronRightIcon aria-hidden="true" />
                </button>
              : <span className="wf-toggle" aria-hidden="true" />}
            <Dot runs={runs} id={w.id} />
          </span>
          <span className="wf-name">
            <a className="wf-link" href={`/viewer?workflow=${encodeURIComponent(w.id)}`} title={w.description || undefined}>{w.title}</a>
            {count}
          </span>
        </span>
      </li>;
    })}
  </ul>;
}

function useWorkflows(list: ReturnType<typeof useRead>) {
  const summary = useRead("summary", Boolean(list.data));
  const workflows: ListedWorkflow[] = list.data?.workflows ?? [];
  const groups: Group[] = list.data?.groups ?? [];
  const runs: LastRuns | undefined = summary.data?.lastRuns;
  return { list, summary, workflows, groups, runs };
}

/** Workspace navigation: the same four tabs on every root page. */
function RootTabs({ current, connectionsUrl }: { current: "workflows" | "runs" | "data"; connectionsUrl?: string }) {
  return <nav className="tabs root-navigation" aria-label="Workspace">
    <a href="/viewer" aria-current={current === "workflows" ? "page" : undefined}>Workflows</a>
    <a href="/viewer?view=runs" aria-current={current === "runs" ? "page" : undefined}>Runs</a>
    <a href="/viewer?view=data" aria-current={current === "data" ? "page" : undefined}>Data</a>
    {connectionsUrl && <a href={connectionsUrl}>Connections</a>}
  </nav>;
}

/** A section's state on its header, only when something needs a look: failures first, then work in progress. */
function SectionState({ members, runs }: { members: ListedWorkflow[]; runs?: LastRuns }) {
  if (!runs) return null;
  const { failing, running } = rollUp(members, runs);
  if (failing) return <span className="wf-word wf-word-failed">{failing} failing</span>;
  if (running) return <span className="wf-word wf-word-running">{running} running</span>;
  return null;
}

function Home({ list }: { list: ReturnType<typeof useRead> }) {
  const { summary, workflows, groups, runs } = useWorkflows(list);
  const p = query(), search = p.get("q") ?? "", failingOnly = p.get("filter") === "failing";
  const narrowed = Boolean(search) || failingOnly;
  const [closedGroups, toggleGroup] = useToggles("gtm.viewer.closedGroups");
  const [openPipelines, togglePipeline] = useToggles("gtm.viewer.openPipelines");
  const keep = (w: ListedWorkflow, g?: Group) => (!failingOnly || passes("failing", w, runs)) && (!search || matches(search, w, g));
  const shown = sections(workflows, groups, narrowed ? keep : undefined);
  // A search or filter opens everything it found, so a match is never hidden in a closed section or pipeline.
  const pipelineOpen = (id: string) => narrowed || openPipelines.has(id);
  // "/" jumps to the search, as on most list pages; typing in a field is left alone.
  useEffect(() => {
    const focus = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.target instanceof HTMLElement && event.target.closest("input, textarea, select, [contenteditable]")) return;
      const input = document.querySelector<HTMLInputElement>(".wf-controls input[type=search]");
      if (input) { event.preventDefault(); input.focus(); }
    };
    window.addEventListener("keydown", focus);
    return () => window.removeEventListener("keydown", focus);
  }, []);
  const failing = runs ? workflows.filter((w) => passes("failing", w, runs)).length : undefined;
  return <>
    <div className="title-row">
      <div className="environment-title"><h1>Workflows</h1><EnvironmentBadge environment={list.data?.environment} /></div>
      {workflows.length > 0 && <div className="wf-controls">
        <Search label="Search workflows, tables, providers…" value={search} onChange={(q) => navigate(href({ q: q || undefined }), true)} />
        <button type="button" className="wf-failing" aria-pressed={failingOnly}
          onClick={() => navigate(href({ filter: failingOnly ? undefined : "failing" }), true)}>
          Failing{failing !== undefined && <span className="wf-failing-count">{failing}</span>}
        </button>
      </div>}
    </div>
    <State state={list} />
    {list.data && <section className="wf-index" aria-label="Workflows">
      {summary.error && <p role="alert" className="notice error">Last runs are unavailable: {summary.error} <button type="button" onClick={summary.retry}>Retry</button></p>}
      {shown.map(({ group, nodes, members }) => {
        const key = group?.id ?? "ungrouped", open = narrowed || !closedGroups.has(key), rows = `wf-rows-${key}`;
        const name = group?.name ?? "Ungrouped";
        return <section className="wf-group" key={key} aria-label={name}>
          {(group || groups.length > 0) && <header className="wf-group-header">
            <h2>
              <button type="button" className="wf-group-toggle" aria-expanded={open} aria-controls={open ? rows : undefined}
                disabled={narrowed} onClick={() => toggleGroup(key)}>
                <ChevronRightIcon aria-hidden="true" />
                <span className="wf-group-name">{name}</span>
                <span className="wf-count">{members.length}</span>
              </button>
            </h2>
            {group && <a className="wf-group-open" href={`/viewer?group=${encodeURIComponent(group.id)}`} title={`Open ${name}: its workflows, runs and data`}
              aria-label={`Open ${name}`}><ArrowRightIcon aria-hidden="true" /></a>}
            <span className="wf-group-state"><SectionState members={members} runs={runs} /></span>
          </header>}
          {open && <WorkflowTree id={rows} nodes={nodes} runs={runs} isOpen={pipelineOpen} toggle={narrowed ? undefined : togglePipeline} />}
        </section>;
      })}
      {!shown.length && <p className="notice">
        {!workflows.length ? "No workflows yet." : "No matching workflows."}{" "}
        {narrowed && <button type="button" onClick={() => navigate(href({ q: undefined, filter: undefined }))}>Show all</button>}
      </p>}
    </section>}
  </>;
}

/** A group: the workspace's Workflows, Runs and Data tabs, narrowed to the group's workflows and their tables. */
function GroupPage({ id }: { id: string }) {
  const list = useRead("list");
  const { workflows, groups, runs } = useWorkflows(list);
  // Here pipelines start open: the page is about this group's detail.
  const [closedPipelines, togglePipeline] = useToggles(undefined);
  const view = query().get("view") ?? "workflows";
  const group = groups.find((g) => g.id === id);
  const section = group && sections(workflows, [group]).find((s) => s.group?.id === id);
  const tab = (name: string, label: React.ReactNode) =>
    <a href={`/viewer?${new URLSearchParams({ group: id, ...(name === "workflows" ? {} : { view: name }) })}`} aria-current={view === name ? "page" : undefined}>{label}</a>;
  return <main className={view === "workflows" ? "workspace group-page" : "workflow group-page"}>
    <header className="workflow-header">
      <div className="breadcrumbs">
        <a href="/viewer">Workflows</a><span aria-hidden="true">/</span>
        <h1>{group?.name ?? "Group"}</h1>
        <EnvironmentBadge environment={list.data?.environment} />
      </div>
    </header>
    <State state={list} />
    {list.data && !group && <p role="alert" className="notice">This group no longer exists. <a href="/viewer">Show all workflows</a></p>}
    {group && <>
      {group.description && <p className="group-description muted">{group.description}</p>}
      <nav className="tabs" aria-label="Group views">
        {tab("workflows", <>Workflows <span className="group-count">{section?.members.length ?? 0}</span></>)}
        {tab("runs", "Runs")}
        {tab("data", "Data")}
      </nav>
      {view === "runs" ? <Runs workspace destinations={list.data?.destinations} />
        : view === "data" ? <Data destinations={list.data?.destinations} csrf={list.data?.csrf} />
          : <div className="wf-index group-workflows">
            <WorkflowTree nodes={section?.nodes ?? []} runs={runs} isOpen={(wid) => !closedPipelines.has(wid)} toggle={togglePipeline} />
          </div>}
    </>}
  </main>;
}

export default function Workspace() {
  const group = query().get("group");
  return group ? <GroupPage key={group} id={group} /> : <Root />;
}

function Root() {
  const view = query().get("view");
  const state = useRead("list");
  if (view === "data" || view === "runs")
    return <main className="workflow">
      <RootTabs current={view} connectionsUrl={state.data?.connectionsUrl} />
      <div className="title-row"><div className="environment-title"><h1>{view === "data" ? "Data" : "Runs"}</h1><EnvironmentBadge environment={state.data?.environment} /></div></div>
      {view === "data" ? <Data destinations={state.data?.destinations} csrf={state.data?.csrf} /> : <Runs workspace destinations={state.data?.destinations} />}
    </main>;
  return <main className="workspace">
    <RootTabs current="workflows" connectionsUrl={state.data?.connectionsUrl} />
    <Home list={state} />
  </main>;
}
