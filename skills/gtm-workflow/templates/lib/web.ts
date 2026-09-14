import { lookup } from "node:dns/promises";
import { FatalError } from "workflow";
import { cached } from "./cache";

/** Built-in web tools for agent stages: a free page fetch and a paid search. Both are "use step" functions. */

const PAGE_CHARS = 8000;
const MAX_REDIRECTS = 3;
const SEARCH_ESTIMATE_USD = 0.01;

/** Readable text of one public page, cached for a day. Free. Every redirect hop is checked like the first address. */
export async function fetchPage(url: string): Promise<{ url: string; text: string; costUsd: number }> {
  "use step";
  const target = publicUrl(url);
  const hit = await cached<string>("page", target, 24 * 60 * 60 * 1000, async () => {
    let current = target;
    for (let hop = 0; ; hop += 1) {
      await assertPublicHost(current);
      const res = await fetch(current, { headers: { "user-agent": "gtm-workflow", accept: "text/html,application/xhtml+xml,text/plain" }, signal: AbortSignal.timeout(20_000), redirect: "manual" });
      const location = res.headers.get("location");
      if ([301, 302, 303, 307, 308].includes(res.status) && location) {
        if (hop >= MAX_REDIRECTS) throw new Error(`${target} redirected more than ${MAX_REDIRECTS} times`);
        current = publicUrl(new URL(location, current).toString());
        continue;
      }
      if (!res.ok) throw new Error(`${current} answered HTTP ${res.status}`);
      const text = (await res.text())
        .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, " ")
        .replace(/<\/(p|div|li|h[1-6]|tr|br|section|article)>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
        .replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim()
        .slice(0, PAGE_CHARS);
      return { value: text, costUsd: 0 };
    }
  });
  return { url: target, text: hit.value, costUsd: 0 };
}

export type SearchResult = { title: string | null; url: string; publishedDate: string | null; excerpt: string };
export type SearchProviderName = keyof typeof SEARCH_PROVIDERS;

type SearchProvider = { keyEnv: string; search: (query: string, numResults: number, key: string) => Promise<{ results: SearchResult[]; costUsd: number }> };

/** Search providers by name; add one here and it becomes `web: { search: "<name>" }` for every agent stage. */
const SEARCH_PROVIDERS = {
  exa: {
    keyEnv: "EXA_API_KEY",
    async search(query, numResults, key) {
      const res = await fetch("https://api.exa.ai/search", {
        method: "POST",
        headers: { "x-api-key": key, "content-type": "application/json" },
        body: JSON.stringify({ query, numResults, type: "auto", contents: { text: { maxCharacters: 1200 } } }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`Exa answered HTTP ${res.status}`);
      const body = (await res.json()) as { results?: { title?: string; url: string; publishedDate?: string; text?: string }[]; costDollars?: { total?: number } };
      return {
        results: (body.results ?? []).map((r) => ({ title: r.title ?? null, url: r.url, publishedDate: r.publishedDate ?? null, excerpt: (r.text ?? "").slice(0, 1200) })),
        costUsd: typeof body.costDollars?.total === "number" ? body.costDollars.total : SEARCH_ESTIMATE_USD,
      };
    },
  },
} satisfies Record<string, SearchProvider>;

/** Web search through the named provider; needs that provider's key. costUsd is what the provider reports, else about a cent. */
export async function webSearch(query: string, numResults = 5, provider: SearchProviderName = "exa"): Promise<{ results: SearchResult[]; costUsd: number }> {
  "use step";
  const p = SEARCH_PROVIDERS[provider] as SearchProvider | undefined;
  if (!p) throw new FatalError(`Unknown search provider ${provider}`);
  const key = process.env[p.keyEnv];
  if (!key) throw new FatalError(`Set ${p.keyEnv} for web search through ${provider}`);
  return p.search(query, Math.min(Math.max(numResults, 1), 10), key);
}
webSearch.maxRetries = 0;

/** Only public http(s) addresses by name: no IP literals, localhost, or internal names. */
function publicUrl(input: string): string {
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    throw new Error(`Not a web address: ${input}`);
  }
  const host = u.hostname.toLowerCase();
  if (!/^https?:$/.test(u.protocol) || /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.startsWith("[") || host.includes(":") || !host.includes(".") || /\.(local|internal|localhost|home|lan|arpa)$/.test(host) || u.username || u.password) {
    throw new Error(`Not a public web address: ${input}`);
  }
  u.hash = "";
  return u.toString();
}

/** The name must resolve only to public addresses; a private, loopback, link-local, or metadata address is refused. */
async function assertPublicHost(url: string): Promise<void> {
  const host = new URL(url).hostname;
  const addresses = await lookup(host, { all: true }).catch(() => []);
  if (addresses.length === 0) throw new Error(`${host} does not resolve`);
  for (const { address } of addresses) if (isPrivateAddress(address)) throw new Error(`${host} resolves to a private address`);
}

function isPrivateAddress(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v.includes(":")) {
    if (v.startsWith("::ffff:")) return isPrivateAddress(v.slice(7));
    return v === "::1" || v === "::" || v.startsWith("fe80:") || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fec0:");
  }
  const [a, b] = v.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}
