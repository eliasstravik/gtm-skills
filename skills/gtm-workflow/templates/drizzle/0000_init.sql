CREATE TABLE "example_research" (
	"key" text PRIMARY KEY NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"cost_usd" double precision DEFAULT 0 NOT NULL,
	"error" text,
	"summary" text,
	"sells" text,
	"headcount_band" text,
	"evidence_json" jsonb,
	"tool_calls" integer,
	"stop_reason" text
);
--> statement-breakpoint
CREATE TABLE "example_scores" (
	"key" text PRIMARY KEY NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"cost_usd" double precision DEFAULT 0 NOT NULL,
	"error" text,
	"score" integer,
	"reason" text
);
