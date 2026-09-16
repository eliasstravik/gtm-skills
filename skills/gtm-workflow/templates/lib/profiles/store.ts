import { createHash, randomUUID } from "node:crypto";
import type { Client, Transaction, InValue } from "@libsql/client";
import {
  fieldsFor,
  identityFields,
  validateFields,
  type Entity,
} from "./schema";

export type Source = {
  workflow_id: string;
  source_id: string;
  source_row_id: string;
  network_owner?: string;
  network_kind?: string;
  connected_on?: string;
  first_observed_at: string;
  last_observed_at: string;
};
export type Identity = Partial<
  Record<
    | "linkedin_url"
    | "linkedin_profile_id"
    | "linkedin_numeric_id"
    | "linkedin_urn"
    | "linkedin_company_id"
    | "domain"
    | "name",
    string
  >
>;
export type Experience = {
  experience_key: string;
  company_key: string | null;
  company_name: string | null;
  company_linkedin_id?: string | null;
  company_linkedin_url?: string | null;
  company_domain?: string | null;
  title: string | null;
  start_date: string | null;
  end_date: string | null;
  current_status: "current" | "ended" | "unknown";
  current_status_evidence: unknown;
  is_primary?: boolean | null;
  [key: string]: unknown;
};
export type Coverage =
  | "complete"
  | "partial"
  | "truncated"
  | "unsupported"
  | "not_requested"
  | "unknown"
  | "failed";
