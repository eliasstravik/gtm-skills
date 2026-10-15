import groupsJson from "#viewer-groups";
import type { RegistryGroup } from "./viewer-contract";
import { ViewerError } from "./viewer-grants";

/** `workflows/groups.ts` as the build checked it, with workflow slugs resolved to permanent viewer IDs. */
export const groups = groupsJson as RegistryGroup[];

/** The group a URL names, or none. An unknown id is refused rather than showing everything. */
export function selectedGroup(url: URL): RegistryGroup | undefined {
  const id = url.searchParams.get("group");
  if (!id) return undefined;
  const group = groups.find((g) => g.id === id);
  if (!group) throw new ViewerError(404, "group_not_found", "This group no longer exists.");
  return group;
}

export const groupOf = (workflowId: string) => groups.find((g) => g.workflows.includes(workflowId));
