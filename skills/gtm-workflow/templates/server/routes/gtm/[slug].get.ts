import { defineHandler } from "nitro";
import { useStorage } from "nitro/storage";
import { verifyLink } from "../../../lib/sign";
import vercelJson from "../../../vercel.json";

// Ledger theme. The workflow's diagram string carries no classDef lines; these six are appended here.
const CLASS_DEFS = `
classDef paid fill:#fff7ed,stroke:#fdba74,color:#7c2d12,stroke-width:1.5px
classDef ai fill:#ecfdf5,stroke:#6ee7b7,color:#064e3b,stroke-width:1.5px
classDef save fill:#f4f4f5,stroke:#a1a1aa,color:#18181b,stroke-width:1.5px
classDef agent fill:#ecfdf5,stroke:#047857,color:#064e3b,stroke-width:2px
classDef wait fill:#f4f4f5,stroke:#a1a1aa,color:#18181b,stroke-width:1.5px,stroke-dasharray:4 3
classDef sub fill:#f4f4f5,stroke:#a1a1aa,color:#18181b,stroke-width:1.5px,stroke-dasharray:4 3`;
const LEGEND: [string, string, string, string][] = [
  ["Paid lookup", "#fff7ed", "#fdba74", "solid"], ["AI step", "#ecfdf5", "#6ee7b7", "solid"], ["Agent stage", "#ecfdf5", "#047857", "solid"],
  ["Saves to a table", "#f4f4f5", "#a1a1aa", "solid"], ["Waits", "#f4f4f5", "#a1a1aa", "dashed"], ["Child workflow", "#f4f4f5", "#a1a1aa", "dashed"],
];
const THEME = { background: "#ffffff", primaryColor: "#ffffff", primaryBorderColor: "#d4d4d8", primaryTextColor: "#18181b", lineColor: "#a1a1aa", clusterBkg: "#fafaf9", clusterBorder: "#e4e4e7", edgeLabelBackground: "#ffffff", fontSize: "15px", fontFamily: "Inter, system-ui, sans-serif" };
const CSS = `
:root{--ground:#fafaf9;--ink:#18181b;--muted:#71717a;--rule:rgba(24,24,27,.10);--panel:#fff;--accent:#0f766e}
html{-webkit-font-smoothing:antialiased}body{margin:0;background:var(--ground);color:var(--ink);font-family:Inter,system-ui,sans-serif;font-size:16px;line-height:1.5;padding:24px 20px 64px}
.wrap{max-width:880px;margin-inline:auto;display:grid;gap:20px}.eyebrow{margin:0;font-size:13px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted)}
h1{margin:4px 0 0;font-size:30px;font-weight:600;letter-spacing:-.02em}.summary{margin:6px 0 0;max-width:62ch;color:var(--muted);font-size:17px}
.schedule{display:inline-flex;align-items:center;gap:8px;margin-top:10px;font-size:13px;color:var(--muted)}.schedule::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--accent)}
.canvas{background:var(--panel);border:1px solid var(--rule);border-radius:14px;padding:28px 20px;overflow-x:auto}.canvas svg{display:block;margin-inline:auto;max-width:100%;height:auto}
.legend{display:flex;flex-wrap:wrap;gap:18px;font-size:14px;color:var(--muted)}.legend span{display:inline-flex;align-items:center;gap:8px}.legend i{width:14px;height:14px;border-radius:4px;border:1.5px solid}
.drift{display:grid;gap:4px;padding:14px 16px;border-radius:10px;border:1px solid rgba(180,83,9,.35);background:rgba(180,83,9,.08);font-size:15px}.drift code{font-size:14px}
@media (max-width:480px){h1{font-size:24px}.canvas{padding:18px 10px}}`;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

