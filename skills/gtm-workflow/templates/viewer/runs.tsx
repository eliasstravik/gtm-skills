import React, { useEffect, useState } from "react";
import { query, href, navigate, shared } from "./navigation";
import { useRead, State, Status, time } from "./common";
function Duration({ run }: any) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!["running", "pending"].includes(run.status)) return;
    const timer = setInterval(() => {
      if (!document.hidden) setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, [run.status]);
  if (
    !run.startedAt ||
    (!run.completedAt && !["running", "pending"].includes(run.status))
  )
    return <>—</>;
  const seconds = Math.max(
    0,
    Math.floor(
      ((run.completedAt ? new Date(run.completedAt).getTime() : now) -
        new Date(run.startedAt).getTime()) /
        1000,
    ),
  );
  return (
    <>
      {seconds < 60
        ? `${seconds}s`
        : `${Math.floor(seconds / 60)}m ${seconds % 60}s`}
    </>
  );
}
export default function Runs({ destinations }: any) {
  const state = useRead("runs"),
    d = state.data,
    p = query(),
    recipient = shared || p.has("preview");
  return (
    <section className="pane runs-pane" aria-label="Runs">
      <div className="toolbar">
        <select
          name="filter-runs-by-status"
          aria-label="Filter runs by status"
          value={p.get("status") ?? ""}
          onChange={(e) =>
            navigate(
              href({ status: e.target.value || undefined, cursor: undefined }),
            )
          }
        >
          <option value="">All statuses</option>
          {["pending", "running", "completed", "failed", "cancelled"].map(
            (s) => (
              <option key={s} value={s}>
                {s[0].toUpperCase() + s.slice(1)}
              </option>
            ),
          )}
        </select>
        <select
          name="filter-runs-by-time"
          aria-label="Filter runs by time"
          value={p.get("period") ?? "all"}
          onChange={(e) =>
            navigate(href({ period: e.target.value, cursor: undefined }))
          }
        >
          <option value="all">All time</option>
          <option value="day">Past day</option>
          <option value="week">Past week</option>
          <option value="month">Past month</option>
        </select>
        <button onClick={state.retry}>Refresh</button>
        {!recipient && destinations?.runs && (
          <a className="button" href={destinations.runs.url}
            target="_blank" rel="noopener noreferrer">
            {destinations.runs.label} ↗
          </a>
        )}
      </div>
      <State state={state} />
      {d && (
        <>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Started</th>
                  <th>Status</th>
                  <th>Duration</th>
                  {!recipient && <th>Details</th>}
                </tr>
              </thead>
              <tbody>
                {d.data.map((r: any) => (
                  <tr key={r.id}>
                    <td>
                      <time
                        tabIndex={0}
                        title={new Date(r.startedAt ?? r.createdAt).toString()}
                      >
                        {time(r.startedAt ?? r.createdAt)}
                      </time>
                      {!r.startedAt && (
                        <span className="muted"> · Created</span>
                      )}
                    </td>
                    <td>
                      <Status value={r.status} />
                    </td>
                    <td className="numeric">
                      <Duration run={r} />
                    </td>
                    {!recipient && (
                      <td>
                        {r.destination ? (
                          <a
                            href={r.destination.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {r.destination.label} ↗
                          </a>
                        ) : (
                          <span className="muted">
                            Inspector not configured
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {!d.data.length && (
              <p className="notice">
                {d.hasMore
                  ? "No matching runs on these pages. Continue to older runs."
                  : p.has("status") ||
                      p.has("cursor") ||
                      (p.get("period") && p.get("period") !== "all")
                    ? "No matching runs."
                    : "No runs yet."}
              </p>
            )}
          </div>
          <nav className="pagination" aria-label="Run pages">
            {p.has("cursor") && (
              <a href={href({ cursor: undefined })}>Newest</a>
            )}
            {d.hasMore && d.cursor && (
              <a href={href({ cursor: d.cursor })}>Older runs</a>
            )}
          </nav>
        </>
      )}
    </section>
  );
}
