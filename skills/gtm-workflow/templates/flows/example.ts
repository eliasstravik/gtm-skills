/**
 * Qualify companies against an example ICP with a schema-checked agent verdict.
 * Runs: on this computer
 * Kind: on-demand
 * Owner: root | ICP: example-icp
 * Providers: none | Cost per row: up to $1.00
 */
import { getWorkflowMetadata } from "workflow";
import { z } from "zod";
import { agent } from "../lib/agent";

const row = z.object({
  company: z.string(),
  website: z.string().optional(),
});

export const input = z.object({
  rows: z.array(row),
  web: z.boolean().optional(),
});

export const MAX_ROWS = 25;
export const MAX_SPEND_USD = 25;
export const COST_PER_ROW_USD = 1;

// Scheduled workflows export their fallback input and uncomment the first line
// in the workflow body below.
// export const scheduledInput: z.infer<typeof input> = { rows: [], web: false };

// strictSchema makes every field required. Use nullable, not optional, for
// fields that an agent may leave empty.
const verdict = z.object({
  fit: z.boolean(),
  reason: z.string(),
  sourceUrl: z.string().nullable(),
});

type Input = z.infer<typeof input>;
type Row = z.infer<typeof row>;
type Completed = { row: Row; result: z.infer<typeof verdict> };
type Failed = { row: Row; error: string };

export async function example(arg: Input) {
  "use workflow";
  // arg ??= scheduledInput;

  const parsed = input.parse(arg);

  // A workflow may fetch rows first, but provider calls belong in a step.
  // const rows = await fetchProviderRows(parsed);
  const rows = parsed.rows;

  if (rows.length > MAX_ROWS) {
    throw new Error(`This run has ${rows.length} rows; MAX_ROWS is ${MAX_ROWS}.`);
  }
  const projectedSpend = rows.length * COST_PER_ROW_USD;
  if (projectedSpend > MAX_SPEND_USD) {
    throw new Error(
      `Projected spend is $${projectedSpend.toFixed(2)}; MAX_SPEND_USD is $${MAX_SPEND_USD.toFixed(2)}.`,
    );
  }

  const completed: Completed[] = [];
  const failed: Failed[] = [];
  for (const item of rows) {
    try {
      // Provider calls also belong in a step before agent(), when needed.
      // const providerData = await fetchProviderData(item);
      const result = await agent({
        prompt: [
          "ICP: B2B software companies that sell to sales or marketing teams and have 20 to 500 employees.",
          `Company: ${item.company}`,
          item.website ? `Website: ${item.website}` : "Website: unknown",
          parsed.web
            ? "Research the company on the web, then decide if it fits the ICP."
            : "Decide if it fits the ICP from the supplied facts and your knowledge.",
        ].join("\n"),
        schema: verdict,
        tools: parsed.web ? "web" : "none",
        maxUsd: COST_PER_ROW_USD,
      });
      completed.push({ row: item, result });
    } catch (error) {
      failed.push({
        row: item,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const metadata = getWorkflowMetadata();
  await deliverResults({
    runId: metadata.workflowRunId,
    workflow: "example",
    dateKey: metadata.workflowStartedAt.toISOString().slice(0, 10),
    completed,
    failed,
  });

  return { completed, failed };
}

async function deliverResults(payload: {
  runId: string;
  workflow: string;
  dateKey: string;
  completed: Completed[];
  failed: Failed[];
}) {
  "use step";
  const url = process.env.GTM_RESULTS_URL;
  if (!url) return { delivered: false };

  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`Result delivery failed with HTTP ${response.status}.`);
  }
  return { delivered: true };
}

/*
async function fetchProviderRows(_arg: Input): Promise<Row[]> {
  "use step";
  // Call a pinned provider endpoint here and return plain data.
  return [];
}
*/
