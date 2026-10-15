import { and, eq, inArray, or, sql } from "drizzle-orm";
import type { Executor } from "../db";
import { profileAttempts, profileInputs } from "../schema/ledger";
import { createHash } from "node:crypto";
import { beginItem, acceptItem, type NetworkPerson } from "./network";
import { pollLookup, startLookup } from "./provider";
import { type RunLease } from "./ledger";
import { getProfile } from "./store";

export type ProfileAgentContext = { lease: RunLease; person: NetworkPerson };
/** The research agent keeps choosing tools; canonical facts come only from recognized provider output. */
export async function profileAgentCall(
  client: Executor,
  context: ProfileAgentContext,
  name: string,
  args: Record<string, unknown>,
  apiKey: string,
): Promise<unknown> {
  const inputKey = `input:${context.person.source.workflow_id}:${context.person.key}`;
  const personKey = context.person.personKey ?? inputKey;
  const requestPrefix = `agent:${createHash("sha256").update(inputKey).digest("hex")}:`;
  if (name === "monid_run") {
    const input =
      args.input && typeof args.input === "object"
        ? (args.input as Record<string, unknown>)
        : {};
    const body =
      input.body && typeof input.body === "object"
        ? (input.body as Record<string, unknown>)
        : {};
    if (typeof args.provider !== "string" || typeof args.endpoint !== "string")
      return { isError: true, error: "Provider and endpoint are required." };
    const canonical =
      args.provider === "clay" &&
      args.endpoint === "/enrichment/person" &&
      String(body.Email ?? "").toLowerCase() === context.person.email;
    const requestKey =
      requestPrefix +
      createHash("sha256").update(JSON.stringify(input)).digest("hex");
    const result = canonical
      ? await beginItem(
          client,
          context.lease,
          "people",
          context.person,
          {},
          apiKey,
        )
      : await startLookup(
          client,
          context.lease,
          requestKey,
          {
            provider: args.provider,
            endpoint: args.endpoint,
            body,
            queryParams: input.queryParams as
              | Record<string, unknown>
              | undefined,
            pathParams: input.pathParams as Record<string, unknown> | undefined,
          },
          apiKey,
        );
    if (result.state === "ready") {
      if (canonical)
        await acceptItem(
          client,
          context.lease,
          "people",
          context.person,
          result,
        );
      return result.run;
    }
    if (result.state === "pending")
      return { runId: result.jobId, status: "RUNNING" };
    if (result.state === "reused") {
      const source = context.person.source;
      const [saved] = await client
        .select({ person_key: profileInputs.person_key })
        .from(profileInputs)
        .where(and(eq(profileInputs.workflow_id, source.workflow_id), eq(profileInputs.source_id, source.source_id), eq(profileInputs.row_id, source.source_row_id)));
      // The envelopes only; an envelope from before attempts held payloads carries its own, so payloads stay.
      const profile = saved?.person_key
        ? await getProfile(client, "people", saved.person_key, { columns: ["responses_json"] })
        : undefined;
      const evidence = (
        Object.values(profile?.responses_json ?? {}) as any[]
      )
        .filter(
          (e) => e.provider === "clay" && e.endpoint === "/enrichment/person",
        )
        .sort((a, b) => b.fetched_at.localeCompare(a.fetched_at))[0];
      // The payload lives on the ledger attempt the envelope points at; an envelope from before attempts were referenced carries it itself.
      const [attempt] = evidence?.attempt_id
        ? await client.select({ response_json: profileAttempts.response_json }).from(profileAttempts).where(eq(profileAttempts.id, evidence.attempt_id))
        : [];
      return (
        attempt?.response_json ??
        evidence?.raw ?? {
          status: "COMPLETED",
          output: null,
          note: "Reused a saved lookup; no new purchase.",
        }
      );
    }
    return {
      isError: true,
      error: `Lookup ${result.state}. No new request was dispatched.`,
    };
  }
  if (name === "monid_get_run") {
    const id = args.runId;
    if (typeof id !== "string")
      return { isError: true, error: "A saved provider run ID is required." };
    const [attempt] = await client
      .select({ id: profileAttempts.id, entity_key: profileAttempts.entity_key, operation: profileAttempts.operation })
      .from(profileAttempts)
      .where(
        and(
          eq(profileAttempts.run_id, context.lease.id),
          eq(profileAttempts.job_id, id),
          or(inArray(profileAttempts.entity_key, [personKey, inputKey]), sql`starts_with(${profileAttempts.entity_key}, ${requestPrefix})`),
        ),
      );
    if (!attempt)
      return {
        isError: true,
        error: "Provider run is not part of this saved work.",
      };
    const result = await pollLookup(client, String(attempt.id), id, apiKey);
    if (result.state === "ready") {
      if (
        attempt.operation === "clay:/enrichment/person:default" &&
        [personKey, inputKey].includes(String(attempt.entity_key))
      )
        await acceptItem(
          client,
          context.lease,
          "people",
          context.person,
          result,
        );
      return result.run;
    }
    return { runId: id, status: "RUNNING" };
  }
  throw new Error("Unexpected profile tool");
}