/** Drift: every paid, ai, or agent node id must be an async function in the file; every "use step" function must be a node id. */
function drift(source: string, diagram: string): string[] {
  const chunks = stripComments(source).split(/(?=async function \w+)/);
  const asyncFns = new Set<string>();
  const stepFns = new Set<string>();
  for (const chunk of chunks) {
    const name = /^async function (\w+)/.exec(chunk)?.[1];
    if (!name) continue;
    asyncFns.add(name);
    if (/\{\s*"use step"/.test(chunk)) stepFns.add(name);
  }
  const nodeIds = new Set([...diagram.matchAll(/^\s*(\w+)\s*[\[\(\{]/gm)].map((m) => m[1]));
  const classed = [...diagram.matchAll(/^\s*(\w+)\s*[\[\(\{].*:::(paid|ai|agent)\b/gm)].map((m) => m[1]);
  const problems: string[] = [];
  for (const id of classed) if (!asyncFns.has(id)) problems.push(`Node <code>${esc(id)}</code> is in the diagram but no function with that name exists in the code.`);
  for (const fn of stepFns) if (!nodeIds.has(fn) && fn !== "readFresh" && fn !== "saveRow") problems.push(`Step <code>${esc(fn)}</code> exists in the code but not in the diagram.`);
  return problems;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
function cronEnglish(expr: string): string {
  const [m, h, dom, mon, dow] = expr.trim().split(/\s+/);
  const at = (mm: string, hh: string) => `${hh.padStart(2, "0")}:${mm.padStart(2, "0")} UTC`;
  if (/^\*\/\d+$/.test(m) && [h, dom, mon, dow].every((f) => f === "*")) return `every ${m.slice(2)} minutes`;
  if (/^\d+$/.test(m) && [h, dom, mon, dow].every((f) => f === "*")) return `hourly at :${m.padStart(2, "0")}`;
  if (/^\d+$/.test(m) && /^\d+$/.test(h) && dom === "*" && mon === "*" && dow === "*") return `daily at ${at(m, h)}`;
  if (/^\d+$/.test(m) && /^\d+$/.test(h) && dom === "*" && mon === "*" && /^[0-6]$/.test(dow)) return `every ${DAYS[Number(dow)]} at ${at(m, h)}`;
  return `on the schedule ${expr}`;
}

export default defineHandler(async (event) => {
  const slug = event.context.params?.slug ?? "";
  if (process.env.VERCEL && !verifyLink(slug, event.url.searchParams.get("t"))) return new Response("This link has expired or is invalid.", { status: 403 });
  const source = await useStorage("assets:workflows").getItem<string>(`${slug}.ts`);
  if (typeof source !== "string") return new Response(`Unknown workflow ${slug}`, { status: 404 });
  const doc = /\/\*\*\s*\n\s*\*\s*(.+)\n\s*\*\s*\n\s*\*\s*(.+)/.exec(source);
  const title = doc?.[1]?.trim() ?? slug;
  const summary = doc?.[2]?.trim() ?? "";
  const diagram = /export const diagram = `([\s\S]*?)`/.exec(source)?.[1] ?? "flowchart TB\n  none([No diagram exported])";
  const cron = (vercelJson.crons as { path: string; schedule: string }[]).find((c) => c.path === `/api/run/${slug}`);
  const problems = drift(source, diagram);
  const legend = LEGEND.map(([label, fill, border, style]) => `<span><i style="background:${fill};border-color:${border};border-style:${style}"></i>${label}</span>`).join("");
  const graph = JSON.stringify(`${diagram}\n${CLASS_DEFS}`).replace(/</g, "\\u003c");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap"><style>${CSS}</style></head><body><div class="wrap">
<div><p class="eyebrow">Workflow</p><h1>${esc(title)}</h1><p class="summary">${esc(summary)}</p>${cron ? `<p class="schedule">Runs ${esc(cronEnglish(cron.schedule))}</p>` : ""}</div>
<div class="canvas" id="canvas" aria-label="Workflow diagram"></div><div class="legend">${legend}</div>
${problems.length ? `<div class="drift" role="status"><strong>The diagram and the code disagree.</strong>${problems.map((p) => `<span>${p} Ask your agent to update the diagram.</span>`).join("")}</div>` : ""}
</div><script src="https://cdnjs.cloudflare.com/ajax/libs/mermaid/11.15.0/mermaid.min.js"></script><script>
mermaid.initialize({ startOnLoad: false, theme: "base", themeVariables: ${JSON.stringify(THEME)}, flowchart: { htmlLabels: true, padding: 12, nodeSpacing: 40, rankSpacing: 44, curve: "basis" } });
mermaid.render("d1", ${graph}).then(({ svg }) => { document.getElementById("canvas").innerHTML = svg; }).catch((e) => { document.getElementById("canvas").textContent = "Diagram could not render: " + (e.message || e); });
</script></body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
});
