import ts from "typescript";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { randomUUID } from "node:crypto";
const parse = (path) =>
  ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
export function readLiteral(node, file, seen = new Set()) {
  if (
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isParenthesizedExpression(node)
  )
    return readLiteral(node.expression, file, seen);
  if (ts.isStringLiteralLike(node) || ts.isNumericLiteral(node))
    return ts.isNumericLiteral(node) ? Number(node.text) : node.text;
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isArrayLiteralExpression(node))
    return node.elements.map((n) => readLiteral(n, file, seen));
  if (ts.isObjectLiteralExpression(node))
    return Object.fromEntries(
      node.properties.map((p) => {
        if (!ts.isPropertyAssignment(p))
          throw Error("Viewer metadata must use explicit literal properties");
        return [p.name.text, readLiteral(p.initializer, file, seen)];
      }),
    );
  if (ts.isIdentifier(node)) {
    const marker = `${file.fileName}:${node.text}`;
    if (seen.has(marker)) throw Error("Cyclic viewer metadata");
    const next = new Set([...seen, marker]);
    for (const s of file.statements) {
      if (ts.isVariableStatement(s))
        for (const d of s.declarationList.declarations)
          if (d.name.text === node.text && d.initializer)
            return readLiteral(d.initializer, file, next);
      if (
        ts.isImportDeclaration(s) &&
        s.importClause?.namedBindings &&
        ts.isNamedImports(s.importClause.namedBindings)
      )
        for (const i of s.importClause.namedBindings.elements)
          if (i.name.text === node.text) {
            let path = resolve(dirname(file.fileName), s.moduleSpecifier.text);
            if (!existsSync(path)) path += ".ts";
            const other = parse(path);
            return readLiteral(
              ts.factory.createIdentifier(i.propertyName?.text ?? i.name.text),
              other,
              next,
            );
          }
    }
  }
  throw Error(
    `Viewer metadata must be statically readable: ${node.getText(file).slice(0, 80)}`,
  );
}
function literalLocation(node, file, seen = new Set()) {
  if (
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isParenthesizedExpression(node)
  )
    return literalLocation(node.expression, file, seen);
  if (ts.isObjectLiteralExpression(node)) return { node, file };
  const marker = `${file.fileName}:${node.text}`;
  if (!ts.isIdentifier(node) || seen.has(marker))
    throw Error("Cannot locate authored viewer metadata");
  seen.add(marker);
  for (const statement of file.statements) {
    if (ts.isVariableStatement(statement))
      for (const declaration of statement.declarationList.declarations)
        if (declaration.name.text === node.text && declaration.initializer)
          return literalLocation(declaration.initializer, file, seen);
    const bindings =
      ts.isImportDeclaration(statement) &&
      statement.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings))
      for (const binding of bindings.elements)
        if (binding.name.text === node.text) {
          let path = resolve(
            dirname(file.fileName),
            statement.moduleSpecifier.text,
          );
          if (!existsSync(path)) path += ".ts";
          return literalLocation(
            ts.factory.createIdentifier(
              binding.propertyName?.text ?? binding.name.text,
            ),
            parse(path),
            seen,
          );
        }
  }
  throw Error("Cannot locate authored viewer metadata");
}
export function registrySource(register = false) {
  const path = resolve("workflows/index.ts"),
    file = parse(path);
  let registry;
  for (const s of file.statements)
    if (ts.isVariableStatement(s))
      for (const d of s.declarationList.declarations)
        if (d.name.text === "workflows") registry = d.initializer;
  while (
    registry &&
    (ts.isAsExpression(registry) || ts.isSatisfiesExpression(registry))
  )
    registry = registry.expression;
  if (!registry || !ts.isObjectLiteralExpression(registry))
    throw Error("Expected a literal workflows registry");
  const edits = [],
    entries = [];
  for (const p of registry.properties) {
    if (
      !ts.isPropertyAssignment(p) ||
      !ts.isObjectLiteralExpression(p.initializer)
    )
      throw Error("Expected explicit workflow registry entries");
    const slug = p.name.text;
    const props = Object.fromEntries(
      p.initializer.properties
        .filter(ts.isPropertyAssignment)
        .map((p) => [p.name.text, p.initializer]),
    );
    let viewer = props.viewer ? readLiteral(props.viewer, file) : null;
    if (!viewer?.id) {
      if (!register)
        throw Error(
          `Run npm run viewer:register to assign a permanent identity to ${slug}`,
        );
      const id = randomUUID();
      const target = props.viewer
        ? literalLocation(props.viewer, file)
        : { node: p.initializer, file };
      viewer = { ...viewer, id };
      edits.push({
        path: target.file.fileName,
        offset: target.node.getStart(target.file) + 1,
        text: props.viewer
          ? ` id: ${JSON.stringify(id)},`
          : ` viewer: ${JSON.stringify(viewer)},`,
      });
    }
    if (!/^[0-9a-f-]{36}$/.test(viewer.id))
      throw Error(`Invalid viewer identity for ${slug}`);
    const run = props.run;
    if (!run || !ts.isIdentifier(run))
      throw Error(`Expected a named workflow function for ${slug}`);
    let source, exportName;
    for (const s of file.statements)
      if (
        ts.isImportDeclaration(s) &&
        s.importClause?.namedBindings &&
        ts.isNamedImports(s.importClause.namedBindings)
      )
        for (const i of s.importClause.namedBindings.elements)
          if (i.name.text === run.text) {
            source = s.moduleSpecifier.text;
            exportName = i.propertyName?.text ?? i.name.text;
          }
    if (!source) throw Error(`Workflow import not found: ${slug}`);
    const workflowPath = resolve("workflows", source + ".ts");
    const content = readFileSync(workflowPath, "utf8");
    const doc = content
      .match(/\/\*\*([\s\S]*?)\*\//)?.[1]
      ?.split("\n")
      .map((s) => s.replace(/^\s*\*?\s?/, ""));
    const paragraphs = doc
      ?.join("\n")
      .trim()
      .split(/\n\s*\n/);
    entries.push({
      id: viewer.id,
      slug,
      title: viewer.title ?? paragraphs?.[0] ?? slug,
      description: viewer.description ?? paragraphs?.[1] ?? "",
      source: source.replace(/^\.\//, ""),
      exportName,
      data: props.data ? readLiteral(props.data, file) : null,
      sharePolicy: viewer.sharePolicy ?? null,
      ...(viewer.connections === undefined ? {} : { connections: validateConnections(viewer.connections) }),
      ...(viewer.businessGraph ? { businessGraph: viewer.businessGraph } : {}),
      ...(viewer.stages ? { stages: viewer.stages } : {}),
      ...(viewer.graph ? { graph: viewer.graph } : {}),
      ...(viewer.mappings ? { mappings: viewer.mappings } : {}),
    });
  }
  if (new Set(entries.map((e) => e.id)).size !== entries.length)
    throw Error("Duplicate immutable workflow identity");
  if (register && edits.length) {
    for (const path of new Set(edits.map((e) => e.path))) {
      let text = readFileSync(path, "utf8");
      for (const e of edits
        .filter((e) => e.path === path)
        .sort((a, b) => b.offset - a.offset))
        text = text.slice(0, e.offset) + e.text + text.slice(e.offset);
      writeFileSync(path, text);
    }
  }
  return entries;
}
function validateConnections(value) {
  if (!Array.isArray(value) || value.length > 100) throw Error("Invalid declared connections");
  return value.map((item) => {
    if (!item || typeof item !== "object" || Object.keys(item).some((key) => !["connection", "provider"].includes(key)) ||
      typeof item.connection !== "string" || !/^[A-Za-z_][A-Za-z0-9_-]{0,255}$/.test(item.connection) ||
      (item.provider !== undefined && (typeof item.provider !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9 ._-]{0,63}$/.test(item.provider))))
      throw Error("Invalid declared connections");
    return { connection: item.connection, ...(item.provider === undefined ? {} : { provider: item.provider }) };
  });
}
if (process.argv[1] === new URL(import.meta.url).pathname)
  console.log(`Registered ${registrySource(true).length} workflow identities.`);
