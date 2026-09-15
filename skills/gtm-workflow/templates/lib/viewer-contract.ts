/** Browser-safe display contract. Never imports workflow execution or database code. */
export const CONTRACT_VERSION = 1;
export type View = "logic" | "runs" | "data";
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
  id: string;
  slug: string;
  title: string;
  description?: string;
  workflowName: string;
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
    row: { version: string; column?: string; equals?: string };
  }[];
  relations: {
    from: string;
    to: string;
    through: string;
    fromColumn: string;
    toColumn: string;
  }[];
};
