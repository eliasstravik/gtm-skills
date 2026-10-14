import { useEffect, useRef, useState } from "react";
import { CONTRACT_VERSION } from "../lib/viewer-contract";

// No ./navigation or ./common here: the Keys page (connections-ui/) shows the same badge, and those take over its links.
type Release = { state: "updating" | "live" | "failed"; since?: number; details?: string; change?: string };
/** Remembers across the reload a new deployment causes that this tab watched it build, to say the change is live. */
const WATCHED = "gtm-viewer-release-watched";
/**
 * The update a save last started, for every tab of this viewer: `{ at, change }`, `change` being the id production gave
 * its build. Each badge turns amber at once, not at its next check, and stays amber until that very build is live or
 * failed, however long Vercel takes to list it, never on an older build's result.
 */
const STARTED = "gtm-viewer-release-started";
/** Sent when an update this tab watched is live, so a page can read again what it changed. */
const LIVE = "gtm-viewer-release-live";
const remember = (on: boolean) => {
  try { on ? sessionStorage.setItem(WATCHED, "1") : sessionStorage.removeItem(WATCHED); } catch { /* Status still works. */ }
};
const watched = () => {
  try { return sessionStorage.getItem(WATCHED) === "1"; } catch { return false; }
};
type Started = { at: number; change?: string };
const started = (): Started | null => {
  try {
    const value = JSON.parse(localStorage.getItem(STARTED) ?? "null");
    return typeof value?.at === "number" ? { at: value.at, ...(typeof value.change === "string" ? { change: value.change } : {}) } : null;
  } catch { return null; }
};
/** Its build reached an outcome: later checks are about whatever is newest again. */
const settled = (change: string) => {
  try { if (started()?.change === change) localStorage.removeItem(STARTED); } catch { /* Expires on its own. */ }
};
/**
 * How long a save's update is followed. Production: until its build is live or failed, at most this long (a build that
 * never shows up is then left to the newest-build answer). Locally the server knows at once whether it runs with the
 * saved keys; only a check lost while it reloads is covered.
 */
const FOLLOW_MS = { production: 15 * 60000, local: 60000 };

/**
 * Called the moment a save starts an update: a production key change that redeploys (`change`, the id the save gave
 * its build), or a local one the server reloads with. Every badge of this viewer, in this tab and the others, shows
 * "Updating…" right away.
 */
export function releaseStarted(change?: string) {
  try { localStorage.setItem(STARTED, JSON.stringify({ at: Date.now(), ...(change ? { change } : {}) })); } catch { /* This tab still shows it. */ }
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

async function readRelease(change?: string): Promise<Release | null> {
  const ask = change ? `&change=${encodeURIComponent(change)}` : "";
  const response = await fetch(`/api/viewer?op=release&v=${CONTRACT_VERSION}${ask}`, { cache: "no-store", credentials: "same-origin" });
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
  // The save this page follows: production by its build's id, locally for the reload's first minute.
  const following = () => {
    const save = started();
    if (!save || Date.now() - save.at >= FOLLOW_MS[local ? "local" : "production"]) return null;
    return local || save.change ? save : null;
  };
  const [release, setRelease] = useState<Release | null>(null);
  const [justLive, setJustLive] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    // Each check and each save takes a new number: an answer to a check that a later check or a save overtook is old
    // news, whatever it says (a status asked just before a save is about the build before it).
    let stopped = false, timer: ReturnType<typeof setTimeout> | undefined, asked = 0;
    // Opened just after a save, on this page or another: amber before the first answer.
    if (following()) setRelease({ state: "updating" });
    const check = async () => {
      clearTimeout(timer);
      if (stopped || document.hidden) return;
      const save = following(), change = local ? undefined : save?.change, mine = ++asked;
      let next: Release | null = null;
      try { next = await readRelease(change); } catch { /* Unknown: show nothing rather than guess. */ }
      if (stopped || mine !== asked) return;
      // A save in another tab lands in storage without a word here until its event: the same rule.
      const now = following();
      if ((now?.at ?? 0) !== (save?.at ?? 0)) {
        clearTimeout(timer);
        timer = setTimeout(check, 300);
        return;
      }
      if (change) {
        // Only an answer about this save's own build counts: none yet, or an older build's live or failed, means it
        // is still on its way.
        if (next?.change !== change) next = { state: "updating" };
        else if (next.state !== "updating") settled(change);
      } else if (save && !next) next = { state: "updating" }; // Locally: lost while the server reloads.
      setRelease(next);
      if (next?.state === "updating") remember(true);
      else if (next?.state === "live" && watched()) {
        remember(false);
        setJustLive(true);
        window.dispatchEvent(new Event(LIVE));
      } else if (next?.state === "failed") remember(false);
      timer = setTimeout(check, next?.state === "updating" ? (local ? 1000 : 5000) : 15000);
    };
    const begun = () => {
      asked++;
      setRelease({ state: "updating" });
      setJustLive(false);
      clearTimeout(timer);
      timer = setTimeout(check, local ? 300 : 2000);
    };
    const elsewhere = (event: StorageEvent) => { if (event.key === STARTED && event.newValue) begun(); };
    const shown = () => { if (!document.hidden) check(); };
    check();
    window.addEventListener(STARTED, begun);
    window.addEventListener("storage", elsewhere);
    document.addEventListener("visibilitychange", shown);
    return () => {
      stopped = true;
      clearTimeout(timer);
      window.removeEventListener(STARTED, begun);
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
