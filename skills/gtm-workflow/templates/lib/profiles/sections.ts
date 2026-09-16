import { z } from "zod";

// Named normalized fields are checked when supplied. Unverified provider extras
// remain admissible as evidence; missing optional facts are never synthesized.
const text = z.string().nullable().optional();
const count = z.number().int().nonnegative().nullable().optional();
const flag = z.boolean().nullable().optional();
const entry = (shape: Record<string, z.ZodTypeAny>) =>
  z.object(shape).passthrough();
const named = entry({ name: text, title: text, description: text, url: text });
const dated = { start_date: text, end_date: text };
const list = (schema: z.ZodTypeAny) => z.array(z.union([z.string(), schema]));
export const sectionValidators: Record<string, z.ZodTypeAny> = {
  identifiers_json: z.array(
    entry({ namespace: z.string(), value: z.string(), observed_at: text }),
  ),
  education_json: list(
    entry({
      school_name: text,
      school_id: text,
      school_url: text,
      degree: text,
      field_of_study: text,
      description: text,
      ...dated,
    }),
  ),
  skills_json: list(
    entry({
      name: text,
      endorsement_count: count,
      endorsement_text: text,
      source_order: count,
    }),
  ),
  languages_json: list(entry({ name: text, proficiency: text })),
  certifications_json: list(
    entry({
      name: text,
      title: text,
      issuer_name: text,
      issuer_url: text,
      credential_id: text,
      credential_url: text,
      issue_date: text,
      expiry_date: text,
    }),
  ),
  projects_json: list(
    entry({
      title: text,
      description: text,
      organization_name: text,
      ...dated,
    }),
  ),
  volunteering_json: list(
    entry({
      role: text,
      organization_name: text,
      organization_id: text,
      organization_url: text,
      cause: text,
      ...dated,
    }),
  ),
  publications_json: list(
    entry({
      title: text,
      description: text,
      publisher: text,
      publication_date: text,
      url: text,
    }),
  ),
  patents_json: list(
    entry({
      title: text,
      number: text,
      issue_date: text,
      description: text,
      url: text,
    }),
  ),
  courses_json: list(named),
  honors_awards_json: list(
    entry({ title: text, issuer: text, issue_date: text, description: text }),
  ),
  organizations_json: list(
    entry({
      name: text,
      position: text,
      description: text,
      url: text,
      ...dated,
    }),
  ),
  recommendations_json: list(entry({ direction: text, text: text })),
  emails_json: list(
    entry({
      address: text,
      type: text,
      verification_status: text,
      deliverable: flag,
      catch_all: flag,
      valid_mail_server: flag,
      free_mail: flag,
      observed_at: text,
      verified_at: text,
    }),
  ),
  phones_json: list(
    entry({ original_value: text, number: text, type: text, status: text }),
  ),
  websites_json: list(entry({ url: text, label: text, type: text })),
  social_profiles_json: list(
    entry({ url: text, username: text, platform: text, label: text }),
  ),
  locations_json: list(
    entry({
      original_text: text,
      city: text,
      region: text,
      country: text,
      country_code: text,
      postal_code: text,
      is_headquarters: flag,
      is_primary: flag,
    }),
  ),
  industries_json: list(entry({ name: text, id: text, namespace: text })),
  locales_json: list(entry({ language: text, country: text })),
  profile_actions_json: list(entry({ type: text, label: text, url: text })),
  related_profiles_json: list(
    entry({ id: text, url: text, full_name: text, headline: text }),
  ),
  affiliated_pages_json: list(named),
  similar_companies_json: list(named),
  employee_previews_json: list(
    entry({
      profile_url: text,
      display_name: text,
      subtitle: text,
      image_url: text,
    }),
  ),
  technologies_json: list(named),
  investors_json: list(named),
  revenue_json: entry({
    currency: text,
    period: text,
    estimated: flag,
    source: text,
  }),
  funding_json: entry({
    currency: text,
    round_count: count,
    status: text,
    latest_date: text,
  }),
};
