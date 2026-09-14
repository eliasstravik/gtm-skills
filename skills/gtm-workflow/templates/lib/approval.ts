import { defineHook } from "workflow";
import { z } from "zod";
import { upsert } from "./db";

/**
 * Human approval for agent tools. A guarded tool creates a hook keyed by its tool call id, records the request, and
 * waits; `POST /api/runs/<id>/approve` resumes it through lib/approval-api.ts. Requests live in the `cache` table
 * under the name `approval`. Only workflow-safe code lives here: routes import lib/approval-api.ts instead.
 */
export const approvalHook = defineHook({ schema: z.object({ approved: z.boolean(), reason: z.string().nullable().optional() }) });

export type Approval = {
  token: string;
  runId: string;
  stage: string;
  tool: string;
  input: unknown;
  requestedAt: string;
  decidedAt: string | null;
  approved: boolean | null;
  reason: string | null;
};

export const APPROVAL_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/** Records a pending request; Date.now() is called here, inside the step. A plain function touching the database here would drag the database client into the workflow bundle. */
export async function recordApproval(a: Omit<Approval, "requestedAt" | "decidedAt" | "approved" | "reason">): Promise<void> {
  "use step";
  const now = new Date();
  const record: Approval = { ...a, requestedAt: now.toISOString(), decidedAt: null, approved: null, reason: null };
  await upsert("cache", [{ name: "approval", hash: a.token, value: JSON.stringify(record), created_at: now.toISOString(), expires_at: new Date(now.getTime() + APPROVAL_RETENTION_MS).toISOString() }], ["name", "hash"]);
}
