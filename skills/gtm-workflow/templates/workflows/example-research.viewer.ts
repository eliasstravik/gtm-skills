import type { Graph, DataPolicy, BusinessGraph } from "../lib/viewer-contract";
import type { WorkflowData } from "../lib/data-api";

/** Authored description of the row helper and workflow-specific calls. It never drives execution. */
export const viewer = {
  businessGraph: {
    nodes: [
      {
        id: "input",
        label: "Company list",
        kind: "input",
        explanation: "Use the company domains supplied for this run.",
      },
      {
        id: "research",
        label: "Research each company",
        kind: "action",
        explanation:
          "Read the company's website and write a brief with the pages used as evidence.",
        details: {
          provider: "AI Gateway with the free page-reading tool.",
          caching:
            "Reuse research results for seven days. Process at most 200 companies within the $2 run budget.",
        },
        source: {
          path: "workflows/example-research.ts",
        },
      },
      {
        id: "result",
        label: "Result available?",
        kind: "decision",
        explanation:
          "Save a successful result, or record why this company could not be processed.",
      },
      {
        id: "save",
        label: "Save research briefs",
        kind: "output",
        explanation:
          "Store each company's brief, what it sells, headcount band and evidence links.",
      },
      {
        id: "error",
        label: "Record company errors",
        kind: "output",
        explanation:
          "Save the error for a company that could not be processed and continue with the remaining companies.",
      },
    ],
    edges: [
      {
        id: "edge-0",
        source: "input",
        target: "research",
      },
      {
        id: "edge-1",
        source: "research",
        target: "result",
      },
      {
        id: "success",
        source: "result",
        target: "save",
        label: "Yes",
      },
      {
        id: "failure",
        source: "result",
        target: "error",
        label: "No",
      },
    ],
  },
  description: "Research company websites and save evidence-backed briefs.",
  stages: [
    {
      id: "prepare-input",
      title: "Prepare input",
      description:
        "Validate inputs and skip recently completed rows before applying the row and spending limits.",
      nodes: ["start", "fresh"],
    },
    {
      id: "process-record",
      title: "Research companies",
      description: "Research company websites and save evidence-backed briefs.",
      nodes: ["action_0"],
    },
    {
      id: "save-results",
      title: "Save results",
      description:
        "Save each successful result. The separate failure path retains row errors and estimated costs.",
      nodes: ["save"],
    },
    {
      id: "report-results",
      title: "Report totals",
      description:
        "Return the recorded result counts and costs; child runs report to their parent.",
      nodes: ["finish"],
    },
  ],
  id: "0f377a8b-80e8-4fc5-a782-2f154a909614",
  graph: {
    nodes: [
      {
        id: "start",
        type: "workflow_start",
        data: {
          label: "Read and validate input",
          nodeKind: "workflow_start",
        },
      },
      {
        id: "fresh",
        type: "step",
        data: {
          label: "Skip recently completed rows",
          nodeKind: "step",
          stepId: "step//./lib/rows//readFresh",
        },
      },
      {
        id: "fanout",
        type: "conditional",
        data: {
          label: "More rows than the chunk limit?",
          nodeKind: "conditional",
        },
      },
      {
        id: "children",
        type: "child",
        data: {
          label: "Start a wave of child runs",
          nodeKind: "child",
          stepId: "step//./lib/rows//startChildren",
        },
      },
      {
        id: "lineage",
        type: "step",
        data: {
          label: "Record the wave's child runs",
          nodeKind: "step",
          stepId: "step//./lib/rows//startChildren",
        },
      },
      {
        id: "wait",
        type: "wait",
        data: {
          label: "Wait for child results",
          nodeKind: "wait",
        },
      },
      {
        id: "caps",
        type: "conditional",
        data: {
          label: "Rows remain and both caps allow a batch?",
          nodeKind: "conditional",
        },
        metadata: {
          loopId: "rows",
        },
      },
      {
        id: "action_0",
        type: "agent",
        data: {
          label: "Research the company with an agent",
          nodeKind: "agent",
        },
        metadata: {
          loopId: "rows",
        },
      },
      {
        id: "save",
        type: "step",
        data: {
          label: "Save the successful result",
          nodeKind: "step",
          stepId: "step//./lib/rows//saveRows",
        },
        metadata: {
          loopId: "rows",
        },
      },
      {
        id: "failed",
        type: "step",
        data: {
          label: "Save the failed row and estimated cost",
          nodeKind: "step",
          stepId: "step//./lib/rows//saveRows",
        },
        metadata: {
          loopId: "rows",
        },
      },
      {
        id: "finish",
        type: "workflow_end",
        data: {
          label: "Return totals; child runs report to their parent",
          nodeKind: "workflow_end",
        },
      },
    ],
    edges: [
      {
        id: "start-fresh-0",
        source: "start",
        target: "fresh",
        type: "default",
      },
      {
        id: "fresh-fanout-1",
        source: "fresh",
        target: "fanout",
        type: "default",
      },
      {
        id: "fanout-children-2",
        source: "fanout",
        target: "children",
        type: "default",
        label: "Yes",
      },
      {
        id: "children-lineage-3",
        source: "children",
        target: "lineage",
        type: "default",
      },
      {
        id: "lineage-wait-4",
        source: "lineage",
        target: "wait",
        type: "default",
      },
      {
        id: "wait-finish-5",
        source: "wait",
        target: "finish",
        type: "default",
      },
      {
        id: "fanout-caps-6",
        source: "fanout",
        target: "caps",
        type: "default",
        label: "No",
      },
      {
        id: "caps-finish-7",
        source: "caps",
        target: "finish",
        type: "default",
        label: "No",
      },
      {
        id: "caps-action_0-8",
        source: "caps",
        target: "action_0",
        type: "default",
        label: "Yes",
      },
      {
        id: "action_0-save-9",
        source: "action_0",
        target: "save",
        type: "default",
      },
      {
        id: "action_0-failed-10",
        source: "action_0",
        target: "failed",
        type: "error",
        label: "Any row step throws",
      },
      {
        id: "failed-caps-11",
        source: "failed",
        target: "caps",
        type: "loop",
        label: "Next row",
      },
      {
        id: "save-caps-12",
        source: "save",
        target: "caps",
        type: "loop",
        label: "Next row",
      },
    ],
  },
  sharePolicy: {
    version: "1",
    tables: [
      {
        id: "322fe8ab-5e5a-4331-977e-a61e784928a3",
        name: "exampleResearch",
        columns: [
          "key",
          "summary",
          "sells",
          "headcount_band",
          "evidence_json",
          "tool_calls",
          "stop_reason",
          "updated_at",
          "cost_usd",
          "error",
        ],
        row: {
          version: "all-rows-v1",
        },
      },
    ],
    relations: [],
  },
} satisfies {
  id: string;
  description: string;
  stages: import("../lib/viewer-contract").Display["stages"];
  businessGraph: BusinessGraph;
  graph: Graph;
  sharePolicy: DataPolicy;
};

export const data = {
  tables: [
    {
      name: "exampleResearch",
      label: "Research",
      labelColumn: "key",
      columns: [
        "key",
        "summary",
        "sells",
        "headcount_band",
        "evidence_json",
        "tool_calls",
        "stop_reason",
        "updated_at",
        "cost_usd",
        "error",
      ],
    },
  ],
  relations: [],
} satisfies WorkflowData;
