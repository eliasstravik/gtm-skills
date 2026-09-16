import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { initialize, request, clearSession, localMode } from "./transport.mjs";
import "@fontsource-variable/geist/index.css";
import "../shared/style.css";
import "./style.css";
const messages = {
  reopen_connections: "Open Connections from the trusted local command to continue.",
  sign_in_required: "Sign in with Vercel to manage this project's connections.",
  setup_needed: "Connections setup is not complete. Resume setup on the owner's computer.",
  membership_denied: "This account does not have supported access to this project.",
  installation_denied: "The project's integration needs attention. Run Connections Doctor.",
  connection_changed: "This connection changed. Close this form and refresh before trying again.",
  save_outcome_requires_review: "The save outcome is uncertain. Refresh and review its status before entering a replacement.",
  operation_in_progress: "Another change is in progress. Refresh when it finishes.",
  explicit_replacement_required: "The previous save is unresolved. Review its status and explicitly replace it.",
  invalid_provider_variable: "Use a provider-specific name ending in _API_KEY. System and public variables are excluded.",
  invalid_key: "Enter a nonempty key on one line.",
  unlock_os_credential_store: "Unlock your OS credential store. Linux requires a running, unlocked Secret Service such as GNOME Keyring.",
};
const message = (code) => messages[code] ?? "Connections could not complete this request. Refresh or run Connections Doctor.";
function EntryForm({ selection, inventory, close, updated }) {
  const dialog = useRef(null), form = useRef(null), password = useRef(null);
  const [service, setService] = useState(inventory.services[0].id), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const disconnect = selection.action === "disconnect";
  useEffect(() => {
    dialog.current.showModal();
    const clear = () => { if (password.current) password.current.value = ""; };
    window.addEventListener("pagehide", clear);
    return () => { clear(); window.removeEventListener("pagehide", clear); };
  }, []);
  function cancel() { form.current?.reset(); close(); }
  async function submit(event) {
    event.preventDefault(); setError(""); setBusy(true);
    const data = new FormData(form.current);
    const variable = selection.field?.variable ?? (service === "custom" ? String(data.get("variable")) : inventory.services.find((item) => item.id === service).variables[0]);
    const existing = inventory.connections.flatMap((row) => row.fields).find((field) => field.variable === variable);
    if (password.current) password.current.value = "";
    if (selection.action === "add" && existing && existing.state !== "disconnected") {
      setError("This connection already exists. Close this form and choose Replace key."); setBusy(false); return;
    }
    const body = { id: crypto.randomUUID(), variable, action: selection.action, version: selection.field?.version ?? existing?.version ?? "absent",
      ...(disconnect ? {} : { value: String(data.get("key")) }),
      ...(service === "custom" && !selection.field ? { label: String(data.get("label")) } : {}),
      ...(data.get("supersede") ? { supersede: true } : {}),
    };
    try { await request("/api/connections", body); form.current?.reset(); await updated(); close(); }
    catch (failure) { setError(message(failure.message)); }
    finally { body.value = undefined; setBusy(false); }
  }
  return <dialog ref={dialog} aria-labelledby="entry-title" className="connection-dialog" onCancel={(event) => { event.preventDefault(); cancel(); }}>
    <form ref={form} onSubmit={submit} autoComplete="off">
      <h2 id="entry-title">{disconnect ? `Disconnect ${selection.row.name}?` : selection.field ? `Replace ${selection.row.name} key` : "Add connection"}</h2>
      {disconnect ? <>
        <p>Remove this credential from {inventory.mode === "local" ? "local configuration after the next runner restart" : "Production after the next deployment"}. This does not revoke the provider key or stop running work.</p>
        {selection.field.externalCopy || selection.field.state === "external" ? <p>An external copy remains in the shell or .env file. Local runner launches will ignore it after disconnect. Remove or rotate that copy separately.</p> : null}
        <p>{selection.row.usage.length ? `Declared workflows: ${selection.row.usage.map((item) => item.title).join(", ")}.` : "No declared workflow usage."}</p>
      </> : <div className="connection-fields">
        {!selection.field ? <><label htmlFor="service">Service</label><select id="service" name="service" value={service} onChange={(event) => setService(event.target.value)}>
          {inventory.services.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}<option value="custom">Custom API connection</option>
        </select></> : <p className="muted">{selection.field.variable}</p>}
        {service === "custom" && !selection.field ? <><label htmlFor="connection-label">Display name</label><input id="connection-label" name="label" maxLength={64} required />
          <label htmlFor="variable">Variable name</label><input id="variable" name="variable" placeholder="PROVIDER_API_KEY" pattern="[A-Z][A-Z0-9_]+_API_KEY" maxLength={72} required /></> : null}
        <label htmlFor="new-key">New API key</label><input ref={password} id="new-key" name="key" type="password" autoComplete="new-password" maxLength={8192} required />
        <p className="muted">Saved keys cannot be displayed. {inventory.mode === "local" ? "Apply changes with a deliberate runner restart." : "Apply changes through the next ordinary deployment."}</p>
        {["unresolved", "write_attempted"].includes(selection.row?.change?.phase) ? <label><input name="supersede" type="checkbox" required />Replace the unresolved save with this new entry</label> : null}
      </div>}
      {error ? <p role="alert" className="error">{error}</p> : null}
      <div className="dialog-actions"><button type="button" disabled={busy} onClick={cancel}>{disconnect ? "No" : "Cancel"}</button>
        <button className="primary" type="submit" disabled={busy}>{busy ? "Saving…" : disconnect ? "Yes, disconnect" : "Save connection"}</button></div>
    </form>
  </dialog>;
}
function App() {
  const [inventory, setInventory] = useState(null), [error, setError] = useState(""), [selection, setSelection] = useState(null), [loading, setLoading] = useState(true);
  const trigger = useRef(null);
  function select(event, value) {
    const menu = event.currentTarget.closest("details");
    trigger.current = menu?.querySelector("summary") ?? event.currentTarget;
    if (menu) menu.open = false;
    setSelection(value);
  }
  function closeEntry() { setSelection(null); requestAnimationFrame(() => trigger.current?.focus()); }
  async function refresh() { setInventory(await request("/api/connections")); }
  async function start() {
    setLoading(true); setError("");
    try { await initialize(); await refresh(); } catch (failure) { setInventory(null); setSelection(null); setError(failure.message); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    start();
    const restore = (event) => { if (event.persisted) { setSelection(null); start(); } };
    const hide = () => setSelection(null);
    window.addEventListener("pageshow", restore); window.addEventListener("pagehide", hide);
    return () => { window.removeEventListener("pageshow", restore); window.removeEventListener("pagehide", hide); };
  }, []);
  async function logout() {
    try { await request("/api/logout", {}); } finally { clearSession(); setInventory(null); setSelection(null); setError(localMode ? "reopen_connections" : "sign_in_required"); }
  }
  async function downloadVerification() {
    try {
      const receipt = await request("/api/verification"), url = URL.createObjectURL(new Blob([JSON.stringify(receipt)], { type: "application/json" }));
      const link = document.createElement("a"); link.href = url; link.download = "connections-verification.json"; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (failure) { setError(failure.message); }
  }
  return <main className="workspace">
    <nav className="tabs root-navigation" aria-label="Workspace"><a href={inventory?.workflowsUrl ?? "#"} aria-disabled={!inventory} onClick={(event) => { if (!inventory) event.preventDefault(); }}>Workflows</a><a href="/" aria-current="page">Connections</a></nav>
    <div className="title-row"><div><h1>Connections</h1><p className="muted">{localMode ? "Local" : "Production"}{inventory?.workspaceName ? ` · ${inventory.workspaceName}` : ""}</p></div>
      {inventory ? <div className="connection-actions">{inventory.vercelUrl ? <a className="button" href={inventory.vercelUrl} rel="noreferrer">Open in Vercel</a> : null}
        {inventory.canWrite ? <button type="button" className="primary" onClick={(event) => select(event, { action: "add" })}>Add connection</button> : null}</div> : null}
    </div>
    {loading ? <p className="notice" role="status">Loading connections…</p> : null}
    {error ? <div className="notice" role="alert"><p>{message(error)}</p>{!localMode && error === "sign_in_required" ? <a className="button" href="/auth/login">Sign in with Vercel</a> : null}</div> : null}
    {inventory ? <>
      {!inventory.canWrite ? <p className="notice">Read-only access. A project owner or member can change Production connections.</p> : null}
      <div className="connection-list">{inventory.connections.map((row) => <div className="connection-row" key={row.id}>
        <div><h2>{row.name}</h2><p className="muted">{row.status}</p>{row.platformIdentity ? <p className="muted">Vercel platform identity remains available independently of an API key.</p> : null}</div>
        <div className="connection-usage">{row.usage.length ? row.usage.map((use, index) => <a key={`${use.workflowId}-${index}`} href={`${inventory.workflowsUrl}?workflow=${encodeURIComponent(use.workflowId)}`}>{use.title}{use.provider ? ` · ${use.provider} via ${row.name}` : ""}</a>) : <span className="muted">No declared usage</span>}</div>
        {inventory.canWrite && row.fields.length ? <details className="connection-menu"><summary aria-label={`Manage ${row.name}`}>Manage</summary><div>{row.fields.map((field) => <React.Fragment key={field.variable}>
          {row.fields.length > 1 ? <p className="muted">{field.variable}</p> : null}{field.editable ? <><button type="button" onClick={(event) => select(event, { action: "replace", row, field })}>Replace key</button><button type="button" onClick={(event) => select(event, { action: "disconnect", row, field })}>Disconnect</button></> : <a href={inventory.vercelUrl}>Manage in Vercel</a>}
        </React.Fragment>)}</div></details> : null}
      </div>)}</div>
      {!inventory.connections.length ? <p className="notice">No connections yet. Add a service key to make it available to workflows.</p> : null}
      <div className="connection-footer"><button type="button" onClick={start}>Refresh</button><button type="button" onClick={logout}>Sign out</button>{inventory.productionUrl ? <a href={inventory.productionUrl}>Open Production</a> : null}{inventory.deploymentUrl ? <a href={inventory.deploymentUrl}>Open deployment settings</a> : null}</div>
      {!localMode && inventory.canVerify ? <details><summary>Setup verification</summary><p className="muted">Download proof of this sign-in and the live connection to your workflow project. It contains project metadata and no credentials.</p><button type="button" onClick={downloadVerification}>Download verification</button></details> : null}
      {selection ? <EntryForm key={`${selection.action}-${selection.field?.variable ?? "new"}`} selection={selection} inventory={inventory} close={closeEntry} updated={refresh} /> : null}
    </> : null}
  </main>;
}
createRoot(document.getElementById("root")).render(<App />);
