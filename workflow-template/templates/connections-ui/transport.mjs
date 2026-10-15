// The Keys page's calls: always to this same server, which keeps keys in `.env.local` locally and in the project's
// Production variables on Vercel. Production changes also carry the CSRF token the session call returns.
export const localMode = document.getElementById("root")?.dataset.environment === "local";
let csrf;
export async function request(path, body) {
  path = path === "/api/connections" ? "/api/connection-management" : path.replace(/^\/api\//, "/api/connection-management/");
  const response = await fetch(path, { method: body === undefined ? "GET" : "POST", cache: "no-store", redirect: "error", credentials: "same-origin",
    headers: { ...(csrf ? { "x-gtm-csrf": csrf } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const result = await response.json();
  if (!response.ok) { const error = Error(result.error ?? "connections_unavailable"); error.status = response.status; throw error; }
  return result;
}
export async function initialize() {
  const session = await request("/api/session"); csrf = session.csrf;
  return session;
}
