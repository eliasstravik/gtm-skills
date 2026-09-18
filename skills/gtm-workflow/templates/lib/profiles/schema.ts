import {
  sqliteTable,
  text,
  integer,
  real,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { sectionValidators } from "./sections";

export const peopleFields = {
  key: "TEXT",
  created_at: "TEXT",
  updated_at: "TEXT",
  enriched_at: "TEXT",
  last_attempt_at: "TEXT",
  enrichment_status: "TEXT",
  error: "TEXT",
  cost_usd: "REAL",
  identifiers_json: "JSON[]",
  sources_json: "JSON[]",
  provenance_json: "JSON{}",
  section_status_json: "JSON{}",
  raw_responses_json: "JSON{}",
  linkedin_url: "TEXT",
  linkedin_slug: "TEXT",
  linkedin_profile_id: "TEXT",
  linkedin_numeric_id: "TEXT",
  linkedin_urn: "TEXT",
  full_name: "TEXT",
  first_name: "TEXT",
  last_name: "TEXT",
  headline: "TEXT",
  about: "TEXT",
  industry: "TEXT",
  primary_job_title: "TEXT",
  primary_company_key: "TEXT",
  job_function: "TEXT",
  seniority: "TEXT",
  location_label: "TEXT",
  country_code: "TEXT",
  country: "TEXT",
  region: "TEXT",
  city: "TEXT",
  location_json: "JSON{}",
  followers_count: "INTEGER",
  connections_count: "INTEGER",
  connections_count_kind: "TEXT",
  recommendations_count: "INTEGER",
  profile_photo_url: "TEXT",
  cover_photo_url: "TEXT",
  images_json: "JSON{}",
  avatar_is_default: "BOOL",
  is_open_to_work: "BOOL",
  is_hiring: "BOOL",
  is_premium: "BOOL",
  is_influencer: "BOOL",
  is_creator: "BOOL",
  is_verified: "BOOL",
  is_memorialized: "BOOL",
  registered_at: "TEXT",
  primary_locale: "TEXT",
  locales_json: "JSON[]",
  localized_headlines_json: "JSON[]",
  profile_actions_json: "JSON[]",
  message_option_type: "TEXT",
  experiences_json: "JSON[]",
  education_json: "JSON[]",
  skills_json: "JSON[]",
  languages_json: "JSON[]",
  certifications_json: "JSON[]",
  projects_json: "JSON[]",
  volunteering_json: "JSON[]",
  publications_json: "JSON[]",
  patents_json: "JSON[]",
  courses_json: "JSON[]",
  honors_awards_json: "JSON[]",
  organizations_json: "JSON[]",
  recommendations_json: "JSON[]",
  interests_json: "JSON[]",
  causes_json: "JSON[]",
  services_json: "JSON{}",
  featured_json: "JSON{}",
  websites_json: "JSON[]",
  social_profiles_json: "JSON[]",
  emails_json: "JSON[]",
  phones_json: "JSON[]",
  profile_highlights_json: "JSON{}",
  related_profiles_json: "JSON[]",
  posts_preview_json: "JSON[]",
  activity_preview_json: "JSON[]",
} as const;
export const people = sqliteTable(
  "people",
  {
    key: text("key").primaryKey(),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull(),
    enriched_at: text("enriched_at"),
    last_attempt_at: text("last_attempt_at"),
    enrichment_status: text("enrichment_status"),
    error: text("error"),
    cost_usd: real("cost_usd"),
    identifiers_json: text("identifiers_json"),
    sources_json: text("sources_json"),
    provenance_json: text("provenance_json"),
    section_status_json: text("section_status_json"),
    raw_responses_json: text("raw_responses_json"),
    linkedin_url: text("linkedin_url"),
    linkedin_slug: text("linkedin_slug"),
    linkedin_profile_id: text("linkedin_profile_id"),
    linkedin_numeric_id: text("linkedin_numeric_id"),
    linkedin_urn: text("linkedin_urn"),
    full_name: text("full_name"),
    first_name: text("first_name"),
    last_name: text("last_name"),
    headline: text("headline"),
    about: text("about"),
    industry: text("industry"),
    primary_job_title: text("primary_job_title"),
    primary_company_key: text("primary_company_key"),
    job_function: text("job_function"),
    seniority: text("seniority"),
    location_label: text("location_label"),
    country_code: text("country_code"),
    country: text("country"),
    region: text("region"),
    city: text("city"),
    location_json: text("location_json"),
    followers_count: integer("followers_count"),
    connections_count: integer("connections_count"),
    connections_count_kind: text("connections_count_kind"),
    recommendations_count: integer("recommendations_count"),
    profile_photo_url: text("profile_photo_url"),
    cover_photo_url: text("cover_photo_url"),
    images_json: text("images_json"),
    avatar_is_default: integer("avatar_is_default", { mode: "boolean" }),
    is_open_to_work: integer("is_open_to_work", { mode: "boolean" }),
    is_hiring: integer("is_hiring", { mode: "boolean" }),
    is_premium: integer("is_premium", { mode: "boolean" }),
    is_influencer: integer("is_influencer", { mode: "boolean" }),
    is_creator: integer("is_creator", { mode: "boolean" }),
    is_verified: integer("is_verified", { mode: "boolean" }),
    is_memorialized: integer("is_memorialized", { mode: "boolean" }),
    registered_at: text("registered_at"),
    primary_locale: text("primary_locale"),
    locales_json: text("locales_json"),
    localized_headlines_json: text("localized_headlines_json"),
    profile_actions_json: text("profile_actions_json"),
    message_option_type: text("message_option_type"),
    experiences_json: text("experiences_json"),
    education_json: text("education_json"),
    skills_json: text("skills_json"),
    languages_json: text("languages_json"),
    certifications_json: text("certifications_json"),
    projects_json: text("projects_json"),
    volunteering_json: text("volunteering_json"),
    publications_json: text("publications_json"),
    patents_json: text("patents_json"),
    courses_json: text("courses_json"),
    honors_awards_json: text("honors_awards_json"),
    organizations_json: text("organizations_json"),
    recommendations_json: text("recommendations_json"),
    interests_json: text("interests_json"),
    causes_json: text("causes_json"),
    services_json: text("services_json"),
    featured_json: text("featured_json"),
    websites_json: text("websites_json"),
    social_profiles_json: text("social_profiles_json"),
    emails_json: text("emails_json"),
    phones_json: text("phones_json"),
    profile_highlights_json: text("profile_highlights_json"),
    related_profiles_json: text("related_profiles_json"),
    posts_preview_json: text("posts_preview_json"),
    activity_preview_json: text("activity_preview_json"),
  },
  (table) => [
    uniqueIndex("people_linkedin_url_unique")
      .on(table.linkedin_url)
      .where(sql`${table.linkedin_url} IS NOT NULL`),
    uniqueIndex("people_linkedin_profile_id_unique")
      .on(table.linkedin_profile_id)
      .where(sql`${table.linkedin_profile_id} IS NOT NULL`),
    uniqueIndex("people_linkedin_numeric_id_unique")
      .on(table.linkedin_numeric_id)
      .where(sql`${table.linkedin_numeric_id} IS NOT NULL`),
    uniqueIndex("people_linkedin_urn_unique")
      .on(table.linkedin_urn)
      .where(sql`${table.linkedin_urn} IS NOT NULL`),
  ],
);

export const companiesFields = {
  key: "TEXT",
  created_at: "TEXT",
  updated_at: "TEXT",
  enriched_at: "TEXT",
  last_attempt_at: "TEXT",
  enrichment_status: "TEXT",
  error: "TEXT",
  cost_usd: "REAL",
  identifiers_json: "JSON[]",
  sources_json: "JSON[]",
  provenance_json: "JSON{}",
  section_status_json: "JSON{}",
  raw_responses_json: "JSON{}",
  linkedin_url: "TEXT",
  linkedin_slug: "TEXT",
  linkedin_company_id: "TEXT",
  name: "TEXT",
  tagline: "TEXT",
  description: "TEXT",
  additional_information: "TEXT",
  website_url: "TEXT",
  domain: "TEXT",
  email_domain: "TEXT",
  industries_json: "JSON[]",
  specialties_json: "JSON[]",
  company_type: "TEXT",
  ownership_status: "TEXT",
  founded_on: "TEXT",
  founded_year: "INTEGER",
  company_size_label: "TEXT",
  employee_count_min: "INTEGER",
  employee_count_max: "INTEGER",
  linkedin_employee_count: "INTEGER",
  reported_employee_count: "INTEGER",
  reported_employee_count_basis: "TEXT",
  followers_count: "INTEGER",
  headquarters_label: "TEXT",
  headquarters_country_code: "TEXT",
  headquarters_country: "TEXT",
  headquarters_region: "TEXT",
  headquarters_city: "TEXT",
  headquarters_address: "TEXT",
  headquarters_postal_code: "TEXT",
  locations_json: "JSON[]",
  country_codes_json: "JSON[]",
  directions_urls_json: "JSON[]",
  logo_url: "TEXT",
  cover_image_url: "TEXT",
  images_json: "JSON{}",
  page_type: "TEXT",
  is_active: "BOOL",
  is_verified: "BOOL",
  is_showcase: "BOOL",
  is_paid_page: "BOOL",
  is_auto_generated: "BOOL",
  call_to_action_url: "TEXT",
  jobs_url: "TEXT",
  affiliated_pages_json: "JSON[]",
  similar_companies_json: "JSON[]",
  employee_previews_json: "JSON[]",
  alumni_json: "JSON{}",
  posts_preview_json: "JSON[]",
  technologies_json: "JSON[]",
  revenue_json: "JSON{}",
  funding_json: "JSON{}",
  investors_json: "JSON[]",
  crunchbase_url: "TEXT",
  stock_info_json: "JSON{}",
} as const;
export const companies = sqliteTable(
  "companies",
  {
    key: text("key").primaryKey(),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull(),
    enriched_at: text("enriched_at"),
    last_attempt_at: text("last_attempt_at"),
    enrichment_status: text("enrichment_status"),
    error: text("error"),
    cost_usd: real("cost_usd"),
    identifiers_json: text("identifiers_json"),
    sources_json: text("sources_json"),
    provenance_json: text("provenance_json"),
    section_status_json: text("section_status_json"),
    raw_responses_json: text("raw_responses_json"),
    linkedin_url: text("linkedin_url"),
    linkedin_slug: text("linkedin_slug"),
    linkedin_company_id: text("linkedin_company_id"),
    name: text("name"),
    tagline: text("tagline"),
    description: text("description"),
    additional_information: text("additional_information"),
    website_url: text("website_url"),
    domain: text("domain"),
    email_domain: text("email_domain"),
    industries_json: text("industries_json"),
    specialties_json: text("specialties_json"),
    company_type: text("company_type"),
    ownership_status: text("ownership_status"),
    founded_on: text("founded_on"),
    founded_year: integer("founded_year"),
    company_size_label: text("company_size_label"),
    employee_count_min: integer("employee_count_min"),
    employee_count_max: integer("employee_count_max"),
    linkedin_employee_count: integer("linkedin_employee_count"),
    reported_employee_count: integer("reported_employee_count"),
    reported_employee_count_basis: text("reported_employee_count_basis"),
    followers_count: integer("followers_count"),
    headquarters_label: text("headquarters_label"),
    headquarters_country_code: text("headquarters_country_code"),
    headquarters_country: text("headquarters_country"),
    headquarters_region: text("headquarters_region"),
    headquarters_city: text("headquarters_city"),
    headquarters_address: text("headquarters_address"),
    headquarters_postal_code: text("headquarters_postal_code"),
    locations_json: text("locations_json"),
    country_codes_json: text("country_codes_json"),
    directions_urls_json: text("directions_urls_json"),
    logo_url: text("logo_url"),
    cover_image_url: text("cover_image_url"),
    images_json: text("images_json"),
    page_type: text("page_type"),
    is_active: integer("is_active", { mode: "boolean" }),
    is_verified: integer("is_verified", { mode: "boolean" }),
    is_showcase: integer("is_showcase", { mode: "boolean" }),
    is_paid_page: integer("is_paid_page", { mode: "boolean" }),
    is_auto_generated: integer("is_auto_generated", { mode: "boolean" }),
    call_to_action_url: text("call_to_action_url"),
    jobs_url: text("jobs_url"),
    affiliated_pages_json: text("affiliated_pages_json"),
    similar_companies_json: text("similar_companies_json"),
    employee_previews_json: text("employee_previews_json"),
    alumni_json: text("alumni_json"),
    posts_preview_json: text("posts_preview_json"),
    technologies_json: text("technologies_json"),
    revenue_json: text("revenue_json"),
    funding_json: text("funding_json"),
    investors_json: text("investors_json"),
    crunchbase_url: text("crunchbase_url"),
    stock_info_json: text("stock_info_json"),
  },
  (table) => [
    uniqueIndex("companies_linkedin_url_unique")
      .on(table.linkedin_url)
      .where(sql`${table.linkedin_url} IS NOT NULL`),
    uniqueIndex("companies_linkedin_company_id_unique")
      .on(table.linkedin_company_id)
      .where(sql`${table.linkedin_company_id} IS NOT NULL`),
  ],
);

export type Entity = "people" | "companies";
export const fieldsFor = (entity: Entity): Record<string, string> =>
  entity === "people" ? peopleFields : companiesFields;
const validators: Record<string, z.ZodTypeAny> = {
  TEXT: z.string(),
  INTEGER: z.number().int().nonnegative(),
  REAL: z.number().finite().nonnegative(),
  BOOL: z.boolean(),
  "JSON[]": z.array(z.unknown()),
  "JSON{}": z.record(z.string(), z.unknown()),
};
const experience = z
  .object({
    experience_key: z.string().min(1),
    company_key: z.string().nullable(),
    company_name: z.string().nullable(),
    title: z.string().nullable(),
    start_date: z.string().nullable(),
    end_date: z.string().nullable(),
    current_status: z.enum(["current", "ended", "unknown"]),
    current_status_evidence: z.unknown(),
    company_linkedin_id: z.string().nullable().optional(),
    company_linkedin_url: z.string().nullable().optional(),
    company_domain: z.string().nullable().optional(),
    is_primary: z.boolean().nullable().optional(),
  })
  .passthrough();
const membership = z
  .object({
    workflow_id: z.string().min(1),
    source_id: z.string().min(1),
    source_row_id: z.string().min(1),
    first_observed_at: z.string(),
    last_observed_at: z.string(),
  })
  .passthrough();
export function validateFields(
  entity: Entity,
  values: Record<string, unknown>,
) {
  const fields = fieldsFor(entity);
  for (const [key, value] of Object.entries(values)) {
    if (!Object.hasOwn(fields, key))
      throw new Error(`Unknown ${entity} field: ${key}`);
    if (value !== null) {
      validators[fields[key]].parse(value);
      sectionValidators[key]?.parse(value);
    }
    if (value !== null && key === "experiences_json")
      z.array(experience).parse(value);
    if (value !== null && key === "sources_json")
      z.array(membership).parse(value);
  }
  return values;
}
export const identityFields = {
  people: [
    "linkedin_profile_id",
    "linkedin_numeric_id",
    "linkedin_urn",
    "linkedin_url",
  ],
  companies: ["linkedin_company_id", "linkedin_url"],
} as const;
export function profileSchemaSql() {
  return (["people", "companies"] as const)
    .map((entity) => {
      const columns = Object.entries(fieldsFor(entity)).map(
        ([name, type]) =>
          `"${name}" ${type.startsWith("JSON") ? "TEXT" : type === "BOOL" ? "INTEGER" : type}${name === "key" ? " PRIMARY KEY" : ["created_at", "updated_at"].includes(name) ? " NOT NULL" : ""}`,
      );
      return (
        `CREATE TABLE IF NOT EXISTS "${entity}" (${columns.join(",")});\n` +
        identityFields[entity]
          .map(
            (field) =>
              `CREATE UNIQUE INDEX IF NOT EXISTS "${entity}_${field}_unique" ON "${entity}" ("${field}") WHERE "${field}" IS NOT NULL;`,
          )
          .join("\n")
      );
    })
    .join("\n") + profileLookupSql;
}
/**
 * Indexed lookups for shared profiles. Turso bills every row a query scans, so
 * identity aliases live in an indexed side table instead of being searched with
 * json_each over identifiers_json. Additive and safe to run on every build.
 */
export const profileLookupSql = `
CREATE TABLE IF NOT EXISTS profile_identifiers (
 entity TEXT NOT NULL, namespace TEXT NOT NULL, value TEXT NOT NULL, entity_key TEXT NOT NULL,
 PRIMARY KEY (entity, namespace, value, entity_key)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS profile_identifiers_entity_key ON profile_identifiers (entity, entity_key);
CREATE INDEX IF NOT EXISTS companies_domain_name ON companies (domain, name);`;
/** One pass over each profile table; repairs aliases written by an older runtime. */
export const profileLookupBackfillSql = (["people", "companies"] as const)
  .map(
    (entity) => `
INSERT OR IGNORE INTO profile_identifiers (entity, namespace, value, entity_key)
SELECT '${entity}', json_extract(a.value, '$.namespace'), json_extract(a.value, '$.value'), p.key
FROM "${entity}" p, json_each(COALESCE(p.identifiers_json, '[]')) a
WHERE json_extract(a.value, '$.namespace') IS NOT NULL AND json_extract(a.value, '$.value') IS NOT NULL;`,
  )
  .join("");
