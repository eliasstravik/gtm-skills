import { useEffect, useRef, useState } from "react";
import { CONTRACT_VERSION } from "../lib/viewer-contract";

// No ./navigation or ./common here: the Keys page (connections-ui/) shows the same badge, and those take over its links.
type Release = { state: "updating" | "live" | "failed"; since?: number; details?: string };
/** Remembers across the reload a new deployment causes that this tab watched it build, to say the change is live. */
const WATCHED = "gtm-viewer-release-watched";
/** When a save last started an update, for every tab of this viewer: each badge turns amber at once, not at its next check. */
const STARTED = "gtm-viewer-release-started";
/** Sent when an update this tab watched is live, so a page can read again what it changed. */
const LIVE = "gtm-viewer-release-live";
const remember = (on: boolean) => {
  try { on ? sessionStorage.setItem(WATCHED, "1") : sessionStorage.removeItem(WATCHED); } catch { /* Status still works. */ }
};
const watched = () => {
  try { return sessionStorage.getItem(WATCHED) === "1"; } catch { return false; }
};
const startedAt = () => {
  try { return Number(localStorage.getItem(STARTED)) || 0; } catch { return 0; }
};
/**
 * How long after a save the badge says "updating" whatever a check answers. Production: Vercel lists the new build as
 * soon as the save returns, but each server instance reuses its answer for a few seconds. Locally the server knows at
 * once, and only a check lost while it reloads is covered.
 */
const grace = (local: boolean) => (local ? 60000 : 20000);

/**
 * Called the moment a save starts an update: a production key change that redeploys, or a local one the server reloads
 * with. Every badge of this viewer, in this tab and the others, shows "Updating…" right away.
 */
export function releaseStarted() {
  try { localStorage.setItem(STARTED, String(Date.now())); } catch { /* This tab still shows it. */ }
  remember(true);
  window.dispatchEvent(new Event(STARTED));
}

/** Runs `read` once an update this tab watched is live: locally the server now uses the saved key, so "Saved" reads "Set". */
export function useReleaseLive(read: () => void) {
  const latest = useRef(read);
  latest.current = read;
  useEffect(() => {
    const live = () => latest.current();
    window.addEventListener(LIVE, live);
    return () => window.removeEventListener(LIVE, live);
  }, []);
}

async function readRelease(): Promise<Release | null> {
  const response = await fetch(`/api/viewer?op=release&v=${CONTRACT_VERSION}`, { cache: "no-store", credentials: "same-origin" });
  const data = await response.json();
  return response.ok && data.version === CONTRACT_VERSION ? (data.release ?? null) : null;
}

/**
 * Whether a change (a saved key, a push, a redeploy) is live yet, for the environment badge to show. Production checks
 * every 15 seconds, every 5 while an update builds; the pulse reloads viewer pages once the new deployment serves.
 * Locally a saved key reloads the server in a few seconds (scripts/local-launch.mjs), checked every second meanwhile.
 * Owner pages only: never a share link or a preview.
 */
export function useRelease(environment?: string): (Release & { justLive: boolean }) | null {
  const local = environment === "local";
  const recipient = location.pathname === "/share" || new URLSearchParams(location.search).has("preview");
  const enabled = (local || environment === "production") && !recipient;
  const recent = () => Date.now() - startedAt() < grace(local);
  const [release, setRelease] = useState<Release | null>(null);
  const [justLive, setJustLive] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let stopped = false, timer: ReturnType<typeof setTimeout> | undefined;
    // Opened just after a save, on this page or another: amber before the first answer.
    if (recent()) setRelease({ state: "updating" });
    const check = async () => {
      clearTimeout(timer);
      if (stopped || document.hidden) return;
      let next: Release | null = null;
      try { next = await readRelease(); } catch { /* Unknown: show nothing rather than guess. */ }
      if (stopped) return;
      // Just saved: an answer from before the update began, or one lost while the local server reloads, is no news.
      if (recent() && (!next || (next.state === "live" && !local))) next = { state: "updating" };
      setRelease(next);
      if (next?.state === "updating") remember(true);
      else if (next?.state === "live" && watched()) {
        remember(false);
        setJustLive(true);
        window.dispatchEvent(new Event(LIVE));
      } else if (next?.state === "failed") remember(false);
      timer = setTimeout(check, next?.state === "updating" ? (local ? 1000 : 5000) : 15000);
    };
    const started = () => {
      setRelease({ state: "updating" });
      setJustLive(false);
      clearTimeout(timer);
      timer = setTimeout(check, local ? 300 : 2000);
    };
    const elsewhere = (event: StorageEvent) => { if (event.key === STARTED && event.newValue) started(); };
    const shown = () => { if (!document.hidden) check(); };
    check();
    window.addEventListener(STARTED, started);
    window.addEventListener("storage", elsewhere);
    document.addEventListener("visibilitychange", shown);
    return () => {
      stopped = true;
      clearTimeout(timer);
      window.removeEventListener(STARTED, started);
      window.removeEventListener("storage", elsewhere);
      document.removeEventListener("visibilitychange", shown);
    };
  }, [enabled]);
  useEffect(() => {
    if (!justLive) return;
    const timer = setTimeout(() => setJustLive(false), 8000);
    return () => clearTimeout(timer);
  }, [justLive]);
  return enabled && release ? { ...release, justLive } : null;
}
