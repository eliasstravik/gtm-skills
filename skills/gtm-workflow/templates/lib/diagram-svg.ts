// gtm-lib v17
import { Resvg } from "@resvg/resvg-js";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DiagramEdge, DiagramNode, DiagramStatus } from "./diagram";
import type { Box, LaidOutGraph } from "./layout";

const FONT = "Inter, system-ui, sans-serif";
const STATUS_COLOR: Record<DiagramStatus, string> = {
  pending: "#9ca3af",
  active: "#2563eb",
  done: "#16a34a",
  failed: "#dc2626",
};
const DEFAULT_STROKE = "#cbd5e1";

function escape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function center(box: Box) {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

function subtitle(node: DiagramNode): string | null {
  const parts: string[] = [];
  if (node.provider) parts.push(node.provider);
  if (node.unitCostUsd !== undefined) parts.push(`$${node.unitCostUsd.toFixed(2)} per call`);
  if (node.spentUsd !== undefined) parts.push(`spent $${node.spentUsd.toFixed(2)}`);
  return parts.length ? parts.join(" · ") : null;
}

function nodeSvg(node: DiagramNode, box: Box): string {
  const stroke = node.status ? STATUS_COLOR[node.status] : DEFAULT_STROKE;
  const c = center(box);
  const sub = subtitle(node);
  const labelY = sub ? c.y - 6 : c.y + 5;
  const text = `<text x="${c.x}" y="${labelY}" text-anchor="middle" font-family="${FONT}" font-size="15" font-weight="600" fill="#0f172a">${escape(node.label)}</text>` +
    (sub ? `<text x="${c.x}" y="${c.y + 16}" text-anchor="middle" font-family="${FONT}" font-size="12" fill="#64748b">${escape(sub)}</text>` : "");
  if (node.kind === "decision") {
    const points = `${c.x},${box.y} ${box.x + box.width},${c.y} ${c.x},${box.y + box.height} ${box.x},${c.y}`;
    return `<polygon points="${points}" fill="#fff7ed" stroke="${stroke}" stroke-width="2"/>${text}`;
  }
  if (node.kind === "start" || node.kind === "end") {
    return `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="${box.height / 2}" fill="#f1f5f9" stroke="${stroke}" stroke-width="2"/>${text}`;
  }
  const fill = node.kind === "save" ? "#f0fdf4" : node.kind === "wait" ? "#fefce8" : "#ffffff";
  return `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="12" fill="${fill}" stroke="${stroke}" stroke-width="2"/>${text}`;
}

function edgeSvg(edge: DiagramEdge, from: Box, to: Box): string {
  const a = center(from);
  const b = center(to);
  if (edge.back) {
    const right = Math.max(from.x + from.width, to.x + to.width) + 28;
    const path = `M ${from.x + from.width} ${a.y} C ${right} ${a.y}, ${right} ${b.y}, ${to.x + to.width} ${b.y}`;
    return `<path d="${path}" fill="none" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="6 4" marker-end="url(#arrow)"/>` +
      `<text x="${right + 6}" y="${(a.y + b.y) / 2}" font-family="${FONT}" font-size="11" fill="#64748b">${escape(edge.label ?? "next")}</text>`;
  }
  const startY = from.y + from.height;
  const endY = to.y;
  const path = `M ${a.x} ${startY} C ${a.x} ${(startY + endY) / 2}, ${b.x} ${(startY + endY) / 2}, ${b.x} ${endY}`;
  const label = edge.label
    ? `<text x="${(a.x + b.x) / 2 + 8}" y="${(startY + endY) / 2}" font-family="${FONT}" font-size="11" fill="#475569">${escape(edge.label)}</text>`
    : "";
  return `<path d="${path}" fill="none" stroke="#94a3b8" stroke-width="1.5" marker-end="url(#arrow)"/>${label}`;
}

export function renderSvg(laidOut: LaidOutGraph): string {
  const parts: string[] = [];
  for (const group of laidOut.groups) {
    const box = laidOut.groupBounds[group.id];
    const title = group.completed !== undefined ? `${group.label}: ${group.completed} done, ${group.failed ?? 0} failed` : group.label;
    parts.push(
      `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="16" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="8 6"/>` +
        `<text x="${box.x + 16}" y="${box.y + 26}" font-family="${FONT}" font-size="13" font-weight="600" fill="#334155">${escape(title)}</text>`,
    );
  }
  const byId = new Map(laidOut.nodes.map((node) => [node.id, node]));
  for (const edge of laidOut.edges) {
    if (!byId.has(edge.from) || !byId.has(edge.to)) continue;
    parts.push(edgeSvg(edge, laidOut.positions[edge.from], laidOut.positions[edge.to]));
  }
  for (const node of laidOut.nodes) parts.push(nodeSvg(node, laidOut.positions[node.id]));
  const title = laidOut.run
    ? `${laidOut.workflow.label} · ${laidOut.run.status} · $${laidOut.run.costUsd.toFixed(2)}`
    : laidOut.workflow.label;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${laidOut.size.width}" height="${laidOut.size.height + 40}" viewBox="0 0 ${laidOut.size.width} ${laidOut.size.height + 40}">` +
    `<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8"/></marker></defs>` +
    `<rect width="100%" height="100%" fill="#ffffff"/>` +
    `<text x="${laidOut.size.width / 2}" y="28" text-anchor="middle" font-family="${FONT}" font-size="16" font-weight="700" fill="#0f172a">${escape(title)}</text>` +
    `<g transform="translate(0 40)">${parts.join("")}</g></svg>`
  );
}

export function renderPng(svg: string, fontBytes: Uint8Array): Buffer {
  // The native Node renderer accepts fontFiles, not the WASM-only fontBuffers.
  // Materialize the bundled font in writable storage, including on Vercel.
  const directory = mkdtempSync(join(tmpdir(), "gtm-diagram-font-"));
  try {
    const fontPath = join(directory, "Inter-Regular.ttf");
    writeFileSync(fontPath, fontBytes);
    const resvg = new Resvg(svg, {
      fitTo: { mode: "width", value: 1400 },
      background: "#ffffff",
      font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "Inter" },
    });
    return resvg.render().asPng();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
