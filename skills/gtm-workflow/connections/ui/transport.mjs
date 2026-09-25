// The local manager's page, or the same page served by the local viewer on its tailnet address (tailnet mode).
export const tailnetMode = document.getElementById("root")?.dataset.tailnet === "true";
const local = tailnetMode || (location.protocol === "http:" && ["localhost", "127.0.0.1"].includes(location.hostname));
export const integratedMode = document.getElementById("root")?.dataset.integrated === "true";
let bearer = local ? sessionStorage.getItem("gtm-connections-session") : null;
let csrf;
const params = new URLSearchParams(location.hash.slice(1));
let bootstrap = params.get("bootstrap");
if (location.hash) history.replaceState(null, "", location.pathname);
export function clearSession() { bearer = null; csrf = null; sessionStorage.removeItem("gtm-connections-session"); }
export async function request(path, body) {
  if (integratedMode || tailnetMode) path = path === "/api/connections" ? "/api/connection-management" : path.replace(/^\/api\//, "/api/connection-management/");
  const response = await fetch(path, { method: body === undefined ? "GET" : "POST", cache: "no-store", redirect: "error", credentials: local ? "omit" : "same-origin",
    headers: { ...(bearer ? { authorization: `Bearer ${bearer}` } : {}), ...(csrf ? { "x-gtm-csrf": csrf } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const result = await response.json();
  if (!response.ok) { if (response.status === 401 || response.status === 403) clearSession(); const error = Error(result.error ?? "connections_unavailable"); error.status = response.status; throw error; }
  return result;
}
export async function initialize() {
  if (bootstrap) {
    const capability = bootstrap; bootstrap = null;
    const session = await request("/api/session", { bootstrap: capability });
    bearer = session.bearer; csrf = session.csrf;
    sessionStorage.setItem("gtm-connections-session", bearer);
  }
  const session = await request("/api/session"); csrf = session.csrf;
  return session;
}
export const localMode = local;
