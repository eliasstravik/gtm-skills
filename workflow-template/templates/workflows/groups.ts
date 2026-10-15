import type { WorkflowGroup } from "../lib/viewer-contract";
import type { workflows } from "./index";

/**
 * Groups on the Workflows page: maintained by Create, Delete and the agent when asked to regroup. One level, a workflow
 * in at most one group, no empty groups; a workflow in none shows under Ungrouped. Order here is the order on screen.
 * List only workflows that stand on their own: a stage that one workflow starts follows it, nested under it.
 *
 * { id: "linkedin-social", name: "LinkedIn social", description: "Who engages with our posts, scored.",
 *   workflows: ["linkedin-social-monitor", "score-inbound"] },
 */
export const groups = [] as const satisfies readonly WorkflowGroup<keyof typeof workflows>[];
