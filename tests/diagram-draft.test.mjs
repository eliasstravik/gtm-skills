import assert from 'node:assert/strict';
import test from 'node:test';
import { extractGraph } from '../skills/gtm-workflow/templates/lib/diagram.ts';
import { renderDiagramPng, renderSvg } from '../skills/gtm-workflow/templates/lib/diagram-svg.ts';
import { layoutGraph } from '../skills/gtm-workflow/templates/lib/layout.ts';
const source = `/**
 * Kind: scheduled
 * Schedule: Every weekday 09:00
 * Summary: Every weekday 09:00: score accounts, save matches
 * Result table: target_accounts
 */
const MODEL = "fixture/scorer";
const COST = 0.03;
/** Score the account */
async function score(row, meta) { "use step"; return agent({ model: MODEL, maxUsd: COST, prompt: row.key, meta }); }
score.maxRetries = 0;
/** Save the account */
async function save(row) { "use step"; }
export async function findAccounts(arg, meta) {
  "use workflow";
  // Does the account fit?
  if (arg.fits) await score(arg, meta);
  return runRows({ rows: arg.rows, meta, rowStep: score, table: { name: "target_accounts", save } });
}`;
test('scratch JSON can render a complete PNG with models, costs and business labels', () => {
  const { graph, findings } = extractGraph(source, 'find-accounts');
  assert.deepEqual(findings, []);
  const model = graph.nodes.find((node) => node.provider === 'model');
  assert.equal(model.model, 'fixture/scorer'); assert.equal(model.unitCostUsd, 0.03);
  assert.equal(graph.nodes.find((node) => node.kind === 'save').label, 'Save to target accounts');
  assert.ok(graph.nodes.filter((node) => node.order).every((node, i) => node.order === i + 1));
  const copied = JSON.parse(JSON.stringify(graph));
  const png = renderDiagramPng(copied);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  const svg = renderSvg(layoutGraph(copied));
  for (const text of ['Every weekday 09:00', 'fixture/scorer', '$0.03 per row', '[x] Done', '[ ] Not reached', 'yes', 'no']) assert.ok(svg.includes(text), text);
});
test('checker gives actionable fixes for noun steps and non-question decisions', () => {
  const { findings } = extractGraph(source.replace('Score the account', 'Account score').replace('Does the account fit?', 'Account fits'), 'find-accounts');
  assert.ok(findings.some((finding) => finding.code === 'step_label_not_verb' && finding.fix));
  assert.ok(findings.some((finding) => finding.code === 'decision_label_not_question' && finding.fix));
});
test('a mixed step exposes every paid call instead of hiding a later model', () => {
  const mixed = source.replace('return agent(', 'await provider({ name: "directory", costUsd: 0.01 }); return agent(');
  const { graph } = extractGraph(mixed, 'find-accounts');
  const step = graph.nodes.find((node) => node.step === 'score');
  assert.deepEqual(step.paidCalls, [{ provider: 'directory', unitCostUsd: 0.01 }, { provider: 'model', model: 'fixture/scorer', unitCostUsd: 0.03 }]);
  assert.equal(step.model, 'fixture/scorer');
});
