import React, {
  useEffect,
  useRef,
  useState,
  useMemo,
  lazy,
  Suspense,
} from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
const Logic = lazy(() => import("./logic"));
const shared = location.pathname === "/share";
const token = new URLSearchParams(location.hash.slice(1)).get("token") ?? "";
// The bearer stays in the fragment and memory. It never becomes a request URL or referrer.
const query = () => new URLSearchParams(location.search);
const href = (changes: Record<string, string | undefined>) => {
  const p = query();
  for (const [k, v] of Object.entries(changes))
    v === undefined ? p.delete(k) : p.set(k, v);
  return `${location.pathname}?${p}${location.hash}`;
};
async function api(
  op: string,
  extra: Record<string, string> = {},
  body?: unknown,
  csrf?: string,
) {
  const p = query();
  p.set("op", op);
  p.set("v", "1");
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  const res = await fetch(`/api/viewer?${p}`, {
    method: body ? "POST" : "GET",
    cache: "no-store",
    headers: {
      ...(shared ? { "x-gtm-share-token": token } : {}),
      ...(body
        ? { "content-type": "application/json", "x-gtm-csrf": csrf ?? "" }
        : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (data.version !== 1)
    throw Error(
      "Update required. Reload after both deployments have been updated.",
    );
  if (!res.ok) throw Error(data.error?.message ?? "View unavailable.");
  return data;
}
function useRead(op: string, enabled = true) {
  const [state, setState] = useState<{
    data?: any;
    error?: string;
    loading: boolean;
  }>({ loading: true });
  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    let delay = 2000;
    async function read() {
      if (document.hidden) {
        timer = setTimeout(read, 1000);
        return;
      }
      try {
        const data = await api(op);
        if (disposed) return;
        setState({ data, loading: false });
        const active =
          data.run && ["pending", "running"].includes(data.run.status);
        if (active || shared) {
          timer = setTimeout(read, active ? delay : 15000);
          delay = Math.min(delay * 1.5, 15000);
        }
      } catch (e) {
        if (!disposed)
          setState({ error: String((e as Error).message), loading: false });
      }
    }
    read();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [op, enabled]);
  return state;
}
const time = (value: string) =>
  value
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "Unavailable";
function Status({ value }: { value: string }) {
  return <span className={`status status-${value}`}>{value}</span>;
}
function State({ state }: { state: any }) {
  return state.loading ? (
    <p role="status" className="notice">
      Loading…
    </p>
  ) : state.error ? (
    <p role="alert" className="notice error">
      {state.error}
    </p>
  ) : null;
}
function Payload({ label, value }: { label: string; value: any }) {
  return (
    <section className="payload">
      <h3>{label}</h3>
      {value?.state === "available" || value?.state === "truncated" ? (
        <>
          <pre>
            {typeof value.value === "string"
              ? value.value
              : JSON.stringify(value.value, null, 2)}
          </pre>
          {value.state === "truncated" && <p>Truncated to 16 KB.</p>}
        </>
      ) : (
        <p className="muted">
          {value?.state === "locked"
            ? "Payload is locked."
            : "Payload unavailable."}
        </p>
      )}
    </section>
  );
}
function Workspace() {
  const state = useRead("list");
  return (
    <main className="workspace">
      <div className="title-row">
        <div>
          <p className="eyebrow">GTM / WORKFLOWS</p>
          <h1>Workflows</h1>
          <p className="muted">
            Inspect your workflow logic, saved runs, and current data.
          </p>
        </div>
        <span className="context">
          {state.data?.environment ?? "Workspace"}
        </span>
      </div>
      <State state={state} />
      {state.data && (
        <div className="workflow-list">
          {state.data.workflows.length === 0 ? (
            <p className="notice">No workflows registered.</p>
          ) : (
            state.data.workflows.map((w: any) => (
              <a
                className="workflow-row"
                key={w.id}
                href={href({ workflow: w.id, view: "logic" })}
              >
                <div>
                  <h2>{w.title}</h2>
                  <p className="muted">{w.description}</p>
                </div>
                <span>
                  {w.latestStatus ? (
                    <Status value={w.latestStatus} />
                  ) : (
                    <span className="muted">No recent run</span>
                  )}
                </span>
              </a>
            ))
          )}
        </div>
      )}
    </main>
  );
}
function Data() {
  const state = useRead("data");
  const d = state.data;
  const link = (to: string) => {
    const p = new URL(to, location.origin).searchParams;
    return href({
      table: p.get("table") ?? undefined,
      page: p.get("page") ?? undefined,
      key: p.get("key") ?? undefined,
      relatedTable: p.get("relatedTable") ?? undefined,
      relatedKey: p.get("relatedKey") ?? undefined,
    });
  };
  return (
    <section className="pane">
      <h2>Current business data</h2>
      <p className="muted">
        Live records in the registered tables. These are not snapshots from an
        earlier run.
      </p>
      <State state={state} />
      {d &&
        (d.unavailable ? (
          <p className="notice">{d.unavailable}</p>
        ) : (
          <>
            <nav className="table-tabs" aria-label="Data tables">
              {d.tabs.map((t: any) => (
                <a
                  key={t.href}
                  href={link(t.href)}
                  aria-current={t.current ? "page" : undefined}
                >
                  {t.label}
                </a>
              ))}
            </nav>
            <div className="section-heading">
              <h3>{d.title}</h3>
              <a href={link(d.all)}>Show all records</a>
            </div>
            {d.context && <p>{d.context}</p>}
            <div
              className="table-scroll"
              tabIndex={0}
              role="region"
              aria-label={d.title}
            >
              <table>
                <caption>{d.rows.length} records on this page</caption>
                <thead>
                  <tr>
                    {d.columns.map((c: string, i: number) => (
                      <th key={i} scope="col">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.rows.map((r: any[], i: number) => (
                    <tr key={i}>
                      {r.map((c, j) => (
                        <td key={j}>
                          {c.href ? (
                            <a href={link(c.href)}>
                              {String(c.value ?? "Unknown")}
                            </a>
                          ) : (
                            String(c.value ?? "Unknown")
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {!d.rows.length && <p className="notice">No records found.</p>}
            </div>
            <nav className="pagination" aria-label="Data pages">
              {d.previous && <a href={link(d.previous)}>← Previous</a>}
              {d.next && <a href={link(d.next)}>Next →</a>}
            </nav>
          </>
        ))}
    </section>
  );
}
function Runs({ workflow }: { workflow: any }) {
  const selected = query().get("run");
  const state = useRead(selected ? "run" : "runs");
  const d = state.data;
  const step = d?.steps?.find((s: any) => s.id === query().get("step"));
  return (
    <section className="pane">
      <div className="section-heading">
        <div>
          <h2>{selected ? "Run details" : "Runs"}</h2>
          <p className="muted">
            Saved execution history, including inputs, outputs, and retry
            attempts.
          </p>
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
                  location.assign(
                    href({ period: e.target.value, cursor: undefined }),
                  )
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
                  location.assign(
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
              <a href={href({ view: "logic", step: undefined })}>
                View on diagram
              </a>
            </div>
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
                        <strong>{s.name.split("//").at(-1)}</strong>
                        <p className="muted">
                          Attempt {s.attempt} ·{" "}
                          {s.startedAt ? time(s.startedAt) : "Not started"}
                        </p>
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
                <h3>{step ? step.name.split("//").at(-1) : "Workflow run"}</h3>
                <Payload label="Saved input" value={(step ?? d.run).input} />
                <Payload label="Saved output" value={(step ?? d.run).output} />
                <Payload label="Saved error" value={(step ?? d.run).error} />
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
function Sharing({ meta }: { meta: any }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [grants, setGrants] = useState<any[]>([]);
  const [views, setViews] = useState(["logic"]);
  const [expiry, setExpiry] = useState("seven");
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  async function open() {
    ref.current?.showModal();
    try {
      setGrants((await api("grants")).grants);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api(
        "createGrant",
        {},
        { views, ...(expiry === "never" ? { expiresAt: null } : {}) },
        meta.csrf,
      );
      setLink(result.url);
      setCopied(false);
      setGrants((await api("grants")).grants);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function revoke(id: string) {
    setBusy(true);
    try {
      await api("revokeGrant", {}, { id }, meta.csrf);
      setGrants((await api("grants")).grants);
      setLink("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button onClick={open}>Share</button>
      <dialog ref={ref} aria-labelledby="share-title">
        <div className="section-heading">
          <h2 id="share-title">Share this workflow</h2>
          <button
            aria-label="Close sharing"
            onClick={() => ref.current?.close()}
          >
            ×
          </button>
        </div>
        <p className="muted">
          Anyone with the link can open the selected views. It follows the
          current workflow.
        </p>
        <form onSubmit={create}>
          <fieldset>
            <legend>Allowed views</legend>
            <label>
              <input type="checkbox" checked disabled />
              Logic
            </label>
            <label>
              <input
                type="checkbox"
                checked={views.includes("runs")}
                onChange={(e) =>
                  setViews((v) =>
                    e.target.checked
                      ? [...v, "runs"]
                      : v.filter((x) => x !== "runs"),
                  )
                }
              />
              Runs, including saved step inputs and outputs
            </label>
            <label>
              <input
                type="checkbox"
                disabled={!meta.dataShareEnabled}
                checked={views.includes("data")}
                onChange={(e) =>
                  setViews((v) =>
                    e.target.checked
                      ? [...v, "data"]
                      : v.filter((x) => x !== "data"),
                  )
                }
              />
              Current business data
            </label>
            {!meta.dataShareEnabled && (
              <p className="muted">
                Data sharing needs an authored table and row policy.
              </p>
            )}
          </fieldset>
          <label>
            Expires{" "}
            <select value={expiry} onChange={(e) => setExpiry(e.target.value)}>
              <option value="seven">In seven days</option>
              <option value="never">Never</option>
            </select>
          </label>
          <p>
            Shares {views.join(", ")}.{" "}
            {expiry === "never" ? "No expiry." : "Expires in seven days."}
          </p>
          <button disabled={busy} type="submit">
            {busy ? "Saving…" : "Create link"}
          </button>
        </form>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {link && (
          <div className="copy-row">
            <label>
              Share link
              <input readOnly value={link} onFocus={(e) => e.target.select()} />
            </label>
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link);
                  setCopied(true);
                } catch {
                  setError("Select and copy the link above.");
                }
              }}
            >
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
        )}
        <h3>Existing links</h3>
        <ul className="grant-list" role="list">
          {grants.map((g) => (
            <li key={g.id}>
              <div>
                {g.views.join(", ")}
                <p className="muted">
                  {g.revokedAt
                    ? "Revoked"
                    : g.expiresAt
                      ? `Expires ${time(g.expiresAt)}`
                      : "No expiry"}
                </p>
              </div>
              {!g.revokedAt && (
                <button disabled={busy} onClick={() => revoke(g.id)}>
                  Revoke
                </button>
              )}
            </li>
          ))}
        </ul>
      </dialog>
    </>
  );
}
function Workflow() {
  const state = useRead("workflow");
  const meta = state.data;
  const view = query().get("view") ?? "logic";
  return (
    <main>
      <State state={state} />
      {meta && (
        <>
          <header>
            <div className="breadcrumbs">
              {shared ? (
                <span>Shared workflow</span>
              ) : (
                <a href="/viewer">GTM / Workflows</a>
              )}
              <span aria-hidden="true">/</span>
              <span>{meta.workflow.title}</span>
            </div>
            <div className="title-row">
              <div>
                <h1>{meta.workflow.title}</h1>
                <p className="muted">{meta.workflow.description}</p>
              </div>
              <div className="header-actions">
                <span className="context">{meta.environment}</span>
                {meta.shareEnabled && <Sharing meta={meta} />}
              </div>
            </div>
            <nav className="tabs" aria-label="Workflow views">
              {meta.views.map((v: string) => (
                <a
                  key={v}
                  href={href({
                    view: v,
                    cursor: undefined,
                    step: undefined,
                    node: undefined,
                  })}
                  aria-current={view === v ? "page" : undefined}
                >
                  {v[0].toUpperCase() + v.slice(1)}
                </a>
              ))}
            </nav>
          </header>
          {!meta.views.includes(view) ? (
            <p className="notice">This view is not shared.</p>
          ) : view === "data" ? (
            <Data />
          ) : view === "runs" ? (
            <Runs workflow={meta.workflow} />
          ) : (
            <Suspense
              fallback={
                <p className="notice" role="status">
                  Loading diagram…
                </p>
              }
            >
              <Logic
                runsAllowed={meta.views.includes("runs")}
                workflow={meta.workflow}
                useRead={useRead}
                href={href}
                Payload={Payload}
              />
            </Suspense>
          )}
        </>
      )}
    </main>
  );
}
function App() {
  return shared && !token ? (
    <main className="workspace">
      <h1>Link unavailable</h1>
      <p>Open the complete link from the workflow owner.</p>
    </main>
  ) : query().get("workflow") ? (
    <Workflow />
  ) : (
    <Workspace />
  );
}
createRoot(document.getElementById("root")!).render(<App />);
