import { createHash, randomUUID } from "node:crypto";
import { and, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { stripNul, writeTransaction, type Executor } from "../db";
import { companies, people, profileIdentifiers } from "../schema/profiles";
import { profileInputs } from "../schema/ledger";
import { canonicalUrl, identifiersOf, identityFields } from "./identifiers.mjs";
import { fieldsFor, validateFields, type Entity } from "./schema";

export { canonicalUrl };

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
const tableOf = (entity: Entity) => (entity === "people" ? people : companies);
const time = (value: unknown) => new Date(value as string | Date).getTime();

/** A stored row as the store works with it: jsonb, boolean and timestamptz columns already arrive as values, arrays and Dates. */
export function decode(_entity: Entity, row: Record<string, unknown>): Profile {
  return row as Profile;
}
export async function getProfile(
  db: Executor,
  entity: Entity,
  key: string,
): Promise<Profile | undefined> {
  const t = tableOf(entity);
  const [row] = await db.select().from(t).where(eq(t.key, key));
  if (row) return decode(entity, row);
  // A merged record's old key stays an identifier of the survivor.
  const [alias] = await db
    .select({ key: profileIdentifiers.key })
    .from(profileIdentifiers)
    .where(and(eq(profileIdentifiers.entity, entity), eq(profileIdentifiers.namespace, "internal_key"), eq(profileIdentifiers.value, key)));
  if (!alias) return undefined;
  const [survivor] = await db.select().from(t).where(eq(t.key, alias.key));
  return survivor ? decode(entity, survivor) : undefined;
}
async function write(db: Executor, entity: Entity, profile: Profile) {
  const fields = fieldsFor(entity);
  const values = stripNul(Object.fromEntries(Object.entries(profile).map(([key, value]) => [key, value != null && fields[key] === "TIME" ? new Date(value) : (value ?? null)])));
  validateFields(entity, values);
  const t = tableOf(entity);
  await db
    .insert(t)
    .values(values as never)
    .onConflictDoUpdate({ target: t.key, set: Object.fromEntries(Object.keys(values).filter((key) => key !== "key").map((key) => [key, sql.raw(`excluded."${key}"`)])) });
}
/** The primary key is the backstop, the write lock the mechanism: a claim another record already owns is left alone. */
async function claim(db: Executor, entity: Entity, key: string, identifiers: { namespace: string; value: string; observed_at?: string | Date | null }[]) {
  if (!identifiers.length) return;
  await db
    .insert(profileIdentifiers)
    .values(identifiers.map((id) => ({ entity, namespace: id.namespace, value: id.value, key, observed_at: id.observed_at ? new Date(id.observed_at) : null })))
    .onConflictDoNothing();
}
/** Every profile and ledger write goes through here: one writer at a time, as the code was written for. */
export async function transaction<T>(
  db: Executor,
  fn: (tx: Executor) => Promise<T>,
): Promise<T> {
  return writeTransaction(db, fn);
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
  tx: Executor,
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
  const t = tableOf(entity);
  // Whoever owns any supplied identifier is a candidate, and so is a company with the same domain and name.
  const owners = entries.length
    ? await tx
        .select({ key: profileIdentifiers.key })
        .from(profileIdentifiers)
        .where(and(eq(profileIdentifiers.entity, entity), or(...entries.map(([namespace, value]) => and(eq(profileIdentifiers.namespace, namespace), eq(profileIdentifiers.value, value))))))
    : [];
  const matches: SQL[] = [];
  const candidateKeys = [...new Set([...owners.map((owner) => owner.key), ...(targetKey ? [targetKey] : [])])];
  if (candidateKeys.length) matches.push(inArray(t.key, candidateKeys));
  if (domainEvidence) matches.push(and(eq(companies.domain, supplied.domain!), eq(companies.name, supplied.name!))!);
  // No match must mean no rows: an empty or() would select the whole table.
  const profiles = matches.length ? (await tx.select().from(t).where(or(...matches))).map((row) => decode(entity, row)) : [];
  const known = profiles.length
    ? await tx.select().from(profileIdentifiers).where(and(eq(profileIdentifiers.entity, entity), inArray(profileIdentifiers.key, profiles.map((p) => p.key))))
    : [];
  const aliasesOf = (key: string) => known.filter((alias) => alias.key === key);
  const strong = identityFields[entity].filter((f) => f !== "linkedin_url");
  // Domain/name evidence cannot bridge incompatible platform URLs. A refresh
  // of a known target or an exact strong identifier can establish a changed slug.
  for (const candidate of profiles) {
    const knownUrl = candidate.linkedin_url;
    const suppliedUrl = identity.linkedin_url;
    const knownAlias = aliasesOf(candidate.key).some(
      (alias) =>
        alias.namespace === "linkedin_url" && alias.value === suppliedUrl,
    );
    const matchingStrongId = strong.some(
      (field) => identity[field] && identity[field] === candidate[field],
    );
    if (
      knownUrl &&
      suppliedUrl &&
      knownUrl !== suppliedUrl &&
      !knownAlias &&
      !matchingStrongId &&
      candidate.key !== targetKey
    )
      return { status: "ambiguous" };
  }
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
      time(a.created_at) - time(b.created_at) || a.key.localeCompare(b.key),
  );
  let profile: Profile = profiles[0] ?? {
    key: randomUUID(),
    created_at: new Date(now),
    updated_at: new Date(now),
    enrichment_status: "pending",
    sources_json: [],
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
      // People with this company, found through the GIN index on experiences_json.
      const affected = await tx
        .select()
        .from(people)
        .where(or(eq(people.primary_company_key, duplicate.key), sql`${people.experiences_json} @> ${JSON.stringify([{ company_key: duplicate.key }])}::jsonb`));
      for (const row of affected) {
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
      await tx.update(profileInputs).set({ person_key: profile.key }).where(eq(profileInputs.person_key, duplicate.key));
      // A workspace may keep its own table of people context; it is optional.
      const [optional] = (await tx.execute(sql`SELECT to_regclass('public.lead_enrichment_context') AS name`)).rows;
      if (optional?.name) await tx.execute(sql`UPDATE public.lead_enrichment_context SET person_key = ${profile.key} WHERE person_key = ${duplicate.key}`);
    }
    // The table covers two entities, so no foreign key can do this: the loser's identifiers move to the survivor, and its key becomes one.
    await tx.update(profileIdentifiers).set({ key: profile.key }).where(and(eq(profileIdentifiers.entity, entity), eq(profileIdentifiers.key, duplicate.key)));
    await claim(tx, entity, profile.key, [{ namespace: "internal_key", value: duplicate.key, observed_at: now }]);
    await tx.delete(t).where(eq(t.key, duplicate.key));
  }
  if (
    profile.linkedin_url &&
    identity.linkedin_url !== profile.linkedin_url &&
    known.some(
      (a) =>
        a.namespace === "linkedin_url" && a.value === identity.linkedin_url,
    )
  ) {
    delete identity.linkedin_url;
  }
  // Time columns are Dates in memory as they are when read back; times inside JSON stay ISO text.
  profile = { ...profile, ...identity, updated_at: new Date(now) };
  if (domainEvidence) {
    profile.domain ??= supplied.domain;
    profile.name ??= supplied.name;
  }
  await write(tx, entity, profile);
  // Same transaction as the record. Supplied values first, so a changed slug stays an identifier next to the record's own columns.
  await claim(tx, entity, profile.key, [
    ...entries.map(([namespace, value]) => ({ namespace, value, observed_at: now })),
    ...identifiersOf(entity, profile, []).map((id) => ({ ...id, observed_at: now })),
  ]);
  return { status: "resolved", profile };
}
/** Deleting a record deletes its identifiers in the same transaction; afterwards they resolve to a new record. */
export async function deleteProfile(db: Executor, entity: Entity, key: string) {
  return transaction(db, async (tx) => {
    const t = tableOf(entity);
    await tx.delete(profileIdentifiers).where(and(eq(profileIdentifiers.entity, entity), eq(profileIdentifiers.key, key)));
    await tx.delete(t).where(eq(t.key, key));
  });
}
export async function resolveIdentity(
  client: Executor,
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
  if (!profile.enriched_at || now - time(profile.enriched_at) >= maxAgeMs)
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
  client: Executor,
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
      profile.enriched_at = new Date(evidence.fetched_at);
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
    profile.last_attempt_at = new Date(evidence.fetched_at);
    profile.updated_at = new Date(evidence.fetched_at);
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
export async function currentCompanies(client: Executor, personKeys: string[]) {
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
