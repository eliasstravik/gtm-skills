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
  const helpers = new Map<string, ts.FunctionDeclaration>();
  let workflow: ts.FunctionDeclaration | undefined;

  for (const statement of file.statements) {
    if (!ts.isFunctionDeclaration(statement) || !statement.name || !statement.body) continue;
    const directive = directiveOf(statement.body);
    if (directive === "use step") steps.set(statement.name.text, stepInfo(statement, file));
    else if (directive === "use workflow") workflow = statement;
    else helpers.set(statement.name.text, statement);
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
  const builder = new GraphBuilder(graph, steps, helpers, file, source, relativeFile, findings);
  builder.build(workflow);
  // A helper the workflow reaches is drawn inline, so only the ones it never reaches hide steps.
  for (const [name, helper] of helpers) {
    if (builder.inlined.has(name)) continue;
    for (const call of stepCalls(helper.body!, steps)) {
      findings.push({
        code: "step_hidden_in_helper",
        file: relativeFile,
        line: lineOf(file, call),
        message: `${calleeName(call)} is called from helper ${name}, so it cannot appear in the diagram or the trace.`,
        fix: `Call it from the workflow body, or make ${name} a "use step" function with its own label.`,
      });
    }
  }
  return { graph, findings };
}

class GraphBuilder {
  #nodes = 0;
  #groups = 0;
  #tails: Tail[] = [];
  #returns: Tail[] = [];
  #inlining: string[] = [];
  /** Helpers drawn inline, so the hidden-step rule can skip them. */
  readonly inlined = new Set<string>();

  constructor(
    private readonly graph: WorkflowGraph,
    private readonly steps: Map<string, StepInfo>,
    private readonly helpers: Map<string, ts.FunctionDeclaration>,
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

  /** Every shape that puts a step call somewhere the walk cannot reach reports the same code. */
  #unreachable(node: ts.Node, message: string, fix: string) {
    this.findings.push({ code: "step_unreachable", file: this.relativeFile, line: lineOf(this.file, node), message, fix });
  }

