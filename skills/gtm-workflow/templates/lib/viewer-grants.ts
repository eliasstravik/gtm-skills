import { createHash, randomBytes, randomUUID } from "node:crypto";
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
const decode = (row: Record<string, unknown>): Grant => ({
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
  await client.execute(`CREATE TABLE IF NOT EXISTS gtm_viewer_graphs (
    workspace TEXT NOT NULL, environment TEXT NOT NULL, workflow_id TEXT NOT NULL,
    deployment_id TEXT NOT NULL, revision TEXT NOT NULL, display TEXT NOT NULL,
    PRIMARY KEY (workspace, environment, workflow_id, deployment_id, revision)
  )`);
}
export function grants(
  client: Pick<Client, "execute">,
  scope: Scope,
  clock = Date.now,
) {
  const scopeArgs = [scope.workspace, scope.environment, scope.workflowId];
  const where = "workspace = ? AND environment = ? AND workflow_id = ?";
  return {
    async create(
      options: { views?: unknown; expiresAt?: unknown },
      policy?: DataPolicy,
    ) {
      const views = options.views === undefined ? ["logic"] : options.views;
      if (
        !Array.isArray(views) ||
        !views.includes("logic") ||
        views.length > 3 ||
        new Set(views).size !== views.length ||
        views.some((v) => !["logic", "runs", "data"].includes(v))
      )
        throw new ViewerError(
          400,
          "invalid_scope",
          "Choose Logic and optionally Runs or Data.",
        );
      if (views.includes("data") && !policy)
        throw new ViewerError(
          400,
          "data_unavailable",
          "Sharing is not configured for this data.",
        );
      const now = clock();
      const expiresAt =
        options.expiresAt === undefined
          ? now + 7 * 86400000
          : options.expiresAt;
      if (
        expiresAt !== null &&
        (typeof expiresAt !== "number" ||
          !Number.isSafeInteger(expiresAt) ||
          expiresAt <= now)
      )
        throw new ViewerError(
          400,
          "invalid_expiry",
          "Choose an expiry in the future.",
        );
      const token = randomBytes(32).toString("base64url");
      const grant: Grant = {
        ...scope,
        id: randomUUID(),
        views: views as View[],
        dataPolicy: views.includes("data") ? policyVersion(policy) : null,
        createdAt: now,
        expiresAt: expiresAt as number | null,
        revokedAt: null,
      };
      await client.execute({
        sql: "INSERT INTO gtm_viewer_grants VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        args: [
          grant.id,
          hash(token),
          scope.workflowId,
          scope.workspace,
          scope.environment,
          JSON.stringify(views),
          grant.dataPolicy,
          now,
          grant.expiresAt,
          null,
        ],
      });
      return { grant, token };
    },
    async list() {
      const rows = await client.execute({
        sql: `SELECT * FROM gtm_viewer_grants WHERE ${where} ORDER BY created_at DESC LIMIT 100`,
        args: scopeArgs,
      });
      return rows.rows.map(decode);
    },
    async revoke(id: string) {
      const result = await client.execute({
        sql: `UPDATE gtm_viewer_grants SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ? AND ${where}`,
        args: [clock(), id, ...scopeArgs],
      });
      if (!result.rowsAffected)
        throw new ViewerError(404, "not_found", "Link not found.");
    },
    async authorize(token: string, view: View, policy?: DataPolicy) {
      if (!/^[A-Za-z0-9_-]{43}$/.test(token))
        throw new ViewerError(404, "invalid_grant", "Link unavailable.");
      const rows = await client.execute({
        sql: `SELECT * FROM gtm_viewer_grants WHERE token_hash = ? AND ${where} LIMIT 1`,
        args: [hash(token), ...scopeArgs],
      });
      if (!rows.rows[0])
        throw new ViewerError(404, "invalid_grant", "Link unavailable.");
      const grant = decode(rows.rows[0]);
      if (grant.revokedAt !== null)
        throw new ViewerError(410, "revoked", "This link was revoked.");
      if (grant.expiresAt !== null && grant.expiresAt <= clock())
        throw new ViewerError(410, "expired", "This link expired.");
      if (!grant.views.includes(view))
        throw new ViewerError(403, "view_denied", "This view is not shared.");
      if (
        view === "data" &&
        (!policy || grant.dataPolicy !== policyVersion(policy))
      )
        throw new ViewerError(
          403,
          "policy_changed",
          "Data permissions changed. Ask the owner for a new link.",
        );
      return grant;
    },
  };
}
