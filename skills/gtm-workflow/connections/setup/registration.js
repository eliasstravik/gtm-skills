const bootstrap = new URLSearchParams(location.hash.slice(1)).get("bootstrap");
history.replaceState(null, "", "/");
let bearer, csrf;
const status = document.querySelector("#status"), form = document.querySelector("form");
async function request(path, body) {
  const response = await fetch(path, { method: body ? "POST" : "GET", credentials: "omit", cache: "no-store", redirect: "error", headers: {
    ...(body ? { "content-type": "application/json" } : {}), ...(bearer ? { authorization: `Bearer ${bearer}`, "x-gtm-csrf": csrf } : {}),
  }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json();
  if (!response.ok) { const error = Error("Setup could not complete this step. Resume the local setup command."); error.code = result.error; throw error; }
  return result;
}
try {
  const session = await request("/api/session", { bootstrap }); bearer = session.bearer; csrf = session.csrf;
  const details = await request("/api/details");
  document.querySelector("#identity-callback").value = details.identityCallback;
  document.querySelector("#integration-callback").value = details.integrationCallback;
  document.querySelector("#identity-link").href = details.identitySettings;
  document.querySelector("#integration-link").href = details.integrationSettings;
  document.querySelector("#target").textContent = `Team: ${details.team}. Workflow project: ${details.project}.`;
  for (const scope of details.scopes) { const row = document.createElement("li"); row.textContent = scope; document.querySelector("#scopes").append(row); }
  const resume = ["exchange_started", "token_staged", "admin_write_attempted", "admin_configured"].includes(details.phase);
  document.querySelector("#setup").hidden = resume || details.phase === "complete";
  document.querySelector("#resume").hidden = !resume;
  status.textContent = details.phase === "complete" ? "Setup is already complete." : "Owner identity and fixed projects verified.";
} catch (error) { status.textContent = error.message; }
const clear = () => { for (const input of document.querySelectorAll('input[type="password"]')) input.value = ""; };
addEventListener("pagehide", clear);
form.addEventListener("submit", async (event) => {
  event.preventDefault(); const body = Object.fromEntries(new FormData(form)); body.identityVerified = body.identityVerified === "on"; clear();
  const button = form.querySelector("button"); button.disabled = true;
  try {
    const result = await request("/api/registration", body); form.reset();
    const consent = document.querySelector("#consent"); consent.href = result.consent; consent.hidden = false;
    status.textContent = "Registration saved. Continue to Vercel consent as the same owner.";
  } catch (error) { document.querySelector("#error").textContent = error.message; }
  finally { body.clientSecret = undefined; body.integrationSecret = undefined; button.disabled = false; }
});
document.querySelector("#resume-button").addEventListener("click", async (event) => {
  const button = event.currentTarget, message = document.querySelector("#resume-status"); button.disabled = true;
  try {
    await request("/api/resume", { reapply: document.querySelector("#reapply").checked });
    message.textContent = "Installation saved. Local setup is continuing automatically.";
    document.querySelector("#reapply-option").hidden = true;
  } catch (error) {
    if (error.code === "setup_configuration_unresolved") {
      message.textContent = "The prior write has an uncertain outcome. Confirm reapplying the staged credential to continue.";
      document.querySelector("#reapply-option").hidden = false;
    } else message.textContent = error.message;
  } finally { button.disabled = false; }
});
