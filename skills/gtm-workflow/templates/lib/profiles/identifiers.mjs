// Which values identify a record, and how each is normalised. Plain JavaScript because two callers must agree to the
// letter: the profile store, and the script that imports records from the previous database into profile_identifiers.

export const identityFields = {
  people: ["linkedin_profile_id", "linkedin_numeric_id", "linkedin_urn", "linkedin_url"],
  companies: ["linkedin_company_id", "linkedin_url"],
};

export function canonicalUrl(value, entity) {
  try {
    const url = new URL(value.startsWith("http") ? value : `https://${value}`);
    if (!/(^|\.)linkedin\.com$/i.test(url.hostname)) return null;
    const match = url.pathname.match(entity === "people" ? /^\/in\/([^/]+)\/?$/i : /^\/company\/([^/]+)\/?$/i);
    return match ? `https://www.linkedin.com/${entity === "people" ? "in" : "company"}/${match[1].toLowerCase()}` : null;
  } catch {
    return null;
  }
}

/** The stored form of one identifier value, or null when it identifies nothing. */
export function normalizeIdentifier(entity, namespace, value) {
  if (typeof value !== "string") return null;
  return (namespace === "linkedin_url" ? canonicalUrl(value, entity) : value.trim()) || null;
}

/**
 * Every identifier a stored record claims, first claim first: its identity columns, then its alias entries.
 * `aliases` is the record's alias list: the identifiers_json column of a record from the previous database.
 */
export function identifiersOf(entity, record, aliases = record.identifiers_json ?? []) {
  const result = new Map();
  const claim = (namespace, value, observedAt) => {
    // An alias keeps a LinkedIn URL that no longer parses rather than dropping the claim.
    const stored = normalizeIdentifier(entity, namespace, value) ?? (typeof value === "string" && value.trim() ? value.trim() : null);
    if (!stored || typeof namespace !== "string" || !namespace) return;
    const id = JSON.stringify([namespace, stored]);
    if (!result.has(id)) result.set(id, { namespace, value: stored, observed_at: observedAt ?? null });
  };
  for (const field of identityFields[entity]) claim(field, record[field], null);
  for (const alias of Array.isArray(aliases) ? aliases : []) if (alias && typeof alias === "object") claim(alias.namespace, alias.value, alias.observed_at);
  return [...result.values()];
}
