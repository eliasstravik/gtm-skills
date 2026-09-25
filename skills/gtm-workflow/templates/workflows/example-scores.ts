/**
 * Score example companies
 *
 * Checks three example companies against the inlined ICP criteria and saves a score you can sort by.
 *
 * Demo and reference implementation of every convention: rows from defaultInput, a free cached step,
 * one AI step with an explicit backend, caps, freshness, and the diagram. It ships with no cron entry.
 */
import { generateObject } from "ai";
import { z } from "zod";
import { cached } from "../lib/cache";
import { runRows, type Row, type RowsInput } from "../lib/rows";

export const diagram = `flowchart TB
  start([Read the company list]) --> loop
  subgraph loop [For each company]
    direction TB
    fetchHomepage["Fetch the homepage<br/><small>company site · free</small>"]
    scoreCompany["Score against the ICP<br/><small>AI Gateway · gpt-6-luna · about $0.01 per row</small>"]:::ai
    saveScore["Save the score<br/><small>table example_scores</small>"]:::save
    fetchHomepage --> scoreCompany --> saveScore
  end
  loop --> done([Stops after 200 rows or $2; more than 100 rows run as child runs])`;

/** Copied from the ICP at Create and refreshed by Update; the first line names the source. */
export const criteria = `ICP: Lean B2B SaaS
- Business types: B2B
- Industries: Software
- Revenue streams: Subscriptions
- Company size: 20–200 employees
- Location: US, UK, or Canada`;

const MAX_ROWS = 200;
const MAX_SPEND_USD = 2;
const CHUNK_SIZE = 100;
const ESTIMATE_USD = 0.01;
const FRESH_FOR_MS = 24 * 60 * 60 * 1000;

/** The cron input; a POST body is merged over it, so `{ maxRows: 1 }` is the limited run. */
export const defaultInput: RowsInput & { rows: Row[] } = {
  rows: [{ key: "vercel.com" }, { key: "linear.app" }, { key: "notion.so" }],
};

export async function exampleScores(input: typeof defaultInput) {
  "use workflow";
  return runRows({
    rows: input.rows ?? defaultInput.rows,
    table: "exampleScores",
    step: scoreRow,
    maxRows: input.maxRows ?? MAX_ROWS,
    maxSpendUsd: input.maxSpendUsd ?? MAX_SPEND_USD,
    estimateUsd: ESTIMATE_USD,
    freshForMs: FRESH_FOR_MS,
    // Above CHUNK_SIZE rows this run only splits the list into child runs of itself, four at a time, and adds up their totals.
    fanOut: { workflow: exampleScores, input, chunkSize: CHUNK_SIZE },
  });
}

/** Workflow scope: awaits the steps in sequence and returns the columns plus the summed cost. */
async function scoreRow(row: Row) {
  const page = await fetchHomepage(row.key);
  const scored = await scoreCompany(row.key, page.value);
  return { score: scored.value.score, reason: scored.value.reason, costUsd: page.costUsd + scored.costUsd };
}

/** Free and keyless, cached for 7 days; unclassed in the diagram. */
async function fetchHomepage(domain: string) {
  "use step";
  // Only a bare public hostname: no paths, ports, IPs, or internal names reach fetch.
  if (!/^(?!\d+\.\d+\.\d+\.\d+$)[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(domain)) throw new Error(`Not a public hostname: ${domain}`);
  return cached("homepage", domain, 7 * 24 * 60 * 60 * 1000, async () => {
    const res = await fetch(`https://${domain}`, { headers: { "user-agent": "gtm-workflow" }, signal: AbortSignal.timeout(15_000) });
    const text = (await res.text()).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 6000);
    return { value: text, costUsd: 0 };
  });
}

const Score = z.object({ score: z.number().int().min(0).max(100), reason: z.string() });
const scorePrompt = (domain: string, page: string) => `Score how well ${domain} fits these criteria from 0 to 100 and give a one-sentence reason.\n\n${criteria}\n\nHomepage text:\n${page}`;

/** AI step through AI Gateway. Gateway cost arrives later, so cost_usd is the declared estimate. */
async function scoreCompany(domain: string, page: string) {
  "use step";
  const { object } = await generateObject({ model: process.env.GTM_MODEL ?? "openai/gpt-6-luna", schema: Score, prompt: scorePrompt(domain, page) });
  return { value: object, costUsd: ESTIMATE_USD };
}
scoreCompany.maxRetries = 0;
