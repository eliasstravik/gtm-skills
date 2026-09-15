/** Owner-only link recovery. The share deployment proxies reads and never imports this module. */
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from "node:crypto";
import type { Client } from "@libsql/client";
import type { DataPolicy, View } from "./viewer-contract";
import {
  decodeGrant,
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
const where = "workspace = ? AND environment = ? AND workflow_id = ?";
const args = (scope: Scope) => [
  scope.workspace,
  scope.environment,
  scope.workflowId,
];
export async function activeLink(
  client: Pick<Client, "execute">,
  scope: Scope,
) {
  const result = await client.execute({
    sql: `SELECT * FROM gtm_viewer_grants WHERE ${where} AND revoked_at IS NULL AND token_ciphertext IS NOT NULL LIMIT 1`,
    args: args(scope),
  });
  return result.rows[0];
}
/** Serialize create/copy/save across owners. No browser state or plaintext token persistence. */
export async function saveLink(
  client: Client,
  scope: Scope,
  options: { views?: unknown; policy?: unknown; save?: unknown },
  policy?: DataPolicy,
) {
  // SQLite and remote replicas may briefly contend on the write lock. Retry only acquisition,
  // before any mutation; uniqueness is enforced by the database, not a process-local lock.
  let tx;
  for (let attempt = 0; ; attempt++) {
    try {
      tx = await client.transaction("write");
      break;
    } catch (error) {
      if (
        attempt >= 5 ||
        !["SQLITE_BUSY", "TRANSACTION_ACTIVE"].includes(
          (error as { code?: string }).code ?? "",
        )
      )
        throw error;
      await new Promise((resolve) => setTimeout(resolve, 20 * 2 ** attempt));
    }
  }
  try {
    const current = await activeLink(tx, scope);
    if (current && options.save !== true) {
      const grant = decodeGrant(current);
      const token = decrypt(String(current.token_ciphertext), grant);
      await tx.commit();
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
      await tx.execute({
        sql: `UPDATE gtm_viewer_grants SET views = ?, data_policy = ? WHERE id = ? AND ${where}`,
        args: [
          JSON.stringify(views),
          grant.dataPolicy,
          grant.id,
          ...args(scope),
        ],
      });
    else
      await tx.execute({
        sql: `INSERT INTO gtm_viewer_grants (id, token_hash, workflow_id, workspace, environment, views, data_policy, created_at, expires_at, revoked_at, token_ciphertext) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)`,
        args: [
          grant.id,
          hash(token),
          scope.workflowId,
          scope.workspace,
          scope.environment,
          JSON.stringify(views),
          grant.dataPolicy,
          grant.createdAt,
          encrypt(token, grant),
        ],
      });
    await tx.commit();
    return { grant, token };
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally {
    tx.close();
  }
}
