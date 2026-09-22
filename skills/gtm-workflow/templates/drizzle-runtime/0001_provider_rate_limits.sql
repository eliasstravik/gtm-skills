CREATE TABLE "gtm"."provider_rate_limits" (
	"provider" text PRIMARY KEY NOT NULL,
	"next_allowed_at" bigint NOT NULL
);
