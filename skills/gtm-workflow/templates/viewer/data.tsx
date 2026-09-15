import React, { useRef, useState } from "react";
import { href, navigate, query, shared, token } from "./navigation";
import { Search, State, time, useRead } from "./common";
function Cell({ value, type }: any) {
  if (value === null || value === undefined)
    return <span className="muted">Unavailable</span>;
  if (type === "boolean") return <>{value ? "Yes" : "No"}</>;
  if (type === "date" && !Number.isNaN(new Date(value).getTime()))
    return <time>{time(value)}</time>;
  if (type === "url" && /^https?:\/\//i.test(String(value)))
    return (
      <a href={String(value)} target="_blank" rel="noreferrer">
        {String(value)}
      </a>
    );
  return (
    <span className={type === "number" ? "numeric" : undefined}>
      {typeof value === "object" ? JSON.stringify(value) : String(value)}
    </span>
  );
}
export default function Data() {
  const state = useRead("data"),
    d = state.data,
    p = query();
  const [message, setMessage] = useState("");
  const [exporting, setExporting] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const visible =
    p.get("columns")?.split(",") ?? d?.fields?.map((f: any) => f.id) ?? [];
  const update = (changes: Record<string, string | undefined>) =>
    navigate(
      href({ ...changes, page: undefined, key: undefined, run: undefined }),
    );
  const link = (to: string) => {
    const next = new URL(to, location.origin).searchParams;
    const currentTable =
      p.get("table") ??
      new URL(
        d.tabs.find((t: any) => t.current).href,
        location.origin,
      ).searchParams.get("table");
    const changedTable = next.get("table") !== currentTable;
    return href({
      table: next.get("table") ?? undefined,
      page: next.get("page") ?? undefined,
      key: next.get("key") ?? undefined,
      relatedTable: next.get("relatedTable") ?? undefined,
      relatedKey: next.get("relatedKey") ?? undefined,
      run: undefined,
      ...(changedTable
        ? {
            q: undefined,
            field: undefined,
            operator: undefined,
            value: undefined,
            sort: undefined,
            order: undefined,
            columns: undefined,
          }
        : {}),
    });
  };
  async function copy(value: unknown) {
    try {
      await navigator.clipboard.writeText(String(value ?? ""));
      setMessage("Copied value.");
    } catch {
      setMessage("Copy failed. Select the value and copy it.");
    }
  }
  async function download() {
    setExporting(true);
    setMessage("");
    abort.current = new AbortController();
    try {
      const params = query();
      params.set("op", "export");
      params.set("v", "1");
      params.set("columns", visible.join(","));
      const response = await fetch(`/api/viewer?${params}`, {
        cache: "no-store",
        signal: abort.current.signal,
        headers: shared ? { "x-gtm-share-token": token } : {},
      });
      if (!response.ok)
        throw Error("Export failed. Refresh access and try again.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob),
        anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "workflow-current-data.csv";
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage(
        `Export complete at ${time(Date.now())}. Live data read started at ${time(response.headers.get("x-export-started-at") ?? Date.now())}.`,
      );
    } catch (error) {
      setMessage(
        abort.current.signal.aborted
          ? "Export cancelled."
          : (error as Error).message,
      );
    } finally {
      setExporting(false);
    }
  }
  return (
    <section className="pane">
      <div>
        <h2>Current data</h2>
        <p className="muted">
          Live records. Historical run output is available in Runs when
          retained.
        </p>
      </div>
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
              <span className="muted">
                {d.total.toLocaleString()} matching records · Updated{" "}
                {time(state.at)}
              </span>
            </div>
            <div className="toolbar">
              <Search
                label={`Search ${d.title.toLowerCase()}`}
                value={p.get("q") ?? ""}
                onChange={(q) => update({ q: q || undefined })}
              />
              <select
                aria-label="Filter field"
                value={p.get("field") ?? ""}
                onChange={(e) => update({ field: e.target.value || undefined })}
              >
                <option value="">All records</option>
                {d.fields.map((f: any) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
              {p.get("field") && (
                <>
                  <select
                    aria-label="Filter operator"
                    value={p.get("operator") ?? "eq"}
                    onChange={(e) => update({ operator: e.target.value })}
                  >
                    {Object.entries({
                      eq: "Equals",
                      ne: "Does not equal",
                      gt: "Greater than",
                      lt: "Less than",
                      missing: "Is missing",
                    }).map(([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <Search
                    label="Filter value"
                    value={p.get("value") ?? ""}
                    onChange={(value) => update({ value })}
                  />
                </>
              )}
              <select
                aria-label="Sort data"
                value={p.get("sort") ?? ""}
                onChange={(e) => update({ sort: e.target.value || undefined })}
              >
                <option value="">Sort by identity</option>
                {d.fields.map((f: any) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
              <button
                onClick={() =>
                  update({ order: p.get("order") === "desc" ? "asc" : "desc" })
                }
              >
                {p.get("order") === "desc" ? "Descending" : "Ascending"}
              </button>
              <details className="column-picker">
                <summary>Columns</summary>
                {d.fields.map((f: any) => (
                  <label key={f.id}>
                    <input
                      type="checkbox"
                      checked={visible.includes(f.id)}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...visible, f.id]
                          : visible.filter((id: string) => id !== f.id);
                        if (next.length)
                          navigate(href({ columns: next.join(",") }));
                      }}
                    />
                    {f.label}
                  </label>
                ))}
              </details>
              <button disabled={exporting || !d.total} onClick={download}>
                Export all matching CSV
              </button>
              {exporting && (
                <button onClick={() => abort.current?.abort()}>
                  Cancel export
                </button>
              )}
            </div>
            <p className="muted">
              CSV includes every matching record and visible field. Records may
              change during export.
            </p>
            {d.context && (
              <p>
                {d.context}{" "}
                <button onClick={() => history.back()}>
                  Back to previous records
                </button>
              </p>
            )}
            {p.get("key") && (
              <aside className="record-inspector" aria-label="Record details">
                <div className="section-heading">
                  <h3>Record details</h3>
                  <button onClick={() => history.back()}>
                    Back to records
                  </button>
                </div>
                {d.rows[0] ? (
                  <dl>
                    {d.fields.map((f: any, i: number) => (
                      <div key={f.id}>
                        <dt>{f.label}</dt>
                        <dd>
                          <Cell value={d.rows[0][i].value} type={f.type} />
                          <button
                            aria-label={`Copy ${f.label}`}
                            onClick={() => copy(d.rows[0][i].value)}
                          >
                            Copy
                          </button>
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p>Record unavailable in this view.</p>
                )}
              </aside>
            )}
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
                    {d.columns.map((c: string, i: number) =>
                      !d.fields[i] || visible.includes(d.fields[i].id) ? (
                        <th key={i} scope="col">
                          {d.fields[i]?.label ?? c}
                        </th>
                      ) : null,
                    )}
                  </tr>
                </thead>
                <tbody>
                  {d.rows.map((row: any[], i: number) => (
                    <tr key={d.keys[i]}>
                      {row.map((cell, j) =>
                        !d.fields[j] || visible.includes(d.fields[j].id) ? (
                          <td key={j}>
                            {cell.href ? (
                              <a href={link(cell.href)}>
                                {String(cell.value ?? "Unavailable")}
                              </a>
                            ) : (
                              <Cell
                                value={cell.value}
                                type={d.fields[j]?.type}
                              />
                            )}
                          </td>
                        ) : null,
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {!d.rows.length && <p className="notice">No matching records.</p>}
            </div>
            <nav className="pagination" aria-label="Data pages">
              {d.previous && <a href={link(d.previous)}>Previous</a>}
              {d.next && <a href={link(d.next)}>Next</a>}
            </nav>
          </>
        ))}
      <p role="status">{message}</p>
    </section>
  );
}
