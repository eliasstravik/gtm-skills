// Real React/useRead, deterministic clock + read-only fake API. No workflow or database is touched.
import React from "react";
import { createRoot } from "react-dom/client";
import { useRead } from "../templates/viewer/common";
const realTimeout = window.setTimeout.bind(window);
let now = Date.now(), sequence = 0, hidden = false, running = true, hold = false;
const timers = new Map<number, { at: number; callback: () => void }>();
const calls: Record<string, number> = {}, pending: (() => void)[] = [];
Date.now = () => now;
window.setTimeout = ((fn: () => void, ms = 0) => { const id = ++sequence; timers.set(id, { at: now + Number(ms), callback: fn }); return id; }) as typeof window.setTimeout;
window.clearTimeout = (id) => { timers.delete(id); };
Object.defineProperty(document, "hidden", { get: () => hidden });
window.fetch = async (input) => {
  const op = new URL(String(input), location.origin).searchParams.get("op")!;
  calls[op] = (calls[op] ?? 0) + 1;
  if (hold && op !== "pulse") await new Promise<void>((resolve) => pending.push(resolve));
  return Response.json(op === "pulse" ? { version: 3, registry: "unchanged", data: "unchanged" } : { version: 3, data: [{ status: running ? "running" : "completed" }] });
};
const settle = async () => { for (let n = 0; n < 8; n++) await Promise.resolve(); await new Promise((r) => realTimeout(r, 0)); };
const clock = {
  calls, timers,
  async settle() { await settle(); await settle(); },
  async advance(ms: number) {
    const end = now + ms;
    for (let steps = 0; ; steps++) {
      if (steps > 5000) throw new Error("Unbounded timer/request loop");
      const next = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      now = Math.max(now, next[1].at); timers.delete(next[0]); next[1].callback(); await settle();
    }
    now = end; await settle();
  },
  jump(ms: number) { now += ms; },
  visibility(value: boolean) { hidden = value; document.dispatchEvent(new Event("visibilitychange")); },
  focus() { window.dispatchEvent(new Event("focus")); },
  running(value: boolean) { running = value; },
  hold(value: boolean) { hold = value; },
  async release() { pending.splice(0).forEach((r) => r()); await settle(); },
};
(window as any).polling = clock;
function Fixture() {
  const workspace = useRead("workspaceRuns"), workflow = useRead("runs");
  return <main><h1>Runs polling regression fixture</h1><button id="input">Genuine input</button>
    <button id="refresh" onClick={workspace.retry}>Refresh workspace</button>
    <output id="ready">{workspace.data && workflow.data ? "ready" : "loading"}</output></main>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
