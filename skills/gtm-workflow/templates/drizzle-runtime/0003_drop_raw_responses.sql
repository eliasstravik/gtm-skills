-- One-time data move: every retained envelope keeps its metadata (provider, endpoint, mode, outcome, sections, times, cost)
-- and loses its payload. provenance_json and section_status_json point at envelopes by hash and stay correct: the hashes are
-- the keys of this object and are copied as they are. The payloads of ledgered lookups stay in gtm.profile_attempts.response_json.
UPDATE "gtm"."people" SET "responses_json" = COALESCE((SELECT jsonb_object_agg(e.key, e.value - 'raw') FROM jsonb_each("raw_responses_json") e), '{}'::jsonb) WHERE "raw_responses_json" IS NOT NULL;--> statement-breakpoint
UPDATE "gtm"."companies" SET "responses_json" = COALESCE((SELECT jsonb_object_agg(e.key, e.value - 'raw') FROM jsonb_each("raw_responses_json") e), '{}'::jsonb) WHERE "raw_responses_json" IS NOT NULL;--> statement-breakpoint
DROP INDEX "gtm"."people_experiences_gin";--> statement-breakpoint
ALTER TABLE "gtm"."companies" DROP COLUMN "raw_responses_json";--> statement-breakpoint
ALTER TABLE "gtm"."people" DROP COLUMN "raw_responses_json";
