import { createHash } from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { Executor } from "./db";
import { gtmViewerGrants } from "./schema/viewer-grants";
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
type GrantRow = typeof gtmViewerGrants.$inferSelect;
const ms = (value: Date | null) => (value === null ? null : value.getTime());
/** The stored row as the rest of the viewer knows a grant: times as epoch milliseconds. */
export const decodeGrant = (row: GrantRow): Grant => ({
  id: row.id,
  workspace: row.workspace,
  environment: row.environment,
  workflowId: row.workflow_id,
  views: row.views as View[],
  dataPolicy: row.data_policy,
  createdAt: row.created_at.getTime(),
  expiresAt: ms(row.expires_at),
  revokedAt: ms(row.revoked_at),
});
export const inScope = (scope: Scope) =>
  and(eq(gtmViewerGrants.workspace, scope.workspace), eq(gtmViewerGrants.environment, scope.environment), eq(gtmViewerGrants.workflow_id, scope.workflowId));
export function grants(
  client: Executor,
  scope: Scope,
  clock = Date.now,
) {
  return {
    async list() {
      const rows = await client.select().from(gtmViewerGrants).where(inScope(scope)).orderBy(desc(gtmViewerGrants.created_at)).limit(100);
      return rows.map(decodeGrant);
    },
    async revoke(id: string) {
      const revoked = await client
        .update(gtmViewerGrants)
        .set({ revoked_at: sql`COALESCE(${gtmViewerGrants.revoked_at}, ${new Date(clock())})` })
        .where(and(eq(gtmViewerGrants.id, id), inScope(scope)))
        .returning({ id: gtmViewerGrants.id });
      if (!revoked.length)
        throw new ViewerError(404, "not_found", "Link not found.");
    },
    async authorize(
      token: string,
      view: View | undefined,
      policy?: DataPolicy,
    ) {
      if (!/^[A-Za-z0-9_-]{43}$/.test(token))
        throw new ViewerError(404, "invalid_grant", "Link unavailable.");
      const [row] = await client.select().from(gtmViewerGrants).where(and(eq(gtmViewerGrants.token_hash, hash(token)), inScope(scope))).limit(1);
      if (!row)
        throw new ViewerError(404, "invalid_grant", "Link unavailable.");
      if (!row.token_ciphertext)
        throw new ViewerError(
          410,
          "legacy_link",
          "This link has been replaced. Ask the owner for a new link.",
        );
      const grant = decodeGrant(row);
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
  client: Executor,
  scope: Scope,
) {
  const revoked = await client
    .update(gtmViewerGrants)
    .set({ revoked_at: new Date() })
    .where(and(inScope(scope), isNull(gtmViewerGrants.revoked_at), isNull(gtmViewerGrants.token_ciphertext)))
    .returning({ id: gtmViewerGrants.id });
  return revoked.length;
}
