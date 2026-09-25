/**
 * Research example companies
 *
 * Sends an agent to read each example company's website and saves a short brief with the pages it used as evidence.
 *
 * Reference implementation of an agent stage: runAgent in workflow scope, a skill for the method, the free page
 * tool, caps on steps, spend, and time, and real cost from the Gateway. It ships with no cron entry.
 */
import { z } from "zod";
import { runAgent } from "../lib/agent";
import { runRows, type Row, type RowsInput } from "../lib/rows";

export const diagram = `flowchart TB
  start([Read the company list]) --> loop
  subgraph loop [For each company]
    direction TB
    researchCompany["Research the company<br/><small>Agent · AI Gateway · gpt-6-luna · about $0.03 per row</small>"]:::agent
    fetchPage["Read the pages the agent asks for<br/><small>company site · free</small>"]
    saveBrief["Save the brief<br/><small>table example_research</small>"]:::save
    researchCompany --> fetchPage --> researchCompany --> saveBrief
  end
  loop --> done([Stops after 200 rows or $2; more than 20 rows run as child runs])`;

const MAX_ROWS = 200;
const MAX_SPEND_USD = 2;
const ESTIMATE_USD = 0.03;
const FRESH_FOR_MS = 7 * 24 * 60 * 60 * 1000;
/** An agent row is about 100 engine events; chunks of 20 keep each child run far under the 25,000-event cap. */
const CHUNK_SIZE = 20;

/** The cron input; a POST body is merged over it, so `{ maxRows: 1 }` is the limited run. */
export const defaultInput: RowsInput & { rows: Row[] } = {
  rows: [{ key: "vercel.com" }, { key: "linear.app" }],
};

export async function exampleResearch(input: typeof defaultInput) {
  "use workflow";
  return runRows({
    rows: input.rows ?? defaultInput.rows,
    table: "exampleResearch",
    step: researchRow,
    maxRows: input.maxRows ?? MAX_ROWS,
    maxSpendUsd: input.maxSpendUsd ?? MAX_SPEND_USD,
    estimateUsd: ESTIMATE_USD,
    freshForMs: FRESH_FOR_MS,
    // Above CHUNK_SIZE rows this run only splits the list into child runs of itself, four at a time, and adds up their totals.
    fanOut: { workflow: exampleResearch, input, chunkSize: CHUNK_SIZE },
  });
}

/** Workflow scope: the agent stage, then the columns plus its real cost. */
async function researchRow(row: Row) {
  const brief = await researchCompany(row.key);
  return {
    summary: brief.value.summary,
    sells: brief.value.whatTheySell,
    headcount_band: brief.value.headcountBand,
    evidence_json: JSON.stringify(brief.value.evidenceUrls),
    tool_calls: brief.toolCalls.length,
    stop_reason: brief.stopReason,
    costUsd: brief.costUsd,
  };
}

const Brief = z.object({
  summary: z.string().describe("Two sentences on what the company does and for whom"),
  whatTheySell: z.string().describe("The product or service in plain words"),
  headcountBand: z.enum(["1-10", "11-50", "51-200", "201-1000", "1000+", "unknown"]),
  evidenceUrls: z.array(z.string()).describe("Pages actually read"),
});

/** Agent stage, in workflow scope: `agent` node in the diagram; cost is what the Gateway reports per call. */
async function researchCompany(domain: string) {
  return runAgent({
    name: "researchCompany",
    instructions: "You research B2B companies from their own websites. Read pages with fetch_page; never invent facts.",
    skills: ["company-research"],
    tools: { web: { fetch: true } },
    prompt: `Research the company at ${domain} and return the brief.`,
    schema: Brief,
    estimateUsd: ESTIMATE_USD,
    maxSteps: 8,
    maxUsd: 0.1,
    timeout: "5m",
  });
}
