export type Identifier = { namespace: string; value: string; observed_at: string | null };
export const identityFields: {
  readonly people: readonly ["linkedin_profile_id", "linkedin_numeric_id", "linkedin_urn", "linkedin_url"];
  readonly companies: readonly ["linkedin_company_id", "linkedin_url"];
};
export function canonicalUrl(value: string, entity: "people" | "companies"): string | null;
export function normalizeIdentifier(entity: "people" | "companies", namespace: string, value: unknown): string | null;
export function identifiersOf(entity: "people" | "companies", record: Record<string, unknown>, aliases?: unknown): Identifier[];
