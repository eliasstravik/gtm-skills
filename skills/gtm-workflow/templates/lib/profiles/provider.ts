import type { Executor } from "../db";
import { failure, reportFailure, type FailureContext } from "../failure";
import {
  reserveAndDispatch,
  saveJob,
  settle,
  uncertain,
  type RunLease,
} from "./ledger";

export type ProviderOperation = {
  provider: string;
  endpoint: string;
  body: Record<string, unknown>;
  queryParams?: Record<string, unknown>;
  pathParams?: Record<string, unknown>;
};
export type ProviderRun = {
  runId?: string;
  /** Set by adapters whose ledger identity varies per call (Blitz person versus email lookups). */
  endpoint?: string;
  status?: string;
  output?: unknown;
  providerResponse?: { httpStatus?: number };
  cost?: { value?: number; currency?: string; unit?: string };
  billing?: {
    reportedCost?: { value?: number; currency?: string; unit?: string };
  };
  price?: { amount?: { value?: number; currency?: string } };
  billedUnits?: number;
};
const terminal = (r: ProviderRun) =>
  [
    "COMPLETED",
    "FAILED",
    "BLOCKED",
    "STOPPED",
    "TIMED_OUT",
    "TIME_OUT",
  ].includes(r.status ?? "");
export function actualCost(run: ProviderRun): number | null {
  const cost = run.cost ?? run.billing?.reportedCost;
  if (
    cost?.currency === "USD" &&
    typeof cost.value === "number" &&
    Number.isFinite(cost.value) &&
    cost.value >= 0
  )
    return cost.unit === "MICRO_DOLLAR"
      ? cost.value / 1e6
      : !cost.unit || cost.unit === "USD" || cost.unit === "DOLLAR"
        ? cost.value
        : null;
  if (
    terminal(run) &&
    typeof run.billedUnits === "number" &&
    run.billedUnits >= 0 &&
    run.price?.amount?.currency === "USD" &&
    typeof run.price.amount.value === "number"
  )
    return run.billedUnits * run.price.amount.value;
  return null;
}
function headers(key: string) {
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}
/** Inspect current price before reserving. Only these single-identity endpoint shapes have a proven result bound. */
export async function maximumCharge(
  operation: ProviderOperation,
  key: string,
  fetcher: typeof fetch = fetch,
): Promise<number | null> {
  let response: Response;
  try {
    response = await fetcher("https://api.monid.ai/v1/inspect", {
      method: "POST",
      headers: headers(key),
      body: JSON.stringify({
        provider: operation.provider,
        endpoint: operation.endpoint,
      }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    throw failure(error, {
      layer: "provider_transport",
      provider: "monid",
      endpoint: "/v1/inspect",
      operation: `${operation.provider}:${operation.endpoint}`,
    });
  }
  if (!response.ok) {
    reportFailure(undefined, {
      layer: "provider_response",
      provider: "monid",
      endpoint: "/v1/inspect",
      operation: `${operation.provider}:${operation.endpoint}`,
      httpStatus: response.status,
    });
    return null;
  }
  let info: any;
  try {
    info = await response.json();
  } catch (error) {
    throw failure(error, {
      layer: "provider_response",
      provider: "monid",
      endpoint: "/v1/inspect",
      httpStatus: response.status,
    });
  }
  const p = info.price;
  if (
    p?.amount?.currency !== "USD" ||
    typeof p.amount.value !== "number" ||
    !Number.isFinite(p.amount.value) ||
    p.amount.value < 0
  )
    return null;
  if (p.type === "PER_CALL") return p.amount.value;
  if (
    operation.provider === "contactout" &&
    operation.endpoint === "/v1/domain/enrich" &&
    p.type === "PER_RESULT" &&
    Array.isArray(operation.body.domains) &&
    operation.body.domains.length === 1
  ) {
    if (
      p.flatFee &&
      (p.flatFee.currency !== "USD" ||
        typeof p.flatFee.value !== "number" ||
        p.flatFee.value < 0)
    )
      return null;
    return p.amount.value + (p.flatFee?.value ?? 0);
  }
  return null;
}
export type LookupResult =
  /** `settlement` present: the response is not settled yet; the caller settles it with that cost in its own transaction. */
  | { state: "ready"; attemptId: string; run: ProviderRun; settlement?: { costUsd: number | null }; createdAt?: Date }
  | { state: "pending"; attemptId: string; jobId: string }
  | { state: "uncertain" | "budget_deferred" | "unknown_price" | "unresolved" };
/** Returns promptly for async providers. Poll from a separate durable workflow step. */
export async function startLookup(
  client: Executor,
  lease: RunLease,
  entityKey: string,
  operation: ProviderOperation,
  key: string,
  fetcher: typeof fetch = fetch,
  options: { deferSettle?: boolean } = {},
): Promise<LookupResult> {
  const name = `${operation.provider}:${operation.endpoint}:default`;
  const maximum = await maximumCharge(operation, key, fetcher);
  // Price and budget checked, attempt written as dispatched, all committed before the POST.
  const reserved = await reserveAndDispatch(client, lease, entityKey, name, maximum);
  if (
    reserved.status === "budget_deferred" ||
    reserved.status === "unknown_price"
  )
    return { state: reserved.status };
  if (reserved.status === "existing") {
    const a = reserved.attempt;
    if (a.state === "settled" && a.response_json)
      return {
        state: "ready",
        attemptId: a.id,
        run: a.response_json as never,
        createdAt: a.created_at,
      };
    if (a.job_id)
      return {
        state: "pending",
        attemptId: a.id,
        jobId: a.job_id,
      };
    // An interrupted reservation is conservative too: only the original dispatcher owns it.
    return { state: "uncertain" };
  }
  let layer: FailureContext["layer"] = "provider_transport";
  try {
    const response = await fetcher("https://api.monid.ai/v1/run", {
      method: "POST",
      headers: headers(key),
      body: JSON.stringify({
        provider: operation.provider,
        endpoint: operation.endpoint,
        input: {
          body: operation.body,
          queryParams: operation.queryParams,
          pathParams: operation.pathParams,
        },
      }),
      signal: AbortSignal.timeout(60000),
    });
    layer = "provider_response";
    const run = (await response.json()) as ProviderRun;
    if (!response.ok || (terminal(run) && run.status !== "COMPLETED"))
      reportFailure(undefined, {
        layer: "provider_response",
        provider: "monid",
        endpoint: "/v1/run",
        operation: `${operation.provider}:${operation.endpoint}`,
        runId: lease.id,
        requestId: run.runId,
        httpStatus: response.status,
      });
    layer = "step";
    if (run.runId) await saveJob(client, reserved.id, run.runId);
    if (terminal(run)) {
      if (options.deferSettle) return { state: "ready", attemptId: reserved.id, run, settlement: { costUsd: actualCost(run) }, createdAt: reserved.createdAt };
      await settle(client, reserved.id, actualCost(run), run);
      return { state: "ready", attemptId: reserved.id, run, createdAt: reserved.createdAt };
    }
    if (run.runId)
      return { state: "pending", attemptId: reserved.id, jobId: run.runId };
    await uncertain(client, reserved.id);
    return { state: "uncertain" };
  } catch (error) {
    reportFailure(error, {
      layer,
      provider: "monid",
      endpoint: "/v1/run",
      operation: `${operation.provider}:${operation.endpoint}`,
      runId: lease.id,
      requestId: reserved.id,
    });
    await uncertain(client, reserved.id);
    return { state: "uncertain" };
  }
}
export async function pollLookup(
  client: Executor,
  attemptId: string,
  jobId: string,
  key: string,
  fetcher: typeof fetch = fetch,
): Promise<LookupResult> {
  let layer: FailureContext["layer"] = "provider_transport";
  try {
    const response = await fetcher(
      `https://api.monid.ai/v1/runs/${encodeURIComponent(jobId)}`,
      { headers: headers(key), signal: AbortSignal.timeout(30000) },
    );
    if (!response.ok) {
      reportFailure(undefined, {
        layer: "provider_response",
        provider: "monid",
        endpoint: "/v1/runs/:id",
        requestId: jobId,
        httpStatus: response.status,
      });
      return { state: "pending", attemptId, jobId };
    }
    layer = "provider_response";
    const run = (await response.json()) as ProviderRun;
    if (!terminal(run)) return { state: "pending", attemptId, jobId };
    if (run.status !== "COMPLETED")
      reportFailure(undefined, {
        layer: "provider_response",
        provider: "monid",
        endpoint: "/v1/runs/:id",
        requestId: jobId,
        httpStatus: response.status,
      });
    layer = "step";
    await settle(client, attemptId, actualCost(run), run);
    return { state: "ready", attemptId, run };
  } catch (error) {
    reportFailure(error, {
      layer,
      provider: "monid",
      endpoint: "/v1/runs/:id",
      requestId: jobId,
    });
    return { state: "pending", attemptId, jobId };
  }
}
