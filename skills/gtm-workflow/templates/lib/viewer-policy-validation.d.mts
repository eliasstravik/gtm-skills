import type { WorkflowData } from "./data-api";
import type { DataPolicy } from "./viewer-contract";
type Entry = { data: WorkflowData | null; sharePolicy: DataPolicy | null };
export function dataSharingIssue(entry: Entry): string | undefined;
export function validateDataSharing(entry: Entry & { slug: string }): void;
