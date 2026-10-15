import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { LIST_WINDOW_ROWS, MAX_LIST_ROWS } from "../lib/viewer-contract";
import { api } from "./common";

/**
 * The Data grid shows a whole table as one scrolling list, without pages, and reads only the rows near the screen.
 *
 * The list is as tall as the matching row count, so the scrollbar spans the table. Rows arrive in windows read at an
 * `offset` (lib/data-api.ts); rows not read yet show as placeholders until the scroll settles near them. Only the rows
 * on screen and a few around them are in the DOM, so a table of any size stays a few dozen rows of markup.
 *
 * Every row read is Neon data transfer (lib/read-budgets.ts): a table is read as far as someone scrolls, once. When
 * the database moves, the pulse re-reads only the rows on screen; rows read before are dropped and read again only if
 * someone scrolls back to them.
 */
export type Cell = { value: unknown; href?: string; folded?: { entries?: number } };
type Row = { key: string; cells: Cell[] };
type Page = { rows: Cell[][]; keys: string[]; offset: number; total: number };

/** Rows kept rendered above and below the screen, so arrow keys and short scrolls find them. */
const OVERSCAN = 10;
/** Row height until one is measured; the stylesheet fixes rows at 36px plus a border unless a value is expanded. */
const ESTIMATE = 37;
/** Reads for rows wait until the scroll rests this long, so dragging the scrollbar across a table reads nothing. */
const SETTLE_MS = 120;

