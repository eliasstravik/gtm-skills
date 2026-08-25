/**
 * Research new pipeline accounts each weekday.
 * Runs: on Vercel
 * Kind: scheduled
 * Schedule: 0 9 * * 1-5
 * Owner: Acme | ICP: Revenue Teams
 * Providers: none | Cost per row: up to $1.00
 */
import { z } from "zod";
export const input = z.object({ rows: z.array(z.object({ company: z.string() })) });
export const MAX_ROWS = 20;
export const MAX_SPEND_USD = 20;
export const COST_PER_ROW_USD = 1;
export const scheduledInput = { rows: [] };
export async function pipelineWatch(arg: z.infer<typeof input>) {
  "use workflow";
  arg ??= scheduledInput;
  return { completed: input.parse(arg).rows, failed: [] };
}
