import React from "react";
import { href, navigate, query } from "./navigation";
import { Search, State, useRead } from "./common";
export default function Workspace() {
  const state = useRead("list"),
    search = query().get("q") ?? "";
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
    <main className="workspace">
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
    </main>
  );
}
