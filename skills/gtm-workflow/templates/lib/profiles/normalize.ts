import { createHash } from "node:crypto";
import {
  canonicalUrl,
  type Evidence,
  type Experience,
  type Coverage,
} from "./store";

const record = (v: unknown): Record<string, any> | null =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, any>)
    : null;
const text = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;
const count = (v: unknown): number | null =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null;
const identifier = (v: unknown): string | null =>
  text(v) ?? (count(v) !== null ? String(v) : null);
export function partialDate(value: unknown): string | null {
  const obj = record(value);
  if (obj) {
    const year = Number(obj.year),
      month = obj.month == null ? null : Number(obj.month),
      day = obj.day == null ? null : Number(obj.day);
    if (!Number.isInteger(year) || year < 1000 || year > 9999) return null;
    if (month == null) return String(year);
    if (!Number.isInteger(month) || month < 1 || month > 12) return null;
    const ym = `${year}-${String(month).padStart(2, "0")}`;
    if (day == null) return ym;
    if (
      !Number.isInteger(day) ||
      day < 1 ||
      day > new Date(Date.UTC(year, month, 0)).getUTCDate()
    )
      return null;
    return `${ym}-${String(day).padStart(2, "0")}`;
  }
  const t = typeof value === "number" ? String(value) : text(value);
  if (!t || !/^\d{4}(-\d{2})?(-\d{2})?$/.test(t)) return null;
  const [year, month, day] = t.split("-");
  return partialDate({ year, month, day });
}
export function domain(value: unknown): string | null {
  const t = text(value);
  if (!t) return null;
  try {
    const u = new URL(t.includes("://") ? t : `https://${t}`);
    return u.hostname.includes(".")
      ? u.hostname.toLowerCase().replace(/^www\./, "")
      : null;
  } catch {
    return null;
  }
}
export function normalizeExperiences(
  items: unknown[],
  fetchedAt: string,
): Experience[] {
  const occurrences = new Map<string, number>();
  return items.map((raw, index) => {
    const e = record(raw) ?? {},
      company = record(e.company) ?? {};
    const title = text(e.title),
      companyName =
        text(e.company) ?? text(e.company_name) ?? text(company.name);
    const start = partialDate(e.start_date ?? e.startDate ?? e.start),
      end = partialDate(e.end_date ?? e.endDate ?? e.end);
    const current =
      typeof e.is_current === "boolean"
        ? e.is_current
        : typeof e.isCurrent === "boolean"
          ? e.isCurrent
          : null;
    const companyId = identifier(
      e.company_linkedin_id ?? company.linkedin_company_id,
    );
    const url = text(
      e.company_linkedin_url ??
        e.company_url ??
        company.linkedin_url ??
        company.url,
    );
    const providerId = identifier(e.id ?? e.experience_id);
    const identity =
      providerId ??
      JSON.stringify([companyId ?? url ?? companyName, title, start]);
    // Duplicate roles remain distinct, including providers without stable role identifiers.
    const occurrence = occurrences.get(identity) ?? 0;
    occurrences.set(identity, occurrence + 1);
    return {
      experience_key: createHash("sha256")
        .update(`${identity}:${occurrence}`)
        .digest("hex")
        .slice(0, 32),
      provider_experience_id: providerId,
      source_order: index,
      company_key: null,
      company_name: companyName,
      company_linkedin_id: companyId,
      company_linkedin_url: url ? canonicalUrl(url, "companies") : null,
      company_domain: domain(e.company_domain ?? company.domain),
      title,
      start_date: start,
      end_date: end,
      current_status:
        current === true
          ? end
            ? "unknown"
            : "current"
          : current === false || end
            ? "ended"
            : "unknown",
      current_status_evidence: {
        is_current: current,
        end_date: e.end_date ?? e.endDate ?? null,
      },
      is_primary: typeof e.is_primary === "boolean" ? e.is_primary : null,
      description: text(e.description),
      location_label: text(e.location),
      employment_type: text(e.employment_type),
      company_snapshot: company,
      observed_at: fetchedAt,
      source_path: `experience[${index}]`,
      original: raw,
    };
  });
}
function base(
  provider: string,
  endpoint: string,
  raw: unknown,
  fetchedAt: string,
  cost: number | null,
): Evidence {
  return {
    provider,
    endpoint,
    mode: "default",
    fetched_at: fetchedAt,
    outcome: "no_match",
    fields: {},
    sections: {},
    raw,
    cost_usd: cost,
  };
}
/** Only the installed Clay endpoint's documented names are promoted to facts. */
export function normalizeClay(
  raw: unknown,
  fetchedAt: string,
  cost: number | null,
): Evidence {
  const e = base("clay", "/enrichment/person", raw, fetchedAt, cost);
  const envelope = record(raw),
    root = record(envelope?.output) ?? envelope;
  const result = record(root?.data?.[0]?.result) ?? root;
  const p = record(result?.["Enrich person"]);
  if (!p || !Object.keys(p).length) return e;
  e.outcome = "success";
  const mapping = {
    name: "full_name",
    title: "primary_job_title",
    headline: "headline",
    country: "country",
    location_name: "location_label",
    picture_url_orig: "profile_photo_url",
  };
  for (const [native, field] of Object.entries(mapping))
    if (text(p[native])) e.fields[field] = text(p[native]);
  const url = text(p.url);
  if (url && canonicalUrl(url, "people"))
    e.fields.linkedin_url = canonicalUrl(url, "people");
  if (count(p.num_followers) !== null)
    e.fields.followers_count = count(p.num_followers);
  if (text(p.org)) {
    e.fields.profile_highlights_json = { current_company_name: p.org };
    e.sections.profile_highlights_json = "partial";
  }
  for (const [native, field] of [
    ["experience", "experiences_json"],
    ["education", "education_json"],
    ["languages", "languages_json"],
  ]) {
    if (!Array.isArray(p[native])) {
      e.sections[field] = "unknown";
      continue;
    }
    e.fields[field] =
      native === "experience"
        ? normalizeExperiences(p[native], fetchedAt)
        : p[native];
    // This endpoint does not advertise a completeness flag or full-section mode.
    e.sections[field] = "partial";
  }
  return e;
}
/** ContactOut wraps domain matches inside companies, keyed by requested domain. */
export function normalizeContactOut(
  raw: unknown,
  requestedDomain: string,
  fetchedAt: string,
  cost: number | null,
): Evidence {
  const e = base("contactout", "/v1/domain/enrich", raw, fetchedAt, cost);
  const envelope = record(raw),
    root = record(envelope?.output) ?? envelope;
  const companies = Array.isArray(root?.companies)
    ? root.companies
    : [root?.companies];
  const matches = companies
    .map((item: unknown) => record(record(item)?.[requestedDomain]))
    .filter(Boolean);
  const p = matches.length === 1 ? matches[0] : null;
  if (!p) return e;
  e.outcome = "success";
  const mapping = {
    name: "name",
    description: "description",
    website: "website_url",
    logo_url: "logo_url",
    type: "company_type",
    headquarter: "headquarters_label",
    country: "headquarters_country",
  };
  for (const [native, field] of Object.entries(mapping))
    if (text(p[native])) e.fields[field] = text(p[native]);
  if (domain(p.domain ?? requestedDomain))
    e.fields.domain = domain(p.domain ?? requestedDomain);
  if (text(p.li_vanity))
    e.fields.linkedin_url = canonicalUrl(
      p.li_vanity.includes("/")
        ? p.li_vanity
        : `https://www.linkedin.com/company/${p.li_vanity}`,
      "companies",
    );
  for (const [native, field] of [
    ["size", "reported_employee_count"],
    ["employees", "linkedin_employee_count"],
    ["followers", "followers_count"],
    ["founded_at", "founded_year"],
  ])
    if (count(p[native]) !== null) e.fields[field] = count(p[native]);
  if (text(p.size)) e.fields.company_size_label = p.size;
  if (e.fields.reported_employee_count != null)
    e.fields.reported_employee_count_basis = "unknown";
  if (e.fields.founded_year)
    e.fields.founded_on = partialDate(e.fields.founded_year);
  for (const [native, field] of [
    ["locations", "locations_json"],
    ["industry", "industries_json"],
    ["specialties", "specialties_json"],
    ["technologies", "technologies_json"],
  ]) {
    if (Array.isArray(p[native]) || text(p[native])) {
      e.fields[field] = Array.isArray(p[native]) ? p[native] : [p[native]];
      e.sections[field] = "partial";
    }
  }
  for (const [native, field] of [
    ["revenue", "revenue_json"],
    ["funding", "funding_json"],
  ])
    if (p[native] != null) {
      e.fields[field] = record(p[native]) ?? { raw_value: p[native] };
      e.sections[field] = "partial";
    }
  return e;
}
