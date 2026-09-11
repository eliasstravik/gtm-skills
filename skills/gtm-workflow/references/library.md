# Workflow library

The template adds these chosen conventions to Vercel Workflow:

- `runRows()` handles caps, row progress, cancellation, and optional checkpoints.
- `provider()` wraps a fixed paid call with caching and a ledger entry.
- `agent()` produces one structured model response. A Gateway credential wins; otherwise `GTM_HOST` selects Claude Code or Codex exactly.
- `agentStage()` lets a hosted `WorkflowAgent` choose among a declared list of HTTP MCP servers. Each MCP call is a durable step. Local CLIs run it only when the recorded capability table proves budget, turn, built-in-tool, and MCP restrictions.
- `withSpend(meta, { step, estimateUsd }, fn)` atomically reserves and settles a paid operation against the run cap. Every paid helper receives an explicit enclosing function name as `step`; only those Diagram nodes light up.
- Every result table declares `key` and `updatedAt` (`updated_at`). `npm run db:generate` writes committed SQL and regenerates the bundled migration module. Nitro applies every pending migration at startup.
- The workflow file starts with an author-written `Diagram:` block. Numbered nodes run in order unless a line uses `-> N`. Paid nodes need `[cost: $X/row]`; `agentStage()` needs `[cost: up to $X/row]`; schedules need `[schedule: cron]` and a matching `vercel.json` entry.
- `gtm` provides `run`, `runs get`, `query`, `check`, `verify`, `diagram`, `approve`, `cancel`, `upgrade`, and `help`. The web diagram response includes Diagram, image, Runs, and Data links.

```ts
/**
 * Diagram:
 *   1. Read the company list       [step: parseInput]
 *   2. Research each company       [step: researchCompany] [cost: up to $0.10/row]
 *   3. Save to account_scores      [step: saveRow]
 */
import { z } from "zod";
import { agentStage } from "../lib/agent-stage";
import { runRows } from "../lib/rows";
import { upsertRows } from "../lib/db";
import { accountScores } from "../db/tables/account-scores";

export const input = z.object({ rows: z.array(z.object({ key: z.string() })) });
export const MAX_ROWS = 100;
export const MAX_SPEND_USD = 10;

async function parseInput(value: unknown) {
  "use step";
  return input.parse(value);
}

async function researchCompany(row: { key: string }, meta: any) {
  return agentStage({
    id: "researchCompany",
    instructions: "Research the company and return a concise score reason.",
    input: row,
    schema: z.object({ score: z.number(), reason: z.string() }),
    tools: [{ name: "company-data", url: "https://example.com/mcp", headers: { Authorization: "COMPANY_DATA_TOKEN" } }],
    maxUsd: 0.1,
    maxTurns: 4,
    deadlineMs: 120_000,
    meta,
  });
}

async function saveRow(row: { key: string; score: number; reason: string }) {
  "use step";
  await upsertRows(accountScores, [{ ...row, updatedAt: Date.now() }]);
}

export async function accountScoring(raw: unknown, meta: any) {
  "use workflow";
  const value = await parseInput(raw);
  return runRows({
    rows: value.rows,
    meta,
    maxRows: MAX_ROWS,
    maxSpendUsd: MAX_SPEND_USD,
    costPerRowUsd: 0.1,
    rowStep: async (row, rowMeta) => {
      const result = await researchCompany(row, rowMeta);
      await saveRow({ key: row.key, ...result });
      return { status: "success" };
    },
  });
}
```
