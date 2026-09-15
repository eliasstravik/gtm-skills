import React, { useEffect, useRef, useState } from "react";
import { CONTRACT_VERSION } from "../lib/viewer-contract";
import { href, navigate, query, shared, token } from "./navigation";
import { Search, State, time, useRead } from "./common";
const valueText = (value: unknown) =>
  value == null
    ? ""
    : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);
export default function Data({ destinations }: any) {
  const state = useRead("data"),
    d = state.data,
    p = query();
  const [message, setMessage] = useState(""),
    [exporting, setExporting] = useState(false);
  const [selected, setSelected] = useState<[number, number] | null>(null),
    [widths, setWidths] = useState<Record<number, number>>({});
  const [detail, setDetail] = useState("");
  const grid = useRef<HTMLTableElement>(null),
    popover = useRef<HTMLDialogElement>(null),
    origin = useRef<HTMLElement | null>(null);
  const abort = useRef<AbortController | null>(null);
  const visible = d?.fields?.map((f: any) => f.id) ?? [];
  useEffect(() => {
    setSelected(null);
  }, [JSON.stringify([d?.keys, d?.columns])]);
  useEffect(() => () => abort.current?.abort(), []);
  const update = (changes: Record<string, string | undefined>) => {
    setSelected(null);
    navigate(
      href({ ...changes, page: undefined, key: undefined, run: undefined }),
    );
  };
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
      await navigator.clipboard.writeText(valueText(value));
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
      params.set("v", String(CONTRACT_VERSION));
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

  const cell = selected && d?.rows[selected[0]]?.[selected[1]];
  function focusCell(row: number, column: number) {
    grid.current
      ?.querySelector<HTMLElement>(
        `[data-row="${row}"][data-column="${column}"]`,
      )
      ?.focus();
  }
  function resize(event: React.PointerEvent, column: number) {
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget as HTMLElement,
      start = event.clientX,
      width = widths[column] ?? 220;
    handle.focus();
    handle.setPointerCapture(event.pointerId);
    const move = (e: PointerEvent) =>
      setWidths((old) => ({
        ...old,
        [column]: Math.max(100, Math.min(800, width + e.clientX - start)),
      }));
    const end = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  }
  return (
    <section className="pane data-pane" aria-label="Data">
      <State state={state} />
      {d &&
        (d.unavailable ? (
          <p className="notice">No configured data for this workflow.</p>
        ) : (
          <>
            <div className="toolbar">
              <select
                aria-label="Data table"
                value={d.tabs.find((t: any) => t.current)?.href ?? ""}
                onChange={(e) => navigate(link(e.target.value))}
              >
                {d.tabs.map((t: any) => (
                  <option key={t.href} value={t.href}>
                    {t.label}
                  </option>
                ))}
              </select>
              <Search
                label="Search data"
                value={p.get("q") ?? ""}
                onChange={(q) => update({ q: q || undefined })}
              />
              <select
                aria-label="Filter field"
                value={p.get("field") ?? ""}
                onChange={(e) =>
                  update({
                    field: e.target.value || undefined,
                    value: undefined,
                  })
                }
              >
                <option value="">Filter</option>
                {d.fields.map((f: any) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
              {p.has("field") && (
                <>
                  <select
                    aria-label="Filter operator"
                    value={p.get("operator") ?? "eq"}
                    onChange={(e) => update({ operator: e.target.value })}
                  >
                    <option value="eq">Equals</option>
                    <option value="ne">Does not equal</option>
                    <option value="gt">Greater than</option>
                    <option value="lt">Less than</option>
                    <option value="missing">Is missing</option>
                  </select>
                  {p.get("operator") !== "missing" && (
                    <Search
                      label="Filter value"
                      value={p.get("value") ?? ""}
                      onChange={(value) => update({ value })}
                    />
                  )}
                </>
              )}
              <button onClick={state.retry}>Refresh</button>
              <button disabled={exporting || !d.total} onClick={download}>
                Export CSV
              </button>
              {exporting && (
                <button onClick={() => abort.current?.abort()}>
                  Cancel export
                </button>
              )}
              {destinations?.database && (
                <a
                  className="button"
                  target="_blank"
                  rel="noreferrer"
                  href={destinations.database.url}
                >
                  {destinations.database.label} ↗
                </a>
              )}
              {cell && (
                <>
                  <button onClick={() => copy(cell.value)}>Copy cell</button>
                  <button
                    onClick={(e) => {
                      origin.current = e.currentTarget;
                      setDetail(valueText(cell.value));
                      popover.current?.showModal();
                    }}
                  >
                    View value
                  </button>
                </>
              )}
            </div>
            {d.context && (
              <p className="grid-message">
                {d.context} <button onClick={() => history.back()}>Back</button>
              </p>
            )}
            <div className="table-scroll">
              <table
                ref={grid}
                className="data-grid"
                role="grid"
                aria-label={d.title}
                aria-readonly="true"
                onKeyDown={(event) => {
                  if (!selected) return;
                  const [row, column] = selected;
                  if (
                    (event.ctrlKey || event.metaKey) &&
                    event.key.toLowerCase() === "c" &&
                    !window.getSelection()?.toString()
                  ) {
                    event.preventDefault();
                    copy(cell?.value);
                  }
                  const delta = (
                    {
                      ArrowUp: [-1, 0],
                      ArrowDown: [1, 0],
                      ArrowLeft: [0, -1],
                      ArrowRight: [0, 1],
                    } as Record<string, number[]>
                  )[event.key];
                  if (delta) {
                    event.preventDefault();
                    focusCell(
                      Math.max(0, Math.min(d.rows.length - 1, row + delta[0])),
                      Math.max(
                        0,
                        Math.min(d.columns.length - 1, column + delta[1]),
                      ),
                    );
                  }
                }}
              >
                <colgroup>
                  <col style={{ width: 56 }} />
                  {d.columns.map((_: string, j: number) => (
                    <col key={j} style={{ width: widths[j] ?? 220 }} />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    <th className="row-number" aria-label="Row number">
                      #
                    </th>
                    {d.columns.map((column: string, j: number) => (
                      <th
                        key={j}
                        scope="col"
                        aria-sort={
                          p.get("sort") === d.fields[j]?.id
                            ? p.get("order") === "desc"
                              ? "descending"
                              : "ascending"
                            : "none"
                        }
                      >
                        {d.fields[j] ? (
                          <button
                            onClick={() =>
                              update({
                                sort: d.fields[j].id,
                                order:
                                  p.get("sort") === d.fields[j].id &&
                                  p.get("order") !== "desc"
                                    ? "desc"
                                    : "asc",
                              })
                            }
                          >
                            {d.fields[j].label}{" "}
                            {p.get("sort") === d.fields[j].id
                              ? p.get("order") === "desc"
                                ? "↓"
                                : "↑"
                              : ""}
                          </button>
                        ) : (
                          column
                        )}
                        <span
                          role="separator"
                          aria-orientation="vertical"
                          aria-label={`Resize ${d.fields[j]?.label ?? column}`}
                          aria-valuenow={widths[j] ?? 220}
                          aria-valuemin={100}
                          aria-valuemax={800}
                          tabIndex={0}
                          className="resize-handle"
                          onPointerDown={(e) => resize(e, j)}
                          onKeyDown={(e) => {
                            if (["ArrowLeft", "ArrowRight"].includes(e.key)) {
                              e.preventDefault();
                              e.stopPropagation();
                              setWidths((old) => ({
                                ...old,
                                [j]: Math.max(
                                  100,
                                  Math.min(
                                    800,
                                    (old[j] ?? 220) +
                                      (e.key === "ArrowLeft" ? -20 : 20),
                                  ),
                                ),
                              }));
                            }
                          }}
                        />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.rows.map((row: any[], i: number) => (
                    <tr key={d.keys[i]}>
                      <th scope="row" className="row-number">
                        {i + 1}
                      </th>
                      {row.map((c, j) => (
                        <td
                          key={j}
                          role="gridcell"
                          data-row={i}
                          data-column={j}
                          tabIndex={
                            selected
                              ? selected[0] === i && selected[1] === j
                                ? 0
                                : -1
                              : i === 0 && j === 0
                                ? 0
                                : -1
                          }
                          aria-selected={
                            selected?.[0] === i && selected?.[1] === j
                          }
                          onClick={(e) => e.currentTarget.focus()}
                          onFocus={() => setSelected([i, j])}
                        >
                          {c.href && j >= d.fields.length ? (
                            <a href={link(c.href)}>{valueText(c.value)}</a>
                          ) : c.value == null ? (
                            <span className="muted">NULL</span>
                          ) : (
                            valueText(c.value)
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {!d.rows.length && (
                <p className="notice">
                  {p.has("q") || p.has("field")
                    ? "No matching records."
                    : "This table is empty."}
                </p>
              )}
            </div>
            <nav className="pagination" aria-label="Data pages">
              <span className="muted">
                {d.total.toLocaleString()} matching records
              </span>
              {d.previous && <a href={link(d.previous)}>Previous</a>}
              {d.next && <a href={link(d.next)}>Next</a>}
            </nav>
          </>
        ))}
      <p className="grid-message" role="status">
        {message}
      </p>
      <dialog
        ref={popover}
        className="value-dialog"
        aria-label="Cell value"
        onClose={() => origin.current?.focus()}
      >
        <div className="section-heading">
          <h2>Cell value</h2>
          <button
            aria-label="Close value"
            onClick={() => popover.current?.close()}
          >
            ×
          </button>
        </div>
        <pre>{detail}</pre>
        <button onClick={() => copy(detail)}>Copy value</button>
      </dialog>
    </section>
  );
}