/** `page` is the view's latest read (useRead); `viewKey` names the view, and changes with its table, search, filter, sort or columns. */
export function useRows(viewKey: string, scroller: RefObject<HTMLElement | null>, page: Page | undefined) {
  const [screen, setScreen] = useState({ first: 0, last: Math.ceil(innerHeight / ESTIMATE) });
  const [arrived, redraw] = useState(0);
  const store = useRef({
    page: undefined as Page | undefined,
    rows: [] as (Row | undefined)[],
    pending: new Set<number>(),
    generation: 0,
    heights: new Map<number, number>(),
    key: viewKey,
    top: false,
    abort: new AbortController(),
    failed: false,
  }).current;
  const screenRef = useRef(screen);
  screenRef.current = screen;
  // A new table, search, filter, sort or column choice starts at the top, before the read for it is sent.
  if (store.key !== viewKey) {
    store.key = viewKey;
    store.heights.clear();
    store.top = true;
    screenRef.current = { first: 0, last: screen.last - screen.first };
  }

  /** Parameters for the view's own read (useRead): the rows on screen and around them, or a first chunk. */
  const request = () => {
    const { first, last } = screenRef.current;
    const offset = Math.max(0, first - OVERSCAN);
    return { offset: String(offset), limit: String(Math.min(MAX_LIST_ROWS, Math.max(last - first + 1 + 2 * OVERSCAN, 40))) };
  };

  // A fresh read of the view replaces every row held, since any of them may have changed.
  if (page && store.page !== page) {
    store.page = page;
    store.generation++;
    store.abort.abort();
    store.abort = new AbortController();
    store.pending.clear();
    store.failed = false;
    store.rows = new Array(page.total);
    page.rows.forEach((cells, i) => (store.rows[page.offset + i] = { key: page.keys[i], cells }));
  }

  const total = store.rows.length;
  const heights = store.heights;
  const [layoutVersion, setLayoutVersion] = useState(0);
  // Where each row starts. Rows keep their measured height; unmeasured rows use the estimate.
  const starts = useMemo(() => {
    const out = new Float64Array(total + 1);
    for (let i = 0; i < total; i++) out[i + 1] = out[i] + (heights.get(i) ?? ESTIMATE);
    return out;
  }, [total, layoutVersion, store.page, viewKey]);
  const indexAt = (y: number) => {
    let low = 0,
      high = total;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (starts[mid + 1] <= y) low = mid + 1;
      else high = mid;
    }
    return Math.min(low, Math.max(0, total - 1));
  };

  // Track the rows on screen as the table scrolls or resizes.
  const measureScreen = () => {
    const box = scroller.current;
    if (!box) return;
    const header = box.querySelector("thead")?.getBoundingClientRect().height ?? ESTIMATE;
    const first = indexAt(Math.max(0, box.scrollTop - header));
    const last = indexAt(box.scrollTop + box.clientHeight - header);
    if (first !== screenRef.current.first || last !== screenRef.current.last) setScreen({ first, last });
  };
  useEffect(() => {
    const box = scroller.current;
    if (!box) return;
    box.addEventListener("scroll", measureScreen, { passive: true });
    const observer = new ResizeObserver(measureScreen);
    observer.observe(box);
    return () => {
      box.removeEventListener("scroll", measureScreen);
      observer.disconnect();
    };
  });

  // After each draw: go to the top for a new view, and record the height of every drawn row.
  useLayoutEffect(() => {
    const box = scroller.current;
    if (!box) return;
    if (store.top) {
      store.top = false;
      box.scrollTop = 0;
    }
    let moved = false;
    for (const row of box.querySelectorAll<HTMLElement>("tr[data-index]")) {
      const index = Number(row.dataset.index),
        height = row.getBoundingClientRect().height;
      if (height && Math.abs((heights.get(index) ?? ESTIMATE) - height) > 0.5) {
        heights.set(index, height);
        moved = true;
      }
    }
    if (moved) setLayoutVersion((n) => n + 1);
  });

  // Once the scroll rests, read the rows missing from the screen and one screen below it.
  useEffect(() => {
    if (!store.page || store.failed) return;
    const timer = setTimeout(() => {
      const { first, last } = screenRef.current;
      const from = Math.max(0, first - OVERSCAN),
        to = Math.min(store.rows.length, last + 1 + (last - first + 1));
      for (let i = from; i < to; i++) {
        if (store.rows[i] || store.pending.has(i)) continue;
        read(i);
        break;
      }
    }, SETTLE_MS);
    return () => clearTimeout(timer);
    // Only a move of the screen, a new read or arrived rows restart the wait; a selection or a keypress does not.
  }, [screen.first, screen.last, store.page, arrived]);

  async function read(offset: number) {
    const generation = store.generation,
      signal = store.abort.signal;
    const size = Math.min(LIST_WINDOW_ROWS, store.rows.length - offset);
    for (let i = offset; i < offset + size; i++) store.pending.add(i);
    try {
      const chunk: Page = await api("data", { offset: String(offset), limit: String(size) }, undefined, undefined, signal);
      if (generation !== store.generation) return;
      // The count moved: a write landed since the view was read. The pulse re-reads the view shortly.
      if (chunk.total !== store.rows.length) store.rows.length = chunk.total;
      chunk.rows.forEach((cells, i) => (store.rows[offset + i] = { key: chunk.keys[i], cells }));
    } catch {
      if (generation !== store.generation) return;
      // Stop reading ahead until the next refresh, instead of retrying a failing read on every scroll.
      store.failed = true;
    } finally {
      if (generation === store.generation) {
        for (let i = offset; i < offset + size; i++) store.pending.delete(i);
        redraw((n) => n + 1);
      }
    }
  }
  useEffect(() => () => store.abort.abort(), []);

  const start = Math.max(0, screen.first - OVERSCAN),
    end = Math.min(total, screen.last + 1 + OVERSCAN);
  return {
    request,
    rows: store.rows,
    total,
    start,
    end,
    before: starts[start] ?? 0,
    after: (starts[total] ?? 0) - (starts[end] ?? 0),
    failed: store.failed,
    loading: store.pending.size > 0,
    /** Scroll a row into the drawn window, for keyboard movement past the edge of what is drawn. */
    reveal(index: number) {
      const box = scroller.current;
      if (!box) return;
      const header = box.querySelector("thead")?.getBoundingClientRect().height ?? ESTIMATE;
      const top = starts[index] + header,
        bottom = starts[index + 1] + header;
      if (top - header < box.scrollTop) box.scrollTop = top - header;
      else if (bottom > box.scrollTop + box.clientHeight) box.scrollTop = bottom - box.clientHeight;
    },
  };
}
