/** Owner-only link recovery. The share deployment proxies reads and never imports this module. */
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { writeLock, type Executor } from "./db";
import { gtmViewerGrants } from "./schema/viewer-grants";
import type { DataPolicy, View } from "./viewer-contract";
import {
  decodeGrant,
  inScope,
  hash,
  policyVersion,
  ViewerError,
  type Scope,
  type Grant,
} from "./viewer-grants";

function key() {
  const value = process.env.GTM_VIEWER_LINK_KEY;
  if (!value || !/^[a-fA-F0-9]{64}$/.test(value))
    throw new ViewerError(
      503,
      "recovery_unavailable",
      "Share link recovery is not configured. Ask the owner to check the sharing key.",
    );
  return Buffer.from(value, "hex");
}
const aad = (grant: Grant) =>
  Buffer.from(
    JSON.stringify([
      1,
      grant.workspace,
      grant.environment,
      grant.workflowId,
      grant.id,
    ]),
  );
function encrypt(token: string, grant: Grant) {
  const nonce = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), nonce);
  cipher.setAAD(aad(grant));
  const ciphertext = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  return [
    "1",
    nonce.toString("base64url"),
    ciphertext.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
  ].join(".");
}
function decrypt(envelope: string, grant: Grant) {
  const secret = key();
  try {
    const [version, nonce, value, tag, extra] = envelope.split(".");
    if (version !== "1" || extra) throw Error();
    const decipher = createDecipheriv(
      "aes-256-gcm",
      secret,
      Buffer.from(nonce, "base64url"),
    );
    decipher.setAAD(aad(grant));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(value, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new ViewerError(
      503,
      "recovery_unavailable",
      "This link cannot be recovered. Restore its key or turn it off and create a new link.",
    );
  }
}
export function shareUrl(workflowId: string, token = "") {
  if (!process.env.GTM_VIEWER_SHARE_ORIGIN)
    throw new ViewerError(503, "configuration", "Sharing is not configured.");
  let link: URL;
  try {
    link = new URL("/share", process.env.GTM_VIEWER_SHARE_ORIGIN);
  } catch {
    throw new ViewerError(503, "configuration", "Invalid sharing origin.");
  }
  if (
    link.protocol !== "https:" &&
    !(
      process.env.GTM_VIEWER_TEST === "1" &&
      ["127.0.0.1", "localhost"].includes(link.hostname)
    )
  )
    throw new ViewerError(
      503,
      "configuration",
      "A secure hosted sharing origin is required.",
    );
  if (link.username || link.password)
    throw new ViewerError(503, "configuration", "Invalid sharing origin.");
  link.searchParams.set("workflow", workflowId);
  if (token) link.hash = new URLSearchParams({ token }).toString();
  return link;
}
/** Recover an existing link without creating or changing a grant. */
export function recoverLink(row: Parameters<typeof decodeGrant>[0]) {
  const grant = decodeGrant(row);
  return shareUrl(
    grant.workflowId,
    decrypt(String(row.token_ciphertext), grant),
  ).href;
}
export async function activeLink(
  client: Executor,
  scope: Scope,
) {
  const [row] = await client
    .select()
    .from(gtmViewerGrants)
    .where(and(inScope(scope), isNull(gtmViewerGrants.revoked_at), isNotNull(gtmViewerGrants.token_ciphertext)))
    .limit(1);
  return row;
}
/** Serialize create/copy/save across owners. No browser state or plaintext token persistence. */
export async function saveLink(
  client: Executor,
  scope: Scope,
  options: { views?: unknown; policy?: unknown; save?: unknown },
  policy?: DataPolicy,
) {
  // One writer at a time, so two owners saving at once see each other's link; the unique index on the one active
  // link per workflow is the backstop, not a process-local lock.
  return client.transaction(async (tx) => {
    await writeLock(tx);
    const current = await activeLink(tx, scope);
    if (current && options.save !== true) {
      const grant = decodeGrant(current);
      const token = decrypt(String(current.token_ciphertext), grant);
      return { grant, token };
    }
    const views = options.views === undefined ? ["logic"] : options.views;
    if (
      !Array.isArray(views) ||
      !views.length ||
      views.length > 3 ||
      new Set(views).size !== views.length ||
      views.some((v) => !["logic", "runs", "data"].includes(v))
    )
      throw new ViewerError(
        400,
        "invalid_scope",
        "Choose at least one available view.",
      );
    if (views.includes("data") && !policy)
      throw new ViewerError(
        400,
        "data_unavailable",
        "Data sharing is not configured.",
      );
    if (views.includes("data") && options.policy !== policyVersion(policy))
      throw new ViewerError(
        409,
        "policy_changed",
        "Permitted data has changed. Review it and save again.",
      );
    const grant: Grant = current
      ? {
          ...decodeGrant(current),
          views: views as View[],
          dataPolicy: views.includes("data") ? policyVersion(policy) : null,
        }
      : {
          ...scope,
          id: randomUUID(),
          views: views as View[],
          dataPolicy: views.includes("data") ? policyVersion(policy) : null,
          createdAt: Date.now(),
          expiresAt: null,
          revokedAt: null,
        };
    const token = current
      ? decrypt(String(current.token_ciphertext), grant)
      : randomBytes(32).toString("base64url");
    if (current)
      await tx.update(gtmViewerGrants).set({ views, data_policy: grant.dataPolicy }).where(and(eq(gtmViewerGrants.id, grant.id), inScope(scope)));
    else
      await tx.insert(gtmViewerGrants).values({
        id: grant.id,
        token_hash: hash(token),
        workflow_id: scope.workflowId,
        workspace: scope.workspace,
        environment: scope.environment,
        views,
        data_policy: grant.dataPolicy,
        created_at: new Date(grant.createdAt),
        token_ciphertext: encrypt(token, grant),
      });
    return { grant, token };
  });
}
