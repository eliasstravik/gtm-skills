import React from "react";
import { query, href, navigate, shared } from "./navigation";
import { useRead, State, Status, Payload, time } from "./common";
export default function Runs({
  workflow,
  dataAllowed,
  logicAllowed,
}: {
  workflow: any;
  dataAllowed: boolean;
  logicAllowed: boolean;
}) {
  const selected = query().get("run");
  const state = useRead(selected ? "run" : "runs");
  const d = state.data;
  const step = d?.steps?.find((s: any) => s.id === query().get("step"));
  return (
    <section className="pane">
      <div className="section-heading">
        <div>
          <h2>{selected ? "Run details" : "Runs"}</h2>
          <p className="muted">Execution history and retained attempts.</p>
        </div>
        {selected ? (
          <a
            href={href({ run: undefined, step: undefined, cursor: undefined })}
          >
            All runs
          </a>
        ) : (
          <div className="run-filters">
            <label>
              Time{" "}
              <select
                aria-label="Filter runs by time"
                value={query().get("period") ?? "all"}
                onChange={(e) =>
                  navigate(href({ period: e.target.value, cursor: undefined }))
                }
              >
                <option value="all">All time</option>
                <option value="day">Past day</option>
                <option value="week">Past week</option>
                <option value="month">Past month</option>
              </select>
            </label>
            <label>
              Status{" "}
              <select
                aria-label="Filter runs by status"
                value={query().get("status") ?? ""}
                onChange={(e) =>
                  navigate(
                    href({
                      status: e.target.value || undefined,
                      cursor: undefined,
                    }),
                  )
                }
              >
                <option value="">All statuses</option>
                {["pending", "running", "completed", "failed", "cancelled"].map(
                  (s) => (
                    <option key={s}>{s}</option>
                  ),
                )}
              </select>
            </label>
          </div>
        )}
      </div>
      <State state={state} />
      {d &&
        (selected ? (
          <>
            <div className="run-meta">
              <Status value={d.run.status} />
              <time>{time(d.run.createdAt)}</time>
              <code>{d.run.id}</code>
              {logicAllowed && (
                <a href={href({ view: "logic", step: undefined })}>
                  View on diagram
                </a>
              )}
            </div>
            <RunSummary run={d.run} />
            <p className="muted">
              {d.summary?.complete
                ? `${d.summary.count} invocations in this run`
                : `${d.summary?.count ?? d.steps.length} invocations on this page. Run totals are partial.`}
            </p>
            {dataAllowed && (
              <a
                href={href({
                  view: "data",
                  run: undefined,
                  step: undefined,
                  cursor: undefined,
                })}
              >
                View current data
              </a>
            )}
            {d.children?.length > 0 && (
              <details>
                <summary>
                  Child runs ({d.children.length}
                  {d.childrenComplete ? "" : "+"})
                </summary>
                <ul>
                  {d.children.map((child: any) => (
                    <li key={child.id}>
                      <a
                        href={href({
                          run: child.id,
                          step: undefined,
                          cursor: undefined,
                        })}
                      >
                        {child.id} · {child.status}
                      </a>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <div className="inspector-layout">
              <div>
                <div className="step-list">
                  {d.steps.map((s: any) => (
                    <a
                      key={s.id}
                      href={href({ step: s.id })}
                      aria-current={s.id === step?.id ? "true" : undefined}
                    >
                      <div>
                        <strong>{s.label ?? s.name.split("//").at(-1)}</strong>
                        <p className="muted">
                          Attempt {s.attempt} ·{" "}
                          {s.startedAt ? time(s.startedAt) : "Not started"}
                        </p>
                        <p className="muted">{identity(s.input)}</p>
                      </div>
                      <Status value={s.status} />
                    </a>
                  ))}
                </div>
                {!d.steps.length && (
                  <p className="notice">No steps retained on this page.</p>
                )}
                {d.hasMore && (
                  <a href={href({ cursor: d.cursor, step: undefined })}>
                    Next steps →
                  </a>
                )}
              </div>
              <aside className="inspector" aria-label="Saved payloads">
                <h3>
                  {step
                    ? (step.label ?? step.name.split("//").at(-1))
                    : "Workflow run"}
                </h3>
                <p>Status: {(step ?? d.run).status}</p>
                <p>Duration: {duration(step ?? d.run)}</p>
                {step && (
                  <p>
                    Attempt {step.attempt}.{" "}
                    {step.status === "completed" && step.attempt > 1
                      ? "Completed after retry."
                      : step.status === "failed"
                        ? "This is a current failure."
                        : ""}
                  </p>
                )}
                {shared && (
                  <p className="muted">
                    Technical payloads are private. Use Data for shared business
                    records.
                  </p>
                )}
                <Payload label="Saved input" value={(step ?? d.run).input} />
                <Payload label="Saved output" value={(step ?? d.run).output} />
                <Payload label="Saved error" value={(step ?? d.run).error} />
                <Attempts />
              </aside>
            </div>
          </>
        ) : (
          <>
            <div
              className="table-scroll"
              tabIndex={0}
              role="region"
              aria-label="Workflow runs"
            >
              <table>
                <thead>
                  <tr>
                    <th scope="col">Run</th>
                    <th scope="col">Status</th>
                    <th scope="col">Started</th>
                    <th scope="col">Finished</th>
                  </tr>
                </thead>
                <tbody>
                  {d.data.map((r: any) => (
                    <tr key={r.id}>
                      <td>
                        <a href={href({ run: r.id, cursor: undefined })}>
                          <code>{r.id}</code>
                        </a>
                      </td>
                      <td>
                        <Status value={r.status} />
                      </td>
                      <td>{time(r.startedAt)}</td>
                      <td>{time(r.completedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!d.data.length && (
                <p className="notice">No matching runs on this page.</p>
              )}
            </div>
            {d.hasMore && <a href={href({ cursor: d.cursor })}>Next runs →</a>}
          </>
        ))}
    </section>
  );
}
function duration(value: any) {
  if (!value.startedAt) return "Unavailable";
  const end = value.completedAt
    ? new Date(value.completedAt).getTime()
    : ["pending", "running"].includes(value.status)
      ? Date.now()
      : NaN;
  const seconds = Math.max(
    0,
    Math.round((end - new Date(value.startedAt).getTime()) / 1000),
  );
  return Number.isFinite(seconds)
    ? `${Math.floor(seconds / 60)}m ${seconds % 60}s${value.completedAt ? "" : " elapsed"}`
    : "Unavailable";
}
function identity(input: any) {
  const value = input?.state === "available" ? input.value : undefined;
  const row = Array.isArray(value) ? value[0] : value;
  const fields =
    row && typeof row === "object"
      ? ["key", "email", "domain", "profile_url"].filter(
          (key) => typeof row[key] === "string" && row[key].length <= 256,
        )
      : [];
  return fields.length
    ? `${fields[0]}: ${row[fields[0]]}`
    : "Row identity unavailable";
}
function RunSummary({ run }: any) {
  const result =
    run.output?.state === "available" ? run.output.value : undefined;
  const counts: [string, number][] = [];
  for (const [prefix, source] of [
    ["", result],
    ["People · ", result?.people],
    ["Companies · ", result?.companies],
  ] as const) {
    for (const key of [
      "done",
      "failed",
      "skipped",
      "spentUsd",
      "employmentLinks",
    ])
      if (typeof source?.[key] === "number" && Number.isFinite(source[key]))
        counts.push([prefix + key, source[key]]);
  }
  const businessFailure = counts.some(
    ([key, value]) => key.endsWith("failed") && value > 0,
  );
  return (
    <div className="run-summary">
      <p>
        Started: {time(run.startedAt)} · Duration: {duration(run)}
      </p>
      <p>
        Trigger: {run.attributes?.["gtm.viewer.trigger"] ?? "Unavailable"} ·
        Version:{" "}
        {run.attributes?.["gtm.viewer.revision"] ??
          run.deploymentId ??
          "Unavailable"}
      </p>
      {businessFailure && (
        <p className="notice">
          Some business records failed, even if the engine completed the run.
        </p>
      )}
      {counts.length ? (
        <dl>
          {counts.map(([label, value]) => (
            <div key={label}>
              <dt>
                {label
                  .replace("spentUsd", "spent USD")
                  .replace("employmentLinks", "employment links")}
              </dt>
              <dd>{value.toLocaleString()}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="muted">
          Recorded business totals unavailable in this view.
        </p>
      )}
    </div>
  );
}
function Attempts() {
  const state = useRead("events");
  const selected = query().get("step");
  const events =
    state.data?.events?.filter(
      (e: any) => !selected || e.invocation === selected,
    ) ?? [];
  return (
    <details>
      <summary>Timeline and attempt history</summary>
      <State state={state} />
      <ol className="event-list">
        {events.map((e: any) => (
          <li key={e.id}>
            <time>{time(e.createdAt)}</time>
            <p>
              {e.type.replaceAll("_", " ")}
              {e.attempt ? ` · Attempt ${e.attempt}` : ""}
            </p>
          </li>
        ))}
      </ol>
      {state.data && !events.length && <p>No matching events on this page.</p>}
      {state.data?.hasMore && (
        <a href={href({ eventCursor: state.data.cursor })}>
          More timeline events
        </a>
      )}
    </details>
  );
}
