import { randomUUID } from "node:crypto";
import { safeEnvironment, setConfiguration, configurationValue } from "./cli.mjs";
import { requireThat } from "../src/errors.mjs";

const version = (row) => row ? JSON.stringify([row.id, row.updatedAt, row.type, row.visibility, row.target, row.comment ?? null]) : "absent";

/** The journal records the outcome and metadata, never a value or value digest. */
export async function writeSetupConfiguration({ api, journal, projectId, key, value, secret = true, reapply = false, update = false }) {
  const journalKey = `configuration:${projectId}:${key}`;
  const prior = await journal.get(journalKey);
  const rows = (await safeEnvironment(api, projectId)).filter((row) => row.key === key && row.target?.includes("production"));
  requireThat(rows.length <= 1 && (!rows[0] || rows[0].target.length === 1), "ambiguous_existing_configuration", 409);
  const current = rows[0];
  let knownUpdate = false;
  if (prior?.phase === "saved") {
    requireThat(version(current) === prior.version, "setup_configuration_changed", 409);
    if (secret || await configurationValue(api, projectId, key) === value) return { state: "saved", id: current.id, reused: true };
    requireThat(update, "setup_configuration_value_changed", 409); knownUpdate = true;
  }
  if (!prior && current && !secret) {
    requireThat(await configurationValue(api, projectId, key) === value, "existing_configuration_mismatch", 409);
    await journal.set(journalKey, { phase: "saved", version: version(current), adopted: true, savedAt: Date.now() });
    return { state: "saved", id: current.id, reused: true };
  }
  // A metadata marker alone cannot establish which secret value is now saved.
  // The caller must offer a separate explicit reapply action for uncertainty.
  requireThat(!prior || reapply || knownUpdate, "setup_configuration_unresolved", 409);
  requireThat(!current || (prior && (reapply || knownUpdate)), "existing_configuration_requires_reconciliation", 409);
  const attempt = randomUUID(), comment = `gtm-setup:${attempt}`;
  await journal.set(journalKey, { phase: "write_attempted", attempt, priorVersion: version(current) });
  const saved = await setConfiguration(api, projectId, key, value, { secret, replace: Boolean(current), comment });
  requireThat(saved.state === "saved", "setup_configuration_unresolved", 409);
  const after = (await safeEnvironment(api, projectId)).filter((row) => row.key === key && row.target?.includes("production"));
  requireThat(after.length === 1 && after[0].id === saved.id && after[0].comment === comment &&
    after[0].updatedAt !== undefined && (saved.updatedAt === undefined || after[0].updatedAt === saved.updatedAt) &&
    after[0].target.length === 1 && (!secret || after[0].visibility === "secret"), "setup_configuration_unresolved", 409);
  await journal.set(journalKey, { phase: "saved", attempt, version: version(after[0]), savedAt: Date.now() });
  return { state: "saved", id: saved.id, reused: false };
}
