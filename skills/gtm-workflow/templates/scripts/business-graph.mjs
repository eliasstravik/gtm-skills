import { existsSync, readFileSync } from "node:fs";
import { resolve, sep } from "node:path";

/** Checks authored business metadata without evaluating workflow code. */
export function validateBusinessGraph(graph, root = process.cwd()) {
  if (
    !graph ||
    !Array.isArray(graph.nodes) ||
    !graph.nodes.length ||
    !Array.isArray(graph.edges)
  )
    throw Error(
      "Every workflow requires viewer.businessGraph with nodes and edges.",
    );
  const ids = new Set();
  for (const node of graph.nodes) {
    if (
      typeof node.id !== "string" ||
      !node.id.trim() ||
      ids.has(node.id) ||
      typeof node.label !== "string" ||
      !node.label.trim() ||
      typeof node.explanation !== "string" ||
      !node.explanation.trim() ||
      !["input", "action", "decision", "output"].includes(node.kind)
    )
      throw Error(
        "Business nodes require unique IDs, labels, kinds and explanations.",
      );
    ids.add(node.id);
    if (
      node.details &&
      Object.entries(node.details).some(
        ([key, value]) =>
          !["provider", "caching", "notes"].includes(key) ||
          typeof value !== "string",
      )
    )
      throw Error(
        "Business node details must use explicit provider, caching or notes fields.",
      );
    if (node.source) {
      const path = node.source.path;
      if (
        typeof path !== "string" ||
        !/^(workflows|lib)\/[A-Za-z0-9_./-]+\.ts$/.test(path) ||
        path.split("/").includes("..")
      )
        throw Error("Invalid business node source path.");
      const target = resolve(root, path);
      if (!target.startsWith(resolve(root) + sep) || !existsSync(target))
        throw Error("Business node source does not exist.");
      if (
        node.source.line !== undefined &&
        (!Number.isSafeInteger(node.source.line) ||
          node.source.line < 1 ||
          node.source.line > readFileSync(target, "utf8").split("\n").length)
      )
        throw Error("Invalid business node source line.");
    }
  }
  const edges = new Set();
  for (const edge of graph.edges) {
    if (
      typeof edge.id !== "string" ||
      !edge.id.trim() ||
      edges.has(edge.id) ||
      !ids.has(edge.source) ||
      !ids.has(edge.target) ||
      (edge.label !== undefined &&
        (typeof edge.label !== "string" || !edge.label.trim()))
    )
      throw Error(
        "Business edges require unique IDs and valid endpoints and labels.",
      );
    if (
      graph.nodes.find((n) => n.id === edge.source).kind === "decision" &&
      !edge.label?.trim()
    )
      throw Error("Business decision branches require meaningful labels.");
    edges.add(edge.id);
  }
}
