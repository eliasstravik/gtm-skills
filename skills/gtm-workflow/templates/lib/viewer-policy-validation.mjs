// Shared by compilation and request authorization. Reads metadata only.
export function dataSharingIssue({ data, sharePolicy: policy }) {
  if (!data) return "No data tab";
  if (!policy) return "Add viewer.sharePolicy for this workflow's Data tab";
  if (!["1", "2"].includes(policy.version)) return "Unsupported Data policy version";
  const all = new Set([
    ...data.tables.map((t) => t.name),
    ...(data.relations ?? []).map((r) => r.through),
  ]);
  if (
    policy.tables.length !== all.size ||
    new Set(policy.tables.map((t) => t.name)).size !== all.size ||
    policy.tables.some((t) => !all.has(t.name) || !t.row?.version)
  ) return "Data policy must cover every displayed table and relation table with a row policy";
  for (const view of data.tables) {
    const shared = policy.tables.find((t) => t.name === view.name);
    if (
      [...(view.defaultColumns ?? view.columns), "key", view.labelColumn ?? "key"].some((c) => !shared.columns.includes(c)) ||
      shared.columns.some((c) => !view.columns.includes(c) && c !== "key")
    ) return `Data policy columns do not match ${view.name}`;
    if (policy.version === "2") {
      if (JSON.stringify(shared.row) !== JSON.stringify(data.rowPolicies?.[view.name]))
        return `Data policy must preserve the private row policy for ${view.name}`;
      if (shared.columns.some((c) => ["responses_json", "sources_json", "provenance_json", "section_status_json"].includes(c)))
        return `Data policy exposes private profile fields in ${view.name}`;
      if (shared.columns.some((c) => c.endsWith("_json") && !shared.nested?.[c]?.length))
        return `Data policy requires allowed nested fields for ${view.name}`;
    }
  }
  for (const relation of data.relations ?? []) {
    const edge = policy.tables.find((t) => t.name === relation.through);
    if (![relation.fromColumn, relation.toColumn].every((c) => edge.columns.includes(c)))
      return `Data policy omits relation keys in ${relation.through}`;
    if (relation.reference && (policy.version !== "2" || relation.reference !== "current-experiences-v1"))
      return "Unsupported Data policy relation";
  }
  if (JSON.stringify(policy.relations) !== JSON.stringify(data.relations ?? []))
    return "Data policy must match the displayed relations";
}

export function validateDataSharing(entry) {
  if (!entry.data) return;
  const issue = dataSharingIssue(entry);
  if (issue) throw new Error(`${entry.slug}: ${issue}. See gtm-workflow/references/viewer.md.`);
}
