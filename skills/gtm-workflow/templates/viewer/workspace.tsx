import React from "react";
import { href, navigate, query } from "./navigation";
import { Search, State, useRead } from "./common";
import Data from "./data";
export default function Workspace() {
  const state = useRead("list"),
    search = query().get("q") ?? "";
  const dataView = query().get("view") === "data";
  const entries = (state.data?.workflows ?? [])
    .filter((w: any) =>
      `${w.title} ${w.description ?? ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    )
    .sort(
      (a: any, b: any) =>
        a.title.localeCompare(b.title) || a.id.localeCompare(b.id),
    );
  return (
    <main className={dataView ? "workflow" : "workspace"}>
        <nav className="tabs root-navigation" aria-label="Workspace">
          <a href="/viewer" aria-current={!dataView ? "page" : undefined}>Workflows</a>
          <a href="/viewer?view=data" aria-current={dataView ? "page" : undefined}>Data</a>
          {state.data?.connectionsUrl && <a href={state.data.connectionsUrl}>Connections</a>}
        </nav>
      {dataView ? <>
        <div className="title-row"><h1>Data</h1></div>
        <Data destinations={state.data?.destinations} />
      </> : <>
      <div className="title-row">
        <h1>Workflows</h1>
        <Search
          label="Search workflows"
          value={search}
          onChange={(q) => navigate(href({ q: q || undefined }), true)}
        />
      </div>
      <State state={state} />
      {state.data && (
        <div className="workflow-list">
          {entries.map((w: any) => (
            <a
              className="workflow-row"
              key={w.id}
              href={`/viewer?workflow=${encodeURIComponent(w.id)}`}
            >
              <h2>{w.title}</h2>
              {w.description && (
                <p className="muted purpose">{w.description}</p>
              )}
            </a>
          ))}
          {!entries.length && (
            <p className="notice">
              {search
                ? "No matching workflows"
                : "No workflows yet. Ask your agent to create one."}{" "}
              {search && (
                <button onClick={() => navigate(href({ q: undefined }))}>
                  Clear search
                </button>
              )}
            </p>
          )}
        </div>
      )}
      </>}
    </main>
  );
}
