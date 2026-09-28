import React, { lazy, Suspense, useRef, useState } from "react";
import { CheckCircleIcon, ClockIcon, XCircleIcon } from "@heroicons/react/16/solid";
import { State, useRead } from "./common";
import "../connections-ui/style.css";
const ConnectionForm = lazy(() => import("./connection-form"));

type Connection = { variable: string; provider?: string; state: "set" | "provided" | "saved" | "missing" };
const icons = { set: CheckCircleIcon, provided: CheckCircleIcon, saved: ClockIcon, missing: XCircleIcon };

/**
 * A workflow's Connections tab (owner pages only): each key the workflow declares and whether it is set where this
 * viewer runs, by name, never a value. A missing key is added here with the Keys page's own form, or on that page.
 */
export default function Connections({ environment }: { environment?: string }) {
  const state = useRead("connections"),
    data = state.data;
  const local = environment === "local";
  const [adding, setAdding] = useState<Connection | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const label = (c: Connection) =>
    c.state === "set" ? "Set"
      : c.state === "provided" ? "Provided by Vercel"
      : c.state === "saved" ? (local ? "Saved, restart npm run dev" : "Saved, going live")
      : "Missing";
  const where = local ? "on this computer" : "in Production";
  const close = () => {
    setAdding(null);
    requestAnimationFrame(() => trigger.current?.focus());
  };
  const connections: Connection[] = data?.connections ?? [];
  const missing = connections.filter((c) => c.state === "missing").length,
    pending = connections.some((c) => c.state === "saved");
  return (
    <div className="connections-tab">
      <State state={state} />
      {data && (
        <>
          <div className="title-row">
            <div>
              <h2 className="sr-only">Connections</h2>
              <p role="status">
                {!data.declared
                  ? "This workflow doesn't list the keys it uses yet."
                  : !connections.length
                    ? "This workflow uses no keys."
                    : missing
                      ? `${missing} of ${connections.length} ${connections.length === 1 ? "key isn't" : "keys aren't"} set ${where}.`
                      : pending
                        ? local ? "Restart npm run dev to use the keys you saved." : "The keys you saved go live in about a minute."
                        : `Every key this workflow uses is set ${where}.`}
              </p>
            </div>
            {data.connectionsUrl ? (
              <a className="button" href={data.connectionsUrl}>All connections</a>
            ) : data.vercelUrl ? (
              <a className="button" href={data.vercelUrl} target="_blank" rel="noopener noreferrer">Open in Vercel</a>
            ) : null}
          </div>
          {missing > 0 && !data.canSet && !data.vercelUrl && (
            <p className="muted connections-hint">Add missing keys in the project's environment variables on Vercel.</p>
          )}
          {!data.declared && (
            <p className="notice">Ask your agent to declare this workflow's connections, then they show here with whether each is set.</p>
          )}
          {connections.length > 0 && (
            <div className="connection-list">
              {connections.map((c) => {
                const Icon = icons[c.state];
                return (
                  <div className="connection-row connection-usage-row" key={c.variable}>
                    <div className="connection-name">
                      <h3>{c.provider ?? c.variable}</h3>
                      {c.provider && <p className="muted connection-variable">{c.variable}</p>}
                    </div>
                    <span className="connection-state" data-state={c.state}>
                      <Icon aria-hidden="true" className="connection-icon" />
                      {label(c)}
                    </span>
                    {c.state === "missing" && data.canSet ? (
                      <button
                        type="button"
                        className="primary"
                        aria-label={`Add ${c.provider ?? c.variable}`}
                        onClick={(event) => {
                          trigger.current = event.currentTarget;
                          setAdding(c);
                        }}
                      >
                        Add
                      </button>
                    ) : (
                      <span aria-hidden="true" />
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {adding && (
            <Suspense fallback={null}>
              <ConnectionForm
                key={adding.variable}
                variable={adding.variable}
                provider={adding.provider}
                close={close}
                saved={() => state.retry()}
              />
            </Suspense>
          )}
        </>
      )}
    </div>
  );
}
