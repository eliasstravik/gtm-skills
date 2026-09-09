// gtm-lib v14
import ts from "typescript-parser";

export type DiagramStatus = "pending" | "active" | "done" | "failed";
export type NodeKind = "start" | "step" | "decision" | "wait" | "save" | "end";
export type GroupKind = "loop" | "parallel";

export type DiagramNode = {
  id: string;
  kind: NodeKind;
  label: string;
  step?: string;
  provider?: string;
  unitCostUsd?: number;
  group?: string;
  status?: DiagramStatus;
  spentUsd?: number;
};
export type DiagramGroup = {
  id: string;
  kind: GroupKind;
  label: string;
  parent?: string;
  completed?: number;
  failed?: number;
};
export type DiagramEdge = { from: string; to: string; label?: string; back?: boolean };
export type WorkflowGraph = {
  workflow: { path: string; label: string; runs: string; kind: string; table: string | null };
  nodes: DiagramNode[];
  groups: DiagramGroup[];
  edges: DiagramEdge[];
  run?: { runKey: string; status: string; startedAt: number; costUsd: number; completed: number; failed: number };
};
export type FindingCode =
  | "step_label_missing"
  | "step_hidden_in_helper"
  | "step_unreachable"
  | "stage_attributes_missing";
export type DiagramFinding = { code: FindingCode; file: string; line: number; message: string; fix: string };
export type ExtractResult = { graph: WorkflowGraph; findings: DiagramFinding[] };

/** Library calls that bookkeep a run and never appear on the diagram. */
const HIDDEN_CALLS = new Set([
  "updateRun",
  "recordWorkflowProgressAndStatus",
  "registerWorkflowRun",
  "getActualRunCostUsd",
  "getRunReceipt",
  "getHeldRunReason",
  "setAttributes",
]);
/** Library calls that pause the run and appear as wait nodes. */
const WAIT_CALLS: Record<string, string> = {
  checkpoint: "Checkpoint",
  approve: "Wait for approval",
  waitForTrigger: "Wait for trigger",
};
const LABEL_MIN = 3;
const LABEL_MAX = 80;

type StepInfo = { name: string; label: string | null; line: number; provider?: string; unitCostUsd?: number };
type Tail = { id: string; label?: string };

