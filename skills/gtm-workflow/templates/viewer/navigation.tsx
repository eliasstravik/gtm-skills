import { useSyncExternalStore } from "react";
export const shared = location.pathname === "/share";
export const token =
  new URLSearchParams(location.hash.slice(1)).get("token") ?? "";
export const query = () => new URLSearchParams(location.search);
export function href(changes: Record<string, string | undefined>) {
  const p = query();
  for (const [k, v] of Object.entries(changes))
    v === undefined ? p.delete(k) : p.set(k, v);
  return `${location.pathname}?${p}${location.hash}`;
}
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((fn) => fn());
export function navigate(url: string, replace = false) {
  history.replaceState({ ...history.state, scroll: [scrollX, scrollY] }, "");
  if (replace) history.replaceState(history.state, "", url);
  else history.pushState({}, "", url);
  changed();
}
window.addEventListener("popstate", () => {
  changed();
  const scroll = history.state?.scroll;
  if (scroll)
    requestAnimationFrame(() =>
      window.scrollTo(...(scroll as [number, number])),
    );
});
document.addEventListener("click", (event) => {
  if (
    event.defaultPrevented ||
    event.button ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return;
  const a = (event.target as Element).closest("a");
  if (
    !a ||
    a.target ||
    a.download ||
    a.origin !== location.origin ||
    !["/", "/viewer", "/share"].includes(a.pathname)
  )
    return;
  event.preventDefault();
  navigate(a.href);
});
export const useLocation = () =>
  useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => location.href,
  );
