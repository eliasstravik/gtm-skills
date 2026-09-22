import { sql } from "drizzle-orm";
import type { Executor } from "../../db";
import { dispatch, reserve, settle, uncertain } from "../ledger";
import { normalizeBlitz } from "../normalize";
import type { ProviderRun } from "../provider";
import type { LookupOptions, NetworkProvider } from "./index";

export const BLITZ_BASE_URL = "https://api.blitz-api.ai";
const RETRIES = 3;
const DEFAULT_REQUESTS_PER_SECOND = 30;
const PACING_KEY = "blitz";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Take the next request slot in one atomic statement so every step and process of the workspace shares one limit. */
async function waitForSlot(client: Executor, requestsPerSecond: number) {
  const interval = Math.ceil(1000 / requestsPerSecond),
    now = Date.now();
  const { rows } = await client.execute(
    sql`INSERT INTO gtm.provider_rate_limits (provider, next_allowed_at) VALUES (${PACING_KEY}, ${now + interval})
        ON CONFLICT (provider) DO UPDATE SET next_allowed_at = GREATEST(gtm.provider_rate_limits.next_allowed_at, ${now}) + ${interval}
        RETURNING next_allowed_at`,
  );
  // bigint arrives as text; this caller's slot is the stored value minus one interval.
  const slot = Number((rows[0] as { next_allowed_at: unknown }).next_allowed_at) - interval;
  if (slot > now) await sleep(slot - now);
}

async function request(
  client: Executor,
  endpoint: string,
  body: Record<string, unknown>,
  apiKey: string,
  requestsPerSecond: number,
): Promise<{ status: number; payload: unknown } | { error: unknown }> {
  for (let attempt = 0; attempt < RETRIES; attempt += 1) {
    try {
      await waitForSlot(client, requestsPerSecond);
      const response = await fetch(`${BLITZ_BASE_URL}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
      });
      const payload = await response.json().catch(() => null);
      if (
        (response.status === 429 || response.status >= 500) &&
        attempt + 1 < RETRIES
      ) {
        await sleep(250 * 2 ** attempt);
        continue;
      }
      return { status: response.status, payload };
    } catch (error) {
      return { error };
    }
  }
  return { error: new Error("Blitz request retry limit reached") };
}

/** A company known only by domain needs its LinkedIn URL before the company lookup. Not ledgered: it is free and idempotent. */
export async function resolveCompanyUrl(
  client: Executor,
  apiKey: string,
  domain: string,
  options: LookupOptions = {},
): Promise<string | null> {
  const result = await request(
    client,
    "/v2/enrichment/domain-to-linkedin",
    { domain },
    apiKey,
    options.requestsPerSecond ?? DEFAULT_REQUESTS_PER_SECOND,
  );
  if ("error" in result || result.status < 200 || result.status >= 300) return null;
  const url = (result.payload as { company_linkedin_url?: unknown } | null)
    ?.company_linkedin_url;
  return typeof url === "string" && url ? url : null;
}

/** The Blitz API: a flat subscription, so every attempt reserves and settles at zero and the ledger never sees an unknown price. */
export const blitz: NetworkProvider = {
  name: "blitz",
  identity(phase, subject) {
    if (phase === "people") {
      if (subject.url)
        return {
          kind: "lookup",
          provider: "blitz",
          endpoint: "/v2/enrichment/person",
          mode: "default",
          body: { person_linkedin_url: subject.url },
        };
      if (subject.email)
        return {
          kind: "lookup",
          provider: "blitz",
          endpoint: "/v2/enrichment/email-to-person",
          mode: "default",
          body: { email: subject.email },
        };
      return { kind: "unresolved", reason: "No LinkedIn URL or email for Blitz lookup" };
    }
    if (!subject.linkedinUrl && !subject.domain)
      return {
        kind: "unresolved",
        reason: "No usable LinkedIn URL or domain for Blitz lookup",
      };
    return {
      kind: "lookup",
      provider: "blitz",
      endpoint: "/v2/enrichment/company",
      mode: "default",
      body: {
        company_linkedin_url: subject.linkedinUrl ?? null,
        domain: subject.domain ?? null,
      },
    };
  },
  async lookup(client, lease, entityKey, plan, apiKey, options) {
    const rate = options.requestsPerSecond ?? DEFAULT_REQUESTS_PER_SECOND;
    let body: Record<string, unknown> = plan.body;
    if (plan.endpoint === "/v2/enrichment/company") {
      const url =
        (plan.body.company_linkedin_url as string | null) ??
        (plan.body.domain
          ? await resolveCompanyUrl(client, apiKey, String(plan.body.domain), options)
          : null);
      if (!url) return { state: "unresolved" };
      body = { company_linkedin_url: url };
    }
    const operation = `${plan.provider}:${plan.endpoint}:${plan.mode}`;
    const reserved = await reserve(client, lease, entityKey, operation, 0);
    if (reserved.status === "existing") {
      const a = reserved.attempt;
      if (a.state === "settled" && a.response_json)
        return { state: "ready", attemptId: a.id, run: a.response_json as ProviderRun };
      return { state: "uncertain" };
    }
    if (reserved.status !== "reserved") return { state: reserved.status };
    if (!(await dispatch(client, lease, reserved.id))) return { state: "uncertain" };
    const result = await request(client, plan.endpoint, body, apiKey, rate);
    if ("error" in result) {
      await uncertain(client, reserved.id);
      return { state: "uncertain" };
    }
    const run: ProviderRun = {
      endpoint: plan.endpoint,
      status: result.status >= 200 && result.status < 300 ? "COMPLETED" : "FAILED",
      output: result.payload,
      providerResponse: { httpStatus: result.status },
      cost: { value: 0, currency: "USD", unit: "USD" },
    };
    await settle(client, reserved.id, 0, run);
    return { state: "ready", attemptId: reserved.id, run };
  },
  normalize(phase, run, { fetchedAt }) {
    return normalizeBlitz(
      phase,
      run.output ?? run,
      fetchedAt,
      0,
      run.endpoint ??
        (phase === "people" ? "/v2/enrichment/person" : "/v2/enrichment/company"),
    );
  },
  cost: () => 0,
};
