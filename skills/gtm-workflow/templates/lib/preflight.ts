// gtm-lib v23
import { posix } from "node:path";
import ts from "typescript-parser";
import { extractGraph } from "./diagram";

export type PreflightResult = { ok: boolean; missing: string[]; auth: { provider: string; status: "verified" | "unavailable" | "failed" }[] };
type Dependencies = {
  readSource: (path: string) => Promise<string | null>;
  tableExists: (name: string) => Promise<boolean>;
  request?: typeof fetch;
  environment?: NodeJS.ProcessEnv;
};

/** Inspect committed adapter metadata, never execute an adapter or a paid endpoint. */
export async function preflightWorkflow(path: string, dependencies: Dependencies): Promise<PreflightResult> {
  const env = dependencies.environment ?? process.env;
  const missing = new Set<string>(), seen = new Set<string>(), tables = new Set<string>();
  const auth: PreflightResult["auth"] = [];
  const field = (source: string, name: string) => source.match(new RegExp(`^\\s*\\*\\s+${name}:\\s*(.+)$`, "m"))?.[1].trim();
  const visit = async (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    const source = await dependencies.readSource(file);
    if (source === null) { missing.add(`Source ${file}`); return; }
    if (file.startsWith("workflows/")) {
      const graph = extractGraph(source, file.slice(10, -3)).graph;
      if (graph.workflow.table) tables.add(graph.workflow.table);
      else if (/["']use workflow["']/.test(source)) missing.add(`Result table declaration for ${file}`);
      for (const node of graph.nodes) if (node.childWorkflow) await visit(`workflows/${node.childWorkflow}.ts`);
    }
    const required: string[] = [...(field(source, "Environment")?.match(/\b[A-Z][A-Z0-9_]*\b/g) ?? [])];
    if (/\b(?:agent|durableAgent)\s*\(/.test(source)) required.push("AI_GATEWAY_API_KEY");
    for (const name of required) if (!env[name]?.trim()) missing.add(`Environment ${name}`);
    if (file.startsWith("providers/")) {
      const provider = field(source, "Provider") ?? posix.basename(file, ".ts");
      const check = field(source, "Auth check");
      if (!check || check === "none") {
        auth.push({ provider, status: "unavailable" });
        if (!check) missing.add(`Authentication check declaration for ${provider}`);
      }
      else {
        const header = field(source, "Auth header")?.split("|").map((part) => part.trim());
        const match = /^GET (https:\/\/\S+) free$/.exec(check);
        let url: URL | null = null;
        try { if (match) url = new URL(match[1]); } catch { /* Invalid declarations fail below. */ }
        if (!url || url.username || url.password || url.search || !header || header.length < 2 || !required.includes(header[1])) {
          missing.add(`Free authentication check configuration for ${provider}`);
          auth.push({ provider, status: "failed" });
        } else if (!env[header[1]]?.trim()) auth.push({ provider, status: "failed" });
        else {
          try {
            const response = await (dependencies.request ?? fetch)(url, { method: "GET", redirect: "error",
              headers: { [header[0]]: `${header[2] ? `${header[2]} ` : ""}${env[header[1]]}` }, signal: AbortSignal.timeout(5_000) });
            await response.body?.cancel();
            auth.push({ provider, status: response.ok ? "verified" : "failed" });
            if (!response.ok) missing.add(`Authentication for ${provider}`);
          } catch { auth.push({ provider, status: "failed" }); missing.add(`Authentication for ${provider}`); }
        }
      }
    }
    const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.ES2022, true);
    for (const statement of parsed.statements) {
      if ((!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) || !statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const name = statement.moduleSpecifier.text;
      if (!name.startsWith(".")) continue;
      let target = posix.normalize(posix.join(posix.dirname(file), name));
      if (!/^(workflows|providers)\//.test(target)) continue;
      if (!target.endsWith(".ts")) target = target.replace(/\.js$/, "") + ".ts";
      await visit(target);
    }
  };
  await visit(`workflows/${path}.ts`);
  for (const table of tables) {
    try { if (!await dependencies.tableExists(table)) missing.add(`Table ${table}`); }
    catch { missing.add(`Table ${table} could not be checked`); }
  }
  return { ok: missing.size === 0 && auth.every((item) => item.status !== "failed"), missing: [...missing], auth };
}
