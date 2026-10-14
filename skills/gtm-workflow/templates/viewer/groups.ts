/** The Workflows page's arithmetic, without React or the page's location, so it can be tested on its own. */
export type ListedWorkflow = {
  id: string; slug: string; title: string; description?: string;
  trigger: { schedule?: string; webhook?: boolean; startedBy?: string[] };
  /** The workflow that starts this one as a stage: it is shown nested under it. */
  parent?: string;
  tables: string[]; providers: string[];
};
export type Group = { id: string; name: string; description: string; workflows: string[] };
export type LastRun = { id: string; status: string; createdAt: string; startedAt?: string; completedAt?: string; stage?: boolean };
export type LastRuns = Record<string, LastRun | null | "unknown">;
/** A workflow and the stages it starts, each a tree of its own. `context`: shown only because a stage below it matched. */
export type Node = { workflow: ListedWorkflow; stages: Node[]; context?: boolean };
export type Section = { group?: Group; nodes: Node[]; members: ListedWorkflow[] };
export type Filter = "failing" | "running";

export const lastRun = (runs: LastRuns | undefined, id: string) => {
  const run = runs?.[id];
  return run && run !== "unknown" ? run : undefined;
};
export const active = (run?: LastRun) => Boolean(run && ["pending", "running"].includes(run.status));

/** Computed from the last runs, never hand-tagged: whose last run failed, and whose is still going. */
export function passes(filter: Filter, workflow: ListedWorkflow, runs: LastRuns | undefined) {
  const run = lastRun(runs, workflow.id);
  return filter === "failing" ? run?.status === "failed" : active(run);
}

/** Search over what a person remembers a workflow by: its name, purpose, group, tables and providers. */
export function matches(search: string, workflow: ListedWorkflow, group?: Group) {
  const words = search.toLowerCase().split(/\s+/).filter(Boolean);
  const text = [workflow.title, workflow.slug, workflow.description, group?.name, ...workflow.tables, ...workflow.providers].join(" ").toLowerCase();
  return words.every((word) => text.includes(word));
}

export const flatten = (nodes: Node[]): ListedWorkflow[] => nodes.flatMap((n) => [n.workflow, ...flatten(n.stages)]);

/**
 * The page's structure: the groups in file order, then the workflows in no group (by title). Inside each, the
 * workflows that stand on their own in order, each with its stages nested under it in list order. With `keep`, a
 * workflow stays when it passes or a stage below it does, so a match is always shown under its pipeline; a section
 * with nothing left is left out. `members` is the whole section, for its header.
 */
export function sections(workflows: ListedWorkflow[], groups: Group[], keep?: (w: ListedWorkflow, g?: Group) => boolean): Section[] {
  const byId = new Map(workflows.map((w) => [w.id, w]));
  const children = new Map<string, ListedWorkflow[]>();
  for (const w of workflows)
    if (w.parent && byId.has(w.parent)) children.set(w.parent, [...(children.get(w.parent) ?? []), w]);
  const tree = (w: ListedWorkflow, seen = new Set<string>()): Node =>
    ({ workflow: w, stages: seen.has(w.id) ? [] : (children.get(w.id) ?? []).map((s) => tree(s, new Set(seen).add(w.id))) });
  const prune = (node: Node, group?: Group): Node[] => {
    const stages = node.stages.flatMap((s) => prune(s, group));
    if (!keep || keep(node.workflow, group)) return [{ ...node, stages }];
    return stages.length ? [{ ...node, stages, context: true }] : [];
  };
  const root = (w: ListedWorkflow) => !w.parent || !byId.has(w.parent);
  const grouped = new Set(groups.flatMap((g) => g.workflows));
  const result: Section[] = groups.map((group) => {
    const nodes = group.workflows.flatMap((id) => byId.get(id) ?? []).filter(root).map((w) => tree(w));
    return { group, members: flatten(nodes), nodes: nodes.flatMap((n) => prune(n, group)) };
  });
  const other = workflows.filter((w) => !grouped.has(w.id) && root(w)).sort((a, b) => a.title.localeCompare(b.title)).map((w) => tree(w));
  result.push({ group: undefined, members: flatten(other), nodes: other.flatMap((n) => prune(n)) });
  return result.filter((section) => section.nodes.length);
}

/** A section header's state, all derived: how many are failing and how many running. */
export function rollUp(members: ListedWorkflow[], runs: LastRuns | undefined) {
  return {
    failing: members.filter((w) => passes("failing", w, runs)).length,
    running: members.filter((w) => passes("running", w, runs)).length,
  };
}

export function ago(value: string | number | Date, now = Date.now()) {
  const seconds = Math.max(0, Math.round((now - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** A Vercel Cron expression (UTC) in words when it is a plain daily or weekly time; otherwise the expression itself. */
export function cronText(cron: string) {
  const [minute, hour, day, month, weekday, ...rest] = cron.trim().split(/\s+/);
  const time = /^\d+$/.test(minute) && /^\d+$/.test(hour) ? `${hour.padStart(2, "0")}:${minute.padStart(2, "0")} UTC` : undefined;
  if (!rest.length && time && day === "*" && month === "*") {
    if (weekday === "*") return `Daily ${time}`;
    if (/^[0-6]$/.test(weekday)) return `${DAYS[Number(weekday)]} ${time}`;
    if (weekday === "1-5") return `Weekdays ${time}`;
  }
  return `Cron ${cron}`;
}

/** How a workflow starts, for its own page: its schedule, a webhook, the workflows that start it, else by hand. */
export function startsText(trigger: { schedule?: string; webhook?: boolean; startedBy?: string[] } = {}) {
  const parts = [
    ...(trigger.schedule ? [cronText(trigger.schedule)] : []),
    ...(trigger.webhook ? ["Webhook"] : []),
    ...(trigger.startedBy?.length ? [`Started by ${trigger.startedBy.join(", ")}`] : []),
  ];
  return parts.length ? parts.join(" · ") : "Manual";
}
