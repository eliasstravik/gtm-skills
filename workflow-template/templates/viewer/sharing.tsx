import React, { useEffect, useRef, useState } from "react";
import { api, ApiError, usePulse } from "./common";
const choices = ["logic", "runs", "data"];
const name = (view: string) =>
  ({ logic: "Diagram", runs: "Runs", data: "Data" })[view];
export default function Sharing({ meta }: any) {
  const dialog = useRef<HTMLDialogElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
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
  // A link turned on, changed or off elsewhere (another tab, the agent) shows here while the dialog is open.
  const version = usePulse().data;
  useEffect(() => {
    if (!dialog.current?.open || !loaded || busy) return;
    refresh(false).catch((e) => setMessage((e as Error).message));
  }, [version]);
  function dismiss() {
    dialog.current?.close();
    setUrl("");
    trigger.current?.focus();
  }
  async function refresh(reset = true) {
    const result = await api("grants");
    setSaved(result.grant);
    setPolicy(result.policy);
    if (dialog.current?.open) setUrl(result.url ?? "");
    if (result.linkError) setMessage(result.linkError);
    setLoaded(true);
    if (reset) setViews(result.grant?.views ?? ["logic"]);
  }
  async function open() {
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
      setMessage("Link copied.");
    } catch {
      setMessage("Copy failed. Select the link to copy it manually.");
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
      if (dialog.current?.open) setUrl(result.url);
      setMessage(saved ? "Changes saved." : "Sharing turned on.");
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
      setMessage("Sharing turned off. The old link no longer works.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button type="button" ref={trigger} onClick={open}>
        Share
      </button>
      <dialog
        ref={dialog}
        className="sharing-dialog"
        aria-labelledby="share-title"
        onCancel={dismiss}
        onClose={() => {
          setUrl("");
          trigger.current?.focus();
        }}
      >
        <div className="section-heading">
          <h2 id="share-title">Share workflow</h2>
          <button type="button" aria-label="Close sharing" onClick={dismiss}>
            ×
          </button>
        </div>
        {!meta.shareEnabled ? (
          <p>
            Sharing is not configured. Ask your agent to check the hosted share
            setup.
          </p>
        ) : (
          <>
            {!loaded && !message && <p role="status">Loading sharing…</p>}
            {loaded && (
              <>
                <fieldset disabled={busy}>
                  <legend>Shared tabs</legend>
                  {choices.map((v) => (
                    <label key={v}>
                      <input
                        type="checkbox"
                        name={`share-${v}`}
                        checked={views.includes(v)}
                        disabled={v === "data" && !policy}
                        onChange={(e) => {
                          setViews(
                            e.target.checked
                              ? [...views, v]
                              : views.filter((x) => x !== v),
                          );
                          setMessage("");
                        }}
                      />
                      {name(v)}
                      {v === "data" && !policy && (
                        <small className="muted">Data sharing isn't configured</small>
                      )}
                    </label>
                  ))}
                </fieldset>
                {stale && <p>Data access changed. Save to restore it.</p>}
                {(changed || stale) && (
                  <div className="dialog-actions">
                    <button
                      type="button"
                      className="primary"
                      disabled={busy || !views.length}
                      onClick={save}
                    >
                      Save changes
                    </button>
                    <span className="muted">Unsaved changes</span>
                  </div>
                )}
                <div className="sharing-state">
                  <div>
                    <h3>Sharing is {saved ? "on" : "off"}</h3>
                    <p className="muted" id="sharing-description">
                      {saved
                        ? "Anyone with the link can view the selected tabs."
                        : "Turn on sharing to create a link."}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="sharing-switch"
                    role="switch"
                    aria-label="Sharing"
                    aria-describedby="sharing-description"
                    aria-checked={!!saved}
                    disabled={busy || (!saved && !views.length)}
                    onClick={saved ? revoke : save}
                  >
                    <span />
                  </button>
                </div>
                {saved && url && (
                  <div className="share-link">
                    <input
                      aria-label="Share link"
                      name="share-link"
                      readOnly
                      value={url}
                      onFocus={(e) => e.target.select()}
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => copy(url)}
                    >
                      Copy
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
        <p className="sharing-message" role="status">
          {message}
        </p>
      </dialog>
    </>
  );
}
