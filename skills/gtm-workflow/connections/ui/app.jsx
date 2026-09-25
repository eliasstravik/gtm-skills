import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ArrowPathIcon, EllipsisHorizontalIcon } from "@heroicons/react/16/solid";
import { initialize, request, clearSession, localMode, integratedMode, tailnetMode } from "./transport.mjs";
import "@fontsource-variable/geist/index.css";
import "../shared/style.css";
import "./style.css";
const messages = {
  private_browser_required: "Open this project's private Workflows URL and sign in through Vercel to manage connections.",
  deployment_protection_required: "Vercel Deployment Protection must be enabled before connections can be managed.",
  access_verification_unavailable: "Vercel access could not be checked. Refresh to try again.",
  use_vercel_settings: "This key has shared or integration settings. Manage it in Vercel to preserve those settings.",
  reopen_connections: "Open Connections from the trusted local command to continue.",
  sign_in_required: "Sign in with Vercel to manage this project's connections.",
  setup_needed: "Connections setup is not complete. Resume setup on the owner's computer.",
  membership_denied: "This account does not have supported access to this project.",
  installation_denied: "The project's integration needs attention. Run Connections Doctor.",
  connection_changed: "This connection changed. Close this form and refresh before trying again.",
  save_outcome_requires_review: "The save outcome is uncertain. Refresh and review its status before entering a replacement.",
  vercel_unavailable: "Update status is temporarily unavailable. Refresh to try again.",
  application_unavailable: "Updates are temporarily unavailable. Refresh and try again.",
  operation_in_progress: "Another change is in progress. Refresh when it finishes.",
  explicit_replacement_required: "The previous save is unresolved. Review its status and explicitly replace it.",
  invalid_provider_variable: "Use letters, numbers and underscores, starting with a letter or underscore. System variables are reserved.",
  invalid_label: "Enter a name of up to 256 characters on one line.",
  replacement_key_required: "Enter a new key value to replace this connection.",
  invalid_key: "Enter a nonempty key on one line.",
  unlock_os_credential_store: "Unlock your OS credential store. Linux requires a running, unlocked Secret Service such as GNOME Keyring.",
  production_not_linked: "This workspace is not linked to its Vercel project yet. Run hosted setup on this computer first.",
  production_unavailable: "Vercel could not be reached. Check that you are signed in to the Vercel CLI (`vercel login`), then try again.",
  production_outcome_unknown: "Vercel did not confirm the push. Open Production Connections to check the key before pushing again.",
  production_key_exists: "Production already has this key. Confirm the replacement to push it.",
  local_key_not_saved: "Save this key here first, then push it.",
  saved_credential_missing: "The key saved on this computer could not be read. Edit it here, then push again.",
};
const message = (code) => messages[code] ?? "Connections could not complete this request. Refresh or run Connections Doctor.";
function EntryForm({ selection, inventory, close, updated, beginApply, failedApply }) {
  const dialog = useRef(null), form = useRef(null), password = useRef(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const deleting = selection.action === "disconnect", editing = Boolean(selection.field);
  const needsKey = !editing || ["external", "unresolved", "unknown", "disconnected"].includes(selection.field?.state);
  useEffect(() => {
    dialog.current.showModal();
    const clear = () => { if (password.current) password.current.value = ""; };
    window.addEventListener("pagehide", clear);
    return () => { clear(); window.removeEventListener("pagehide", clear); };
  }, []);
  function cancel() { if (!busy) { form.current?.reset(); close(); } }
  async function submit(event) {
    event.preventDefault(); setError(""); setBusy(true);
    const data = new FormData(form.current), variable = selection.field?.variable ?? String(data.get("variable")).trim();
    const existing = inventory.connections.flatMap((row) => row.fields).find((field) => field.variable === variable);
    if (selection.action === "add" && existing && existing.state !== "disconnected") {
      setError("This key already exists. Close this form and choose Edit."); setBusy(false); return;
    }
    const value = String(data.get("key") ?? "");
    const body = { id: crypto.randomUUID(), variable, action: selection.action, version: selection.field?.version ?? existing?.version ?? "absent",
      ...(deleting ? {} : { label: String(data.get("label")).trim(), ...(value ? { value } : {}) }),
      ...(data.get("supersede") ? { supersede: true } : {}),
    };
    const applies = inventory.mode === "production" && (deleting || !editing || Boolean(value));
    if (applies) beginApply(body.id);
    try { const result = await request("/api/connections", body); form.current?.reset(); updated(result, applies ? body.id : null); close(); }
    catch (failure) { if (applies) failedApply(body.id, failure); setError(message(failure.message)); }
    finally { body.value = undefined; setBusy(false); }
  }
  return <dialog ref={dialog} aria-labelledby="entry-title" className="connection-dialog" onCancel={(event) => { event.preventDefault(); cancel(); }}>
    <form ref={form} onSubmit={submit} autoComplete="off">
      <h2 id="entry-title">{deleting ? `Delete ${selection.row.name}?` : editing ? "Edit connection" : "Add connection"}</h2>
      {deleting ? <>
        <p>Workflows using this connection may stop working.</p>
      </> : <div className="connection-fields">
        <label htmlFor="connection-label">Name</label><input id="connection-label" name="label" placeholder="Apollo" defaultValue={selection.field?.label ?? ""} maxLength={256} required autoFocus />
        <label htmlFor="variable">Key</label><input id="variable" name="variable" placeholder="APOLLO_API_KEY" defaultValue={selection.field?.variable ?? selection.preset ?? ""} disabled={editing} pattern="[A-Za-z_][A-Za-z0-9_]*" maxLength={256} required />
        <label htmlFor="new-key">{editing ? "New API key value" : "API key value"}</label><input ref={password} id="new-key" name="key" type="password" placeholder={editing && !needsKey ? "Leave blank to keep the current key" : "your_apollo_api_key"} autoComplete="new-password" maxLength={8192} required={needsKey} />
        {["unresolved", "write_attempted"].includes(selection.row?.change?.phase) ? <label><input name="supersede" type="checkbox" required />Replace the unresolved save with this new entry</label> : null}
      </div>}
      {error ? <p role="alert" className="error">{error}</p> : null}
      <div className="dialog-actions"><button type="button" disabled={busy} onClick={cancel}>Cancel</button>
        <button className={`connection-submit primary${deleting ? " danger" : ""}`} type="submit" disabled={busy} aria-busy={busy}>{busy ? <ArrowPathIcon aria-hidden="true" className="connection-icon connection-spinner" /> : null}{busy ? deleting ? "Deleting…" : "Saving…" : deleting ? "Delete connection" : "Save connection"}</button></div>
    </form>
  </dialog>;
}
/** Sends a key saved here to production. Only the value goes up; nothing is read back down. */
function PushForm({ selection, production, close, pushed }) {
  const dialog = useRef(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const { field } = selection, existing = production.names.includes(field.variable);
  useEffect(() => { dialog.current.showModal(); }, []);
  function cancel() { if (!busy) close(); }
  async function submit(event) {
    event.preventDefault(); setError(""); setBusy(true);
    try { pushed(await request("/api/production/push", { id: crypto.randomUUID(), variable: field.variable, ...(existing ? { replace: true } : {}) })); close(); }
    catch (failure) { setError(message(failure.message)); }
    finally { setBusy(false); }
  }
  return <dialog ref={dialog} aria-labelledby="push-title" className="connection-dialog" onCancel={(event) => { event.preventDefault(); cancel(); }}>
    <form onSubmit={submit}>
      <h2 id="push-title">{existing ? `Replace ${field.variable} in Production?` : `Push ${field.variable} to Production?`}</h2>
      <p className="muted">Sends the key saved on this computer to {production.project} as a sensitive Production variable, then redeploys Production so it takes effect. Values are never read back down.</p>
      {existing ? <label className="connection-confirm"><input name="replace" type="checkbox" required />Production already has {field.variable}. Replace it with this computer’s key.</label> : null}
      {error ? <p role="alert" className="error">{error}</p> : null}
      <div className="dialog-actions"><button type="button" disabled={busy} onClick={cancel}>Cancel</button>
        <button className={`connection-submit primary${existing ? " danger" : ""}`} type="submit" disabled={busy} aria-busy={busy}>{busy ? <ArrowPathIcon aria-hidden="true" className="connection-icon connection-spinner" /> : null}{busy ? "Pushing…" : existing ? "Replace in Production" : "Push to Production"}</button></div>
    </form>
  </dialog>;
}
const applicationStorage = "gtm-connections-application";
function readPending() {
  try { const value = JSON.parse(localStorage.getItem(applicationStorage)); return typeof value?.id === "string" ? { id: value.id, state: "pending" } : null; } catch { return null; }
}
function App() {
  const [inventory, setInventory] = useState(null), [error, setError] = useState(""), [selection, setSelection] = useState(null), [loading, setLoading] = useState(true);
  const trigger = useRef(null);
  const [pendingApply, setPendingApply] = useState(readPending), [retrying, setRetrying] = useState(false);
  // Local only: which key names production has, for the hints. Null until known, and stays null when Vercel can't be asked.
  const [production, setProduction] = useState(null), [pushResult, setPushResult] = useState(null);
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
    if (!integratedMode || pendingApply?.state === "saving" || (!applying && !pendingApply)) return;
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
    if (localMode) request("/api/production").then((next) => setProduction(next.linked && Array.isArray(next.names) ? next : null), () => setProduction(null));
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
  async function logout() {
    try { await request("/api/logout", {}); } finally { clearSession(); setInventory(null); setSelection(null); setError(localMode ? "reopen_connections" : "sign_in_required"); }
  }
  // On the tailnet the manager's link names its loopback address; the viewer is this page's own origin.
  const workflowsUrl = inventory && tailnetMode ? "/viewer" : inventory?.workflowsUrl;
  return <main className="workspace">
    <nav className="tabs root-navigation" aria-label="Workspace"><a href={workflowsUrl ?? "#"} aria-disabled={!inventory} onClick={(event) => { if (!inventory) event.preventDefault(); }}>Workflows</a><a href={workflowsUrl ? (() => { const url = new URL(workflowsUrl, location.origin); url.searchParams.set("view", "data"); return url.href; })() : "#"} aria-disabled={!inventory} onClick={(event) => { if (!inventory) event.preventDefault(); }}>Data</a><a href={integratedMode || tailnetMode ? "/connections" : "/"} aria-current="page">Connections</a></nav>
    <div className="title-row"><div><div className="environment-title"><h1>Connections</h1><span className="environment-badge" data-environment={localMode ? "local" : "production"} title={localMode ? "Keys saved on this computer" : "Keys on Vercel"}>{localMode ? "Local" : "Production"}</span></div>{inventory?.workspaceName ? <p className="muted">{inventory.workspaceName}</p> : null}</div>
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
      <div className="connection-list">{inventory.connections.filter((row) => row.platformIdentity || row.fields.some((field) => field.state !== "disconnected")).map((row) => <div className="connection-row" key={row.id}>
        <div className="connection-name"><h2>{row.name}</h2><p className="muted connection-variable">{row.fields.map((field) => field.variable).join(", ")}</p>
          {row.status && row.status !== "Saved" ? <p className="muted connection-status">{row.status}</p> : null}
          {production && row.fields.some((field) => field.state === "saved") ? <p className="connection-hint">{row.fields.every((field) => production.names.includes(field.variable)) ? <span className="muted">Also in Production</span> : "Only on this computer"}</p> : null}</div>
        {inventory.canWrite && row.fields.length ? <details className="connection-menu"><summary className="icon-button" aria-label={`Actions for ${row.name}`} title="Connection actions"><EllipsisHorizontalIcon aria-hidden="true" className="connection-icon" /></summary><div>{row.fields.map((field) => <React.Fragment key={field.variable}>
          {field.editable ? <><button type="button" onClick={(event) => select(event, { action: "replace", row, field })}>Edit</button>{production && field.state === "saved" ? <button type="button" onClick={(event) => select(event, { action: "push", row, field })}>{production.names.includes(field.variable) ? "Replace in Production" : "Push to Production"}</button> : null}<button type="button" className="danger-text" onClick={(event) => select(event, { action: "disconnect", row, field })}>Delete</button></> : inventory.vercelUrl ? <a href={inventory.vercelUrl} target="_blank" rel="noopener noreferrer">Open in Vercel</a> : <span className="muted">Read only</span>}
        </React.Fragment>)}</div></details> : null}
      </div>)}</div>
      {!inventory.connections.some((row) => row.platformIdentity || row.fields.some((field) => field.state !== "disconnected")) ? <p className="notice">No connections yet. Add an API key to get started.</p> : null}
      {production ? (() => {
        const here = new Set(inventory.connections.flatMap((row) => row.fields).filter((field) => field.state !== "disconnected").map((field) => field.variable));
        const missing = production.names.filter((name) => !here.has(name));
        return missing.length ? <section className="production-only" aria-labelledby="production-only-title">
          <h2 id="production-only-title">Set in Production, not here</h2>
          <p className="muted">Workflows run on this computer can’t use these keys until you add them here. Values stay on Vercel, so paste each key again.</p>
          <div className="connection-list">{missing.map((name) => <div className="connection-row" key={name}>
            <div className="connection-name"><p className="connection-variable">{name}</p></div>
            {inventory.canWrite ? <button type="button" onClick={(event) => select(event, { action: "add", preset: name })}>Add</button> : null}
          </div>)}</div>
        </section> : null;
      })() : null}
      {pushResult ? <div className="notice application-notice" role="status"><span>{pushResult.replaced ? `Replaced ${pushResult.variable} in Production.` : `Pushed ${pushResult.variable} to Production.`} {pushResult.application === "applying" ? "Production is redeploying so it takes effect." : "Redeploy Production so it takes effect: open Production Connections and choose Retry, or redeploy in Vercel."}</span>
        {pushResult.url ? <a className="button" href={pushResult.url} target="_blank" rel="noopener noreferrer">Open Production Connections</a> : null}</div> : null}
      {!integratedMode ? <div className="connection-footer"><button type="button" onClick={logout}>Sign out</button>{inventory.productionUrl ? <a href={inventory.productionUrl} target="_blank" rel="noopener noreferrer">Open Production</a> : null}</div> : null}
      {selection?.action === "push" && production ? <PushForm key={`push-${selection.field.variable}`} selection={selection} production={production} close={closeEntry} pushed={(result) => { setPushResult({ ...result, variable: selection.field.variable }); refresh().catch(() => setError("vercel_unavailable")); }} /> :
        selection ? <EntryForm key={`${selection.action}-${selection.field?.variable ?? selection.preset ?? "new"}`} selection={selection} inventory={inventory} close={closeEntry} updated={updated} beginApply={beginApply} failedApply={failedApply} /> : null}
    </> : null}
  </main>;
}
createRoot(document.getElementById("root")).render(<App />);