export type Evidence = {
  provider: string;
  endpoint: string;
  mode: string;
  fetched_at: string;
  observed_at?: string;
  classification?: "reported" | "inferred" | "derived";
  outcome: "success" | "no_match" | "failed" | "ambiguous";
  fields: Record<string, unknown>;
  sections: Record<string, Coverage>;
  raw: unknown;
  cost_usd: number | null;
};
export type Profile = Record<string, any> & { key: string };
type Sql = Pick<Client, "execute">;
const q = (name: string) => `"${name}"`;
export function canonicalUrl(value: string, entity: Entity): string | null {
  try {
    const url = new URL(value.startsWith("http") ? value : `https://${value}`);
    if (!/(^|\.)linkedin\.com$/i.test(url.hostname)) return null;
    const match = url.pathname.match(
      entity === "people" ? /^\/in\/([^/]+)\/?$/i : /^\/company\/([^/]+)\/?$/i,
    );
    return match
      ? `https://www.linkedin.com/${entity === "people" ? "in" : "company"}/${match[1].toLowerCase()}`
      : null;
  } catch {
    return null;
  }
}
export function decode(entity: Entity, row: Record<string, unknown>): Profile {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      value == null
        ? null
        : fieldsFor(entity)[key]?.startsWith("JSON")
          ? JSON.parse(String(value))
          : fieldsFor(entity)[key] === "BOOL"
            ? Boolean(value)
            : value,
    ]),
  ) as Profile;
}
export async function getProfile(
  db: Sql,
  entity: Entity,
  key: string,
): Promise<Profile | undefined> {
  const result = await db.execute({
    sql: `SELECT * FROM ${q(entity)} WHERE key = ?`,
    args: [key],
  });
  if (result.rows[0]) return decode(entity, result.rows[0]);
  const alias = await db.execute({
    sql: `SELECT * FROM ${q(entity)} WHERE EXISTS (SELECT 1 FROM json_each(COALESCE(identifiers_json, '[]')) a WHERE json_extract(a.value, '$.namespace') = 'internal_key' AND json_extract(a.value, '$.value') = ?)`,
    args: [key],
  });
  return alias.rows.length === 1 ? decode(entity, alias.rows[0]) : undefined;
}
async function write(db: Sql, entity: Entity, profile: Profile) {
  validateFields(entity, profile);
  const keys = Object.keys(profile);
  const args = keys.map((key) => {
    const v = profile[key];
    return v == null
      ? null
      : fieldsFor(entity)[key].startsWith("JSON")
        ? JSON.stringify(v)
        : typeof v === "boolean"
          ? Number(v)
          : v;
  }) as InValue[];
  await db.execute({
    sql: `INSERT INTO ${q(entity)} (${keys.map(q).join(",")}) VALUES (${keys.map(() => "?").join(",")}) ON CONFLICT(key) DO UPDATE SET ${keys
      .filter((k) => k !== "key")
      .map((k) => `${q(k)}=excluded.${q(k)}`)
      .join(",")}`,
    args,
  });
}
export async function transaction<T>(
  client: Client,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  const tx = await client.transaction("write");
  try {
    const result = await fn(tx);
    await tx.commit();
    return result;
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally {
    tx.close();
  }
}
function sourceUnion(a: Source[], b: Source[]) {
  const result = new Map<string, Source>();
  for (const item of [...a, ...b]) {
    const key = JSON.stringify([
      item.workflow_id,
      item.source_id,
      item.source_row_id,
    ]);
    const prior = result.get(key);
    result.set(key, {
      ...prior,
      ...item,
      first_observed_at: prior?.first_observed_at ?? item.first_observed_at,
    });
  }
  return [...result.values()];
}
/** Called only inside the same serialized transaction as profile writes. */
async function resolve(
  tx: Sql,
  entity: Entity,
  supplied: Identity,
  now: string,
  create = true,
  targetKey?: string,
): Promise<
  | { status: "resolved"; profile: Profile }
  | { status: "unresolved" | "ambiguous" }
> {
  const identity: Record<string, string> = {};
  for (const field of identityFields[entity]) {
    const value = supplied[field as keyof Identity];
    if (!value) continue;
    if (typeof value !== "string")
      throw new Error("Identity must preserve string precision");
    const normalized =
      field === "linkedin_url" ? canonicalUrl(value, entity) : value.trim();
    if (normalized) identity[field] = normalized;
  }
  const domainEvidence =
    entity === "companies" && supplied.domain && supplied.name;
  if (!Object.keys(identity).length && !domainEvidence)
    return { status: "unresolved" };
  const entries = Object.entries(identity);
  const found = await tx.execute({
    sql: `SELECT * FROM ${q(entity)} WHERE 0 ${entries.map(([field]) => `OR (${q(field)} = ? OR EXISTS (SELECT 1 FROM json_each(COALESCE(identifiers_json, '[]')) a WHERE json_extract(a.value, '$.namespace') = ? AND json_extract(a.value, '$.value') = ?))`).join(" ")}${domainEvidence ? " OR (domain = ? AND name = ?)" : ""}${targetKey ? " OR key = ?" : ""}`,
    args: [
      ...entries.flatMap(([field, value]) => [value, field, value]),
      ...(domainEvidence ? [supplied.domain!, supplied.name!] : []),
      ...(targetKey ? [targetKey] : []),
    ],
  });
  const profiles = found.rows.map((row) => decode(entity, row));
  const strong = identityFields[entity].filter((f) => f !== "linkedin_url");
  for (const field of strong) {
    const values = new Set(
      [identity[field], ...profiles.map((p) => p[field])].filter(Boolean),
    );
    if (values.size > 1) return { status: "ambiguous" };
  }
  if (profiles.length > 1 && !strong.some((f) => identity[f]))
    return { status: "ambiguous" };
  if (!profiles.length && !create) return { status: "unresolved" };
  profiles.sort(
    (a, b) =>
      String(a.created_at).localeCompare(String(b.created_at)) ||
      a.key.localeCompare(b.key),
  );
  let profile: Profile = profiles[0] ?? {
    key: randomUUID(),
    created_at: now,
    updated_at: now,
    enrichment_status: "pending",
    sources_json: [],
    identifiers_json: [],
  };
  for (const duplicate of profiles.slice(1)) {
    // Preserve accepted values and their evidence; reconciliation does not refresh either profile.
    const prior = profile;
    profile = {
      ...duplicate,
      ...Object.fromEntries(Object.entries(prior).filter(([, v]) => v != null)),
    } as Profile;
    profile.sources_json = sourceUnion(
      prior.sources_json ?? [],
      duplicate.sources_json ?? [],
    );
    profile.identifiers_json = [
      ...(prior.identifiers_json ?? []),
      ...(duplicate.identifiers_json ?? []),
      { namespace: "internal_key", value: duplicate.key, observed_at: now },
    ];
    profile.raw_responses_json = {
      ...duplicate.raw_responses_json,
      ...prior.raw_responses_json,
    };
    profile.provenance_json = {
      ...duplicate.provenance_json,
      ...prior.provenance_json,
    };
    for (const field of Object.keys(duplicate.provenance_json ?? {})) {
      if (prior[field] == null)
        profile.provenance_json[field] = duplicate.provenance_json[field];
    }
    if (entity === "companies") {
      const affected = await tx.execute({
        sql: "SELECT * FROM people WHERE primary_company_key = ? OR EXISTS (SELECT 1 FROM json_each(COALESCE(experiences_json, '[]')) e WHERE json_extract(e.value, '$.company_key') = ?)",
        args: [duplicate.key, duplicate.key],
      });
      for (const row of affected.rows) {
        const person = decode("people", row);
        person.experiences_json = (person.experiences_json ?? []).map(
          (e: Experience) =>
            e.company_key === duplicate.key
              ? { ...e, company_key: profile.key }
              : e,
        );
        if (person.primary_company_key === duplicate.key)
          person.primary_company_key = profile.key;
        await write(tx, "people", person);
      }
    }
    if (entity === "people") {
      // Operational tables are optional for standalone profile readers.
      const tables = await tx.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('profile_inputs','lead_enrichment_context')",
      );
      for (const row of tables.rows)
        await tx.execute({
          sql: `UPDATE ${q(String(row.name))} SET person_key = ? WHERE person_key = ?`,
          args: [profile.key, duplicate.key],
        });
    }
    await tx.execute({
      sql: `DELETE FROM ${q(entity)} WHERE key = ?`,
      args: [duplicate.key],
    });
  }
  const aliases = new Map<string, unknown>(
    (profile.identifiers_json ?? []).map((a: any) => [
      JSON.stringify([a.namespace, a.value]),
      a,
    ]),
  );
  if (
    profile.linkedin_url &&
    identity.linkedin_url !== profile.linkedin_url &&
    (profile.identifiers_json ?? []).some(
      (a: any) =>
        a.namespace === "linkedin_url" && a.value === identity.linkedin_url,
    )
  ) {
    delete identity.linkedin_url;
  }
  for (const [namespace, value] of entries)
    aliases.set(JSON.stringify([namespace, value]), {
      namespace,
      value,
      observed_at: now,
    });
  profile = {
    ...profile,
    ...identity,
    identifiers_json: [...aliases.values()],
    updated_at: now,
  };
  if (domainEvidence) {
    profile.domain ??= supplied.domain;
    profile.name ??= supplied.name;
  }
  await write(tx, entity, profile);
  return { status: "resolved", profile };
}
export async function resolveIdentity(
  client: Client,
  entity: Entity,
  identity: Identity,
  source?: Source,
) {
  return transaction(client, async (tx) => {
    const result = await resolve(
      tx,
      entity,
      identity,
      new Date().toISOString(),
    );
    if (result.status === "resolved" && source) {
      result.profile.sources_json = sourceUnion(
        result.profile.sources_json ?? [],
        [source],
      );
      await write(tx, entity, result.profile);
    }
    return result;
  });
}
/** Import and membership writes never change enriched_at. */
export function isFresh(
  profile: Profile,
  provider: string,
  endpoint: string,
  mode: string,
  sections: string[] = [],
  maxAgeMs = 30 * 86400000,
  now = Date.now(),
) {
  if (!profile.enriched_at || now - Date.parse(profile.enriched_at) >= maxAgeMs)
    return false;
  const evidence = Object.values(profile.raw_responses_json ?? {}) as any[];
  return evidence.some(
    (e) =>
      e.provider === provider &&
      e.endpoint === endpoint &&
      e.mode === mode &&
      e.outcome === "success" &&
      now - Date.parse(e.fetched_at) < maxAgeMs &&
      sections.every((s) => e.sections?.[s] === "complete"),
  );
}
export function recentMiss(
  profile: Profile,
  provider: string,
  endpoint: string,
  mode: string,
  maxAgeMs = 30 * 86400000,
  now = Date.now(),
) {
  return Object.values(profile.raw_responses_json ?? {}).some(
    (e: any) =>
      e.provider === provider &&
      e.endpoint === endpoint &&
      e.mode === mode &&
      e.outcome === "no_match" &&
      now - Date.parse(e.fetched_at) < maxAgeMs,
  );
}
export function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([k]) =>
            !/^(authorization|headers|request_headers|api_?key|access_?token|refresh_?token|password|secret)$/i.test(
              k,
            ),
        )
        .map(([k, v]) => [k, sanitize(v)]),
    );
  return value;
}
export async function applyEvidence(
  client: Client,
  entity: Entity,
  key: string,
  evidence: Evidence,
) {
  validateFields(entity, evidence.fields);
  if (
    Object.keys(evidence.fields).some((k) =>
      [
        "key",
        "sources_json",
        "created_at",
        "updated_at",
        "enriched_at",
        "raw_responses_json",
        "provenance_json",
        "identifiers_json",
        "section_status_json",
        "last_attempt_at",
        "enrichment_status",
        "error",
        "cost_usd",
      ].includes(k),
    )
  )
    throw new Error("Provider cannot write operational metadata");
  return transaction(client, async (tx) => {
    let profile = await getProfile(tx, entity, key);
    if (!profile) throw new Error("Profile not found");
    let outcome = evidence.outcome;
    if (outcome === "success") {
      const identity = Object.fromEntries(
        identityFields[entity]
          .filter((f) => evidence.fields[f] != null)
          .map((f) => [f, evidence.fields[f]]),
      ) as Identity;
      // Include prior platform evidence to reject an incompatible refresh.
      const conflicts = identityFields[entity]
        .filter((f) => f !== "linkedin_url")
        .some(
          (f) =>
            identity[f as keyof Identity] &&
            profile![f] &&
            identity[f as keyof Identity] !== profile![f],
        );
      const changedUrl =
        identity.linkedin_url &&
        profile.linkedin_url &&
        canonicalUrl(identity.linkedin_url, entity) !== profile.linkedin_url;
      const stronger = identityFields[entity].some(
        (f) => f !== "linkedin_url" && identity[f as keyof Identity],
      );
      if (conflicts || (changedUrl && !stronger)) outcome = "ambiguous";
      else if (Object.keys(identity).length) {
        const result = await resolve(
          tx,
          entity,
          {
            ...Object.fromEntries(
              identityFields[entity]
                .filter((f) => profile![f])
                .map((f) => [f, profile![f]]),
            ),
            ...identity,
          },
          evidence.fetched_at,
          true,
          profile.key,
        );
        if (result.status === "ambiguous") outcome = "ambiguous";
        else if (result.status === "resolved") profile = result.profile;
      }
    }
    const envelope = {
      ...evidence,
      outcome,
      raw: sanitize(evidence.raw),
      fields: undefined,
    };
    const ref = createHash("sha256")
      .update(JSON.stringify(envelope))
      .digest("hex");
    const raw = { ...profile.raw_responses_json, [ref]: envelope };
    const provenance = { ...profile.provenance_json };
    const coverage = { ...profile.section_status_json };
    let partial = false;
    if (outcome === "success") {
      for (const [field, value] of Object.entries(evidence.fields)) {
        if (value == null) continue;
        const section = fieldsFor(entity)[field].startsWith("JSON");
        const state =
          evidence.sections[field] ?? (section ? "unknown" : "complete");
        if (section)
          coverage[field] = {
            status: state,
            response: ref,
            fetched_at: evidence.fetched_at,
            returned_count: Array.isArray(value) ? value.length : undefined,
          };
        if (["unsupported", "failed", "not_requested"].includes(state)) {
          partial = true;
          continue;
        }
        if (section && state !== "complete") {
          partial = true;
          if (profile[field] != null || (Array.isArray(value) && !value.length))
            continue;
        }
        profile[field] =
          field === "linkedin_url"
            ? (canonicalUrl(String(value), entity) ?? profile[field])
            : sanitize(value);
        provenance[field] = {
          response: ref,
          provider: evidence.provider,
          endpoint: evidence.endpoint,
          mode: evidence.mode,
          fetched_at: evidence.fetched_at,
          observed_at: evidence.observed_at ?? null,
          classification: evidence.classification ?? "reported",
          completeness: state,
        };
      }
      if (
        entity === "people" &&
        provenance.experiences_json?.response === ref
      ) {
        const roles: Experience[] = profile.experiences_json ?? [];
        for (const role of roles) {
          const company = await resolve(
            tx,
            "companies",
            {
              linkedin_company_id: role.company_linkedin_id ?? undefined,
              linkedin_url: role.company_linkedin_url ?? undefined,
              domain: role.company_domain ?? undefined,
              name: role.company_name ?? undefined,
            },
            evidence.fetched_at,
            role.current_status === "current",
          );
          role.company_key =
            company.status === "resolved" ? company.profile.key : null;
          if (company.status === "resolved") {
            if (!company.profile.name) company.profile.name = role.company_name;
            if (!company.profile.domain)
              company.profile.domain = role.company_domain ?? null;
            await write(tx, "companies", company.profile);
          }
        }
        const current = roles.filter((r) => r.current_status === "current");
        const explicit = current.filter((r) => r.is_primary === true);
        const primary =
          explicit.length === 1
            ? explicit[0]
            : current.length === 1
              ? current[0]
              : null;
        profile.primary_company_key = primary?.company_key ?? null;
        profile.primary_job_title = primary?.title ?? null;
      }
      profile.enriched_at = evidence.fetched_at;
    }
    // Keep latest evidence per endpoint/mode and every envelope supporting surviving fields.
    const keep = new Set<string>(
      Object.values(provenance).map((p: any) => p.response),
    );
    const latest = new Map<string, string>();
    for (const [id, e] of Object.entries(raw) as [string, any][]) {
      const operation = JSON.stringify([e.provider, e.endpoint, e.mode]);
      const prior = latest.get(operation);
      if (!prior || raw[prior].fetched_at <= e.fetched_at)
        latest.set(operation, id);
    }
    for (const id of latest.values()) keep.add(id);
    profile.raw_responses_json = Object.fromEntries(
      Object.entries(raw).filter(([id]) => keep.has(id)),
    );
    profile.provenance_json = provenance;
    profile.section_status_json = coverage;
    profile.last_attempt_at = evidence.fetched_at;
    profile.updated_at = evidence.fetched_at;
    profile.cost_usd = evidence.cost_usd;
    profile.enrichment_status =
      outcome === "success" ? (partial ? "partial" : "enriched") : outcome;
    profile.error =
      outcome === "failed"
        ? "Provider lookup failed; previous profile retained"
        : null;
    await write(tx, entity, profile);
    return profile;
  });
}
export async function currentCompanies(client: Sql, personKeys: string[]) {
  const companies = new Set<string>();
  let roles = 0,
    unresolved = 0;
  for (const key of personKeys) {
    const person = await getProfile(client, "people", key);
    for (const role of (person?.experiences_json ?? []) as Experience[])
      if (role.current_status === "current") {
        roles++;
        if (role.company_key) companies.add(role.company_key);
        else unresolved++;
      }
  }
  return { keys: [...companies].sort(), roles, unresolved };
}
