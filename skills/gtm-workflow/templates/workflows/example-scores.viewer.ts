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
        id: "read",
        label: "Read company websites",
        kind: "action",
        explanation:
          "Read each company's homepage for facts about its business.",
        details: {
          caching:
            "Homepage content is cached for seven days. Company scores remain fresh for one day.",
        },
        source: {
          path: "workflows/example-scores.ts",
        },
      },
      {
        id: "score",
        label: "Score against the ICP",
        kind: "action",
        explanation:
          "Compare the homepage with the saved ideal customer profile and produce a score from 0 to 100 with a reason.",
        details: {
          provider: "AI Gateway",
          notes: "Process at most 200 companies within the $2 run budget.",
        },
        source: {
          path: "workflows/example-scores.ts",
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
        label: "Save scores",
        kind: "output",
        explanation: "Store each company's score and reason for later review.",
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
        target: "read",
      },
      {
        id: "edge-1",
        source: "read",
        target: "score",
      },
      {
        id: "edge-2",
        source: "score",
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
  description:
    "Read company websites and score their fit against the saved criteria.",
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
      title: "Score companies",
      description:
        "Read company websites and score their fit against the saved criteria.",
      nodes: ["action_0", "action_1"],
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
  id: "4bb87c60-4b7c-4598-8063-c2cf6cf95e71",
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
          label: "Start child runs in bounded waves",
          nodeKind: "child",
          stepId: "step//./lib/rows//startChild",
        },
      },
      {
        id: "lineage",
        type: "step",
        data: {
          label: "Record child run identities",
          nodeKind: "step",
          stepId: "step//./lib/rows//recordChildren",
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
        type: "step",
        data: {
          label: "Read company website",
          nodeKind: "step",
          stepId: "step//./workflows/example-scores//fetchHomepage",
        },
        metadata: {
          loopId: "rows",
        },
      },
      {
        id: "action_1",
        type: "step",
        data: {
          label: "Score the company",
          nodeKind: "step",
          stepId: "step//./workflows/example-scores//scoreCompany",
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
          stepId: "step//./lib/rows//saveRow",
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
          stepId: "step//./lib/rows//saveRow",
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
        id: "action_0-action_1-9",
        source: "action_0",
        target: "action_1",
        type: "default",
      },
      {
        id: "action_1-save-10",
        source: "action_1",
        target: "save",
        type: "default",
      },
      {
        id: "action_0-failed-11",
        source: "action_0",
        target: "failed",
        type: "error",
        label: "Any row step throws",
      },
      {
        id: "failed-caps-12",
        source: "failed",
        target: "caps",
        type: "loop",
        label: "Next row",
      },
      {
        id: "save-caps-13",
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
        id: "bc3243cb-a41f-4b51-af22-0d1cc4e268a0",
        name: "exampleScores",
        columns: ["key", "score", "reason", "updated_at", "cost_usd", "error"],
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
      name: "exampleScores",
      label: "Scores",
      labelColumn: "key",
      columns: ["key", "score", "reason", "updated_at", "cost_usd", "error"],
    },
  ],
  relations: [],
} satisfies WorkflowData;
