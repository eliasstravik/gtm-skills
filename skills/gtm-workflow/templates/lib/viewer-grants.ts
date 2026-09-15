import { createHash } from "node:crypto";
import type { Client } from "@libsql/client";
import type { DataPolicy, View } from "./viewer-contract";
export class ViewerError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
export function policyVersion(policy?: DataPolicy): string | null {
  return policy ? hash(canonical(policy)) : null;
}
export type Scope = {
  workspace: string;
  environment: string;
  workflowId: string;
};
export type Grant = Scope & {
  id: string;
  views: View[];
  dataPolicy: string | null;
  createdAt: number;
  expiresAt: number | null;
  revokedAt: number | null;
};
export const decodeGrant = (row: Record<string, unknown>): Grant => ({
  id: String(row.id),
  workspace: String(row.workspace),
  environment: String(row.environment),
  workflowId: String(row.workflow_id),
  views: JSON.parse(String(row.views)),
  dataPolicy: row.data_policy === null ? null : String(row.data_policy),
  createdAt: Number(row.created_at),
  expiresAt: row.expires_at === null ? null : Number(row.expires_at),
  revokedAt: row.revoked_at === null ? null : Number(row.revoked_at),
});
/** Run explicitly during upgrade/deployment, never while browsing. */
export async function migrateViewer(client: Pick<Client, "execute">) {
  await client.execute(`CREATE TABLE IF NOT EXISTS gtm_viewer_grants (
    id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, workflow_id TEXT NOT NULL,
    workspace TEXT NOT NULL, environment TEXT NOT NULL, views TEXT NOT NULL, data_policy TEXT,
    created_at INTEGER NOT NULL, expires_at INTEGER, revoked_at INTEGER
  )`);
  const columns = await client.execute("PRAGMA table_info(gtm_viewer_grants)");
  if (!columns.rows.some((row) => row.name === "token_ciphertext"))
    await client.execute(
      "ALTER TABLE gtm_viewer_grants ADD COLUMN token_ciphertext TEXT",
    );
  await client.execute(`CREATE UNIQUE INDEX IF NOT EXISTS gtm_viewer_one_active_link
    ON gtm_viewer_grants (workspace, environment, workflow_id)
    WHERE revoked_at IS NULL AND token_ciphertext IS NOT NULL`);
}
export function grants(
  client: Pick<Client, "execute">,
  scope: Scope,
  clock = Date.now,
) {
  const scopeArgs = [scope.workspace, scope.environment, scope.workflowId];
  const where = "workspace = ? AND environment = ? AND workflow_id = ?";
  return {
    async list() {
      const rows = await client.execute({
        sql: `SELECT * FROM gtm_viewer_grants WHERE ${where} ORDER BY created_at DESC LIMIT 100`,
        args: scopeArgs,
      });
      return rows.rows.map(decodeGrant);
    },
    async revoke(id: string) {
      const result = await client.execute({
        sql: `UPDATE gtm_viewer_grants SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ? AND ${where}`,
        args: [clock(), id, ...scopeArgs],
      });
      if (!result.rowsAffected)
        throw new ViewerError(404, "not_found", "Link not found.");
    },
    async authorize(
      token: string,
      view: View | undefined,
      policy?: DataPolicy,
    ) {
      if (!/^[A-Za-z0-9_-]{43}$/.test(token))
        throw new ViewerError(404, "invalid_grant", "Link unavailable.");
      const rows = await client.execute({
        sql: `SELECT * FROM gtm_viewer_grants WHERE token_hash = ? AND ${where} LIMIT 1`,
        args: [hash(token), ...scopeArgs],
      });
      if (!rows.rows[0])
        throw new ViewerError(404, "invalid_grant", "Link unavailable.");
      if (!rows.rows[0].token_ciphertext)
        throw new ViewerError(
          410,
          "legacy_link",
          "This link has been replaced. Ask the owner for a new link.",
        );
      const grant = decodeGrant(rows.rows[0]);
      if (grant.revokedAt !== null)
        throw new ViewerError(410, "revoked", "This link was revoked.");
      if (grant.expiresAt !== null && grant.expiresAt <= clock())
        throw new ViewerError(410, "expired", "This link expired.");
      if (view && !grant.views.includes(view))
        throw new ViewerError(403, "view_denied", "This view is not shared.");
      if (
        view === "data" &&
        (!policy || grant.dataPolicy !== policyVersion(policy))
      )
        throw new ViewerError(
          403,
          "policy_changed",
          "Permitted data has changed. Ask the owner to save the sharing permissions.",
        );
      return grant;
    },
  };
}

/** Explicit upgrade only, scoped to the workflows being migrated. Never called on reads. */
export async function revokeLegacyLinks(
  client: Pick<Client, "execute">,
  scope: Scope,
) {
  const result = await client.execute({
    sql: "UPDATE gtm_viewer_grants SET revoked_at = ? WHERE workspace = ? AND environment = ? AND workflow_id = ? AND revoked_at IS NULL AND token_ciphertext IS NULL",
    args: [Date.now(), scope.workspace, scope.environment, scope.workflowId],
  });
  return result.rowsAffected;
}
