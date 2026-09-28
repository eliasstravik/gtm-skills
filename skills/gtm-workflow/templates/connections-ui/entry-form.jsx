import React, { useEffect, useRef, useState } from "react";
import { ArrowPathIcon } from "@heroicons/react/16/solid";
import { request } from "./transport.mjs";
/**
 * The Add, Edit and Delete form for one key, shared by the Keys page and a workflow's Connections tab. It sends the
 * value once, to this same server, and never shows it again. `inventory` is the Keys page's own read
 * (`GET /api/connection-management`), for the key's version and whether this is the local or the production page.
 */
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
  local_access_only: "Open the Keys page from this computer's viewer (or your own tailnet address).",
  csrf_denied: "Refresh this page and try again.",
  vercel_request_denied: "Vercel refused the change. Check `vercel login` and that you can edit this project, then save again.",
};
export const message = (code) => messages[code] ?? "Connections could not complete this request. Refresh or run Connections Doctor.";
export function EntryForm({ selection, inventory, close, updated, beginApply = () => {}, failedApply = () => {} }) {
  const localMode = inventory.mode === "local";
  const dialog = useRef(null), form = useRef(null), password = useRef(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const deleting = selection.action === "disconnect", editing = Boolean(selection.field);
  // Locally the key is all there is to edit, so an edit always takes a new value.
  const needsKey = localMode || !editing || ["external", "unresolved", "unknown", "disconnected"].includes(selection.field?.state);
  useEffect(() => {
    dialog.current.showModal();
    // The key's name is given: straight to its value (hosted, the Name field comes first and has focus already).
    if (selection.preset && localMode) password.current?.focus();
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
      ...(deleting ? {} : { ...(localMode ? {} : { label: String(data.get("label")).trim() }), ...(value ? { value } : {}) }),
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
        {localMode ? null : <><label htmlFor="connection-label">Name</label><input id="connection-label" name="label" placeholder="Apollo" defaultValue={selection.field?.label ?? selection.presetLabel ?? ""} maxLength={256} required autoFocus /></>}
        <label htmlFor="variable">Key</label><input id="variable" name="variable" placeholder="APOLLO_API_KEY" defaultValue={selection.field?.variable ?? selection.preset ?? ""} disabled={editing} readOnly={Boolean(selection.preset)} pattern="[A-Za-z_][A-Za-z0-9_]*" maxLength={256} required />
        <label htmlFor="new-key">{editing ? "New API key value" : "API key value"}</label><input ref={password} id="new-key" name="key" type="password" placeholder={editing && !needsKey ? "Leave blank to keep the current key" : "your_apollo_api_key"} autoComplete="new-password" maxLength={8192} required={needsKey} />
        {["unresolved", "write_attempted"].includes(selection.row?.change?.phase) ? <label><input name="supersede" type="checkbox" required />Replace the unresolved save with this new entry</label> : null}
      </div>}
      {error ? <p role="alert" className="error">{error}</p> : null}
      <div className="dialog-actions"><button type="button" disabled={busy} onClick={cancel}>Cancel</button>
        <button className={`connection-submit primary${deleting ? " danger" : ""}`} type="submit" disabled={busy} aria-busy={busy}>{busy ? <ArrowPathIcon aria-hidden="true" className="connection-icon connection-spinner" /> : null}{busy ? deleting ? "Deleting…" : "Saving…" : deleting ? "Delete connection" : "Save connection"}</button></div>
    </form>
  </dialog>;
}
