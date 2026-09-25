import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CONTRACT_VERSION } from "../lib/viewer-contract";
import { href, navigate, query, shared, token } from "./navigation";
import { api, Search, State, time, useRead } from "./common";
import { webUrl } from "./web-url";
import { ColumnChooser } from "./column-chooser";
import { useRows } from "./rows";
const valueText = (value: unknown) =>
  value == null
    ? ""
    : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);
function CellValue({ value }: { value: unknown }) {
  if (value !== null && typeof value === "object")
    return (
      <details className="structured-value">
        <summary>
          {Array.isArray(value)
            ? `${value.length} ${value.length === 1 ? "entry" : "entries"}`
            : "View details"}
        </summary>
        <StructuredValue value={value} />
      </details>
    );
  const url = webUrl(value);
  if (url)
    return (
      <a
        className="cell-link"
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        tabIndex={-1}
        aria-label={`${valueText(value)} (opens in a new tab)`}
      >
        {valueText(value)}
      </a>
    );
  return value == null ? (
    <span className="muted">NULL</span>
  ) : (
    <>{valueText(value)}</>
  );
}
function StructuredValue({ value }: { value: unknown }): React.ReactNode {
  if (Array.isArray(value))
    return (
      <ol>
        {value.map((item, i) => (
          <li key={i}>
            {item && typeof item === "object" ? (
              <details>
                <summary>
                  {[
                    item.title ?? item.name ?? item.school_name,
                    item.company_name,
                  ]
                    .filter(Boolean)
                    .join(" · ") || `Entry ${i + 1}`}
                </summary>
                <StructuredValue value={item} />
              </details>
            ) : (
              <CellValue value={item} />
            )}
          </li>
        ))}
      </ol>
    );
  if (value && typeof value === "object")
    return (
      <dl>
        {Object.entries(value)
          .filter(([, item]) => item != null)
          .map(([key, item]) => (
            <React.Fragment key={key}>
              <dt>{key.replaceAll("_", " ")}</dt>
              <dd>
                {item && typeof item === "object" ? (
                  <details>
                    <summary>Details</summary>
                    <StructuredValue value={item} />
                  </details>
                ) : (
                  <CellValue value={item} />
                )}
              </dd>
            </React.Fragment>
          ))}
      </dl>
    );
  return <CellValue value={value} />;
}
export default function Data({ destinations }: any) {
  const p = query();
  // What the rows depend on; paging parameters from older links are not part of it.
  const viewKey = new URLSearchParams(
    [...p].filter(([name]) => !["node", "step", "expanded", "eventCursor", "page", "offset", "limit"].includes(name)),
  ).toString();
  const request = useRef<() => Record<string, string>>(undefined);
  const state = useRead("data", true, () => request.current?.() ?? {});
  // While a new search or table loads, the toolbar and the old rows stay, so typing is never interrupted.
  const kept = useRef<any>(undefined);
  if (state.data) kept.current = state.data;
  const d = state.error && !state.data ? undefined : kept.current;
  const scroller = useRef<HTMLDivElement>(null);
  const list = useRows(viewKey, scroller, d?.unavailable ? undefined : d);
  request.current = list.request;
  const focusAfterDraw = useRef<[number, number] | null>(null);
  const [message, setMessage] = useState(""),
    [exporting, setExporting] = useState(false);
  const [selected, setSelected] = useState<[number, number] | null>(null),
    [widths, setWidths] = useState<Record<number, number>>({});
  const [detail, setDetail] = useState<unknown>("");
  const grid = useRef<HTMLTableElement>(null),
    popover = useRef<HTMLDialogElement>(null),
    origin = useRef<HTMLElement | null>(null);
  const abort = useRef<AbortController | null>(null);
  const visible = d?.fields?.map((f: any) => f.id) ?? [];
  /**
   * A cell's whole value. A list leaves JSON values in the database (`folded`), so opening or copying one reads that
   * single record's column, only for this record and only when asked.
   */
  async function whole(row: number, column: number) {
    const record = list.rows[row],
      c = record?.cells[column];
    if (!c?.folded) return c?.value;
    setMessage("Loading value…");
    const read = await api("data", {
      key: record!.key,
      columns: d.fields[column].id,
      q: "",
      field: "",
      offset: "0",
      limit: "1",
    });
    setMessage("");
    if (!read.rows?.length) throw Error("This record changed. Refresh to see it.");
    return read.rows[0][0].value;
  }
  async function open(row: number, column: number, from: HTMLElement) {
    try {
      const value = await whole(row, column);
      origin.current = from;
      setDetail(value);
      popover.current?.showModal();
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
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
      ...(next.has("key") ? { columns: undefined } : {}),
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
  async function download(format: "csv" | "json" = "csv") {
    setExporting(true);
    setMessage("");
    abort.current = new AbortController();
    try {
      const params = query();
      params.set("op", "export");
      params.set("format", format);
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
      anchor.download = `workflow-current-data.${format}`;
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

  const cell = selected && list.rows[selected[0]]?.cells[selected[1]];
  function focusCell(row: number, column: number) {
    const target = grid.current?.querySelector<HTMLElement>(
      `[data-row="${row}"][data-column="${column}"]`,
    );
    if (target) return target.focus();
    // The row is outside the drawn window or not read yet: bring it on screen and focus it once it is drawn.
    focusAfterDraw.current = [row, column];
    list.reveal(row);
  }
  useLayoutEffect(() => {
    if (!focusAfterDraw.current) return;
    const [row, column] = focusAfterDraw.current;
    const target = grid.current?.querySelector<HTMLElement>(
      `[data-row="${row}"][data-column="${column}"]`,
    );
    if (target) {
      focusAfterDraw.current = null;
      target.focus();
    }
  });
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
      <State state={d && !state.error ? { ...state, loading: false } : state} />
      {d &&
        (d.unavailable ? (
          <p className="notice">No configured data for this workflow.</p>
        ) : (
          <>
            <div className="toolbar">
              <select
                name="data-table"
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
                name="filter-field"
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
                    name="filter-operator"
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
              <ColumnChooser key={p.get("table") ?? "default"}
                fields={d.availableFields ?? d.fields} visible={visible}
                onChange={columns => update({ columns: columns?.join(",") })} />
              <button
                disabled={exporting || !list.total}
                onClick={() => download("csv")}
              >
                Export CSV
              </button>
              <button
                disabled={exporting || !list.total}
                onClick={() => download("json")}
              >
                Export JSON
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
                  rel="noopener noreferrer"
                  href={destinations.database.url}
                >
                  {destinations.database.label} ↗
                </a>
              )}
              {cell && (
                <>
                  <button
                    onClick={() =>
                      whole(...selected!).then(copy, (error) => setMessage(error.message))
                    }
                  >
                    Copy cell
                  </button>
                  <button
                    onClick={(e) => open(...selected!, e.currentTarget)}
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
            <div className="table-scroll" ref={scroller}>
              <table
                ref={grid}
                className="data-grid"
                role="grid"
                aria-label={d.title}
                aria-readonly="true"
                aria-rowcount={list.total + 1}
                aria-busy={state.loading || list.loading}
                onKeyDown={(event) => {
                  if (!selected) return;
                  // A key pressed before the last move drew its row moves on from that row, so no press is lost.
                  const [row, column] = focusAfterDraw.current ?? selected;
                  if (
                    event.key === "Enter" &&
                    (event.target as Element).matches('[role="gridcell"]')
                  ) {
                    const anchor = (
                      event.target as HTMLElement
                    ).querySelector<HTMLElement>("a.cell-link, button.folded");
                    if (anchor) {
                      event.preventDefault();
                      anchor.click();
                    }
                  }
                  if (
                    (event.ctrlKey || event.metaKey) &&
                    event.key.toLowerCase() === "c" &&
                    !window.getSelection()?.toString()
                  ) {
                    event.preventDefault();
                    whole(row, column).then(copy, (error) => setMessage(error.message));
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
                      Math.max(0, Math.min(list.total - 1, row + delta[0])),
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
                  <tr aria-rowindex={1}>
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
                  {list.before > 0 && (
                    <tr className="spacer" aria-hidden="true">
                      <td colSpan={d.columns.length + 1} style={{ height: list.before }} />
                    </tr>
                  )}
                  {Array.from({ length: list.end - list.start }, (_, n) => {
                    const i = list.start + n,
                      record = list.rows[i];
                    if (!record)
                      return (
                        <tr key={`missing-${i}`} data-index={i} aria-rowindex={i + 2} className="placeholder">
                          <th scope="row" className="row-number">
                            {i + 1}
                          </th>
                          <td colSpan={d.columns.length} className="muted">
                            {list.failed ? "Rows unavailable. Refresh to try again." : "Loading…"}
                          </td>
                        </tr>
                      );
                    return (
                    <tr key={record.key} data-index={i} aria-rowindex={i + 2}>
                      <th scope="row" className="row-number">
                        {i + 1}
                      </th>
                      {record.cells.map((c, j) => (
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
                          onFocus={(event) => {
                            // Let a nested link finish its click before selection can wrap the toolbar.
                            if (event.target === event.currentTarget)
                              setSelected([i, j]);
                          }}
                        >
                          {c.href ? (
                            <a href={link(c.href)}>{valueText(c.value)}</a>
                          ) : (
                            c.folded ? (
                              <button
                                className="folded"
                                tabIndex={-1}
                                onClick={(e) => open(i, j, e.currentTarget.closest("td")!)}
                              >
                                {c.folded.entries === undefined
                                  ? "View details"
                                  : `${c.folded.entries} ${c.folded.entries === 1 ? "entry" : "entries"}`}
                              </button>
                            ) : (
                              <CellValue value={c.value} />
                            )
                          )}
                        </td>
                      ))}
                    </tr>
                    );
                  })}
                  {list.after > 0 && (
                    <tr className="spacer" aria-hidden="true">
                      <td colSpan={d.columns.length + 1} style={{ height: list.after }} />
                    </tr>
                  )}
                </tbody>
              </table>
              {!list.total && (
                <p className="notice">
                  {p.has("q") || p.has("field")
                    ? "No matching records."
                    : "This table is empty."}
                </p>
              )}
            </div>
            <p className="grid-footer muted">
              {state.loading
                ? "Loading…"
                : `${list.total.toLocaleString()} matching ${list.total === 1 ? "record" : "records"}`}
            </p>
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
        <StructuredValue value={detail} />
        <button onClick={() => copy(detail)}>Copy value</button>
      </dialog>
    </section>
  );
}
