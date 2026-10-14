import React from "react";
import { href, navigate, query } from "./navigation";
import { Search, State, Status, time, useRead } from "./common";
import Data from "./data";
import Runs from "./runs";
import { EnvironmentBadge } from "./environment";
import { FILTERS, ago, cronText, lastRun, matches, passes, rollUp, sections, type Filter, type Group, type LastRuns, type ListedWorkflow } from "./groups";

/** How many of a group's workflows the home page shows before "+ n more". */
const PREVIEW = 3;

function Trigger({ workflow, titles }: { workflow: ListedWorkflow; titles: Map<string, string> }) {
  const t = workflow.trigger;
  const parts = [
    ...(t.schedule ? [<span key="schedule" className="trigger" title={`vercel.json cron: ${t.schedule}`}>{cronText(t.schedule)}</span>] : []),
    ...(t.webhook ? [<span key="webhook" className="trigger">Webhook</span>] : []),
    ...(t.startedBy?.length ? [<span key="stage" className="trigger">Stage of {t.startedBy.map((slug) => titles.get(slug) ?? slug).join(", ")}</span>] : []),
  ];
  return <>{parts.length ? parts : <span className="trigger">Manual</span>}</>;
}

function LastRunCell({ runs, id }: { runs?: LastRuns; id: string }) {
  if (!runs) return <span className="muted">…</span>;
  const run = lastRun(runs, id);
  if (!run) return <span className="muted">{runs[id] === "unknown" ? "No recent run" : "Never run"}</span>;
  return <span className="last-run">
    <Status value={run.status} />
    <time dateTime={new Date(run.createdAt).toISOString()} title={time(run.createdAt)}>{ago(run.createdAt)}</time>
    {run.stage && <span className="muted"> · as a stage</span>}
  </span>;
}

function WorkflowRow({ workflow: w, runs, titles }: { workflow: ListedWorkflow; runs?: LastRuns; titles: Map<string, string> }) {
  return <a className="workflow-row" href={`/viewer?workflow=${encodeURIComponent(w.id)}`}>
    <span className="workflow-row-main">
      <h3>{w.title}</h3>
      {w.description && <span className="muted purpose">{w.description}</span>}
      <span className="workflow-meta">
        <Trigger workflow={w} titles={titles} />
        {w.tables.length > 0 && <span className="workflow-tables" title="Tables it reads or writes">
          <span className="sr-only">Tables: </span>{w.tables.map((t) => <span key={t} className="table-name">{t}</span>)}
        </span>}
      </span>
    </span>
    <span className="workflow-status"><LastRunCell runs={runs} id={w.id} /></span>
  </a>;
}

function useWorkflows(list: ReturnType<typeof useRead>) {
  const summary = useRead("summary", Boolean(list.data));
  const workflows: ListedWorkflow[] = list.data?.workflows ?? [];
  const groups: Group[] = list.data?.groups ?? [];
  const runs: LastRuns | undefined = summary.data?.lastRuns;
  const titles = new Map(workflows.map((w) => [w.slug, w.title]));
  return { list, summary, workflows, groups, runs, titles };
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

function Home({ list }: { list: ReturnType<typeof useRead> }) {
  const { summary, workflows, groups, runs, titles } = useWorkflows(list);
  const p = query(), search = p.get("q") ?? "";
  const filter = (FILTERS.some(([f]) => f === p.get("filter")) ? p.get("filter") : "all") as Filter;
  const narrowed = Boolean(search) || filter !== "all";
  const keep = (w: ListedWorkflow, g?: Group) => passes(filter, w, runs) && (!search || matches(search, w, g));
  const shown = sections(workflows, groups, keep, runs, !narrowed);
  return <>
    <div className="title-row"><div className="environment-title"><h1>Workflows</h1><EnvironmentBadge environment={list.data?.environment} /></div>
      <Search label="Search workflows, tables, providers…" value={search} onChange={(q) => navigate(href({ q: q || undefined }), true)} />
    </div>
    <State state={list} />
    {list.data && <section className="workflow-home" aria-label="Workflows">
      {workflows.length > 0 && <div className="chips" role="group" aria-label="Show">
        {FILTERS.map(([value, label]) => {
          const count = value === "all" || value === "scheduled" || runs ? workflows.filter((w) => passes(value, w, runs)).length : undefined;
          return <button key={value} type="button" aria-pressed={filter === value}
            onClick={() => navigate(href({ filter: value === "all" ? undefined : value }), true)}>
            {label}{count !== undefined && <span className="chip-count">{count}</span>}
          </button>;
        })}
      </div>}
      {summary.error && <p role="alert" className="notice error">Last runs are unavailable: {summary.error} <button onClick={summary.retry}>Retry</button></p>}
      {shown.map(({ group, all, workflows: members }) => {
        const visible = group && !narrowed ? members.slice(0, PREVIEW) : members;
        return <section className="workflow-group" key={group?.id ?? "other"} aria-label={group?.name ?? "Other"}>
          {(group || groups.length > 0) && <header className="group-header">
            {group ? <h2><a href={`/viewer?group=${encodeURIComponent(group.id)}`}>{group.name} <span aria-hidden="true">›</span></a></h2> : <h2>Other</h2>}
            <p className="muted">{rollUp(all, runs)}</p>
          </header>}
          <div className="workflow-list">
            {visible.map((w) => <WorkflowRow key={w.id} workflow={w} runs={runs} titles={titles} />)}
          </div>
          {group && visible.length < members.length && <a className="more" href={`/viewer?group=${encodeURIComponent(group.id)}`}>+ {members.length - visible.length} more</a>}
        </section>;
      })}
      {!shown.length && <p className="notice">
        {!workflows.length ? "No workflows yet." : "No matching workflows."}{" "}
        {narrowed && <button onClick={() => navigate(href({ q: undefined, filter: undefined }))}>Show all</button>}
      </p>}
    </section>}
  </>;
}

/** A group: the workspace's Workflows, Runs and Data tabs, narrowed to the group's workflows and their tables. */
function GroupPage({ id }: { id: string }) {
  const list = useRead("list");
  const { workflows, groups, runs, titles } = useWorkflows(list);
  const view = query().get("view") ?? "workflows";
  const group = groups.find((g) => g.id === id);
  const members = group ? group.workflows.flatMap((wid) => workflows.filter((w) => w.id === wid)) : [];
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
        {tab("workflows", <>Workflows <span className="group-count">{members.length}</span></>)}
        {tab("runs", "Runs")}
        {tab("data", "Data")}
      </nav>
      {view === "runs" ? <Runs workspace destinations={list.data?.destinations} />
        : view === "data" ? <Data destinations={list.data?.destinations} csrf={list.data?.csrf} />
          : <div className="workflow-list group-workflows">
            {members.map((w) => <WorkflowRow key={w.id} workflow={w} runs={runs} titles={titles} />)}
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