  #expression(node: ts.Node, group: string | undefined) {
    const visit = (current: ts.Node): void => {
      if (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) {
        const hidden = stepCalls(current, this.steps);
        if (hidden.length > 0) {
          this.#unreachable(
            hidden[0],
            `${calleeName(hidden[0])} is called inside a callback the diagram cannot follow.`,
            "Use a for..of loop or Promise.all(items.map(...)) so the call sits in the workflow body.",
          );
        }
        return;
      }
      if (ts.isConditionalExpression(current)) {
        const branchCalls = [
          ...stepCalls(current.whenTrue, this.steps),
          ...stepCalls(current.whenFalse, this.steps),
        ];
        if (branchCalls.length > 0) {
          this.#unreachable(
            branchCalls[0],
            `${calleeName(branchCalls[0])} is called inside a conditional expression the diagram cannot follow.`,
            "Write the choice as if/else in the workflow body so the diagram shows the decision.",
          );
          // Descending would chain both branches as if they both ran, which is a false shape.
          return void visit(current.condition);
        }
      }
      if (ts.isCallExpression(current)) {
        if (isPromiseAll(current)) return this.#parallel(current, group);
        const name = calleeName(current);
        if (name && this.steps.has(name)) {
          for (const nested of current.arguments.flatMap((argument) => stepCalls(argument, this.steps))) {
            this.#unreachable(
              nested,
              `${calleeName(nested)} is called inside the arguments of ${name}, so the diagram cannot follow it.`,
              "Assign each call to its own const in the workflow body, so every step is its own stage.",
            );
          }
          return this.#stepNode(name, group);
        }
        if (name === "runRows") return this.#runRows(current, group);
        if (name && this.helpers.has(name)) return this.#inlineHelper(name, current, group);
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

  /**
   * A plain helper called from workflow context runs in workflow context, so every step inside it
   * is a real step: its body is drawn at the call site. A `return` inside it ends that helper, not
   * the workflow, so its return tails continue into whatever follows the call.
   */
  #inlineHelper(name: string, call: ts.Node, group: string | undefined) {
    if (this.#inlining.includes(name)) {
      return this.#unreachable(
        call,
        `${name} calls itself directly or indirectly, so the diagram cannot follow it.`,
        "Recursive helpers cannot be drawn; unroll the loop in the workflow body.",
      );
    }
    const helper = this.helpers.get(name);
    if (!helper?.body) return;
    this.inlined.add(name);
    this.#inlining.push(name);
    const outerReturns = this.#returns;
    this.#returns = [];
    this.#statements(helper.body.statements, group);
    this.#tails = [...this.#tails, ...this.#returns];
    this.#returns = outerReturns;
    this.#inlining.pop();
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
    // Inside an inlined helper a bare `return` ends that row early, which is a real path even when
    // the branch calls no step, so the decision is still drawn.
    const endsEarly = this.#inlining.length > 0 && containsReturn(node);
    if (!containsStep(node, this.steps, this.helpers) && !endsEarly) return;
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
    if (!containsStep(node.statement, this.steps, this.helpers)) return;
    const loop = this.#group("loop", leadingComment(this.source, node) ?? loopLabel(node, this.file), group);
    const firstIndex = this.graph.nodes.length;
    this.#statement(node.statement, loop.id);
    const first = this.graph.nodes[firstIndex];
    if (first) {
      // A loop whose body is itself just a single nested loop reaches here with the same
      // node as both the tail and the first node of the body: never emit a from === to edge.
      for (const tail of this.#tails) {
        if (tail.id !== first.id) this.graph.edges.push({ from: tail.id, to: first.id, label: "next", back: true });
      }
    }
    this.#dropIfEmpty(loop);
  }

  /**
   * A loop that wraps only another loop (or other groups) contributes no node of its own to
   * the diagram, so it is dropped; any group nested directly inside it is re-parented to the
   * dropped group's own parent, so a chain of pass-through loops collapses to the one group
   * that actually contains a node.
   */
  #dropIfEmpty(group: DiagramGroup) {
    if (this.graph.nodes.some((node) => node.group === group.id)) return;
    const index = this.graph.groups.indexOf(group);
    if (index === -1) return;
    this.graph.groups.splice(index, 1);
    for (const child of this.graph.groups) {
      if (child.parent !== group.id) continue;
      if (group.parent === undefined) delete child.parent;
      else child.parent = group.parent;
    }
  }

  #try(node: ts.TryStatement, group: string | undefined) {
    const entryTails = this.#tails;
    const before = this.graph.nodes.length;
    this.#statements(node.tryBlock.statements, group);
    const tryTails = this.#tails;
    if (node.catchClause && containsStep(node.catchClause.block, this.steps, this.helpers)) {
      // Every path out of the try block (all of them, not just the last node created) is a
      // possible error source; fall back to the try's own entry when the block added no nodes.
      const sources = this.graph.nodes.length > before ? tryTails : entryTails;
      this.#tails = sources.map((tail) => ({ id: tail.id, label: "on error" }));
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
        const collection = lastIdentifierSegment(argument.expression.expression, this.file);
        label = `For each ${humanize(collection).toLowerCase()}, at the same time`;
      } else if (callback && ts.isIdentifier(callback) && this.steps.has(callback.text)) {
        const mapCall = argument.expression.getText(this.file);
        this.#unreachable(
          callback,
          `${callback.text} is passed as a callback to ${mapCall}, so the diagram cannot follow it.`,
          `Call it from an arrow function instead, such as ${mapCall}((item) => ${callback.text}(item)).`,
        );
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
    // runRows() calls the row step in workflow context, so a plain helper there is drawn inline.
    else if (rowStep && this.helpers.has(rowStep)) this.#inlineHelper(rowStep, call, loop.id);
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

/** A helper call counts as a step call, because the helper's body is drawn inline. */
function containsStep(
  node: ts.Node,
  steps: Map<string, StepInfo>,
  helpers: Map<string, ts.FunctionDeclaration> = new Map(),
  seen: Set<string> = new Set(),
): boolean {
  let found = false;
  const visit = (current: ts.Node) => {
    if (found) return;
    if (ts.isCallExpression(current)) {
      const name = calleeName(current);
      if (name && (steps.has(name) || name === "runRows" || WAIT_CALLS[name])) found = true;
      const helper = name && !seen.has(name) ? helpers.get(name) : undefined;
      if (helper?.body && containsStep(helper.body, steps, helpers, new Set([...seen, name!]))) found = true;
    }
    ts.forEachChild(current, visit);
  };
  visit(node);
  return found;
}

/** A `return` that is not inside a nested function, so it ends the body being walked. */
function containsReturn(node: ts.Node): boolean {
  let found = false;
  const visit = (current: ts.Node) => {
    if (found) return;
    if (ts.isFunctionLike(current)) return;
    if (ts.isReturnStatement(current)) found = true;
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

/** The last segment of a property path, so `arg.items` labels as "items", not "arg.items". */
function lastIdentifierSegment(node: ts.Expression, file: ts.SourceFile): string {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (ts.isIdentifier(node)) return node.text;
  return node.getText(file);
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
