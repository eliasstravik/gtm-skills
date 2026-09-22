import { normalizeClay, normalizeContactOut } from "../normalize";
import { actualCost, startLookup } from "../provider";
import type { NetworkProvider } from "./index";

/** The default: Clay for people and ContactOut for companies, priced per call through the Monid gateway. */
export const monid: NetworkProvider = {
  name: "monid",
  identity(phase, subject) {
    if (phase === "people") {
      if (!subject.url && !subject.email)
        return { kind: "unresolved", reason: "No LinkedIn URL or email" };
      return {
        kind: "lookup",
        provider: "clay",
        endpoint: "/enrichment/person",
        mode: "default",
        body: subject.url
          ? { "Professional Profile URL": subject.url }
          : { Email: subject.email },
      };
    }
    if (!subject.domain) return { kind: "unresolved", reason: "No domain" };
    return {
      kind: "lookup",
      provider: "contactout",
      endpoint: "/v1/domain/enrich",
      mode: "default",
      body: { domains: [subject.domain] },
    };
  },
  lookup(client, lease, entityKey, plan, apiKey) {
    return startLookup(
      client,
      lease,
      entityKey,
      { provider: plan.provider, endpoint: plan.endpoint, body: plan.body },
      apiKey,
    );
  },
  normalize(phase, run, { fetchedAt, existingDomain }) {
    const cost = actualCost(run);
    return phase === "people"
      ? normalizeClay(run, fetchedAt, cost)
      : normalizeContactOut(run, existingDomain, fetchedAt, cost);
  },
  cost: actualCost,
};