export function humanize(value: string): string {
  const words = value.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function extractGraph(source: string, workflowPath: string): ExtractResult {
  const relativeFile = `workflows/${workflowPath}.ts`;
  const file = ts.createSourceFile(relativeFile, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const findings: DiagramFinding[] = [];
  const steps = new Map<string, StepInfo>();
  const helpers: ts.FunctionDeclaration[] = [];
  let workflow: ts.FunctionDeclaration | undefined;

  for (const statement of file.statements) {
    if (!ts.isFunctionDeclaration(statement) || !statement.name || !statement.body) continue;
    const directive = directiveOf(statement.body);
    if (directive === "use step") steps.set(statement.name.text, stepInfo(statement, file));
    else if (directive === "use workflow") workflow = statement;
    else helpers.push(statement);
  }

  for (const step of steps.values()) {
    if (step.label) continue;
    findings.push({
      code: "step_label_missing",
      file: relativeFile,
      line: step.line,
      message: `${step.name} has no label.`,
      fix: "Add a JSDoc comment directly above it whose first line says what the stage does, such as /** Score the account against the ICP */.",
    });
  }
  for (const helper of helpers) {
    for (const call of stepCalls(helper.body!, steps)) {
      findings.push({
        code: "step_hidden_in_helper",
        file: relativeFile,
        line: lineOf(file, call),
        message: `${calleeName(call)} is called from helper ${helper.name!.text}, so it cannot appear in the diagram or the trace.`,
        fix: `Call it from the workflow body, or make ${helper.name!.text} a "use step" function with its own label.`,
      });
    }
  }

  const slug = workflowPath.split("/").at(-1)!;
  const graph: WorkflowGraph = {
    workflow: {
      path: workflowPath,
      label: humanize(slug),
      runs: headerValue(source, "Runs") ?? "unknown",
      kind: headerValue(source, "Kind") ?? "unknown",
      table: headerValue(source, "Table")?.split("|")[0].trim() ?? null,
    },
    nodes: [],
    groups: [],
    edges: [],
  };
  new GraphBuilder(graph, steps, file, source, relativeFile, findings).build(workflow);
  return { graph, findings };
}

class GraphBuilder {
  #nodes = 0;
  #groups = 0;
  #tails: Tail[] = [];
  #returns: Tail[] = [];

  constructor(
    private readonly graph: WorkflowGraph,
    private readonly steps: Map<string, StepInfo>,
    private readonly file: ts.SourceFile,
    private readonly source: string,
    private readonly relativeFile: string,
    private readonly findings: DiagramFinding[],
  ) {}

  build(workflow: ts.FunctionDeclaration | undefined) {
    const start = this.#node({ kind: "start", label: /\brows\s*:\s*z\.array/.test(this.source) ? "Rows" : "Input" });
    this.#tails = [{ id: start.id }];
    if (workflow?.body) {
      this.#statements(workflow.body.statements, undefined);
      if (!/\b(?:runRows|setAttributes)\s*\(/.test(workflow.body.getText(this.file))) {
        this.findings.push({
          code: "stage_attributes_missing",
          file: this.relativeFile,
          line: lineOf(this.file, workflow),
          message: "workflow body never calls setAttributes.",
          fix: 'Call setAttributes({ stage: "<label>" }) before each stage, or use runRows() which does this for row work.',
        });
      }
    }
    const end = this.#node({ kind: "end", label: "Done" });
    this.#tails = [...this.#tails, ...this.#returns];
    this.#connect(end.id);
  }

  #node(partial: Omit<DiagramNode, "id">, group?: string): DiagramNode {
    const node: DiagramNode = { id: `n${++this.#nodes}`, ...partial, ...(group ? { group } : {}) };
    this.graph.nodes.push(node);
    return node;
  }

  #group(kind: GroupKind, label: string, parent?: string): DiagramGroup {
    const group: DiagramGroup = { id: `g${++this.#groups}`, kind, label, ...(parent ? { parent } : {}) };
    this.graph.groups.push(group);
    return group;
  }

  #connect(to: string) {
    for (const tail of this.#tails) {
      this.graph.edges.push({ from: tail.id, to, ...(tail.label ? { label: tail.label } : {}) });
    }
    this.#tails = [{ id: to }];
  }

  #statements(statements: readonly ts.Statement[], group: string | undefined) {
    for (const statement of statements) this.#statement(statement, group);
  }

  #statement(node: ts.Statement, group: string | undefined) {
    if (ts.isBlock(node)) return this.#statements(node.statements, group);
    if (ts.isIfStatement(node)) return this.#if(node, group);
    if (ts.isForOfStatement(node) || ts.isForStatement(node) || ts.isForInStatement(node) || ts.isWhileStatement(node)) {
      return this.#loop(node, group);
    }
    if (ts.isTryStatement(node)) return this.#try(node, group);
    if (ts.isReturnStatement(node)) {
      if (node.expression) this.#expression(node.expression, group);
      this.#returns.push(...this.#tails);
      this.#tails = [];
      return;
    }
    if (ts.isThrowStatement(node) || ts.isContinueStatement(node) || ts.isBreakStatement(node)) {
      this.#tails = [];
      return;
    }
    this.#expression(node, group);
  }

  #expression(node: ts.Node, group: string | undefined) {
    const visit = (current: ts.Node): void => {
      if (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) {
        const hidden = stepCalls(current, this.steps);
        if (hidden.length > 0) {
          this.findings.push({
            code: "step_unreachable",
            file: this.relativeFile,
            line: lineOf(this.file, hidden[0]),
            message: `${calleeName(hidden[0])} is called inside a callback the diagram cannot follow.`,
            fix: "Use a for..of loop or Promise.all(items.map(...)) so the call sits in the workflow body.",
          });
        }
        return;
      }
      if (ts.isCallExpression(current)) {
        if (isPromiseAll(current)) return this.#parallel(current, group);
        const name = calleeName(current);
        if (name && this.steps.has(name)) return this.#stepNode(name, group);
        if (name === "runRows") return this.#runRows(current, group);
        if (name && WAIT_CALLS[name]) {
          const wait = this.#node({ kind: "wait", label: waitLabel(name, current, this.file) }, group);
          return this.#connect(wait.id);
        }
        if (name && HIDDEN_CALLS.has(name)) return;
      }
      ts.forEachChild(current, visit);
    };
    visit(node);
  }

  #stepNode(name: string, group: string | undefined) {
    const info = this.steps.get(name)!;
    const node = this.#node(
      {
        kind: "step",
        label: info.label ?? humanize(name),
        step: name,
        ...(info.provider ? { provider: info.provider } : {}),
        ...(info.unitCostUsd !== undefined ? { unitCostUsd: info.unitCostUsd } : {}),
      },
      group,
    );
    this.#connect(node.id);
  }

  #if(node: ts.IfStatement, group: string | undefined) {
    if (!containsStep(node, this.steps)) return;
    const decision = this.#node(
      { kind: "decision", label: leadingComment(this.source, node) ?? `${condensed(node.expression.getText(this.file))}?` },
      group,
    );
    this.#connect(decision.id);
    const after: Tail[] = [];
    this.#tails = [{ id: decision.id, label: "yes" }];
    this.#statement(node.thenStatement, group);
    after.push(...this.#tails);
    this.#tails = [{ id: decision.id, label: "no" }];
    if (node.elseStatement) this.#statement(node.elseStatement, group);
    after.push(...this.#tails);
    this.#tails = after;
  }

  #loop(node: ts.IterationStatement, group: string | undefined) {
    if (!containsStep(node.statement, this.steps)) return;
    const loop = this.#group("loop", leadingComment(this.source, node) ?? loopLabel(node, this.file), group);
    const firstIndex = this.graph.nodes.length;
    this.#statement(node.statement, loop.id);
    const first = this.graph.nodes[firstIndex];
    if (first) {
      for (const tail of this.#tails) this.graph.edges.push({ from: tail.id, to: first.id, label: "next", back: true });
    }
  }

  #try(node: ts.TryStatement, group: string | undefined) {
    const before = this.graph.nodes.length;
    this.#statements(node.tryBlock.statements, group);
    const tryTails = this.#tails;
    const tried = this.graph.nodes.slice(before);
    if (node.catchClause && containsStep(node.catchClause.block, this.steps)) {
      const last = tried.at(-1);
      this.#tails = last ? [{ id: last.id, label: "on error" }] : tryTails;
      this.#statements(node.catchClause.block.statements, group);
      this.#tails = [...tryTails, ...this.#tails];
    } else {
      this.#tails = tryTails;
    }
    if (node.finallyBlock) this.#statements(node.finallyBlock.statements, group);
  }

  #parallel(call: ts.CallExpression, group: string | undefined) {
    const argument = call.arguments[0];
    let branches: ts.Node[] = [];
    let label = "At the same time";
    if (argument && ts.isArrayLiteralExpression(argument)) branches = [...argument.elements];
    else if (argument && isMapCall(argument)) {
      const callback = argument.arguments[0];
      if (callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))) {
        branches = [callback.body];
        label = `For each ${humanize(argument.expression.expression.getText(this.file)).toLowerCase()}, at the same time`;
      }
    }
    if (branches.length === 0) return;
    const parallel = this.#group("parallel", label, group);
    const entry = this.#tails;
    const exits: Tail[] = [];
    for (const branch of branches) {
      this.#tails = entry;
      if (ts.isBlock(branch)) this.#statements(branch.statements, parallel.id);
      else this.#expression(branch, parallel.id);
      exits.push(...this.#tails);
    }
    this.#tails = exits;
  }

  #runRows(call: ts.CallExpression, group: string | undefined) {
    const argument = call.arguments[0];
    const properties = argument && ts.isObjectLiteralExpression(argument) ? argument.properties : [];
    const rowStep = identifierProperty(properties, "rowStep");
    const table = objectProperty(properties, "table");
    const saveStep = table ? identifierProperty(table.properties, "save") : undefined;
    const tableName = table ? stringProperty(table.properties, "name") : undefined;
    const loop = this.#group("loop", "For each row", group);
    const firstIndex = this.graph.nodes.length;
    if (rowStep && this.steps.has(rowStep)) this.#stepNode(rowStep, loop.id);
    const saveInfo = saveStep ? this.steps.get(saveStep) : undefined;
    const save = this.#node(
      {
        kind: "save",
        label: saveInfo?.label ?? (tableName ? `Save to ${tableName}` : "Save the row"),
        ...(saveStep ? { step: saveStep } : {}),
      },
      loop.id,
    );
    this.#connect(save.id);
    const wait = this.#node({ kind: "wait", label: "Checkpoint" }, loop.id);
    this.#connect(wait.id);
    const first = this.graph.nodes[firstIndex];
    if (first) this.graph.edges.push({ from: wait.id, to: first.id, label: "next", back: true });
  }
}

