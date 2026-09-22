import { createHash, randomUUID } from "node:crypto";
import { and, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { lockNames, stripNul, writeTransaction, type Executor } from "../db";
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
  /** The ledger attempt whose response_json holds the payload; with it, the record keeps a reference instead of the payload. */
  attempt_id?: string;
};
/** What a record keeps per response: the envelope without its payload when a ledger attempt holds that, otherwise with it. */
export type ResponseEnvelope = Omit<Evidence, "fields" | "raw"> & { raw?: unknown };
export type Profile = Record<string, any> & { key: string };
const tableOf = (entity: Entity) => (entity === "people" ? people : companies);
const time = (value: unknown) => new Date(value as string | Date).getTime();
const identifierName = (entity: Entity, namespace: string, value: string) => `id:${entity}:${namespace}:${value}`;
const CHUNK = 500;

/** A stored row as the store works with it: jsonb, boolean and timestamptz columns already arrive as values, arrays and Dates. */
export function decode(_entity: Entity, row: Record<string, unknown>): Profile {
  return row as Profile;
}
/** Several records by key, in batches; a merged record's old key finds the survivor. Missing keys are left out. */
export async function getProfiles(db: Executor, entity: Entity, keys: string[]): Promise<Map<string, Profile>> {
  const t = tableOf(entity);
  const found = new Map<string, Profile>();
  const unique = [...new Set(keys)];
  for (let i = 0; i < unique.length; i += CHUNK) {
    const batch = unique.slice(i, i + CHUNK);
    for (const row of await db.select().from(t).where(inArray(t.key, batch))) found.set(row.key, decode(entity, row));
    const missing = batch.filter((key) => !found.has(key));
    if (!missing.length) continue;
    const aliases = await db
      .select({ old: profileIdentifiers.value, key: profileIdentifiers.key })
      .from(profileIdentifiers)
      .where(and(eq(profileIdentifiers.entity, entity), eq(profileIdentifiers.namespace, "internal_key"), inArray(profileIdentifiers.value, missing)));
    if (!aliases.length) continue;
    const survivors = new Map((await db.select().from(t).where(inArray(t.key, [...new Set(aliases.map((a) => a.key))]))).map((row) => [row.key, decode(entity, row)]));
    for (const alias of aliases) {
      const survivor = survivors.get(alias.key);
      if (survivor) found.set(alias.old, survivor);
    }
  }
  return found;
}
/** One record by key. Inside a write transaction, `lock` takes the row lock that serializes writers of this record. */
export async function getProfile(
  db: Executor,
  entity: Entity,
  key: string,
  options: { lock?: boolean } = {},
): Promise<Profile | undefined> {
  const t = tableOf(entity);
  const one = (k: string) => (options.lock ? db.select().from(t).where(eq(t.key, k)).for("update") : db.select().from(t).where(eq(t.key, k)));
  const [row] = await one(key);
  if (row) return decode(entity, row);
  // A merged record's old key stays an identifier of the survivor.
  const [alias] = await db
    .select({ key: profileIdentifiers.key })
    .from(profileIdentifiers)
    .where(and(eq(profileIdentifiers.entity, entity), eq(profileIdentifiers.namespace, "internal_key"), eq(profileIdentifiers.value, key)));
  if (!alias) return undefined;
  const [survivor] = await one(alias.key);
  return survivor ? decode(entity, survivor) : undefined;
}
const same = (a: unknown, b: unknown) => {
  if (a == null || b == null) return a == null && b == null;
  if (a instanceof Date || b instanceof Date) return time(a) === time(b);
  if (typeof a === "object" || typeof b === "object") return JSON.stringify(a) === JSON.stringify(b);
  return a === b;
};
/**
 * Writes a record. With `previous` (the row as read in this transaction) only the changed columns are sent, and
 * nothing at all when only updated_at would change: a resolution that changes nothing is not an update.
 */
