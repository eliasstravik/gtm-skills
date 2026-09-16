import { connectionInventory, services } from "../dist/catalog.mjs";
import { mutation } from "./validation.mjs";
import { requireThat, ConnectionError } from "./errors.mjs";

export function createManager({ journal, storage, active, context }) {
  async function inventory() {
    const [saved, snapshot, operations, metadata] = await Promise.all([storage.list(), active().catch(() => null), journal.operations(), journal.list()]);
    for (const operation of operations) if (!saved.some((row) => row.variable === operation.variable))
      saved.push({ variable: operation.variable, version: "absent", state: operation.phase === "saved" && operation.action === "disconnect" ? "disconnected" : "unknown", editable: true });
    for (const field of saved) field.label ??= metadata.find((entry) => entry.variable === field.variable)?.label;
    const names = saved.map((row) => row.variable);
    const rows = connectionInventory(names, [], snapshot?.connections?.some((row) => row.platformIdentity) ?? false);
    for (const entry of snapshot?.connections ?? []) if (!rows.some((row) => row.id === entry.id)) rows.push({ ...entry, fields: [] });
    for (const row of rows) {
      const live = snapshot?.connections?.find((entry) => entry.id === row.id);
      row.active = snapshot ? Boolean(live?.configured) : null;
      row.usage = live?.usage ?? []; row.usageComplete = live?.usageComplete ?? false;
      row.fields = saved.filter((entry) => row.fields.some((field) => field.variable === entry.variable)).map((entry) => ({
        variable: entry.variable, version: entry.version, editable: entry.editable, state: entry.state,
        ...(entry.label ? { label: entry.label } : {}), externalCopy: entry.externalCopy === true,
      }));
      row.configured = row.platformIdentity || row.fields.some((field) => ["saved", "external"].includes(field.state))
        ? true : row.fields.some((field) => ["unknown", "unresolved"].includes(field.state)) ? null : false;
      if (!services.some((service) => service.id === row.id)) row.name = row.fields.find((field) => field.label)?.label ?? row.name;
      const last = operations.find((op) => row.fields.some((field) => field.variable === op.variable));
      row.change = last ? { phase: last.phase, action: last.action, at: last.updated_at } : null;
      row.status = !snapshot ? "Active state unknown" : row.active ? "Configured" : "Not active";
      if (row.fields.some((field) => field.state === "external")) row.status = "Configured externally";
      if (last?.phase === "unresolved" || last?.phase === "write_attempted") row.status = "Save outcome unresolved";
      else if (last?.phase === "saved") {
        const refreshed = context.mode === "local"
          ? snapshot && Number(snapshot.generation) >= Number(last.saved_version)
          : snapshot?.deploymentCreatedAt > Number(last.updated_at) && snapshot?.deploymentId !== last.deployment && row.fields.some((field) => field.version === last.saved_version);
        row.status = refreshed ? last.action === "replace" ? context.mode === "local" ? "Runner restarted after save" : "Deployment refreshed after save" : row.active ? "Configured" : "Disconnected"
          : context.mode === "local" ? snapshot ? "Saved, restart local runner to apply" : "Saved locally, runner not started" : "Saved, awaiting deployment";
      }
    }
    return { version: 1, ...context, services, connections: rows, active: snapshot ? {
      deploymentId: snapshot.deploymentId, generation: snapshot.generation, processGeneration: snapshot.processGeneration, commit: snapshot.commit,
    } : null };
  }
  async function change(body, actor) {
    const input = mutation(body), lease = await journal.acquire();
    try {
      const existing = await journal.operation(input.id);
      if (existing) {
        requireThat(existing.variable === input.variable && existing.action === input.action, "operation_conflict", 409);
        return { operation: existing.id, phase: existing.phase };
      }
      const prior = (await journal.operations()).find((op) => op.variable === input.variable && ["unresolved", "write_attempted"].includes(op.phase));
      requireThat(!prior || input.supersede === true, "explicit_replacement_required", 409);
      requireThat(!prior || input.action === "replace", "replacement_required", 409);
      const saved = (await storage.list()).find((row) => row.variable === input.variable);
      requireThat((saved?.version ?? "absent") === input.version, "connection_changed", 409);
      requireThat(!saved || saved.editable, "use_vercel_settings", 409);
      requireThat(input.action !== "add" || !saved || saved.state === "disconnected", "already_configured", 409);
      const snapshot = await active().catch(() => null);
      await journal.prepare(input, actor, snapshot?.deploymentId);
      await journal.fence(lease);
      await journal.phase(input.id, "write_attempted");
      try {
        await journal.fence(lease);
        // No automatic retry. A lost response leaves the operation unresolved.
        const version = await storage.write(input, saved);
        await journal.fence(lease);
        const generation = await journal.saved(input);
        await journal.phase(input.id, "saved", context.mode === "local" ? String(generation) : version);
        return { operation: input.id, phase: "saved" };
      } catch (error) {
        await journal.phase(input.id, error instanceof ConnectionError && error.status >= 400 && error.status < 500 && error.code !== "lease_expired" ? "failed" : "unresolved");
        throw new ConnectionError("save_outcome_requires_review", 409);
      }
    } finally { input.value = undefined; await journal.release(lease); }
  }
  return { inventory, change };
}
