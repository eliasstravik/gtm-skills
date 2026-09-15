type Step = { status: string };
type Page = { data: Step[]; cursor?: string | null; hasMore: boolean };
/** A bounded scan, independent of the selected detail page. Never infer completeness. */
export async function summarizeRun(list: (cursor?: string) => Promise<Page>) {
  let cursor: string | undefined;
  const statuses: Record<string, number> = {};
  let count = 0;
  const seen = new Set<string>();
  for (let page = 0; page < 20; page++) {
    const result = await list(cursor);
    for (const step of result.data) {
      count++;
      statuses[step.status] = (statuses[step.status] ?? 0) + 1;
    }
    if (!result.hasMore) return { complete: true, count, statuses };
    if (!result.cursor || seen.has(result.cursor)) break;
    seen.add(result.cursor);
    cursor = result.cursor;
  }
  return { complete: false, count, statuses };
}
