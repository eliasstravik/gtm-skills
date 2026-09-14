import { cached } from "./cache";

/** Built-in web tools for agent stages: a free page fetch and a paid search. Both are "use step" functions. */

const PAGE_CHARS = 8000;
const SEARCH_ESTIMATE_USD = 0.01;

/** Readable text of one public page, cached for a day. Free. */
export async function fetchPage(url: string): Promise<{ url: string; text: string; costUsd: number }> {
  "use step";
  const target = publicUrl(url);
  const hit = await cached<string>("page", target, 24 * 60 * 60 * 1000, async () => {
    const res = await fetch(target, { headers: { "user-agent": "gtm-workflow", accept: "text/html,application/xhtml+xml,text/plain" }, signal: AbortSignal.timeout(20_000), redirect: "follow" });
    if (!res.ok) throw new Error(`${target} answered HTTP ${res.status}`);
    const text = (await res.text())
      .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<\/(p|div|li|h[1-6]|tr|br|section|article)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim()
      .slice(0, PAGE_CHARS);
    return { value: text, costUsd: 0 };
  });
  return { url: target, text: hit.value, costUsd: 0 };
}

export type SearchResult = { title: string | null; url: string; publishedDate: string | null; excerpt: string };

/** Web search through Exa; needs EXA_API_KEY. costUsd is what Exa reports for the call, else about a cent. */
export async function webSearch(query: string, numResults = 5): Promise<{ results: SearchResult[]; costUsd: number }> {
  "use step";
  const key = process.env.EXA_API_KEY;
  if (!key) throw new Error("Set EXA_API_KEY for web search");
  const res = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: { "x-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({ query, numResults: Math.min(Math.max(numResults, 1), 10), type: "auto", contents: { text: { maxCharacters: 1200 } } }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Exa answered HTTP ${res.status}`);
  const body = (await res.json()) as { results?: { title?: string; url: string; publishedDate?: string; text?: string }[]; costDollars?: { total?: number } };
  return {
    results: (body.results ?? []).map((r) => ({ title: r.title ?? null, url: r.url, publishedDate: r.publishedDate ?? null, excerpt: (r.text ?? "").slice(0, 1200) })),
    costUsd: typeof body.costDollars?.total === "number" ? body.costDollars.total : SEARCH_ESTIMATE_USD,
  };
}
webSearch.maxRetries = 0;

/** Only public http(s) addresses: no IPs, localhost, or internal names reach fetch. */
function publicUrl(input: string): string {
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    throw new Error(`Not a web address: ${input}`);
  }
  const host = u.hostname.toLowerCase();
  if (!/^https?:$/.test(u.protocol) || /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":") || !host.includes(".") || /\.(local|internal|localhost)$/.test(host) || u.username || u.password) {
    throw new Error(`Not a public web address: ${input}`);
  }
  u.hash = "";
  return u.toString();
}
