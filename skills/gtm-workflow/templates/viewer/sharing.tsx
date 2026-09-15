import React, { useRef, useState } from "react";
import { api, time } from "./common";
import { query } from "./navigation";
const viewName = (view: string) =>
  ({ logic: "Diagram", runs: "Runs", data: "Data" })[view] ?? view;
export default function Sharing({ meta }: { meta: any }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [grants, setGrants] = useState<any[]>([]);
  const [views, setViews] = useState([query().get("view") ?? "logic"]);
  const [expiry, setExpiry] = useState("7");
  const [replace, setReplace] = useState<string | undefined>();
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  async function open() {
    setViews([query().get("view") ?? "logic"]);
    setReplace(undefined);
    setLink("");
    setError("");
    ref.current?.showModal();
    try {
      setGrants((await api("grants")).grants);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api(
        replace ? "replaceGrant" : "createGrant",
        {},
        {
          views,
          expiresAt:
            expiry === "never" ? null : Date.now() + Number(expiry) * 86400000,
          ...(replace ? { id: replace } : {}),
        },
        meta.csrf,
      );
      setReplace(undefined);
      setLink(result.url);
      setCopied(false);
      setGrants((await api("grants")).grants);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function revoke(id: string) {
    setBusy(true);
    try {
      await api("revokeGrant", {}, { id }, meta.csrf);
      setGrants((await api("grants")).grants);
      setLink("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button onClick={open}>Share</button>
      <dialog ref={ref} aria-labelledby="share-title">
        <div className="section-heading">
          <h2 id="share-title">Share this workflow</h2>
          <button
            aria-label="Close sharing"
            onClick={() => ref.current?.close()}
          >
            ×
          </button>
        </div>
        <p className="muted">
          Anyone with the link can open the selected views. It follows the
          current workflow. Filters and the selected run do not restrict the
          link. Runs keeps technical payloads private. Revocation stops future
          reads, but existing downloads remain.
        </p>
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(
                `${location.origin}/viewer?workflow=${meta.workflow.id}`,
              );
              setCopied(true);
            } catch {
              setError("Copy failed.");
            }
          }}
        >
          Copy private link
        </button>
        <form onSubmit={create}>
          <fieldset>
            <legend>Allowed views</legend>
            <label>
              <input
                type="checkbox"
                checked={views.includes("logic")}
                onChange={(e) =>
                  setViews((v) =>
                    e.target.checked
                      ? [...v, "logic"]
                      : v.filter((x) => x !== "logic"),
                  )
                }
              />
              Diagram
            </label>
            <label>
              <input
                type="checkbox"
                checked={views.includes("runs")}
                onChange={(e) =>
                  setViews((v) =>
                    e.target.checked
                      ? [...v, "runs"]
                      : v.filter((x) => x !== "runs"),
                  )
                }
              />
              Runs, including retained and future status and timing
            </label>
            <label>
              <input
                type="checkbox"
                disabled={!meta.dataShareEnabled}
                checked={views.includes("data")}
                onChange={(e) =>
                  setViews((v) =>
                    e.target.checked
                      ? [...v, "data"]
                      : v.filter((x) => x !== "data"),
                  )
                }
              />
              Current business data
            </label>
            {!meta.dataShareEnabled && (
              <p className="muted">
                Data sharing needs an authored table and row policy.
              </p>
            )}
          </fieldset>
          {views.includes("data") && (
            <div>
              <p>Current and future records in the configured policy:</p>
              <ul>
                {meta.dataScope?.map((t: any) => (
                  <li key={t.name}>
                    {t.name}: {t.columns.join(", ")}.{" "}
                    {t.row.column
                      ? `${t.row.column} equals ${t.row.equals}`
                      : "All records."}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <label>
            Expires{" "}
            <select value={expiry} onChange={(e) => setExpiry(e.target.value)}>
              <option value="1">1 day</option>
              <option value="7">7 days</option>
              <option value="30">30 days</option>
              <option value="never">Never</option>
            </select>
          </label>
          <p>
            Shares {views.map(viewName).join(", ")}.{" "}
            {expiry === "never"
              ? "No expiry."
              : `Expires ${time(Date.now() + Number(expiry) * 86400000)}.`}
          </p>
          <button disabled={busy || !views.length} type="submit">
            {busy ? "Saving…" : replace ? "Replace link" : "Create link"}
          </button>
          {views.length > 0 && (
            <a
              target="_blank"
              rel="noreferrer"
              href={`/viewer?workflow=${meta.workflow.id}&preview=${views.join(",")}&view=${["logic", "runs", "data"].find((v) => views.includes(v))}`}
            >
              Preview recipient view
            </a>
          )}
          {replace && (
            <p>
              The old link remains active if replacement fails.{" "}
              <button type="button" onClick={() => setReplace(undefined)}>
                Cancel replacement
              </button>
            </p>
          )}
        </form>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {link && (
          <div className="copy-row">
            <label>
              Share link
              <input readOnly value={link} onFocus={(e) => e.target.select()} />
            </label>
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link);
                  setCopied(true);
                } catch {
                  setError("Select and copy the link above.");
                }
              }}
            >
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
        )}
        <p role="status">{copied ? "Copied." : ""}</p>
        <h3>Existing links</h3>
        <p className="muted">
          Original links cannot be recovered. Replace a lost link to issue a new
          one.
        </p>
        <ul className="grant-list" role="list">
          {grants.map((g) => (
            <li key={g.id}>
              <div>
                {g.views.map(viewName).join(", ")} · Created {time(g.createdAt)}
                <p className="muted">
                  {g.revokedAt
                    ? "Revoked"
                    : g.expiresAt
                      ? `${g.expiresAt <= Date.now() ? "Expired" : "Expires"} ${time(g.expiresAt)}`
                      : "No expiry"}
                </p>
              </div>
              {!g.revokedAt && (
                <>
                  <button
                    disabled={busy}
                    onClick={() => {
                      setReplace(g.id);
                      setViews(g.views);
                    }}
                  >
                    Replace link
                  </button>
                  <button disabled={busy} onClick={() => revoke(g.id)}>
                    Revoke
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      </dialog>
    </>
  );
}
