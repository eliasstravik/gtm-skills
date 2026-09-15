import React, { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { query, href, shared, token, useLocation } from "./navigation";
import { State, useRead, time } from "./common";
import Workspace from "./workspace";
import Data from "./data";
import Runs from "./runs";
import Sharing from "./sharing";
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
  const view = query().get("view") ?? meta?.views?.[0] ?? "logic";
  const recipient = shared || query().has("preview");
  return (
    <main>
      <State state={state} />
      {meta && (
        <>
          <header>
            <div className="breadcrumbs">
              {recipient ? (
                <span>
                  {query().has("preview")
                    ? "Recipient preview"
                    : "Shared workflow"}{" "}
                  · Live
                </span>
              ) : (
                <a href="/viewer">All workflows</a>
              )}
              <span aria-hidden="true">/</span>
              <span>{meta.workflow.title}</span>
            </div>
            <div className="title-row">
              <div>
                <h1>{meta.workflow.title}</h1>
                <p className="muted purpose" title={meta.workflow.description}>
                  {meta.workflow.description}
                </p>
              </div>
              <div className="header-actions">
                {!recipient && (
                  <span className="context">
                    {meta.workspace} · {meta.environment}
                  </span>
                )}
                {meta.shareEnabled && <Sharing meta={meta} />}
              </div>
            </div>
            {recipient && (
              <p className="muted">
                Updated {time(state.at)} ·{" "}
                {query().has("preview")
                  ? "Preview only. No link created."
                  : meta.expiresAt
                    ? "Expires " + time(meta.expiresAt)
                    : "No expiry"}
              </p>
            )}
            <nav className="tabs" aria-label="Workflow views">
              {meta.views.map((v: string) => (
                <a
                  key={v}
                  href={href({
                    view: v,
                    cursor: undefined,
                    step: undefined,
                    node: undefined,
                    page: undefined,
                    ...(v !== "runs" ? { run: undefined } : {}),
                  })}
                  aria-current={view === v ? "page" : undefined}
                >
                  {labels[v]}
                </a>
              ))}
            </nav>
          </header>
          {!meta.views.includes(view) ? (
            <p className="notice">
              This view is not shared. Choose an available view above.
            </p>
          ) : view === "data" ? (
            <Data />
          ) : view === "runs" ? (
            <Runs
              workflow={meta.workflow}
              dataAllowed={meta.views.includes("data")}
              logicAllowed={meta.views.includes("logic")}
            />
          ) : (
            <Suspense
              fallback={
                <p role="status" className="notice">
                  Loading diagram…
                </p>
              }
            >
              <Logic
                workflow={meta.workflow}
                runsAllowed={meta.views.includes("runs")}
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
  const recipient = shared || query().has("preview");
  return (
    <>
      <div className="app-bar" role="banner">
        <a href={recipient ? location.href : "/viewer"}>GTM Workflows</a>
        <span className="muted">
          {recipient ? "Live shared view" : "Inspection"}
        </span>
      </div>
      {shared && (!token || !query().get("workflow")) ? (
        <main className="workspace">
          <h1>Link unavailable</h1>
          <p>Ask the sender for a complete, active link.</p>
        </main>
      ) : query().get("workflow") ? (
        <Workflow />
      ) : (
        <Workspace />
      )}
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