function directiveOf(body: ts.Block): string | undefined {
  const first = body.statements[0];
  if (first && ts.isExpressionStatement(first) && ts.isStringLiteral(first.expression)) return first.expression.text;
  return undefined;
}

function stepInfo(fn: ts.FunctionDeclaration, file: ts.SourceFile): StepInfo {
  const docs = ts.getJSDocCommentsAndTags(fn).filter(ts.isJSDoc);
  const comment = docs.length > 0 ? docs[docs.length - 1].comment : undefined;
  const text = typeof comment === "string" ? comment : comment ? ts.getTextOfJSDocComment(comment) ?? "" : "";
  const firstLine = text.split("\n")[0].trim();
  const label = firstLine.length >= LABEL_MIN && firstLine.length <= LABEL_MAX ? firstLine : null;
  const info: StepInfo = { name: fn.name!.text, label, line: lineOf(file, fn) };
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const argument = node.arguments[0];
      const properties = argument && ts.isObjectLiteralExpression(argument) ? argument.properties : [];
      if (node.expression.text === "provider" && info.provider === undefined) {
        info.provider = stringProperty(properties, "name") ?? "provider";
        info.unitCostUsd = numberProperty(properties, "costUsd");
      } else if (node.expression.text === "agent" && info.provider === undefined) {
        info.provider = "model";
        info.unitCostUsd = numberProperty(properties, "maxUsd");
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(fn.body!);
  return info;
}

function stepCalls(node: ts.Node, steps: Map<string, StepInfo>): ts.CallExpression[] {
  const calls: ts.CallExpression[] = [];
  const visit = (current: ts.Node) => {
    if (ts.isCallExpression(current)) {
      const name = calleeName(current);
      if (name && steps.has(name)) calls.push(current);
    }
    ts.forEachChild(current, visit);
  };
  visit(node);
  return calls;
}

function containsStep(node: ts.Node, steps: Map<string, StepInfo>): boolean {
  let found = false;
  const visit = (current: ts.Node) => {
    if (found) return;
    if (ts.isCallExpression(current)) {
      const name = calleeName(current);
      if (name && (steps.has(name) || name === "runRows" || WAIT_CALLS[name])) found = true;
    }
    ts.forEachChild(current, visit);
  };
  visit(node);
  return found;
}

function calleeName(call: ts.CallExpression): string | undefined {
  return ts.isIdentifier(call.expression) ? call.expression.text : undefined;
}

function isPromiseAll(call: ts.CallExpression): boolean {
  return (
    ts.isPropertyAccessExpression(call.expression) &&
    ts.isIdentifier(call.expression.expression) &&
    call.expression.expression.text === "Promise" &&
    ["all", "allSettled"].includes(call.expression.name.text)
  );
}

function isMapCall(node: ts.Node): node is ts.CallExpression & { expression: ts.PropertyAccessExpression } {
  return ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "map";
}

function waitLabel(name: string, call: ts.CallExpression, file: ts.SourceFile): string {
  if (name !== "approve") return WAIT_CALLS[name];
  const argument = call.arguments[0];
  const properties = argument && ts.isObjectLiteralExpression(argument) ? argument.properties : [];
  const stage = stringProperty(properties, "stage");
  return stage ? `Wait for approval: ${humanize(stage)}` : WAIT_CALLS[name];
}

function loopLabel(node: ts.IterationStatement, file: ts.SourceFile): string {
  if (ts.isForOfStatement(node) && ts.isVariableDeclarationList(node.initializer)) {
    const declaration = node.initializer.declarations[0];
    if (declaration && ts.isIdentifier(declaration.name)) return `For each ${humanize(declaration.name.text).toLowerCase()}`;
  }
  return "Repeat";
}

function leadingComment(source: string, node: ts.Node): string | undefined {
  const ranges = ts.getLeadingCommentRanges(source, node.getFullStart()) ?? [];
  const last = ranges.filter((range) => range.kind === ts.SyntaxKind.SingleLineCommentTrivia).at(-1);
  if (!last) return undefined;
  const text = source.slice(last.pos + 2, last.end).trim();
  return text.length >= LABEL_MIN && text.length <= LABEL_MAX ? text : undefined;
}

function condensed(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > 60 ? `${flat.slice(0, 57)}...` : flat;
}

function lineOf(file: ts.SourceFile, node: ts.Node): number {
  return file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
}

function headerValue(source: string, name: string): string | undefined {
  return source.match(new RegExp(`^\\s*\\*\\s+${name}:\\s*(.+)$`, "m"))?.[1].trim();
}

function property(properties: readonly ts.ObjectLiteralElementLike[], name: string): ts.PropertyAssignment | undefined {
  return properties.find(
    (candidate): candidate is ts.PropertyAssignment =>
      ts.isPropertyAssignment(candidate) && ts.isIdentifier(candidate.name) && candidate.name.text === name,
  );
}

function identifierProperty(properties: readonly ts.ObjectLiteralElementLike[], name: string): string | undefined {
  const shorthand = properties.find(
    (candidate): candidate is ts.ShorthandPropertyAssignment =>
      ts.isShorthandPropertyAssignment(candidate) && candidate.name.text === name,
  );
  if (shorthand) return shorthand.name.text;
  const assignment = property(properties, name);
  return assignment && ts.isIdentifier(assignment.initializer) ? assignment.initializer.text : undefined;
}

function stringProperty(properties: readonly ts.ObjectLiteralElementLike[], name: string): string | undefined {
  const assignment = property(properties, name);
  return assignment && ts.isStringLiteral(assignment.initializer) ? assignment.initializer.text : undefined;
}

function numberProperty(properties: readonly ts.ObjectLiteralElementLike[], name: string): number | undefined {
  const assignment = property(properties, name);
  return assignment && ts.isNumericLiteral(assignment.initializer) ? Number(assignment.initializer.text) : undefined;
}

function objectProperty(properties: readonly ts.ObjectLiteralElementLike[], name: string): ts.ObjectLiteralExpression | undefined {
  const assignment = property(properties, name);
  return assignment && ts.isObjectLiteralExpression(assignment.initializer) ? assignment.initializer : undefined;
}
