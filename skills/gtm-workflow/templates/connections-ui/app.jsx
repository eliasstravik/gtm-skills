import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ArrowPathIcon, EllipsisHorizontalIcon, XCircleIcon } from "@heroicons/react/16/solid";
import { initialize, request, localMode } from "./transport.mjs";
import { EntryForm, message } from "./entry-form.jsx";
import "@fontsource-variable/geist/index.css";
import "../viewer/style.css";
import "./style.css";
const applicationStorage = "gtm-connections-application";
function readPending() {
  try { const value = JSON.parse(localStorage.getItem(applicationStorage)); return typeof value?.id === "string" ? { id: value.id, state: "pending" } : null; } catch { return null; }
}
function App() {
  const [inventory, setInventory] = useState(null), [error, setError] = useState(""), [selection, setSelection] = useState(null), [loading, setLoading] = useState(true);
  const trigger = useRef(null);
  const [pendingApply, setPendingApply] = useState(readPending), [retrying, setRetrying] = useState(false);
  // Local only: a saved change is used from the next `npm run dev`.
  const [restart, setRestart] = useState(false);
  useEffect(() => { document.documentElement.dataset.environment = localMode ? "local" : "production"; }, []);
  function rememberApply(value) {
    setPendingApply(value);
    try { if (value) localStorage.setItem(applicationStorage, JSON.stringify({ id: value.id })); else localStorage.removeItem(applicationStorage); } catch { /* Status still works when browser storage is disabled. */ }
  }
  function beginApply(id) { rememberApply({ id, state: "saving" }); }
  function failedApply(id, failure) {
    if (failure.status && failure.status < 500) rememberApply(null);
    else rememberApply({ id, state: "pending" });
  }
  const application = pendingApply?.state === "saving" ? { state: "applying" } :
    inventory?.application?.state === "applying" ? inventory.application :
    pendingApply && inventory?.application?.id !== pendingApply.id ? { state: "failed" } : inventory?.application;
  const applying = application?.state === "applying";
  async function updated(result, id) {
    if (result.restartRequired) setRestart(true);
    if (id) rememberApply({ id, state: "pending" });
    if (result.application) setInventory((current) => current ? { ...current, application: result.application } : current);
    try { await refresh(); } catch { setError("vercel_unavailable"); }
  }
  async function retryApply() {
    setRetrying(true); setError("");
    const id = pendingApply?.id ?? application?.id ?? crypto.randomUUID();
    beginApply(id);
    try { const result = await request("/api/connections", { action: "apply", id }); await updated(result, id); }
    catch (failure) { rememberApply({ id, state: "pending" }); setError(failure.message); }
    finally { setRetrying(false); }
  }
  useEffect(() => {
    if (pendingApply && inventory?.application?.id === pendingApply.id && inventory.application.state === "applied") rememberApply(null);
  }, [inventory?.application?.id, inventory?.application?.state]);
  useEffect(() => {
    if (localMode || pendingApply?.state === "saving" || (!applying && !pendingApply)) return;
    // Reads only. Closing the tab does not stop Vercel's update.
    let stopped = false, timer, inactivePolls = 0;
    const poll = async () => {
      try { const next = await request("/api/connections"); if (!stopped) { setInventory(next); setError(""); }
        if (next.application?.state !== "applying" && ++inactivePolls >= 6) return; }
      catch { if (!stopped) setError("vercel_unavailable"); if (++inactivePolls >= 6) return; }
      if (!stopped) timer = setTimeout(poll, 5000);
    };
    timer = setTimeout(poll, 5000);
    return () => { stopped = true; clearTimeout(timer); };
  }, [applying, pendingApply?.id, pendingApply?.state]);
  function select(event, value) {
    const menu = event.currentTarget.closest("details");
    trigger.current = menu?.querySelector("summary") ?? event.currentTarget;
    if (menu) menu.open = false;
    setSelection(value);
  }
  function closeEntry() { setSelection(null); requestAnimationFrame(() => trigger.current?.focus()); }
  async function refresh() {
    setInventory(await request("/api/connections"));
  }
  async function start() {
    setLoading(true); setError("");
    try { await initialize(); await refresh(); } catch (failure) { setInventory(null); setSelection(null); setError(failure.message); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    start();
    const restore = (event) => { if (event.persisted) { setSelection(null); start(); } };
    const hide = () => setSelection(null);
    const dismissMenus = (event) => {
      for (const menu of document.querySelectorAll(".connection-menu[open]")) {
        if (!menu.contains(event.target)) menu.open = false;
      }
    };
    document.addEventListener("click", dismissMenus);
    window.addEventListener("pageshow", restore); window.addEventListener("pagehide", hide);
    return () => { document.removeEventListener("click", dismissMenus); window.removeEventListener("pageshow", restore); window.removeEventListener("pagehide", hide); };
  }, []);
  const workflowsUrl = inventory?.workflowsUrl;
  // A workflow's own Connections tab, where its keys are listed with whether each is set.
  const workflowHref = (id) => { if (!workflowsUrl) return "#"; const url = new URL(workflowsUrl, location.origin); url.searchParams.set("workflow", id); url.searchParams.set("view", "connections"); return url.href; };
  const workflowLinks = (list) => <>{list.slice(0, 3).map((workflow, index) => <React.Fragment key={workflow.id ?? workflow.workflowId}>{index ? ", " : ""}<a href={workflowHref(workflow.id ?? workflow.workflowId)}>{workflow.title}</a></React.Fragment>)}{list.length > 3 ? ` and ${list.length - 3} more` : ""}</>;
  return <main className="workspace">
    <nav className="tabs root-navigation" aria-label="Workspace"><a href={workflowsUrl ?? "#"} aria-disabled={!inventory} onClick={(event) => { if (!inventory) event.preventDefault(); }}>Workflows</a><a href={workflowsUrl ? (() => { const url = new URL(workflowsUrl, location.origin); url.searchParams.set("view", "data"); return url.href; })() : "#"} aria-disabled={!inventory} onClick={(event) => { if (!inventory) event.preventDefault(); }}>Data</a><a href="/connections" aria-current="page">Connections</a></nav>
    <div className="title-row"><div><div className="environment-title"><h1>Connections</h1><span className="environment-badge" data-environment={localMode ? "local" : "production"} title={localMode ? "Keys for runs on this computer" : "Keys for the deployed copy on Vercel"}>{localMode ? "Local" : "Production"}</span></div>{inventory?.workspaceName ? <p className="muted">{inventory.workspaceName}</p> : null}</div>
      {inventory ? <div className="connection-actions"><button type="button" className="icon-button" aria-label="Refresh connections" title="Refresh connections" disabled={loading} onClick={start}><ArrowPathIcon aria-hidden="true" className="connection-icon" /></button>{inventory.vercelUrl ? <a className="button" href={inventory.vercelUrl} target="_blank" rel="noopener noreferrer">Open in Vercel</a> : null}
        {inventory.canWrite ? <button type="button" className="primary" onClick={(event) => select(event, { action: "add" })}>Add connection</button> : null}</div> : null}
    </div>
    {loading && !inventory ? <p className="muted" role="status">Loading connections…</p> : null}
    {error ? <div className="notice" role="alert"><p>{message(error)}</p></div> : null}
    {inventory ? <>
      {inventory.mode === "production" && application && ["failed", "unknown"].includes(application.state) ? <div className="notice application-notice" role={application.state === "failed" ? "alert" : "status"}>
        <span>{application.state === "unknown" ? "Unable to check whether changes have applied. Refresh to try again." : "Couldn’t apply changes. Review your saved connections, then retry."}</span>
        {application.state === "failed" ? <button type="button" disabled={retrying} onClick={retryApply}>{retrying ? "Retrying…" : "Retry"}</button> : null}
      </div> : null}
      {!inventory.canWrite ? <p className="notice">Read-only access. A project owner or member can change Production connections.</p> : null}
      {inventory.missing?.length ? <section className="connection-missing" aria-labelledby="missing-title">
        <h2 id="missing-title">Missing</h2>
        <p className="muted">Workflows use these keys, but none is set {localMode ? "on this computer" : "in Production"}.</p>
        <div className="connection-list">{inventory.missing.map((row) => <div className="connection-row" key={row.variable}>
          <div className="connection-name"><h3><XCircleIcon aria-hidden="true" className="connection-icon connection-state-icon" data-state="missing" />{row.provider ?? row.variable}</h3>{row.provider ? <p className="muted connection-variable">{row.variable}</p> : null}
            <p className="muted connection-usage">Needed by {workflowLinks(row.workflows)}</p></div>
          {inventory.canWrite ? <button type="button" onClick={(event) => select(event, { action: "add", preset: row.variable, presetLabel: row.provider })} aria-label={`Add ${row.provider ?? row.variable}`}>Add</button> : null}
        </div>)}</div>
      </section> : null}
      {inventory.missing?.length ? <h2 className="connection-saved-title">Saved</h2> : null}
      <div className="connection-list">{inventory.connections.filter((row) => row.platformIdentity || row.fields.some((field) => field.state !== "disconnected")).map((row) => <div className="connection-row" key={row.id}>
        <div className="connection-name"><h2>{row.name}</h2><p className="muted connection-variable">{row.fields.map((field) => field.variable).join(", ")}</p>
          {row.status && row.status !== "Saved" ? <p className="muted connection-status">{row.status}</p> : null}
          {row.usage?.length ? <p className="muted connection-usage">Used by {workflowLinks(row.usage)}</p> : row.usageComplete ? <p className="muted connection-usage">Not used by any workflow</p> : null}
</div>
        {inventory.canWrite && row.fields.length ? <details className="connection-menu"><summary className="icon-button" aria-label={`Actions for ${row.name}`} title="Connection actions"><EllipsisHorizontalIcon aria-hidden="true" className="connection-icon" /></summary><div>{row.fields.map((field) => <React.Fragment key={field.variable}>
          {field.editable ? <><button type="button" onClick={(event) => select(event, { action: "replace", row, field })}>Edit</button><button type="button" className="danger-text" onClick={(event) => select(event, { action: "disconnect", row, field })}>Delete</button></> : inventory.vercelUrl ? <a href={inventory.vercelUrl} target="_blank" rel="noopener noreferrer">Open in Vercel</a> : <span className="muted">Read only</span>}
        </React.Fragment>)}</div></details> : null}
      </div>)}</div>
      {!inventory.connections.some((row) => row.platformIdentity || row.fields.some((field) => field.state !== "disconnected")) ? <p className="notice">No connections yet. Add an API key to get started.</p> : null}
      {localMode ? <p className="muted connection-store">{inventory.linked
        ? "Saved in workflows/.env.local on this computer only. `vercel env pull` replaces this file with the project's Development variables."
        : "Saved in workflows/.env.local on this computer."} Changes apply the next time you start npm run dev.</p> : null}
      {restart ? <div className="notice" role="status"><p>Saved. Restart npm run dev to use it in runs.</p></div> : null}
      {selection ? <EntryForm key={`${selection.action}-${selection.field?.variable ?? selection.preset ?? "new"}`} selection={selection} inventory={inventory} close={closeEntry} updated={updated} beginApply={beginApply} failedApply={failedApply} /> : null}
    </> : null}
  </main>;
}
createRoot(document.getElementById("root")).render(<App />);
