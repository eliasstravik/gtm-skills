/**
 * The workspace's ICPs and personas, read when a run starts rather than copied into workflow code, so an edit to
 * `icps/<slug>/ICP.md` or `personas/<slug>/PERSONA.md` reaches every workflow that names it: on this computer from the
 * next run, on the deployed copy from the deployment that the edit's push makes. Locally each call reads the file;
 * deployed, the files outside `workflows/` are not in the function, so `scripts/build-viewer.mjs` bakes them into
 * `criteria.generated.ts` at every build and a call reads that.
 */
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { FatalError } from "workflow";
import baked from "./criteria.generated";

export type CriteriaKind = "icp" | "persona";

export type Criteria = {
  kind: CriteriaKind;
  slug: string;
  /** The file's H1. */
  name: string;
  /** The whole file without HTML comments: what an AI step's prompt quotes. */
  text: string;
  /** Every stated field of Company data or Person data, by its label; `Unknown` fields are left out. Nested bullets join with ", ". */
  fields: Record<string, string>;
  signals: string[];
  disqualifiers: string[];
};

/** Where each kind lives in the workspace, relative to its root (the folder that holds `workflows/`). */
export const criteriaPath = (kind: CriteriaKind, slug: string) =>
  kind === "icp" ? `icps/${slug}/ICP.md` : `personas/${slug}/PERSONA.md`;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Parses an ICP.md or PERSONA.md in the shape the gtm-icp and gtm-persona templates give it. */
export function parseCriteria(kind: CriteriaKind, slug: string, markdown: string): Criteria {
  const text = markdown.replace(/<!--[\s\S]*?-->/g, "").replace(/\n{3,}/g, "\n\n").trim();
  const name = /^#\s+(.+)$/m.exec(text)?.[1].trim() ?? slug;
  const fields: Record<string, string> = {}, signals: string[] = [], disqualifiers: string[] = [];
  let section = "", field = "";
  for (const line of text.split("\n")) {
    const heading = /^##\s+(.+)$/.exec(line);
    if (heading) { section = heading[1].trim().toLowerCase(); field = ""; continue; }
    const item = /^(\s*)[-*]\s+(.+)$/.exec(line);
    if (!item) continue;
    const [, indent, value] = item;
    if (section.endsWith(" data")) {
      if (indent && field) fields[field] = fields[field] ? `${fields[field]}, ${value.trim()}` : value.trim();
      else {
        const pair = /^([^:]+):\s*(.*)$/.exec(value);
        if (!pair) continue;
        field = pair[1].trim();
        const stated = pair[2].trim();
        if (stated && !/^unknown$/i.test(stated)) fields[field] = stated;
      }
    } else if (section.endsWith(" signals")) signals.push(value.trim());
    else if (section === "disqualifiers") disqualifiers.push(value.trim());
  }
  return { kind, slug, name, text, fields, signals, disqualifiers };
}

/** A field as a list: nested bullets or a comma-separated value ("Director, VP, C-level"). "1,001+" stays whole. */
export const items = (value: string | undefined) =>
  (value ?? "").split(/,\s+/).map((part) => part.trim()).filter(Boolean);

/** The workspace root on this computer: the dev server and every script run from `workflows/`. */
const workspaceRoot = () => resolve(process.cwd(), "..");

async function readCriteria(kind: CriteriaKind, slug: string): Promise<Criteria> {
  "use step";
  if (!SLUG.test(slug)) throw new FatalError(`Not an ${kind === "icp" ? "ICP" : "persona"} slug: ${slug}`);
  const path = criteriaPath(kind, slug);
  let markdown: string | undefined;
  if (process.env.VERCEL) markdown = baked[path];
  else markdown = await readFile(join(workspaceRoot(), path), "utf8").catch((error) => {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  });
  if (markdown === undefined)
    throw new FatalError(`${path} is not in this workspace${process.env.VERCEL ? "'s deployment" : ""}; name an existing ${kind === "icp" ? "ICP" : "persona"} or create it first`);
  return parseCriteria(kind, slug, markdown);
}
readCriteria.maxRetries = 0;

/** Reads `icps/<slug>/ICP.md` for this run. Call it in workflow scope once, before `runRows`, and pass what it returns on. */
export const readIcp = (slug: string) => readCriteria("icp", slug);
/** Reads `personas/<slug>/PERSONA.md` for this run. Call it in workflow scope once, before `runRows`, and pass what it returns on. */
export const readPersona = (slug: string) => readCriteria("persona", slug);
