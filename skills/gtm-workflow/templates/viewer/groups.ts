/** The Workflows page's arithmetic, without React or the page's location, so it can be tested on its own. */
export type ListedWorkflow = {
  id: string; slug: string; title: string; description?: string;
  trigger: { schedule?: string; webhook?: boolean; startedBy?: string[] };
  tables: string[]; providers: string[];
};
export type Group = { id: string; name: string; description: string; workflows: string[] };
export type LastRun = { id: string; status: string; createdAt: string; startedAt?: string; completedAt?: string; stage?: boolean };
export type LastRuns = Record<string, LastRun | null | "unknown">;
export type Filter = "all" | "scheduled" | "failing" | "week";
export const FILTERS: [Filter, string][] = [["all", "All"], ["scheduled", "Scheduled"], ["failing", "Failing"], ["week", "Ran this week"]];
const WEEK = 7 * 86400000;

export const lastRun = (runs: LastRuns | undefined, id: string) => {
  const run = runs?.[id];
  return run && run !== "unknown" ? run : undefined;
};
export const active = (run?: LastRun) => Boolean(run && ["pending", "running"].includes(run.status));

/** The fixed chips: computed from the build and the last runs, never hand-tagged. */
export function passes(filter: Filter, workflow: ListedWorkflow, runs: LastRuns | undefined, now = Date.now()) {
  const run = lastRun(runs, workflow.id);
  if (filter === "scheduled") return Boolean(workflow.trigger.schedule);
  if (filter === "failing") return run?.status === "failed";
  if (filter === "week") return Boolean(run && now - new Date(run.createdAt).getTime() < WEEK);
  return true;
}

/** Search over what a person remembers a workflow by: its name, purpose, group, tables and providers. */
export function matches(search: string, workflow: ListedWorkflow, group?: Group) {
  const words = search.toLowerCase().split(/\s+/).filter(Boolean);
  const text = [workflow.title, workflow.slug, workflow.description, group?.name, ...workflow.tables, ...workflow.providers].join(" ").toLowerCase();
  return words.every((word) => text.includes(word));
}

/**
 * The groups in file order, each with its workflows in file order, then Other for workflows in no group. A group with
 * no workflow left after filtering is left out. `preview` puts failing and running workflows first, for the home
 * page's first few rows.
 */
export function sections(workflows: ListedWorkflow[], groups: Group[], keep: (w: ListedWorkflow, g?: Group) => boolean, runs?: LastRuns, preview = false) {
  const byId = new Map(workflows.map((w) => [w.id, w]));
  const grouped = new Set(groups.flatMap((g) => g.workflows));
  const order = (list: ListedWorkflow[]) => preview
    ? list.map((w, i) => ({ w, i, first: lastRun(runs, w.id)?.status === "failed" || active(lastRun(runs, w.id)) }))
        .sort((a, b) => Number(b.first) - Number(a.first) || a.i - b.i).map((x) => x.w)
    : list;
  const result = groups.map((group) => ({
    group: group as Group | undefined,
    all: group.workflows.flatMap((id) => byId.get(id) ?? []),
    workflows: order(group.workflows.flatMap((id) => { const w = byId.get(id); return w && keep(w, group) ? [w] : []; })),
  }));
  const other = workflows.filter((w) => !grouped.has(w.id)).sort((a, b) => a.title.localeCompare(b.title));
  result.push({ group: undefined, all: other, workflows: order(other.filter((w) => keep(w))) });
  return result.filter((section) => section.workflows.length);
}

/** One line for a group's header: size, newest run, failures and tables, all derived. */
export function rollUp(members: ListedWorkflow[], runs: LastRuns | undefined, now = Date.now()) {
  const last = members.map((w) => lastRun(runs, w.id)).filter((r): r is LastRun => Boolean(r))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  const failing = members.filter((w) => lastRun(runs, w.id)?.status === "failed").length;
  const running = members.filter((w) => active(lastRun(runs, w.id))).length;
  const tables = new Set(members.flatMap((w) => w.tables)).size;
  return [
    `${members.length} workflow${members.length === 1 ? "" : "s"}`,
    ...(runs ? [last ? `last run ${ago(last.createdAt, now)}` : "no runs yet"] : []),
    ...(running ? [`${running} running`] : []),
    ...(failing ? [`${failing} failing`] : []),
    ...(tables ? [`${tables} table${tables === 1 ? "" : "s"}`] : []),
  ].join(" · ");
}

export function ago(value: string | number | Date, now = Date.now()) {
  const seconds = Math.max(0, Math.round((now - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
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
