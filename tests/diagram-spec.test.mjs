import assert from 'node:assert/strict';
import test from 'node:test';
import { diagramCost, parseDiagramSpec } from '../skills/gtm-workflow/templates/lib/diagram-spec.ts';

const source = `/**
 * Diagram:
 *   1. Read the company list        [step: parseInput]
 *   2. Look up each company         [step: lookup] [cost: $0.02/row]
 *   3. Research each company        [step: research] [cost: up to $0.10/row]
 *   4. Is it a fit?                 [decision: Is it a fit?] -> 2
 *   5. Save to account_scores       [step: saveRow]
 *   Every weekday 09:00             [schedule: 0 9 * * 1-5]
 */
export const x = 1;`;

test('parses steps, fixed and upper-bound costs, decisions, schedule, and explicit edges', () => {
  const graph = parseDiagramSpec(source, 'score');
  const byStep = (step) => graph.nodes.find((node) => node.step === step);
  assert.equal(graph.nodes.length, 7);
  assert.equal(byStep('lookup').unitCostUsd, 0.02);
  assert.equal(byStep('lookup').upperBound, false);
  assert.equal(byStep('research').unitCostUsd, 0.1);
  assert.equal(byStep('research').upperBound, true);
  assert.equal(graph.nodes.find((node) => node.id === 'step-4').kind, 'decision');
  assert.ok(graph.edges.some((edge) => edge.from === 'step-4' && edge.to === 'step-2'));
  assert.equal(graph.workflow.schedule, '0 9 * * 1-5');
  assert.ok(Math.abs(diagramCost(graph) - 0.12) < 1e-9);
});

test('a workflow without a Diagram header fails with a plain sentence', () => {
  assert.throws(() => parseDiagramSpec('export const x = 1;', 'x'), /Add a Diagram header/);
});
