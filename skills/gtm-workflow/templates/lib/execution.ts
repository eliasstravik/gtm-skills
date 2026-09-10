// gtm-lib v22
import ts from "typescript-parser";

export type ExecutionShape = {
  concurrency: number;
  batch?: { childWorkflow: string; batchSize: number; timeoutMs: number; table: string };
};

/** Static preview and validation share the same accepted, literal configuration. */
export function executionShape(source: string): ExecutionShape {
  const file = ts.createSourceFile("workflow.ts", source, ts.ScriptTarget.ES2022, true);
  const constants = new Map<string, ts.Expression>();
  for (const statement of file.statements) if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.initializer) constants.set(declaration.name.text, declaration.initializer);
    }
  }
  const literal = (node: ts.Node | undefined, seen = new Set<string>()): ts.Node | undefined => {
    if (!node) return;
    if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node)) return literal(node.expression, seen);
    if (ts.isIdentifier(node) && !seen.has(node.text)) return literal(constants.get(node.text), new Set([...seen, node.text]));
    return node;
  };
  const property = (node: ts.Node | undefined, name: string) => {
    const object = literal(node);
    if (!object || !ts.isObjectLiteralExpression(object) || object.properties.some(ts.isSpreadAssignment)) throw new Error("Use explicit literal options for runRows/runBatches so preview can verify them");
    const found = object.properties.find((item) => item.name?.getText(file).replace(/["']/g, "") === name);
    return found && ts.isPropertyAssignment(found) ? found.initializer : found && ts.isShorthandPropertyAssignment(found) ? found.name : undefined;
  };
  const number = (node: ts.Node | undefined, fallback?: number) => {
    if (!node && fallback !== undefined) return fallback;
    const value = literal(node);
    if (!value || !ts.isNumericLiteral(value)) throw new Error("Execution limits must be numeric literals or committed constants");
    return Number(value.text);
  };
  const string = (node: ts.Node | undefined) => {
    const value = literal(node);
    if (!value || !ts.isStringLiteral(value)) throw new Error("Child workflow and result table must be literal strings");
    return value.text;
  };
  const shape: ExecutionShape = { concurrency: 1 };
  let rowTable: string | undefined;
  let rowsCalls = 0, batchCalls = 0;
  const visit = (node: ts.Node, inStep = false) => {
    if (ts.isFunctionDeclaration(node) && node.body) {
      const first = node.body.statements[0];
      inStep = !!first && ts.isExpressionStatement(first) && ts.isStringLiteral(first.expression) && first.expression.text === "use step";
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ["runRows", "runBatches"].includes(node.expression.text)) {
      if (inStep) throw new Error(`${node.expression.text} must run in workflow context`);
      const options = node.arguments[0];
      if (node.expression.text === "runRows") {
        rowsCalls++;
        rowTable = string(property(property(options, "table"), "name"));
        shape.concurrency = number(property(options, "concurrency"), 1);
        if (!Number.isSafeInteger(shape.concurrency) || shape.concurrency < 1 || shape.concurrency > 16) throw new Error("Row concurrency must be an integer from 1 to 16");
        const rowStep = property(options, "rowStep");
        if (!rowStep || !ts.isIdentifier(rowStep)) throw new Error("runRows requires a named rowStep");
        const fn = file.statements.find((item): item is ts.FunctionDeclaration => ts.isFunctionDeclaration(item) && item.name?.text === rowStep.text);
        if (!fn) throw new Error("Declare the named rowStep in this workflow file");
        if (fn.body?.statements[0]?.getText(file).includes("use step") && !new RegExp(`\\b${rowStep.text}\\.maxRetries\\s*=\\s*0\\b`).test(source)) throw new Error("The row step must set maxRetries = 0");
      } else {
        batchCalls++;
        shape.batch = { childWorkflow: string(property(options, "childWorkflow")), batchSize: number(property(options, "batchSize")), timeoutMs: number(property(options, "timeoutMs")), table: string(property(options, "table")) };
        if (!/^(?:[a-z0-9]+(?:-[a-z0-9]+)*\/)*[a-z0-9]+(?:-[a-z0-9]+)*$/.test(shape.batch.childWorkflow) || !Number.isSafeInteger(shape.batch.batchSize) || shape.batch.batchSize < 1 || shape.batch.batchSize > 300 || !Number.isSafeInteger(shape.batch.timeoutMs) || shape.batch.timeoutMs < 1) throw new Error("Child batches require a workflow path, batchSize 1–300, and a positive timeoutMs");
        // The helper owns the parent lifecycle and its timers; no unrelated workflow work.
        const workflows = file.statements.filter(ts.isFunctionDeclaration).filter((fn) => fn.body?.statements[0]?.getText(file).includes("use workflow"));
        const parent = workflows[0];
        const statements = parent?.body?.statements.slice(1).filter((statement) => !/^arg\s*=\s*input\.parse\(arg\);?$/.test(statement.getText(file))) ?? [];
        const final = statements[0];
        let expression = final && ts.isReturnStatement(final) ? final.expression : undefined;
        if (expression && ts.isAwaitExpression(expression)) expression = expression.expression;
        if (!parent || statements.length !== 1 || expression !== node) throw new Error("After input parsing, the parent workflow must only return runBatches({...}); it owns the complete lifecycle");
      }
    }
    ts.forEachChild(node, (child) => visit(child, inStep));
  };
  visit(file);
  if (rowsCalls > 1 || batchCalls > 1 || (rowsCalls && batchCalls)) throw new Error("Use one row or batch lifecycle per workflow");
  const header = source.match(/^\s*\*\s+Concurrency:\s*(\d+)\s*$/mi)?.[1];
  if ((header !== undefined && Number(header) !== shape.concurrency) || (shape.concurrency > 1 && header === undefined)) throw new Error("Concurrency header must match runRows concurrency");
  if (shape.batch) {
    const table = source.match(/^\s*\*\s+(?:Result table|Table):\s*([^|\n]+)/mi)?.[1].trim();
    if (table !== shape.batch.table) throw new Error("Batch result table must match the workflow header");
  }
  if (rowTable) {
    const table = source.match(/^\s*\*\s+(?:Result table|Table):\s*([^|\n]+)/mi)?.[1].trim();
    if (table && table !== rowTable) throw new Error("Row result table must match the workflow header");
  }
  return shape;
}