async function write(db: Executor, entity: Entity, profile: Profile, previous?: Profile) {
  const fields = fieldsFor(entity);
  const values = Object.fromEntries(Object.entries(profile).map(([key, value]) => [key, value != null && fields[key] === "TIME" ? new Date(value) : (value ?? null)]));
  const t = tableOf(entity);
  if (!previous || previous.key !== values.key) {
    const row = stripNul(values);
    validateFields(entity, row);
    await db
      .insert(t)
      .values(row as never)
      .onConflictDoUpdate({ target: t.key, set: Object.fromEntries(Object.keys(row).filter((key) => key !== "key").map((key) => [key, sql.raw(`excluded."${key}"`)])) });
    return;
  }
  // Only the changed columns are cleaned, validated and sent.
  const changed = stripNul(Object.fromEntries(Object.entries(values).filter(([key, value]) => key !== "key" && !same(value, previous[key]))));
  if (!Object.keys(changed).some((key) => key !== "updated_at")) return;
  validateFields(entity, changed);
  await db.update(t).set(changed as never).where(eq(t.key, values.key));
}
type Claim = { namespace: string; value: string; observed_at?: string | Date | null };
/** The primary key is the backstop, the identifier lock the mechanism: a claim another record already owns is left alone. Known claims are skipped. */
async function claim(db: Executor, entity: Entity, key: string, identifiers: Claim[], known: { namespace: string; value: string; key: string }[] = []) {
  const wanted = identifiers.filter((id) => !known.some((k) => k.key === key && k.namespace === id.namespace && k.value === id.value));
  if (!wanted.length) return;
  await db
    .insert(profileIdentifiers)
    .values(wanted.map((id) => ({ entity, namespace: id.namespace, value: id.value, key, observed_at: id.observed_at ? new Date(id.observed_at) : null })))
    .onConflictDoNothing();
}
/** Every profile and ledger write goes through here: per-record and per-identifier locks, so unrelated writers run in parallel. */
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
/** The identifiers an identity supplies, normalized; the lock names of a resolution are made from these. */
function normalizeIdentity(entity: Entity, supplied: Identity) {
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
  const domainEvidence = Boolean(entity === "companies" && supplied.domain && supplied.name);
  return { identity, domainEvidence };
}
/** The lock names a resolution of this identity takes, so a caller can take them up front together with others. */
export function identityLockNames(entity: Entity, supplied: Identity) {
  const { identity, domainEvidence } = normalizeIdentity(entity, supplied);
  const names = Object.entries(identity).map(([namespace, value]) => identifierName(entity, namespace, value));
  if (domainEvidence) names.push(identifierName("companies", "domain+name", `${supplied.domain}|${supplied.name}`));
  return names;
}
/**
 * Called only inside a write transaction. Locks the supplied identifiers first, so two writers cannot both create a
 * record for one identifier, then the candidate records by row, so identity resolution and merges of one record are
 * serialized. A candidate that disappeared while waiting (merged away) means its identifiers moved: look them up again.
 */
async function resolve(
  tx: Executor,
  entity: Entity,
  supplied: Identity,
  now: string,
  create = true,
  targetKey?: string,
  options: { deferWrite?: boolean } = {},
): Promise<
  | { status: "resolved"; profile: Profile; written: boolean }
  | { status: "unresolved" | "ambiguous" }
