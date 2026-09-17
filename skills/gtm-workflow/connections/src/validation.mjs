import { providerVariable, connectionLabel } from "../dist/catalog.mjs";
import { requireThat } from "./errors.mjs";
export function mutation(body) {
  requireThat(Object.keys(body).every((key) => ["id", "variable", "label", "action", "value", "version", "supersede"].includes(key)), "unknown_field");
  requireThat(typeof body.id === "string" && /^[0-9a-f-]{36}$/.test(body.id), "invalid_operation");
  requireThat(providerVariable(body.variable), "invalid_provider_variable");
  requireThat(["add", "replace", "disconnect"].includes(body.action), "invalid_action");
  requireThat(typeof body.version === "string" && body.version.length <= 128, "invalid_version");
  requireThat(body.supersede === undefined || typeof body.supersede === "boolean", "invalid_supersession");
  requireThat(body.label === undefined || connectionLabel(body.label), "invalid_label");
  if (body.action === "disconnect") requireThat(body.value === undefined, "unexpected_value");
  else if (body.action === "add" || body.value !== undefined) requireThat(typeof body.value === "string" && body.value.trim().length > 0 && body.value.length <= 8192 && !/[\r\n\0]/.test(body.value), "invalid_key");
  return body;
}
export function fixedOrigin(value, local = false) {
  const url = new URL(value);
  requireThat(url.origin === value && !url.username && !url.password &&
    (local ? url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname) : url.protocol === "https:"), "invalid_origin");
  return url.origin;
}
