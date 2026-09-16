import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { requireThat } from "./errors.mjs";
const fields = ["version", "id", "origin", "teamId", "projectId", "adminProjectId", "installationId", "actor", "deploymentId", "runtimeDeploymentId", "runtimeCommit", "componentDigest", "expires"];
const signature = (data, secret) => createHmac("sha256", secret).update("gtm-connections-setup-verification-v1\0").update(JSON.stringify(data)).digest("hex");
export function verificationReceipt(input, secret, now = Date.now()) {
  requireThat(typeof secret === "string" && secret.length >= 43, "verification_unavailable", 503);
  const data = { version: 1, id: randomUUID(), ...input, expires: now + 5 * 60000 };
  requireThat(fields.every((key) => data[key] !== undefined) && Object.keys(data).every((key) => fields.includes(key)), "verification_unavailable", 503);
  return { data, signature: signature(data, secret) };
}
export function verifyReceipt(receipt, secret, expected, now = Date.now()) {
  requireThat(receipt && Object.keys(receipt).length === 2 && receipt.data && typeof receipt.signature === "string" && /^[a-f0-9]{64}$/.test(receipt.signature), "invalid_verification_receipt", 403);
  const data = receipt.data;
  requireThat(Object.keys(data).length === fields.length && Object.keys(data).every((key) => fields.includes(key)) && data.version === 1 &&
    typeof data.id === "string" && /^[a-f0-9-]{36}$/.test(data.id) && Number.isFinite(data.expires) && data.expires > now && data.expires <= now + 5 * 60000 &&
    Object.entries(expected).every(([key, value]) => data[key] === value) && typeof secret === "string" && secret.length >= 43, "verification_binding_denied", 403);
  requireThat(timingSafeEqual(Buffer.from(receipt.signature, "hex"), Buffer.from(signature(data, secret), "hex")), "verification_signature_denied", 403);
  return data;
}
