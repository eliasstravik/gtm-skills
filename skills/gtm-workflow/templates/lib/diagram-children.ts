// gtm-lib v21
import { extractGraph, type WorkflowGraph } from "./diagram";
import { layoutGraph } from "./layout";
import { renderSvg } from "./diagram-svg";

/** Child graphs stay collapsed until the operator opens the batch card. */
export async function attachChildGraphs(graph: WorkflowGraph, read: (path: string) => Promise<string | null>): Promise<void> {
  for (const node of graph.nodes) {
    if (!node.childWorkflow) continue;
    if (!/^(?:[a-z0-9]+(?:-[a-z0-9]+)*\/)*[a-z0-9]+(?:-[a-z0-9]+)*$/.test(node.childWorkflow)) throw new Error("Invalid child workflow path");
    const source = await read(node.childWorkflow);
    if (source === null) throw new Error(`Missing child workflow ${node.childWorkflow}`);
    node.childGraph = extractGraph(source, node.childWorkflow).graph;
    node.childSvg = renderSvg(layoutGraph(node.childGraph));
  }
}