> {
  const { identity, domainEvidence } = normalizeIdentity(entity, supplied);
  if (!Object.keys(identity).length && !domainEvidence)
    return { status: "unresolved" };
  await lockNames(tx, identityLockNames(entity, supplied));
  const entries = Object.entries(identity);
  const t = tableOf(entity);
  const ownerOf = and(eq(profileIdentifiers.entity, entity), or(...entries.map(([namespace, value]) => and(eq(profileIdentifiers.namespace, namespace), eq(profileIdentifiers.value, value)))));
  let profiles: Profile[] = [];
  let known: (typeof profileIdentifiers.$inferSelect)[] = [];
  for (let round = 0; ; round += 1) {
    // Whoever owns any supplied identifier is a candidate, and so is a company with the same domain and name. One query
    // brings every identifier of every owner, which is what the checks below need.
    known = entries.length
      ? await tx
          .select()
          .from(profileIdentifiers)
          .where(and(eq(profileIdentifiers.entity, entity), inArray(profileIdentifiers.key, tx.select({ key: profileIdentifiers.key }).from(profileIdentifiers).where(ownerOf))))
      : [];
    const owners = new Set(known.filter((row) => entries.some(([namespace, value]) => row.namespace === namespace && row.value === value)).map((row) => row.key));
    const matches: SQL[] = [];
    const candidateKeys = [...new Set([...owners, ...(targetKey ? [targetKey] : [])])];
    if (candidateKeys.length) matches.push(inArray(t.key, candidateKeys));
    if (domainEvidence) matches.push(and(eq(companies.domain, supplied.domain!), eq(companies.name, supplied.name!))!);
    // No match must mean no rows: an empty or() would select the whole table.
    profiles = matches.length ? (await tx.select().from(t).where(or(...matches)).for("update")).map((row) => decode(entity, row)) : [];
    // An identifier changes owner only when its record is merged away, so present candidates mean stable owners.
    if (candidateKeys.every((key) => profiles.some((p) => p.key === key)) || round >= 3) break;
  }
  // The target record and a domain-and-name match were not found through their identifiers; fetch those too.
  const uncovered = profiles.map((p) => p.key).filter((key) => !known.some((row) => row.key === key));
  if (uncovered.length) known = [...known, ...(await tx.select().from(profileIdentifiers).where(and(eq(profileIdentifiers.entity, entity), inArray(profileIdentifiers.key, uncovered))))];
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
  const previous = profiles[0];
  let profile: Profile = previous ?? {
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
    profile.responses_json = {
      ...duplicate.responses_json,
      ...prior.responses_json,
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
      // People with this company, locked by row while their roles are rewritten.
      const affected = await tx
        .select()
        .from(people)
        .where(or(eq(people.primary_company_key, duplicate.key), sql`${people.experiences_json} @> ${JSON.stringify([{ company_key: duplicate.key }])}::jsonb`))
        .for("update");
      for (const row of affected) {
        const stored = decode("people", row);
        const person = { ...stored };
        person.experiences_json = (person.experiences_json ?? []).map(
          (e: Experience) =>
            e.company_key === duplicate.key
              ? { ...e, company_key: profile.key }
              : e,
        );
        if (person.primary_company_key === duplicate.key)
          person.primary_company_key = profile.key;
        await write(tx, "people", person, stored);
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
  // A caller that will write the record itself in this transaction can leave the row to that write; a new record or a merge is always written here.
  const written = !(options.deferWrite && profiles.length === 1);
  if (written) await write(tx, entity, profile, profiles.length === 1 ? previous : undefined);
  // Same transaction as the record. Supplied values first, so a changed slug stays an identifier next to the record's own columns.
  await claim(
    tx,
    entity,
    profile.key,
    [
      ...entries.map(([namespace, value]) => ({ namespace, value, observed_at: now })),
      ...identifiersOf(entity, profile, []).map((id) => ({ ...id, observed_at: now })),
    ],
    profiles.length === 1 ? known : [],
  );
  return { status: "resolved", profile, written };
}
/** Deleting a record deletes its identifiers in the same transaction; afterwards they resolve to a new record. */
export async function deleteProfile(db: Executor, entity: Entity, key: string) {
  return transaction(db, async (tx) => {
    await lockNames(tx, []);
    const t = tableOf(entity);
    await tx.delete(profileIdentifiers).where(and(eq(profileIdentifiers.entity, entity), eq(profileIdentifiers.key, key)));
    await tx.delete(t).where(eq(t.key, key));
  });
}
/** Mark a profile as resolved to a terminal non-match state without a provider response. */
export async function markUnresolved(
  client: Executor,
  entity: Entity,
  key: string,
  reason: string,
) {
  return transaction(client, async (tx) => {
    await lockNames(tx, []);
    const stored = await getProfile(tx, entity, key, { lock: true });
    if (!stored) return;
    const now = new Date();
    const profile = { ...stored };
    profile.enrichment_status = "unresolved";
    profile.error = reason;
    profile.last_attempt_at = now;
    profile.updated_at = now;
    await write(tx, entity, profile, stored);
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
      const stored = result.profile;
      const profile = { ...stored };
      profile.sources_json = sourceUnion(
        stored.sources_json ?? [],
        [source],
      );
      await write(tx, entity, profile, stored);
      result.profile = profile;
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
  const evidence = Object.values(profile.responses_json ?? {}) as any[];
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
  return Object.values(profile.responses_json ?? {}).some(
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
const OPERATIONAL = [
  "key",
  "sources_json",
  "created_at",
  "updated_at",
  "enriched_at",
  "responses_json",
  "provenance_json",
  "section_status_json",
  "last_attempt_at",
  "enrichment_status",
  "error",
  "cost_usd",
];
/** The company identities the roles of a person's evidence will resolve, for locking up front. */
function roleIdentities(evidence: Evidence): Identity[] {
  const roles = evidence.fields.experiences_json;
  if (!Array.isArray(roles)) return [];
  return roles.map((role: Experience) => ({
    linkedin_company_id: role.company_linkedin_id ?? undefined,
    linkedin_url: role.company_linkedin_url ?? undefined,
    domain: role.company_domain ?? undefined,
    name: role.company_name ?? undefined,
  }));
}
export async function applyEvidence(
  client: Executor,
  entity: Entity,
  key: string,
  evidence: Evidence,
  options: { /** The record as already read, unlocked, by the caller; saves the read that gathers the lock names. */ known?: Profile } = {},
) {
  validateFields(entity, evidence.fields);
  if (Object.keys(evidence.fields).some((k) => OPERATIONAL.includes(k)))
    throw new Error("Provider cannot write operational metadata");
  return transaction(client, async (tx) => {
    // Every identifier this application may claim, locked in one batch before any row: the record's own, the evidence's,
    // and those of each role's company. Row locks then never wait in a cycle.
    const unlocked = options.known ?? (await getProfile(tx, entity, key));
    if (!unlocked) throw new Error("Profile not found");
    const own = Object.fromEntries(identityFields[entity].filter((f) => unlocked[f]).map((f) => [f, unlocked[f]])) as Identity;
    const supplied = Object.fromEntries(identityFields[entity].filter((f) => evidence.fields[f] != null).map((f) => [f, evidence.fields[f]])) as Identity;
    const names = [...identityLockNames(entity, { ...own, ...supplied })];
    if (entity === "people") for (const role of roleIdentities(evidence)) names.push(...identityLockNames("companies", role));
    await lockNames(tx, names);
    const stored = await getProfile(tx, entity, key, { lock: true });
    if (!stored) throw new Error("Profile not found");
    let profile: Profile = { ...stored };
    let previous: Profile | undefined = stored;
    let outcome = evidence.outcome;
    if (outcome === "success") {
      const identity = supplied;
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
          { deferWrite: true },
        );
        if (result.status === "ambiguous") outcome = "ambiguous";
        else if (result.status === "resolved") {
          // Written (a merge): the row as it now stands. Deferred: the identity columns join the write at the end.
          if (result.written) previous = result.profile;
          profile = { ...result.profile };
        }
      }
    }
    const envelope: ResponseEnvelope = {
      ...evidence,
      outcome,
      fields: undefined,
      raw: evidence.attempt_id ? undefined : sanitize(evidence.raw),
    } as ResponseEnvelope;
    const ref = createHash("sha256")
      .update(JSON.stringify(envelope))
      .digest("hex");
    const responses = { ...profile.responses_json, [ref]: envelope };
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
            const filled = { ...company.profile };
            if (!filled.name) filled.name = role.company_name;
            if (!filled.domain) filled.domain = role.company_domain ?? null;
            await write(tx, "companies", filled, company.profile);
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
    for (const [id, e] of Object.entries(responses) as [string, any][]) {
      const operation = JSON.stringify([e.provider, e.endpoint, e.mode]);
      const prior = latest.get(operation);
      if (!prior || responses[prior].fetched_at <= e.fetched_at)
        latest.set(operation, id);
    }
    for (const id of latest.values()) keep.add(id);
    profile.responses_json = Object.fromEntries(
      Object.entries(responses).filter(([id]) => keep.has(id)),
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
    await write(tx, entity, profile, previous);
    return profile;
  });
}
export async function currentCompanies(client: Executor, personKeys: string[]) {
  const companies = new Set<string>();
  let roles = 0,
    unresolved = 0;
  const found = await getProfiles(client, "people", personKeys);
  for (const key of personKeys) {
    const person = found.get(key);
    for (const role of (person?.experiences_json ?? []) as Experience[])
      if (role.current_status === "current") {
        roles++;
        if (role.company_key) companies.add(role.company_key);
        else unresolved++;
      }
  }
  return { keys: [...companies].sort(), roles, unresolved };
}
