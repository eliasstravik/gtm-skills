// gtm-lib v23
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));

/** Initialize only: no workflow invocation, credentials, network, or real steps. */
export async function initializeWorkflowCode(code, root = projectRoot) {
  // Pinned beta.46 VM intrinsics match production's initialization environment.
  const { createContext } = await import(pathToFileURL(join(root, 'node_modules/@workflow/core/dist/vm/index.js')).href);
  const { context } = createContext({ seed: 'gtm-build-check', fixedTimestamp: 1788983603849 });
  context.process = Object.freeze({ env: Object.freeze({}) });
  Object.assign(context, { TransformStream, ReadableStream, WritableStream });
  context[Symbol.for('WORKFLOW_USE_STEP')] = (name) => () => {
    throw new Error(`Build check cannot execute step: ${name}`);
  };
  vm.runInContext(code, context, { filename: 'compiled-workflows.js', timeout: 5000 });
  return context.__private_workflows?.size ?? 0;
}

export async function checkWorkflowRuntime(root = projectRoot) {
  const require = createRequire(join(root, 'package.json'));
  const ts = require('typescript-parser');
  const source = await readFile(join(root, 'node_modules/.nitro/workflow/workflows.mjs'), 'utf8');
  const parsed = ts.createSourceFile('workflows.mjs', source, ts.ScriptTarget.Latest, true);
  const declaration = parsed.statements
    .flatMap(statement => ts.isVariableStatement(statement) ? [...statement.declarationList.declarations] : [])
    .find(item => item.name.getText(parsed) === 'workflowCode');
  if (!declaration?.initializer || !ts.isNoSubstitutionTemplateLiteral(declaration.initializer)) {
    throw new Error('Compiled workflow bundle is missing or changed format; check the pinned runtime.');
  }
  const count = await initializeWorkflowCode(declaration.initializer.text, root);
  console.log(`Workflow initialization verified: ${count} workflow(s); no steps executed.`);
  return count;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await checkWorkflowRuntime(); }
  catch (error) {
    console.error('Workflow initialization failed. Move Node-only SDK imports inside trusted steps.');
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  }
}
