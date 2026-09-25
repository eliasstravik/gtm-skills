import { defineHook, getWorkflowMetadata, setAttributes } from "workflow";
import { resumeHook, start } from "workflow/api";
import { z } from "zod";
import { db } from "../db";
import { recordChildren } from "../rows";
import { finishRun, runSummary, type RunLease } from "./ledger";
import { collectCompanies, enrichItems, prepareNetwork, DEFAULT_WORKERS, type NetworkInput, type NetworkPerson } from "./network";

/** Plain steps: 100 items is far under the engine's 25,000-event cap and one chunk is one step. */
export const NETWORK_CHUNK_SIZE = 100;
/** Child runs at a time. With twelve workers each, four children offer 48 requests at once; the provider's pacing table is the real cap. */
export const NETWORK_CONCURRENCY = 4;

type Phase = "people" | "companies";
type Chunk = { phase: Phase; items: NetworkPerson[] | string[]; lease: RunLease; parent: string };
/** A network workflow's input: the user's settings, plus `chunk` on a child that runNetwork started for one chunk of one phase. */
export type NetworkRunInput = NetworkInput & { chunk?: Chunk };
export type ChunkReport = { phase: Phase; count: number };
export type RunNetworkOptions = {
  /** The workflow function itself; its engine id starts the children. */
  workflow: (input: never) => Promise<unknown>;
  /** The workflow's permanent UUID, which keys profile membership. */
  workflowId: string;
  input: NetworkRunInput;
  /** The environment variable holding the provider key (BLITZ_API_KEY or MONID_API_KEY), read inside the step that needs it. */
  apiKeyVariable: string;
  /** Filled in when the input leaves them out: the recipe's 200 people, $20 and 30 days unless the workflow says otherwise. */
  defaults?: Pick<NetworkInput, "maxPeople" | "maxSpendUsd" | "freshForDays">;
  chunkSize?: number;
  concurrency?: number;
  workers?: number;
  /** Tests replace the engine: how children start, how their reports are awaited, how a child reports. */
  engine?: {
    startChunks: (workflowId: string, inputs: NetworkRunInput[]) => Promise<string[]>;
    awaitChunks: (tokens: string[]) => Promise<ChunkReport[]>;
    report: (token: string, result: ChunkReport) => Promise<void>;
  };
};

const chunkHook = defineHook({ schema: z.object({ phase: z.enum(["people", "companies"]), count: z.number() }) });

/**
 * The whole of a network enrichment run, in workflow scope: import, people, company collection, companies, summary.
 * Every phase is split into chunks; above one chunk the run starts child runs of the same workflow, `concurrency`
 * at a time, each enriching one chunk under the parent's run and lease, so a 4,000-person list is forty parallel
 * children sharing one budget and one ledger. A child does only its chunk and reports its count through a hook.
 */
