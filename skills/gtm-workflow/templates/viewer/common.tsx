import { CONTRACT_VERSION } from "../lib/viewer-contract";
import React, { useEffect, useState } from "react";
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
export function useRead(op: string, enabled = true) {
  useLocation();
  const p = query();
  for (const name of ["node", "step", "expanded", "columns"]) p.delete(name);
  if (op !== "events") p.delete("eventCursor");
  if (["meta", "workflow"].includes(op))
    for (const key of [...p.keys()])
      if (!["workflow", "preview"].includes(key)) p.delete(key);
  const key = JSON.stringify([op, enabled, p.toString()]);
  const [state, setState] = useState<any>({ loading: true });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>,
      expiry: ReturnType<typeof setTimeout>;
    let busy = false,
      delay = 3000;
    setState((old: any) =>
      old.key === key && old.data
        ? { ...old, loading: false }
        : { key, loading: true },
    );
    const read = async () => {
      if (busy || controller.signal.aborted || document.hidden) return;
      busy = true;
      clearTimeout(timer);
      try {
        const data = await api(op, {}, undefined, undefined, controller.signal);
        if (controller.signal.aborted) return;
        setState({ key, data, loading: false, at: Date.now() });
        delay =
          data.run && ["pending", "running"].includes(data.run.status)
            ? 3000
            : 15000;
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
        setState((old: any) => ({
          ...(denied ? {} : old),
          key,
          loading: false,
          error: (error as Error).message,
        }));
        delay = Math.min(delay * 2, 60000);
      } finally {
        busy = false;
        if (!controller.signal.aborted)
          timer = setTimeout(read, shared ? 10000 : delay);
      }
    };
    read();
    window.addEventListener("focus", read);
    document.addEventListener("visibilitychange", read);
    return () => {
      controller.abort();
      clearTimeout(timer);
      clearTimeout(expiry);
      window.removeEventListener("focus", read);
      document.removeEventListener("visibilitychange", read);
    };
  }, [op, enabled, key, retry]);
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
