/**
 * Checks the pipeline on a schedule.
 * Runs: on Vercel
 * Kind: scheduled
 * Schedule: 0 9 * * *
 * Owner: Acme | ICP: revenue teams
 * Providers: none
 */
import { z } from "zod";
import type { WorkflowMeta } from "../../lib/approve";

export const input = z.object({ date: z.string() });
export const scheduledInput = { date: "fixture" };
export const MAX_ROWS = 1;
export const MAX_SPEND_USD = 0;
export const COST_PER_ROW_USD = 0;

export async function pipelineWatch(arg: z.infer<typeof input> | null, _meta: WorkflowMeta) {
  "use workflow";
  arg ??= scheduledInput;
  return arg;
}
