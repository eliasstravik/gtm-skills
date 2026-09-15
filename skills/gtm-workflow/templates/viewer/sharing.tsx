import React, { useRef, useState } from "react";
import { api, ApiError } from "./common";
const choices = ["logic", "runs", "data"];
const name = (view: string) =>
  ({ logic: "Diagram", runs: "Runs", data: "Data" })[view];
export default function Sharing({ meta }: any) {
  const dialog = useRef<HTMLDialogElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const [copyFailed, setCopyFailed] = useState(false);
  const [views, setViews] = useState<string[]>(["logic"]),
    [saved, setSaved] = useState<any>(null);
  const [policy, setPolicy] = useState<string | null>(null);
  const [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false),
    [url, setUrl] = useState(""),
    [message, setMessage] = useState("");
  const changed =
    !!saved &&
    choices.some((v) => views.includes(v) !== saved.views.includes(v));
  const stale = !!saved?.views.includes("data") && saved.dataPolicy !== policy;
  function dismiss() {
    dialog.current?.close();
    setUrl("");
    trigger.current?.focus();
  }
  async function refresh(reset = true) {
    const result = await api("grants");
    setSaved(result.grant);
    setPolicy(result.policy);
    setLoaded(true);
    if (reset) setViews(result.grant?.views ?? ["logic"]);
  }
  async function open() {
    setCopyFailed(false);
    setLoaded(false);
    setUrl("");
    setMessage("");
    dialog.current?.showModal();
    if (!meta.shareEnabled) return;
    setBusy(true);
    try {
      await refresh();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopyFailed(false);
      setMessage("Link copied.");
    } catch {
      setCopyFailed(true);
      setMessage("Copy failed. Select the link below or retry copy.");
    }
  }
  async function save() {
    setBusy(true);
    setMessage("");
    try {
      const result = await api(
        "saveLink",
        {},
        { views, policy, save: changed || stale },
        meta.csrf,
      );
      setSaved(result.grant);
      setViews(result.grant.views);
      setUrl(result.url);
      await copy(result.url);
    } catch (e) {
      setMessage((e as Error).message);
      if (e instanceof ApiError && e.status === 409) {
        setUrl("");
        await refresh(false);
      }
    } finally {
      setBusy(false);
    }
  }
  async function revoke() {
    setBusy(true);
    setMessage("");
    try {
      await api("revokeGrant", {}, { id: saved.id }, meta.csrf);
      setSaved(null);
      setUrl("");
      setViews(["logic"]);
      setMessage("Link turned off.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button ref={trigger} onClick={open}>
        Share
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="share-title"
        onCancel={dismiss}
        onClose={() => {
          setUrl("");
          trigger.current?.focus();
        }}
      >
        <div className="section-heading">
          <h2 id="share-title">Share workflow</h2>
          <button aria-label="Close sharing" onClick={dismiss}>
            ×
          </button>
        </div>
        {!meta.shareEnabled ? (
          <p>
            {meta.hosted
              ? "Sharing is not configured. Ask your agent to check the hosted share setup."
              : "Deploy this workflow to share it."}
          </p>
        ) : (
          <>
            <p>Anyone with the link can view the selected tabs.</p>
            {!loaded && !message && <p role="status">Loading sharing…</p>}
            {loaded && (
              <>
                <fieldset disabled={busy}>
                  <legend className="sr-only">Shared tabs</legend>
                  {choices.map((v) => (
                    <label key={v}>
                      <input
                        type="checkbox"
                        checked={views.includes(v)}
                        disabled={v === "data" && !policy}
                        onChange={(e) => {
                          setViews(
                            e.target.checked
                              ? [...views, v]
                              : views.filter((x) => x !== v),
                          );
                          setUrl("");
                        }}
                      />
                      {name(v)}
                      {v === "data" && !policy && (
                        <small> No permitted data configured</small>
                      )}
                    </label>
                  ))}
                </fieldset>
                {stale && <p>Data access changed. Save to restore it.</p>}
                {(changed || stale) && (
                  <p className="muted">
                    Changes apply to everyone using this link.
                  </p>
                )}
                <div className="dialog-actions">
                  <button
                    className="primary"
                    disabled={busy || !views.length}
                    onClick={save}
                  >
                    {changed || stale ? "Save and copy link" : "Copy link"}
                  </button>
                  {saved && (
                    <button disabled={busy} onClick={revoke}>
                      Turn off link
                    </button>
                  )}
                </div>
                {url && copyFailed && (
                  <div className="copy-fallback">
                    <input
                      aria-label="Share link"
                      readOnly
                      value={url}
                      onFocus={(e) => e.target.select()}
                    />
                    <button onClick={() => copy(url)}>Retry copy</button>
                  </div>
                )}
              </>
            )}
          </>
        )}
        <p role="status">{message}</p>
      </dialog>
    </>
  );
}
