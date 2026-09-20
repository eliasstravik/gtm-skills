-- The schema a workspace had before Postgres, as text: the two Drizzle migrations of commit 271ff2b, the ledger and grants
-- tables that build scripts created, and what PR #119 (commit 7163259) added to production before it was reverted.
CREATE TABLE `cache` (
	`name` text NOT NULL,
	`hash` text NOT NULL,
	`value` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	PRIMARY KEY(`name`, `hash`)
);
--> statement-breakpoint
CREATE TABLE `example_research` (
	`key` text PRIMARY KEY NOT NULL,
	`updated_at` text NOT NULL,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`error` text,
	`summary` text,
	`sells` text,
	`headcount_band` text,
	`evidence_json` text,
	`tool_calls` integer,
	`stop_reason` text
);
--> statement-breakpoint
CREATE TABLE `example_scores` (
	`key` text PRIMARY KEY NOT NULL,
	`updated_at` text NOT NULL,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`error` text,
	`score` integer,
	`reason` text
);

CREATE TABLE `companies` (
	`key` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`enriched_at` text,
	`last_attempt_at` text,
	`enrichment_status` text,
	`error` text,
	`cost_usd` real,
	`identifiers_json` text,
	`sources_json` text,
	`provenance_json` text,
	`section_status_json` text,
	`raw_responses_json` text,
	`linkedin_url` text,
	`linkedin_slug` text,
	`linkedin_company_id` text,
	`name` text,
	`tagline` text,
	`description` text,
	`additional_information` text,
	`website_url` text,
	`domain` text,
	`email_domain` text,
	`industries_json` text,
	`specialties_json` text,
	`company_type` text,
	`ownership_status` text,
	`founded_on` text,
	`founded_year` integer,
	`company_size_label` text,
	`employee_count_min` integer,
	`employee_count_max` integer,
	`linkedin_employee_count` integer,
	`reported_employee_count` integer,
	`reported_employee_count_basis` text,
	`followers_count` integer,
	`headquarters_label` text,
	`headquarters_country_code` text,
	`headquarters_country` text,
	`headquarters_region` text,
	`headquarters_city` text,
	`headquarters_address` text,
	`headquarters_postal_code` text,
	`locations_json` text,
	`country_codes_json` text,
	`directions_urls_json` text,
	`logo_url` text,
	`cover_image_url` text,
	`images_json` text,
	`page_type` text,
	`is_active` integer,
	`is_verified` integer,
	`is_showcase` integer,
	`is_paid_page` integer,
	`is_auto_generated` integer,
	`call_to_action_url` text,
	`jobs_url` text,
	`affiliated_pages_json` text,
	`similar_companies_json` text,
	`employee_previews_json` text,
	`alumni_json` text,
	`posts_preview_json` text,
	`technologies_json` text,
	`revenue_json` text,
	`funding_json` text,
	`investors_json` text,
	`crunchbase_url` text,
	`stock_info_json` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `companies_linkedin_url_unique` ON `companies` (`linkedin_url`) WHERE "companies"."linkedin_url" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `companies_linkedin_company_id_unique` ON `companies` (`linkedin_company_id`) WHERE "companies"."linkedin_company_id" IS NOT NULL;--> statement-breakpoint
CREATE TABLE `people` (
	`key` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`enriched_at` text,
	`last_attempt_at` text,
	`enrichment_status` text,
	`error` text,
	`cost_usd` real,
	`identifiers_json` text,
	`sources_json` text,
	`provenance_json` text,
	`section_status_json` text,
	`raw_responses_json` text,
	`linkedin_url` text,
	`linkedin_slug` text,
	`linkedin_profile_id` text,
	`linkedin_numeric_id` text,
	`linkedin_urn` text,
	`full_name` text,
	`first_name` text,
	`last_name` text,
	`headline` text,
	`about` text,
	`industry` text,
	`primary_job_title` text,
	`primary_company_key` text,
	`job_function` text,
	`seniority` text,
	`location_label` text,
	`country_code` text,
	`country` text,
	`region` text,
	`city` text,
	`location_json` text,
	`followers_count` integer,
	`connections_count` integer,
	`connections_count_kind` text,
	`recommendations_count` integer,
	`profile_photo_url` text,
	`cover_photo_url` text,
	`images_json` text,
	`avatar_is_default` integer,
	`is_open_to_work` integer,
	`is_hiring` integer,
	`is_premium` integer,
	`is_influencer` integer,
	`is_creator` integer,
	`is_verified` integer,
	`is_memorialized` integer,
	`registered_at` text,
	`primary_locale` text,
	`locales_json` text,
	`localized_headlines_json` text,
	`profile_actions_json` text,
	`message_option_type` text,
	`experiences_json` text,
	`education_json` text,
	`skills_json` text,
	`languages_json` text,
	`certifications_json` text,
	`projects_json` text,
	`volunteering_json` text,
	`publications_json` text,
	`patents_json` text,
	`courses_json` text,
	`honors_awards_json` text,
	`organizations_json` text,
	`recommendations_json` text,
	`interests_json` text,
	`causes_json` text,
	`services_json` text,
	`featured_json` text,
	`websites_json` text,
	`social_profiles_json` text,
	`emails_json` text,
	`phones_json` text,
	`profile_highlights_json` text,
	`related_profiles_json` text,
	`posts_preview_json` text,
	`activity_preview_json` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `people_linkedin_url_unique` ON `people` (`linkedin_url`) WHERE "people"."linkedin_url" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `people_linkedin_profile_id_unique` ON `people` (`linkedin_profile_id`) WHERE "people"."linkedin_profile_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `people_linkedin_numeric_id_unique` ON `people` (`linkedin_numeric_id`) WHERE "people"."linkedin_numeric_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `people_linkedin_urn_unique` ON `people` (`linkedin_urn`) WHERE "people"."linkedin_urn" IS NOT NULL;
CREATE TABLE IF NOT EXISTS profile_runs (
 id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL, owner TEXT NOT NULL, lease_until INTEGER NOT NULL,
 state TEXT NOT NULL, budget_micro INTEGER NOT NULL, spent_micro INTEGER NOT NULL DEFAULT 0,
 reserved_micro INTEGER NOT NULL DEFAULT 0, input_json TEXT NOT NULL, companies_json TEXT,
 omitted INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS profile_single_flight ON profile_runs ((1)) WHERE state = 'running';
CREATE TABLE IF NOT EXISTS profile_work (
 run_id TEXT NOT NULL, phase TEXT NOT NULL, entity_key TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending',
 PRIMARY KEY (run_id, phase, entity_key)
);
CREATE TABLE IF NOT EXISTS profile_attempts (
 id TEXT PRIMARY KEY, run_id TEXT NOT NULL, entity_key TEXT NOT NULL, operation TEXT NOT NULL,
 state TEXT NOT NULL, reserved_micro INTEGER NOT NULL, cost_micro INTEGER, job_id TEXT, response_json TEXT,
 created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS profile_unsettled ON profile_attempts (entity_key, operation) WHERE state IN ('reserved','dispatched','uncertain');
CREATE TABLE IF NOT EXISTS profile_inputs (
 workflow_id TEXT NOT NULL, source_id TEXT NOT NULL, row_id TEXT NOT NULL, input_json TEXT NOT NULL,
 person_key TEXT, first_observed_at TEXT NOT NULL, last_observed_at TEXT NOT NULL,
 PRIMARY KEY (workflow_id, source_id, row_id)
);
CREATE TABLE IF NOT EXISTS gtm_viewer_grants (
    id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, workflow_id TEXT NOT NULL,
    workspace TEXT NOT NULL, environment TEXT NOT NULL, views TEXT NOT NULL, data_policy TEXT,
    created_at INTEGER NOT NULL, expires_at INTEGER, revoked_at INTEGER
  );
ALTER TABLE gtm_viewer_grants ADD COLUMN token_ciphertext TEXT;
-- PR #119's drift:
CREATE TABLE IF NOT EXISTS profile_identifiers (
 entity TEXT NOT NULL, namespace TEXT NOT NULL, value TEXT NOT NULL, entity_key TEXT NOT NULL,
 PRIMARY KEY (entity, namespace, value, entity_key)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS profile_identifiers_entity_key ON profile_identifiers (entity, entity_key);
CREATE INDEX IF NOT EXISTS companies_domain_name ON companies (domain, name);
