/**
 * Score supplied accounts against the Revenue Teams ICP.
 * Runs: on this computer
 * Kind: on-demand
 * Owner: Acme | ICP: Revenue Teams
 * Providers: none | Cost per row: up to $1.00
 */
import { z } from "zod";
import { agent } from "../lib/agent";

export const input = z.object({ rows: z.array(z.object({ company: z.string() })) });
export const MAX_ROWS = 25;
export const MAX_SPEND_USD = 25;
export const COST_PER_ROW_USD = 1;
const resultSchema = z.object({ fit: z.boolean(), reason: z.string() });

export async function accountScoring(arg: z.infer<typeof input>) {
  "use workflow";
  const parsed = input.parse(arg);
  if (parsed.rows.length > MAX_ROWS) throw new Error("MAX_ROWS exceeded");
  if (parsed.rows.length * COST_PER_ROW_USD > MAX_SPEND_USD) throw new Error("MAX_SPEND_USD exceeded");
  const completed = [];
  const failed = [];
  for (const row of parsed.rows) {
    try {
      completed.push({ row, result: await agent({ prompt: row.company, schema: resultSchema, maxUsd: COST_PER_ROW_USD }) });
    } catch (error) {
      failed.push({ row, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { completed, failed };
}
