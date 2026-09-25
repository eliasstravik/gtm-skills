import { CONTRACT_VERSION } from "../lib/viewer-contract";
import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { query, shared, token, useLocation } from "./navigation";
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api(
  op: string,
  extra: Record<string, string> = {},
  body?: unknown,
  csrf?: string,
  signal?: AbortSignal,
) {
  const p = query();
  p.set("op", op);
  p.set("v", String(CONTRACT_VERSION));
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  const res = await fetch(`/api/viewer?${p}`, {
    method: body ? "POST" : "GET",
    cache: "no-store",
    signal,
    headers: {
      ...(shared ? { "x-gtm-share-token": token } : {}),
      ...(body
        ? { "content-type": "application/json", "x-gtm-csrf": csrf ?? "" }
        : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok)
    throw new ApiError(data.error?.message ?? "View unavailable.", res.status);
  if (data.version !== CONTRACT_VERSION)
    throw new ApiError(
      "Update required. Reload after both deployments are ready.",
      409,
    );
  return data;
}
/**
 * One cheap check for every open view, instead of each view re-reading on a timer. The server answers with short
 * fingerprints (lib/viewer-pulse.ts) and a view reads again only when the one it depends on moves. The pulse pauses
 * while the tab is hidden or nobody has used the page for half an hour, so a forgotten tab neither reads nor keeps the
 * database awake; showing the tab or touching the page checks at once.
 */
type Pulse = { deployment?: string | null; registry?: string; data?: string; down?: boolean };
const PULSE_MS = shared ? 10000 : 5000,
  IDLE_MS = 30 * 60000;
let pulse: Pulse = {},
  pulseTimer: ReturnType<typeof setTimeout> | undefined,
  beating = false,
  started = false,
  failures = 0,
  lastInput = Date.now();
const pulseListeners = new Set<() => void>();
function setPulse(next: Pulse) {
  if ((["deployment", "registry", "data", "down"] as const).every((k) => next[k] === pulse[k])) return;
  pulse = next;
  pulseListeners.forEach((fn) => fn());
}
/** A new deployment brings new page code. Reload for it, but never under an open dialog or menu. */
function reloadWhenIdle() {
  if (document.querySelector("dialog[open], [popover]:popover-open")) return false;
  location.reload();
  return true;
}
async function beat() {
  clearTimeout(pulseTimer);
  if (beating || document.hidden || Date.now() - lastInput > IDLE_MS) return;
  beating = true;
  try {
    const next = await api("pulse");
    failures = 0;
    const moved = pulse.deployment && next.deployment && next.deployment !== pulse.deployment;
    if (moved && reloadWhenIdle()) return;
    // Until the reload can happen, keep the old deployment so the next pulse tries again.
    setPulse({ deployment: moved ? pulse.deployment : next.deployment, registry: next.registry, data: next.data });
  } catch {
    failures++;
    // The views read once more and show why, next to the time of what is still on screen.
    setPulse({ ...pulse, down: true });
  } finally {
    beating = false;
    pulseTimer = setTimeout(beat, failures ? Math.min(PULSE_MS * 2 ** failures, 60000) : PULSE_MS);
  }
}
function startPulse() {
  started = true;
  const awake = () => {
    const idle = Date.now() - lastInput > IDLE_MS;
    lastInput = Date.now();
    if (idle) beat();
  };
  for (const name of ["pointerdown", "keydown", "wheel", "touchstart"])
    window.addEventListener(name, awake, { capture: true, passive: true });
  window.addEventListener("focus", beat);
  document.addEventListener("visibilitychange", beat);
  beat();
}
export function usePulse() {
  return useSyncExternalStore(
    (fn) => {
      pulseListeners.add(fn);
      if (!started) startPulse();
      return () => {
        pulseListeners.delete(fn);
      };
    },
    () => pulse,
  );
}
/** Data re-reads on a pulse at most this often, however fast a run writes: never more than the old polling read. */
const DATA_MS = 15000;
export function useRead(op: string, enabled = true) {
  useLocation();
  const p = query();
  for (const name of ["node", "step", "expanded"]) p.delete(name);
  if (op === "list") for (const key of [...p.keys()]) p.delete(key);
  // Data columns are projected by the API, so Apply must trigger a new read.
  if (op !== "data") p.delete("columns");
  if (op !== "events") p.delete("eventCursor");
  if (["meta", "workflow"].includes(op))
    for (const key of [...p.keys()])
      if (!["workflow", "preview"].includes(key)) p.delete(key);
  const key = JSON.stringify([op, enabled, p.toString()]);
  const [state, setState] = useState<any>({ loading: true });
  const [retry, setRetry] = useState(0);
  // What must move before this view reads again: the registry for every view, data for tables. Runs live in the
  // workflow runtime, not in Postgres, so the runs list also keeps its own timer.
  const current = usePulse();
  const cause = JSON.stringify([current.registry, current.down, op === "data" ? current.data : null]);
  const reread = useRef<() => void>(undefined);
  const baseline = useRef(current.registry === undefined ? undefined : cause);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>,
      expiry: ReturnType<typeof setTimeout>;
    let busy = false,
      again = false,
      failed = false,
      at = 0,
      delay = 3000;
    setState((old: any) =>
      old.key === key && old.data
        ? { ...old, loading: false }
        : { key, loading: true },
    );
    const read = async () => {
      if (controller.signal.aborted || document.hidden) return;
      // A change that lands during a read is read once that read is done.
      if (busy) return void (again = true);
      busy = true;
      again = false;
      clearTimeout(timer);
      let next: number | undefined;
      try {
        const data = await api(op, {}, undefined, undefined, controller.signal);
        if (controller.signal.aborted) return;
        at = Date.now();
        failed = false;
        delay = 3000;
        setState({ key, data, loading: false, at });
        if (op === "runs")
          next = data.data?.some((r: any) => ["pending", "running"].includes(r.status)) ? 3000 : 15000;
        clearTimeout(expiry);
        if (data.expiresAt)
          expiry = setTimeout(
            () =>
              setState({
                key,
                loading: false,
                error: "This link expired. Ask the sender for a new link.",
              }),
            Math.min(2147483647, Math.max(0, data.expiresAt - Date.now())),
          );
      } catch (error) {
        if (controller.signal.aborted) return;
        const denied =
          error instanceof ApiError &&
          [401, 403, 404, 409, 410].includes(error.status);
        failed = true;
        setState((old: any) => ({
          ...(denied ? {} : old),
          key,
          loading: false,
          error: (error as Error).message,
        }));
        next = delay = Math.min(delay * 2, 60000);
      } finally {
        busy = false;
        if (!controller.signal.aborted && (again || next !== undefined))
          timer = setTimeout(read, again ? 0 : next);
      }
    };
    reread.current = () => {
      clearTimeout(timer);
      timer = setTimeout(read, op === "data" ? Math.max(0, at + DATA_MS - Date.now()) : 0);
    };
    // Showing the tab again re-reads only what cannot wait for the pulse: runs, a view that failed, and one that
    // opened in a hidden tab and never read.
    const shown = () => {
      if (!document.hidden && (op === "runs" || failed || !at)) read();
    };
    read();
    document.addEventListener("visibilitychange", shown);
    return () => {
      controller.abort();
      clearTimeout(timer);
      clearTimeout(expiry);
      reread.current = undefined;
      document.removeEventListener("visibilitychange", shown);
    };
  }, [op, enabled, key, retry]);
  useEffect(() => {
    // The first pulse after the page opens only sets the baseline: the view's first read is at least as new.
    if (baseline.current === undefined) {
      if (current.registry !== undefined || current.down) baseline.current = cause;
      return;
    }
    if (baseline.current === cause) return;
    baseline.current = cause;
    reread.current?.();
  }, [cause]);
  return {
    ...(state.key === key && enabled ? state : { loading: enabled }),
    retry: () => setRetry((n) => n + 1),
  };
}
export const time = (value: string | number) =>
  value
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "Unavailable";
export function Status({ value }: { value: string }) {
  return <span className={`status status-${value}`}>{value}</span>;
}
export function State({ state }: any) {
  return state.loading ? (
    <p role="status" className="notice">
      Loading…
    </p>
  ) : state.error ? (
    <p role="alert" className="notice error">
      {state.data ? `Showing data from ${time(state.at)}. ` : ""}
      {state.error} <button onClick={state.retry}>Retry</button>
    </p>
  ) : null;
}
export function Payload({ label, value }: any) {
  if (shared || query().has("preview")) return null;
  return (
    <details className="payload">
      <summary>{label}</summary>
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
    </details>
  );
}
export function Search({
  value,
  onChange,
  label = "Search",
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  const [text, setText] = useState(value);
  useEffect(() => {
    setText(value);
  }, [value]);
  useEffect(() => {
    if (text === value) return;
    const timer = setTimeout(() => onChange(text), 250);
    return () => clearTimeout(timer);
  }, [text, value, onChange]);
  return (
    <input
      type="search"
      aria-label={label}
      placeholder={label}
      value={text}
      onChange={(e) => setText(e.target.value)}
    />
  );
}
