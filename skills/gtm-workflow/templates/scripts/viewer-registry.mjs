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
    if (!viewer) {
      if (!register)
        throw Error(
          `Run npm run viewer:register to assign a permanent identity to ${slug}`,
        );
      viewer = { id: randomUUID() };
      edits.push({
        offset: p.initializer.getStart(file) + 1,
        text: ` viewer: ${JSON.stringify(viewer)},`,
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
      ...(viewer.graph ? { graph: viewer.graph } : {}),
      ...(viewer.mappings ? { mappings: viewer.mappings } : {}),
    });
  }
  if (new Set(entries.map((e) => e.id)).size !== entries.length)
    throw Error("Duplicate immutable workflow identity");
  if (register && edits.length) {
    let text = file.text;
    for (const e of edits.sort((a, b) => b.offset - a.offset))
      text = text.slice(0, e.offset) + e.text + text.slice(e.offset);
    writeFileSync(path, text);
  }
  return entries;
}
if (process.argv[1] === new URL(import.meta.url).pathname)
  console.log(`Registered ${registrySource(true).length} workflow identities.`);
