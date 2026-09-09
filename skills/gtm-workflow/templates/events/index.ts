import type { EventDefinition } from "../lib/events";

// Workflow-owned registry. Add a source only with an accepted input/effect/limit policy.
export const eventSources: Record<string, EventDefinition> = {};
