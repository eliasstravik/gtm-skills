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
    const title = text(e.title ?? e.job_title),
      companyName =
        text(e.company) ?? text(e.company_name) ?? text(company.name);
    const start = partialDate(
        e.start_date ?? e.job_start_date ?? e.startDate ?? e.start,
      ),
      end = partialDate(e.end_date ?? e.job_end_date ?? e.endDate ?? e.end);
    const current =
      typeof e.is_current === "boolean"
        ? e.is_current
        : typeof e.job_is_current === "boolean"
          ? e.job_is_current
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
    const jobLocation = record(e.job_location),
      locationLabel =
        text(e.location) ??
        ([jobLocation?.city, jobLocation?.state_code, jobLocation?.country_code]
          .map(text)
          .filter((v): v is string => Boolean(v))
          .join(", ") || null);
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
        end_date: e.end_date ?? e.job_end_date ?? e.endDate ?? null,
      },
      is_primary: typeof e.is_primary === "boolean" ? e.is_primary : null,
      description: text(e.description ?? e.job_description),
      location_label: locationLabel,
      employment_type: text(e.employment_type ?? e.job_contract_type),
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

function locationText(location: Record<string, any> | null) {
  return (
    [location?.city, location?.state_code, location?.country_code]
      .map(text)
      .filter((v): v is string => Boolean(v))
      .join(", ") || null
  );
}
/** Blitz returns the profile and the full experience history from a LinkedIn URL or email. The body may arrive bare or as a run envelope. */
export function normalizeBlitz(
  phase: "people" | "companies",
  raw: unknown,
  fetchedAt: string,
  cost: number | null,
  endpoint: string,
): Evidence {
  const envelope = record(raw),
    root = record(envelope?.output) ?? envelope ?? {};
  const e = base("blitz", endpoint, root, fetchedAt, cost);
  if (root.found === false) return e;
  const list = (field: string, value: unknown) => {
    if (Array.isArray(value)) {
      e.fields[field] = value;
      e.sections[field] = "complete";
    }
  };
  if (phase === "people") {
    const p = record(root.person);
    if (!p || !Object.keys(p).length) return e;
    e.outcome = "success";
    const mapping = {
      first_name: "first_name",
      last_name: "last_name",
      full_name: "full_name",
      headline: "headline",
      about_me: "about",
      industry: "industry",
      profile_picture_url: "profile_photo_url",
    };
    for (const [native, field] of Object.entries(mapping))
      if (text(p[native])) e.fields[field] = text(p[native]);
    const url = text(p.linkedin_url);
    if (url && canonicalUrl(url, "people"))
      e.fields.linkedin_url = canonicalUrl(url, "people");
    if (identifier(p.linkedin_id))
      e.fields.linkedin_profile_id = identifier(p.linkedin_id);
    if (count(p.connections_count) !== null) {
      e.fields.connections_count = count(p.connections_count);
      e.fields.connections_count_kind = "linkedin";
    }
    const location = record(p.location);
    if (location) {
      e.fields.location_json = location;
      e.sections.location_json = "complete";
      if (locationText(location)) e.fields.location_label = locationText(location);
      if (text(location.city)) e.fields.city = text(location.city);
      if (text(location.state_code)) e.fields.region = text(location.state_code);
      if (text(location.country_code))
        e.fields.country_code = text(location.country_code);
      if (text(location.country_name)) e.fields.country = text(location.country_name);
    }
    if (Array.isArray(p.experiences)) {
      e.fields.experiences_json = normalizeExperiences(p.experiences, fetchedAt);
      e.sections.experiences_json = "complete";
      const current = p.experiences
        .map(record)
        .find((role) => role?.job_is_current === true || role?.is_current === true);
      if (text(current?.job_title ?? current?.title))
        e.fields.primary_job_title = text(current?.job_title ?? current?.title);
    }
    list("education_json", p.education);
    list("skills_json", p.skills);
    list("certifications_json", p.certifications);
    return e;
  }
  const c = record(root.company);
  if (!c || !Object.keys(c).length) return e;
  e.outcome = "success";
  const url = text(c.linkedin_url);
  if (url && canonicalUrl(url, "companies"))
    e.fields.linkedin_url = canonicalUrl(url, "companies");
  if (identifier(c.linkedin_id))
    e.fields.linkedin_company_id = identifier(c.linkedin_id);
  if (text(c.name)) e.fields.name = text(c.name);
  if (text(c.about)) e.fields.description = text(c.about);
  if (text(c.website)) e.fields.website_url = text(c.website);
  if (domain(c.domain)) e.fields.domain = domain(c.domain);
  if (text(c.type)) e.fields.company_type = text(c.type);
  if (text(c.size)) e.fields.company_size_label = text(c.size);
  if (count(c.employees_on_linkedin) !== null) {
    e.fields.linkedin_employee_count = count(c.employees_on_linkedin);
    e.fields.reported_employee_count = count(c.employees_on_linkedin);
    e.fields.reported_employee_count_basis = "linkedin";
  }
  if (count(c.followers) !== null) e.fields.followers_count = count(c.followers);
  if (Number.isSafeInteger(Number(c.founded_year)) && Number(c.founded_year) > 0) {
    e.fields.founded_year = Number(c.founded_year);
    e.fields.founded_on = partialDate(c.founded_year);
  }
  if (text(c.industry)) list("industries_json", [c.industry]);
  list("specialties_json", c.specialties);
  const hq = record(c.hq);
  if (hq) {
    if (locationText(hq)) e.fields.headquarters_label = locationText(hq);
    if (text(hq.country_code))
      e.fields.headquarters_country_code = text(hq.country_code);
    if (text(hq.country_name)) e.fields.headquarters_country = text(hq.country_name);
    if (text(hq.region)) e.fields.headquarters_region = text(hq.region);
    if (text(hq.city)) e.fields.headquarters_city = text(hq.city);
    list("locations_json", [hq]);
  }
  return e;
}
