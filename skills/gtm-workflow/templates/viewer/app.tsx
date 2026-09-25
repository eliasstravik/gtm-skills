import React, { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { query, href, shared, token, useLocation } from "./navigation";
import { State, useRead } from "./common";
import Workspace from "./workspace";
import Data from "./data";
import Runs from "./runs";
import Sharing from "./sharing";
import { EnvironmentBadge } from "./environment";
import "@fontsource-variable/geist/index.css";
import "@fontsource-variable/geist-mono/index.css";
import "./style.css";
const Logic = lazy(() => import("./logic"));
const labels: Record<string, string> = {
  logic: "Diagram",
  runs: "Runs",
  data: "Data",
};
function Workflow() {
  const state = useRead("meta"),
    meta = state.data;
  const view =
    query().get("view") ??
    ["logic", "runs", "data"].find((v) => meta?.views.includes(v)) ??
    "logic";
  const recipient = shared || query().has("preview");
  return (
    <main className="workflow">
      <State state={state} />
      {meta && (
        <>
          <header className="workflow-header">
            <div className="breadcrumbs">
              {!recipient && (
                <>
                  <a href="/viewer">Workflows</a>
                  <span aria-hidden="true">/</span>
                </>
              )}
              <h1>{meta.workflow.title}</h1>
              {!recipient && <EnvironmentBadge environment={meta.environment} />}
            </div>
            {!recipient && meta.hosted && <Sharing meta={meta} />}
          </header>
          <nav className="tabs" aria-label="Workflow views">
            {["logic", "runs", "data"]
              .filter((v) => meta.views.includes(v))
              .map((v) => (
                <a
                  key={v}
                  href={href({
                    view: v,
                    cursor: undefined,
                    node: undefined,
                    page: undefined,
                    run: undefined,
                  })}
                  aria-current={view === v ? "page" : undefined}
                >
                  {labels[v]}
                </a>
              ))}
          </nav>
          {!meta.views.includes(view) ? (
            <p className="notice">This view isn't shared.</p>
          ) : view === "data" ? (
            <Data destinations={meta.destinations} />
          ) : view === "runs" ? (
            <Runs destinations={meta.destinations} />
          ) : (
            <Suspense
              fallback={
                <p className="notice" role="status">
                  Loading diagram…
                </p>
              }
            >
              <Logic
                workflow={meta.workflow}
                destinations={meta.destinations}
              />
            </Suspense>
          )}
        </>
      )}
    </main>
  );
}
function App() {
  useLocation();
  return (
    <>
      {shared && (!token || !query().get("workflow")) ? (
        <main className="workspace">
          <h1>Link unavailable</h1>
          <p>Ask the sender for a complete, active link.</p>
        </main>
      ) : query().get("workflow") ? (
        <Workflow key={query().get("workflow")} />
      ) : (
        <Workspace />
      )}
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
