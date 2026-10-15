CREATE TABLE IF NOT EXISTS "gtm"."workflow_folder_assignments" (
	"workspace" text NOT NULL,
	"environment" text NOT NULL,
	"workflow_id" uuid NOT NULL,
	"folder_id" uuid NOT NULL,
	CONSTRAINT "workflow_folder_assignments_workspace_environment_workflow_id_pk" PRIMARY KEY("workspace","environment","workflow_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "gtm"."workflow_folder_scopes" (
	"workspace" text NOT NULL,
	"environment" text NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "workflow_folder_scopes_workspace_environment_pk" PRIMARY KEY("workspace","environment")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "gtm"."workflow_folders" (
	"workspace" text NOT NULL,
	"environment" text NOT NULL,
	"id" uuid NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	CONSTRAINT "workflow_folders_workspace_environment_id_pk" PRIMARY KEY("workspace","environment","id"),
	CONSTRAINT "workflow_folder_not_self" CHECK ("gtm"."workflow_folders"."parent_id" IS NULL OR "gtm"."workflow_folders"."parent_id" <> "gtm"."workflow_folders"."id"),
	CONSTRAINT "workflow_folder_valid_name" CHECK (length("gtm"."workflow_folders"."name") BETWEEN 1 AND 120 AND "gtm"."workflow_folders"."name" = btrim("gtm"."workflow_folders"."name") AND "gtm"."workflow_folders"."name" NOT IN ('.', '..') AND "gtm"."workflow_folders"."name" !~ '[/\\[:cntrl:]]')
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'gtm.workflow_folder_assignments'::regclass AND conname = 'workflow_folder_assignments_workspace_environment_folder_id_wor') THEN
    ALTER TABLE "gtm"."workflow_folder_assignments" ADD CONSTRAINT "workflow_folder_assignments_workspace_environment_folder_id_workflow_folders_workspace_environment_id_fk" FOREIGN KEY ("workspace","environment","folder_id") REFERENCES "gtm"."workflow_folders"("workspace","environment","id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'gtm.workflow_folders'::regclass AND conname = 'workflow_folders_workspace_environment_workflow_folder_scopes_w') THEN
    ALTER TABLE "gtm"."workflow_folders" ADD CONSTRAINT "workflow_folders_workspace_environment_workflow_folder_scopes_workspace_environment_fk" FOREIGN KEY ("workspace","environment") REFERENCES "gtm"."workflow_folder_scopes"("workspace","environment") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'gtm.workflow_folders'::regclass AND conname = 'workflow_folders_workspace_environment_parent_id_workflow_folde') THEN
    ALTER TABLE "gtm"."workflow_folders" ADD CONSTRAINT "workflow_folders_workspace_environment_parent_id_workflow_folders_workspace_environment_id_fk" FOREIGN KEY ("workspace","environment","parent_id") REFERENCES "gtm"."workflow_folders"("workspace","environment","id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_folder_assignment_folder" ON "gtm"."workflow_folder_assignments" USING btree ("workspace","environment","folder_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "workflow_folder_sibling_names" ON "gtm"."workflow_folders" USING btree ("workspace","environment",coalesce("parent_id", '00000000-0000-0000-0000-000000000000'::uuid),lower("name"));