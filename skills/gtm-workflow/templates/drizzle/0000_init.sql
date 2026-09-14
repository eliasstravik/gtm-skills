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
