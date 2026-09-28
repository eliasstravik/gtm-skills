import React, { useEffect, useState } from "react";
import { api } from "./common";
import { query, shared } from "./navigation";

type Release = { state: "updating" | "live" | "failed"; since?: number; details?: string };
/** Remembers across the reload a new deployment causes that this tab watched it build, to say the change is live. */
const WATCHED = "gtm-viewer-release-watched";
const remember = (on: boolean) => {
  try { on ? sessionStorage.setItem(WATCHED, "1") : sessionStorage.removeItem(WATCHED); } catch { /* Status still works. */ }
};
const watched = () => {
  try { return sessionStorage.getItem(WATCHED) === "1"; } catch { return false; }
};

/**
 * Whether a change (a saved key, a push, a redeploy) is live yet on the hosted viewer, for the Production badge to show.
 * Checks every 15 seconds, every 5 while an update builds; the pulse reloads the page once the new deployment serves.
 * Production owner pages only: locally a saved key applies on this computer and there is nothing to deploy.
 */
export function useRelease(environment?: string): (Release & { justLive: boolean }) | null {
  const enabled = environment === "production" && !shared && !query().has("preview");
  const [release, setRelease] = useState<Release | null>(null);
  const [justLive, setJustLive] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let stopped = false, timer: ReturnType<typeof setTimeout> | undefined;
    const check = async () => {
      clearTimeout(timer);
      if (stopped || document.hidden) return;
      let next: Release | null = null;
      try { next = (await api("release")).release ?? null; } catch { /* Unknown: show nothing rather than guess. */ }
      if (stopped) return;
      setRelease(next);
      if (next?.state === "updating") remember(true);
      else if (next?.state === "live" && watched()) {
        remember(false);
        setJustLive(true);
      } else if (next?.state === "failed") remember(false);
      timer = setTimeout(check, next?.state === "updating" ? 5000 : 15000);
    };
    const shown = () => { if (!document.hidden) check(); };
    check();
    document.addEventListener("visibilitychange", shown);
    return () => {
      stopped = true;
      clearTimeout(timer);
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
