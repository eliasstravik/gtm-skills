import React, { useEffect, useRef, useState } from "react";
import { href, navigate, query } from "./navigation";
import { api, Search, State, useRead } from "./common";
import Data from "./data";
import Runs from "./runs";
import { EnvironmentBadge } from "./environment";
import type { Folder, FolderState } from "../lib/workflow-folders";

/** Iterative traversal supports any nesting depth without recursive rendering or stack limits. */
export function folderOptions(folders: Folder[]) {
  const children = new Map<string | null, Folder[]>();
  for (const folder of folders) children.set(folder.parentId, [...(children.get(folder.parentId) ?? []), folder]);
  for (const list of children.values()) list.sort((a, b) => a.name.localeCompare(b.name));
  const stack = (children.get(null) ?? []).slice().reverse().map((folder) => ({ folder, path: folder.name }));
  const result: { folder: Folder; path: string }[] = [], seen = new Set<string>();
  while (stack.length) {
    const item = stack.pop()!;
    if (seen.has(item.folder.id)) continue;
    seen.add(item.folder.id); result.push(item);
    for (const folder of (children.get(item.folder.id) ?? []).slice().reverse()) stack.push({ folder, path: `${item.path} / ${folder.name}` });
  }
  return result;
}
/** Missing workflow placements remain visible metadata, never links to nonexistent workflows. */
export function folderEntries(workflows: any[], folders: FolderState) {
  const known = new Set(workflows.map((w) => w.id));
  return [...workflows, ...Object.keys(folders.assignments).filter((id) => !known.has(id)).map((id) => ({ id, title: "Workflow unavailable in this copy", description: `Placement for ${id}. Clear it explicitly when it is no longer needed.`, unavailable: true }))];
}
export function FolderWorkflow({ workflow: w, editable, onMove }: { workflow: any; editable: boolean; onMove: () => void }) {
  return <div className="workflow-folder-row">
    {w.unavailable ? <div className="workflow-row"><h2>{w.title}</h2><p className="muted purpose">{w.description}</p></div> : <a className="workflow-row" href={`/viewer?workflow=${encodeURIComponent(w.id)}`}><h2>{w.title}</h2>{w.description && <p className="muted purpose">{w.description}</p>}</a>}
    {editable && <button aria-label={w.unavailable ? `Clear placement ${w.id}` : `Move ${w.title}`} onClick={onMove}>{w.unavailable ? "Clear placement" : "Move"}</button>}
  </div>;
}
type Edit = { action: "create" | "rename" | "move" | "delete" | "assign"; id?: string; workflowId?: string; name: string; parentId: string; unavailable?: boolean };
export default function Workspace() {
  const state = useRead("list"), search = query().get("q") ?? "";
  const dataView = query().get("view") === "data", runsView = query().get("view") === "runs";
  const selected = query().get("folder") ?? "root";
  const folders: FolderState = state.data?.folders ?? { revision: 0, folders: [], assignments: {} };
  const current = folders.folders.find((f) => f.id === selected);
  const options = folderOptions(folders.folders);
  const [edit, setEdit] = useState<Edit | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null), editRevision = useRef(0);
  useEffect(() => { if (edit && !dialog.current?.open) dialog.current?.showModal(); }, [edit]);
  const begin = (value: Edit) => { editRevision.current = folders.revision; setError(""); setEdit(value); };
  const close = () => { dialog.current?.close(); setEdit(null); };
  const foldersUnavailable = state.data?.foldersUnavailable;
  const entries = folderEntries(state.data?.workflows ?? [], folders).filter((w: any) => {
    const folder = folders.assignments[w.id];
    return (foldersUnavailable || selected === "all" || (selected === "root" || selected === "unfiled" ? !folder : folder === selected)) &&
      `${w.title} ${w.description ?? ""}`.toLowerCase().includes(search.toLowerCase());
  }).sort((a: any, b: any) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
  const children = folders.folders.filter((f) => f.parentId === (current?.id ?? null));
  const editable = state.data?.foldersEditable;
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); if (!edit || busy) return;
    setBusy(true); setError("");
    try {
      const { unavailable: _placeholder, ...command } = edit;
      await api("folders", {}, { ...command, parentId: edit.parentId || null, revision: editRevision.current }, state.data?.csrf);
      if (edit.action === "delete" && selected === edit.id) navigate(href({ folder: current?.parentId ?? undefined }));
      close(); state.retry();
    } catch (e) { setError(`${(e as Error).message} Close this dialog and reopen it after reloading.`); state.retry(); }
    finally { setBusy(false); }
  };
  return <main className={dataView || runsView ? "workflow" : "workspace"}>
    <nav className="tabs root-navigation" aria-label="Workspace">
      <a href="/viewer" aria-current={!dataView && !runsView ? "page" : undefined}>Workflows</a>
      <a href="/viewer?view=runs" aria-current={runsView ? "page" : undefined}>Runs</a>
      <a href="/viewer?view=data" aria-current={dataView ? "page" : undefined}>Data</a>
      {state.data?.connectionsUrl && <a href={state.data.connectionsUrl}>Connections</a>}
    </nav>
    {dataView ? <>
      <div className="title-row"><div className="environment-title"><h1>Data</h1><EnvironmentBadge environment={state.data?.environment} /></div></div>
      <Data destinations={state.data?.destinations} csrf={state.data?.csrf} />
    </> : runsView ? <>
      <div className="title-row"><div className="environment-title"><h1>Runs</h1><EnvironmentBadge environment={state.data?.environment} /></div></div>
      <Runs workspace destinations={state.data?.destinations} />
    </> : <>
      <div className="title-row"><div className="environment-title"><h1>Workflows</h1><EnvironmentBadge environment={state.data?.environment} /></div>
        <Search label="Search workflows" value={search} onChange={(q) => navigate(href({ q: q || undefined }), true)} />
      </div>
      <State state={state} />
      {state.data?.foldersMode === "local-only" && <p className="notice">Local-only folders. This standalone workspace is not linked to production; organization is saved on this computer only.</p>}
      {state.data && <div className="folder-layout">
        {!foldersUnavailable && <nav className="folder-navigation" aria-label="Workflow folders">
          <a href={href({ folder: undefined })} aria-current={selected === "root" ? "page" : undefined}>Root</a>
          <a href={href({ folder: "all" })} aria-current={selected === "all" ? "page" : undefined}>All workflows</a>
          <a href={href({ folder: "unfiled" })} aria-current={selected === "unfiled" ? "page" : undefined}>Unfiled</a>
          <label>Open folder<select value={current?.id ?? ""} onChange={(e) => navigate(href({ folder: e.target.value || undefined }))}>
            <option value="">Root</option>{options.map(({ folder, path }) => <option key={folder.id} value={folder.id}>{path}</option>)}
          </select></label>
        </nav>}
        <section className="folder-content" aria-label="Folder contents">
          {foldersUnavailable && <p role="alert" className="notice">{foldersUnavailable}</p>}
          <div className="folder-toolbar"><h2>{foldersUnavailable ? "Workflows" : current?.name ?? (selected === "all" ? "All workflows" : selected === "unfiled" ? "Unfiled" : "Root")}</h2>
            {editable && <button onClick={() => begin({ action: "create", name: "", parentId: current?.id ?? "" })}>New folder</button>}
            {editable && current && <>
              <button onClick={() => begin({ action: "rename", id: current.id, name: current.name, parentId: current.parentId ?? "" })}>Rename</button>
              <button onClick={() => begin({ action: "move", id: current.id, name: current.name, parentId: current.parentId ?? "" })}>Move folder</button>
              <button onClick={() => begin({ action: "delete", id: current.id, name: current.name, parentId: "" })}>Delete folder</button>
            </>}
          </div>
          {current && <a href={href({ folder: current.parentId ?? undefined })}>↑ Parent folder</a>}
          {!foldersUnavailable && !current && !["root", "all", "unfiled"].includes(selected) ? <p role="alert">This folder no longer exists. Choose Root.</p> : <>
            {(selected === "root" || current) && children.map((f) => <a className="folder-row" key={f.id} href={href({ folder: f.id })}>▸ {f.name}</a>)}
            <div className="workflow-list">{entries.map((w: any) => <FolderWorkflow key={w.id} workflow={w} editable={editable} onMove={() => begin({ action: "assign", workflowId: w.id, name: w.title, parentId: w.unavailable ? "" : folders.assignments[w.id] ?? "", unavailable: w.unavailable })} />)}
            {!entries.length && <p className="notice">{search ? "No matching workflows" : "No workflows in this view."} {search && <button onClick={() => navigate(href({ q: undefined }))}>Clear search</button>}</p>}
            </div>
          </>}
        </section>
      </div>}
    </>}
    <dialog ref={dialog} className="folder-dialog" aria-labelledby="folder-dialog-title" onCancel={(e) => { e.preventDefault(); if (!busy) close(); }}>
      {edit && <form onSubmit={save}>
        <h2 id="folder-dialog-title">{edit.unavailable ? "Clear unavailable workflow placement" : edit.action === "assign" ? `Move ${edit.name}` : `${edit.action[0].toUpperCase()}${edit.action.slice(1)} folder`}</h2>
        {edit.unavailable ? <p>Clear this placement only? No workflow, run or data will be deleted. This workflow may still exist in another copy.</p> : edit.action === "delete" ? <p>Delete “{edit.name}”? Only empty folders can be deleted. Workflows and runs are never deleted.</p> : <>
          {["create", "rename"].includes(edit.action) && <label>Name<input autoFocus required maxLength={120} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>}
          {edit.action !== "rename" && <label>Destination<select value={edit.parentId} onChange={(e) => setEdit({ ...edit, parentId: e.target.value })}>
            <option value="">Root (unfiled)</option>{options.filter(({ folder }) => {
              if (edit.action !== "move") return true;
              const byId = new Map(folders.folders.map((f) => [f.id, f]));
              for (let f: Folder | undefined = folder; f; f = f.parentId ? byId.get(f.parentId) : undefined) if (f.id === edit.id) return false;
              return true;
            }).map(({ folder, path }) => <option key={folder.id} value={folder.id}>{path}</option>)}
          </select></label>}
        </>}
        {error && <p role="alert" className="error">{error}</p>}
        <div className="folder-toolbar"><button type="button" disabled={busy} onClick={close}>Cancel</button><button disabled={busy} type="submit">{busy ? "Saving…" : edit.action === "delete" ? "Delete empty folder" : "Save"}</button></div>
      </form>}
    </dialog>
  </main>;
}
