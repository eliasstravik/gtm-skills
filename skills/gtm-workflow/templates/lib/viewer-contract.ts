/** Browser-safe display contract. Never imports workflow execution or database code. */
export const CONTRACT_VERSION = 3;
/**
 * The Data grid reads a table in windows of rows (`offset`, `limit`), never whole: rows ahead of the screen come
 * LIST_WINDOW_ROWS at a time, and one call returns at most MAX_LIST_ROWS. Each row is Neon data transfer, held to
 * `listedRow` and `dataApiList` in lib/read-budgets.ts.
 */
export const LIST_WINDOW_ROWS = 100;
export const MAX_LIST_ROWS = 200;
export type RowPolicy = {
  version: string;
  column?: string;
  equals?: string;
  membership?: { column: "sources_json"; workflowId: string };
  currentCompanies?: { peopleTable: string; workflowId: string };
};
export type DataRelation = {
  from: string;
  to: string;
  through: string;
  fromColumn: string;
  toColumn: string;
  reference?: "current-experiences-v1";
};
export type View = "logic" | "runs" | "data";
/**
 * One group in `workflows/groups.ts`: workflows that belong together, usually because they share data or run as a
 * pipeline. `S` is the registry's slugs, so a misspelled or deleted workflow fails the type check and the build.
 * Order of `workflows` is the order on screen (pipeline order). A workflow is in at most one group.
 */
export type WorkflowGroup<S extends string = string> = {
  id: string;
  name: string;
  description?: string;
  workflows: readonly S[];
};
/** A group as the build resolves it: workflow slugs replaced by their permanent viewer IDs. */
export type RegistryGroup = { id: string; name: string; description: string; workflows: string[] };
/** How a workflow starts, derived at build from `vercel.json` crons, a registered `intake` and stage calls. */
export type Trigger = { schedule?: string; webhook?: boolean; startedBy?: string[] };
export type BusinessGraph = {
  nodes: {
    id: string;
    label: string;
    kind: "input" | "action" | "decision" | "output";
    explanation: string;
    details?: { provider?: string; caching?: string; notes?: string };
    source?: { path: string; line?: number };
  }[];
  edges: { id: string; source: string; target: string; label?: string }[];
};
export type Graph = {
  nodes: {
    id: string;
    type: string;
    data: { label: string; nodeKind?: string; stepId?: string };
    metadata?: Record<string, unknown>;
  }[];
  edges: {
    id: string;
    source: string;
    target: string;
    type?: string;
    label?: string;
  }[];
};
export type Display = {
  connections?: import("./connections-contract").ConnectionUsage[];
  businessGraph?: BusinessGraph;
  source?: string;
  id: string;
  slug: string;
  title: string;
  description?: string;
  stages?: {
    id: string;
    title: string;
    description: string;
    nodes: string[];
  }[];
  workflowName: string;
  trigger?: Trigger;
  graph?: Graph;
  revision: string;
  /** Exact argument selectors disambiguate repeated call sites without inferring execution order. */
  mappings?: {
    nodeId: string;
    stepName: string;
    argument?: { path: (string | number)[]; equals: string | number | boolean };
  }[];
};
export type DataPolicy = {
  version: string;
  tables: {
    id: string;
    name: string;
    columns: string[];
    row: RowPolicy;
    nested?: Record<string, string[]>;
  }[];
  relations: DataRelation[];
};
