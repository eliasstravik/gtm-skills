import { pgTable, text } from "drizzle-orm/pg-core";
// Stands in for lib/tables.ts. The physical name differs from the runtime's own gtm.people on purpose: the local
// role's search path looks in schema gtm first.
export const tables: Record<string, any> = {
  people: pgTable("fixture_people", {
    key: text().primaryKey(),
    name: text(),
    secret: text(),
  }),
};
export const listChildren = async () => [];
export const entry = {
  id: "stable",
  slug: "network",
  title: "Network",
  description: "Find people in the network.",
  businessGraph: {
    nodes: [
      {
        id: "lookup",
        label: "Find people",
        kind: "action",
        explanation: "Find matching people.",
        details: { notes: "PRIVATE" },
      },
    ],
    edges: [],
  },
  revision: "1",
  workflowName: "network",
  graph: {
    nodes: [
      {
        id: "lookup",
        type: "step",
        data: { label: "Find people" },
        metadata: { secret: "PRIVATE" },
      },
    ],
    edges: [],
  },
  data: {
    tables: [
      {
        name: "people",
        label: "People",
        columns: ["key", "name"],
        labelColumn: "name",
      },
    ],
    relations: [],
  },
  sharePolicy: {
    version: "1",
    tables: [
      {
        id: "people",
        name: "people",
        columns: ["key", "name"],
        row: { version: "all" },
      },
    ],
    relations: [],
  },
};
export default [entry];
export const runId = "wrun_" + "A".repeat(26);
export const run = {
  runId,
  workflowName: "network",
  status: "completed",
  createdAt: new Date(),
  deploymentId: "fixture",
  startedAt: new Date(Date.now() - 120000),
  completedAt: new Date(),
  input: { nested: { secret: "PRIVATE" } },
  output: { done: 38, failed: 2, skipped: 0, spentUsd: 1.2, secret: "PRIVATE" },
  error: { secret: "PRIVATE" },
  attributes: {
    "gtm.viewer.workspace": "fixture",
    "gtm.viewer.environment": "production",
    "gtm.viewer.id": "stable",
  },
};
export const fixtureRuns: any[] = [run];
export const getWorld = async () => ({
  events: {
    list: async () => ({
      data: [
        {
          eventId: "event-1",
          eventType: "step_retrying",
          correlationId: "step-0",
          createdAt: new Date(),
          eventData: { secret: "PRIVATE" },
        },
        {
          eventId: "event-2",
          eventType: "wait_created",
          correlationId: "wait-1",
          createdAt: new Date(),
        },
      ],
      hasMore: false,
    }),
  },
  runs: {
    get: async (id: string) => {
      const result = fixtureRuns.find((r) => r.runId === id);
      if (!result) throw Error("Unknown fixture run");
      return result;
    },
    list: async ({ workflowName, status, pagination }: any) => {
      const rows = fixtureRuns.filter(
        (r) =>
          r.workflowName === workflowName && (!status || r.status === status),
      );
      const offset = Number(pagination.cursor ?? 0);
      return {
        data: rows.slice(offset, offset + pagination.limit),
        hasMore: offset + pagination.limit < rows.length,
        cursor: String(offset + pagination.limit),
      };
    },
  },
  steps: {
    list: async ({ pagination }: any) => {
      const offset = Number(pagination.cursor ?? 0),
        limit = pagination.limit;
      return {
        data: Array.from(
          { length: Math.max(0, Math.min(limit, 40 - offset)) },
          (_, i) => ({
            stepId: `step-${i + offset}`,
            stepName: "lookup",
            status: "completed",
            attempt: i ? 1 : 2,
            startedAt: new Date(run.startedAt.getTime() + 30000),
            completedAt: new Date(run.startedAt.getTime() + 60000),
            input: { key: `person-${offset + i}`, secret: "PRIVATE" },
            output: { secret: "PRIVATE" },
            error: { secret: "PRIVATE" },
          }),
        ),
        cursor: String(offset + limit),
        hasMore: offset + limit < 40,
      };
    },
  },
});
export const deriveRunPayloadKeys = async (x: unknown) => x;
export const hydrateStepArguments = async (x: unknown) => x;
export const hydrateStepReturnValue = hydrateStepArguments;
export const hydrateWorkflowArguments = hydrateStepArguments;
export const hydrateWorkflowReturnValue = hydrateStepArguments;
export const hydrateRunError = hydrateStepArguments;
export const hydrateStepError = hydrateStepArguments;
