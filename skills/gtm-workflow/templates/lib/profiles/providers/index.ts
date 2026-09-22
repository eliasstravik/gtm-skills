import type { Executor } from "../../db";
import type { RunLease } from "../ledger";
import type { Evidence } from "../store";
import type { LookupResult, ProviderRun } from "../provider";
import { monid } from "./monid";
import { blitz } from "./blitz";

export type ProviderName = "monid" | "blitz";
export type Phase = "people" | "companies";
export type Subject = {
  url?: string;
  email?: string;
  domain?: string;
  linkedinUrl?: string;
  name?: string;
};
export type LookupPlan =
  | {
      kind: "lookup";
      provider: string;
      endpoint: string;
      mode: "default";
      body: Record<string, unknown>;
    }
  | { kind: "unresolved"; reason: string };
export type LookupOptions = { requestsPerSecond?: number };
/** One selectable enrichment service. The ledger identity is (provider, endpoint, mode) from identity(). */
export type NetworkProvider = {
  name: ProviderName;
  /** Decides the ledger identity and request body without any network call. */
  identity(phase: Phase, subject: Subject): LookupPlan;
  /** Reserve, call, settle. Only called for a "lookup" plan. */
  lookup(
    client: Executor,
    lease: RunLease,
    entityKey: string,
    plan: Extract<LookupPlan, { kind: "lookup" }>,
    apiKey: string,
    options: LookupOptions,
  ): Promise<LookupResult>;
  normalize(
    phase: Phase,
    run: ProviderRun,
    context: { fetchedAt: string; existingDomain: string },
  ): Evidence;
  /** null means the price is unknown and the row stays uncertain. */
  cost(run: ProviderRun): number | null;
};

const registry: Record<ProviderName, NetworkProvider> = { monid, blitz };
export function provider(name?: ProviderName): NetworkProvider {
  const chosen = registry[name ?? "monid"];
  if (!chosen) throw new Error(`Unknown network provider: ${name}`);
  return chosen;
}