export async function runNetwork(o: RunNetworkOptions) {
  const chunkSize = o.chunkSize ?? NETWORK_CHUNK_SIZE, concurrency = o.concurrency ?? NETWORK_CONCURRENCY;
  const { workflowRunId } = getWorkflowMetadata();
  const input: NetworkRunInput = { ...o.defaults, ...o.input };
  // Called bare, never as `engine.x()`: a step called as a method sends its receiver to the step too, and this
  // object holds functions, which fail the run with "Cannot stringify a function" at `.thisVal`.
  const { startChunks: startChildren, awaitChunks, report: reportChunk } = o.engine ?? {
    startChunks,
    awaitChunks: (tokens: string[]) => Promise.all(tokens.map((token) => chunkHook.create({ token }))),
    report,
  };
  await setAttributes({ workflow: workflowSlug(), ...(input.chunk && { parent: input.chunk.parent.split(":chunk:")[0] as string, phase: input.chunk.phase }) });
  if (input.chunk) {
    const { chunk, ...settings } = input;
    await enrichChunk(chunk.lease, chunk.phase, chunk.items, settings, o.apiKeyVariable, o.workers);
    const result: ChunkReport = { phase: chunk.phase, count: chunk.items.length };
    await reportChunk(chunk.parent, result);
    return result;
  }
  const prepared = await prepare(o.workflowId, workflowRunId, input);
  if (prepared.status !== "running") return summary(prepared.runId);
  const { lease } = prepared;
  const engineWorkflowId = (o.workflow as unknown as { workflowId?: string }).workflowId;
  const phase = async (name: Phase, items: NetworkPerson[] | string[]) => {
    const chunks: (NetworkPerson[] | string[])[] = [];
    for (let i = 0; i < items.length; i += chunkSize) chunks.push(items.slice(i, i + chunkSize) as NetworkPerson[] | string[]);
    if (chunks.length <= 1) {
      // One chunk runs here: nothing to gain from a child.
      for (const chunk of chunks) await enrichChunk(lease, name, chunk, input, o.apiKeyVariable, o.workers);
      return;
    }
    if (!engineWorkflowId) throw new Error("runNetwork's workflow must be the workflow function itself");
    for (let wave = 0; wave < chunks.length; wave += concurrency) {
      const waveChunks = chunks.slice(wave, wave + concurrency);
      const tokens = waveChunks.map((_, j) => `${workflowRunId}:${name}:chunk:${wave + j}`);
      // The hooks exist before the children start, so no report can arrive unheard.
      const reports = awaitChunks(tokens);
      await startChildren(
        engineWorkflowId,
        waveChunks.map((chunk, j) => ({ ...input, rows: undefined, chunk: { phase: name, items: chunk, lease, parent: tokens[j] } })),
      );
      await reports;
    }
  };
  await phase("people", prepared.people);
  const companies = await collect(lease, prepared.people);
  await phase("companies", companies.keys);
  return finish(lease);
}

async function prepare(workflowId: string, owner: string, input: NetworkInput) {
  "use step";
  return prepareNetwork(db(), workflowId, owner, input);
}

/** One chunk of one phase, twelve workers wide, inside one step. Paid calls are made durable by the ledger, so this step never retries. */
async function enrichChunk(lease: RunLease, phase: Phase, items: NetworkPerson[] | string[], input: NetworkInput, apiKeyVariable: string, workers?: number) {
  "use step";
  const apiKey = process.env[apiKeyVariable];
  if (!apiKey) throw new Error(`Set ${apiKeyVariable} in the workflow project settings`);
  // DEFAULT_WORKERS is read here, not in workflow scope: `network` reaches `db.ts` and `pg`, and a workflow-scope
  // reference to any of its values would pull `pg` into the workflow bundle and fail build-viewer.
  await enrichItems(db(), lease, phase, items, input, apiKey, { workers: workers ?? DEFAULT_WORKERS });
}
enrichChunk.maxRetries = 0;

async function collect(lease: RunLease, people: NetworkPerson[]) {
  "use step";
  return collectCompanies(db(), lease, people);
}

async function finish(lease: RunLease) {
  "use step";
  await finishRun(db(), lease);
  return runSummary(db(), lease.id);
}

async function summary(runId: string) {
  "use step";
  return runSummary(db(), runId);
}

/** Starts a wave of children and records their ids for the cancel route, in one step. */
async function startChunks(workflowId: string, inputs: NetworkRunInput[]): Promise<string[]> {
  "use step";
  const { getWorld } = await import("workflow/runtime");
  const parentId = getWorkflowMetadata().workflowRunId;
  const parent = await (await getWorld()).runs.get(parentId, { resolveData: "none" });
  const attributes = Object.fromEntries(Object.entries(parent.attributes ?? {}).filter(([key]) => key.startsWith("gtm.viewer.")));
  const runIds: string[] = [];
  for (const input of inputs) {
    const run = await start({ workflowId }, [input] as never, { attributes: { ...attributes, "gtm.viewer.parent": parentId } });
    runIds.push(run.runId);
  }
  await recordChildren(db(), parentId, runIds);
  return runIds;
}

async function report(token: string, result: ChunkReport): Promise<void> {
  "use step";
  await resumeHook(token, result);
}

/** workflowName is `workflow//./workflows/<slug>//<function>`; the slug is what the routes and links use. */
function workflowSlug(): string {
  const parts = getWorkflowMetadata().workflowName.split("//");
  return (parts[1] ?? "").split("/").pop() || parts[parts.length - 1] || "";
}
