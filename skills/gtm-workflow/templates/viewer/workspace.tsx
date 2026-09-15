import React from "react";
import { href, navigate, query } from "./navigation";
import { Search, State, Status, time, useRead } from "./common";
export default function Workspace() {
  const state = useRead("list"),
    params = query();
  const search = params.get("q") ?? "",
    status = params.get("status") ?? "",
    sort = params.get("sort") ?? "activity";
  const entries = (state.data?.workflows ?? [])
    .filter(
      (w: any) =>
        `${w.title} ${w.description}`
          .toLowerCase()
          .includes(search.toLowerCase()) &&
        (!status ||
          (w.history === "unavailable"
            ? "unavailable"
            : (w.latestRun?.status ?? "never")) === status),
    )
    .sort(
      (a: any, b: any) =>
        (sort === "activity"
          ? new Date(b.latestRun?.createdAt ?? 0).getTime() -
            new Date(a.latestRun?.createdAt ?? 0).getTime()
          : 0) ||
        a.title.localeCompare(b.title) ||
        a.id.localeCompare(b.id),
    );
  const page = Math.max(0, Number(params.get("page") ?? 0));
  const update = (changes: Record<string, string | undefined>) =>
    navigate(href({ ...changes, page: undefined }));
  return (
    <main className="workspace">
      <div className="title-row">
        <h1>Workflows</h1>
        <span className="muted">
          {state.data?.workspace} · {state.data?.environment}
        </span>
      </div>
      <div className="toolbar">
        <Search
          label="Search workflows"
          value={search}
          onChange={(q) => update({ q: q || undefined })}
        />
        <select
          aria-label="Latest run status"
          value={status}
          onChange={(e) => update({ status: e.target.value || undefined })}
        >
          <option value="">Latest run: all</option>
          {[
            "completed",
            "running",
            "pending",
            "failed",
            "cancelled",
            "never",
            "unavailable",
          ].map((s) => (
            <option key={s} value={s}>
              {s === "never" ? "Never run" : s}
            </option>
          ))}
        </select>
        <select
          aria-label="Sort workflows"
          value={sort}
          onChange={(e) => update({ sort: e.target.value })}
        >
          <option value="activity">Latest activity</option>
          <option value="name">Name</option>
        </select>
      </div>
      <State state={state} />
      {state.data && (
        <div className="workflow-list">
          <div className="workflow-row column-head">
            <span>Workflow</span>
            <span>Latest run</span>
            <span>Current records</span>
          </div>
          {entries.slice(page * 25, page * 25 + 25).map((w: any) => (
            <div className="workflow-row" key={w.id}>
              <div>
                <a
                  className="workflow-name"
                  href={`/viewer?workflow=${encodeURIComponent(w.id)}`}
                >
                  <h2>{w.title}</h2>
                </a>
                <p className="muted purpose" title={w.description}>
                  {w.description}
                </p>
              </div>
              <div>
                {w.history === "unavailable" ? (
                  <span className="muted">History unavailable</span>
                ) : w.latestRun ? (
                  <a
                    href={`/viewer?workflow=${encodeURIComponent(w.id)}&view=runs&run=${encodeURIComponent(w.latestRun.id)}`}
                  >
                    <Status value={w.latestRun.status} />
                    <p className="muted">{time(w.latestRun.createdAt)}</p>
                  </a>
                ) : (
                  <span className="muted">Never run</span>
                )}
              </div>
              <span className="muted">
                {w.counts?.length
                  ? w.counts.map((c: any) => (
                      <a
                        key={c.table}
                        className="record-count"
                        href={`/viewer?workflow=${encodeURIComponent(w.id)}&view=data&table=${encodeURIComponent(c.table)}`}
                      >
                        {c.total.toLocaleString()} {c.label.toLowerCase()}
                      </a>
                    ))
                  : "Unavailable"}
              </span>
            </div>
          ))}
          {!entries.length && (
            <p className="notice">
              {state.data.workflows.length
                ? "No workflows match these filters."
                : "No workflows yet. Ask your agent to create one."}
            </p>
          )}
        </div>
      )}
      <nav className="pagination" aria-label="Workflow pages">
        {page > 0 && <a href={href({ page: String(page - 1) })}>Previous</a>}
        {entries.length > (page + 1) * 25 && (
          <a href={href({ page: String(page + 1) })}>Next</a>
        )}
      </nav>
    </main>
  );
}
