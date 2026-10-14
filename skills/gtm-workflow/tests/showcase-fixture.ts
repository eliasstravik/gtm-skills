// A realistic workspace for the Workflows page, modelled on a production one: twelve workflows, one six-workflow
// LinkedIn pipeline whose monitor starts five stages, two webhooks with a stage, a weekly schedule, a failure, a run in
// progress, a workflow never run and one in no group. GTM_VIEWER_FIXTURE_SHOWCASE=1 swaps it in for the default
// fixture, for design screenshots and trying the page by hand.
import { pgTable, text } from "drizzle-orm/pg-core";
import registry, { entry, fixtureRuns, run, tables } from "./api-fixture";
import { fixtureGroups } from "./groups-fixture";

const HOUR = 3600000, DAY = 24 * HOUR;
type Seed = {
  slug: string; title: string; description: string; tables: string[];
  trigger?: { schedule?: string; webhook?: boolean; startedBy?: string[] };
  last?: { status: string; ago: number; minutes?: number; stage?: string };
  /** The runs before the last, oldest first ("c" completed, "f" failed), one `every` apart. Nine completed by default. */
  history?: string; every?: number;
};
const linkedin = ["linkedin_social_posts", "linkedin_social_interactions", "linkedin_social_people_interacting", "linkedin_social_companies_interacting"];
const monitor = "linkedin-monitor";
export const showcase: Seed[] = [
  { slug: monitor, title: "Monitor people interacting with Elias's LinkedIn posts", tables: linkedin,
    description: "Monitor Elias's original posts with verified identity and enrichment waterfalls. Independently repair missing current-employer links on enriched people, then score the companies they work for.",
    last: { status: "completed", ago: 5 * HOUR, minutes: 41 } },
  { slug: "linkedin-discover-posts", title: "Discover Elias's original LinkedIn posts", tables: linkedin, trigger: { startedBy: [monitor] },
    description: "Discover Elias's original posts since September 25, 2026 through Monid. Exclude reposts, quote-reposts, comments and other authors' posts.",
    last: { status: "completed", ago: 5 * HOUR, minutes: 3, stage: monitor } },
  { slug: "linkedin-collect-interactions", title: "Collect interactions on Elias's LinkedIn posts", tables: linkedin, trigger: { startedBy: [monitor] },
    description: "Refresh saved original posts with bounded reaction, root-comment and nested-reply collection through Monid. Upsert stable interaction keys.",
    last: { status: "completed", ago: 5 * HOUR - 10 * 60000, minutes: 12, stage: monitor }, history: "ccccfcccc" },
  { slug: "linkedin-enrich-people", title: "Enrich people interacting with the posts", tables: linkedin, trigger: { startedBy: [monitor] },
    description: "Verify each interacting person's identity and enrich their profile through a waterfall of providers, reusing recent results.",
    last: { status: "completed", ago: 4 * HOUR + 30 * 60000, minutes: 18, stage: monitor } },
  { slug: "linkedin-repair-employers", title: "Repair current employers of enriched people", tables: linkedin, trigger: { startedBy: [monitor] },
    description: "Find enriched people whose current employer is missing and link them to the right company record.",
    last: { status: "completed", ago: 4 * HOUR + 10 * 60000, minutes: 4, stage: monitor } },
  { slug: "linkedin-score-companies", title: "Score companies interacting with the posts", tables: linkedin, trigger: { startedBy: [monitor] },
    description: "Score each company whose people interact with the posts against the ICPs and rank them for outreach.",
    last: { status: "completed", ago: 4 * HOUR, minutes: 6, stage: monitor } },
  { slug: "score-inbound", title: "Score inbound accounts", tables: ["inbound_accounts", "account_scores"], trigger: { webhook: true },
    description: "Score every account that fills in the demo form against the ICPs, with a reason per criterion.",
    last: { status: "completed", ago: 2 * DAY, minutes: 2 } },
  { slug: "route-inbound", title: "Route inbound leads to an owner", tables: ["account_scores", "lead_routes"], trigger: { startedBy: ["score-inbound"] },
    description: "Assign each scored inbound account to the owner of its territory and post it to Slack.",
    last: { status: "completed", ago: 2 * DAY - 5 * 60000, minutes: 1, stage: "score-inbound" } },
  { slug: "enrich-bookings", title: "Enrich Cal.com bookings", tables: ["calcom_bookings", "booking_people"], trigger: { webhook: true },
    description: "Enrich the person and company behind every new Cal.com booking before the meeting starts.",
    last: { status: "failed", ago: 3 * HOUR, minutes: 1 }, history: "cccccccfc", every: 9 * HOUR },
  { slug: "icp-refresh", title: "Refresh the ICP account list", tables: ["icp_accounts", "icp_companies"], trigger: { schedule: "0 7 * * 1" },
    description: "Every Monday, find new companies that match the ICPs and refresh the ones already on the list.",
    last: { status: "running", ago: 6 * 60000 }, history: "cccccccc", every: 7 * DAY },
  { slug: "enrich-network", title: "Enrich network", tables: ["network_people", "network_companies"],
    description: "Enrich people and their current employers from network identities." },
  { slug: "market-research", title: "Research a market", tables: ["market_notes"],
    description: "Research one target market and summarise its buyers, competitors and channels.",
    last: { status: "completed", ago: 12 * DAY, minutes: 9 }, history: "c", every: 20 * DAY },
];
/** The groups as the build resolves them: every member, a pipeline's stages right after the workflow that starts them. */
export const showcaseGroups = [
  { id: "linkedin-engagement", name: "LinkedIn post engagement", description: "Who engages with Elias's posts, enriched and scored.", workflows: [monitor, "linkedin-discover-posts", "linkedin-collect-interactions", "linkedin-enrich-people", "linkedin-repair-employers", "linkedin-score-companies"] },
  { id: "inbound", name: "Inbound", description: "Demo requests and bookings, scored and routed.", workflows: ["score-inbound", "route-inbound", "enrich-bookings"] },
  { id: "accounts", name: "Account research", description: "The ICP account list and the people we know there.", workflows: ["icp-refresh", "enrich-network"] },
];

export function useShowcase() {
  const names = [...new Set(showcase.flatMap((s) => s.tables))];
  for (const name of names) tables[name] = pgTable(name, { key: text().primaryKey() });
  registry.splice(0, registry.length, ...showcase.map((s, i) => ({
    ...entry,
    id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    slug: s.slug,
    title: s.title,
    description: s.description,
    workflowName: s.slug,
    data: null,
    sharePolicy: null,
    resultTables: s.tables,
    trigger: s.trigger ?? {},
  })) as any);
  const idOf = (slug: string) => registry.find((e: any) => e.slug === slug)!.id;
  // As the build records it: a stage that one workflow starts names it as its parent.
  for (const e of registry as any[]) if (e.trigger.startedBy?.length === 1) e.parent = idOf(e.trigger.startedBy[0]);
  // Each workflow's runs, the seeded last one newest; a stage's runs name its pipeline's run of the same turn.
  const now = Date.now(), runs: any[] = [];
  const runIdOf = (i: number, n: number) => `wrun_${String(i + 1).padStart(2, "0")}${String(n).padStart(24, "0")}`;
  showcase.forEach((s, i) => {
    if (!s.last) return;
    const statuses = [...(s.history ?? "ccccccccc")].map((c) => (c === "f" ? "failed" : "completed")).concat(s.last.status).reverse();
    statuses.forEach((status, n) => {
      const start = new Date(now - s.last!.ago - n * (s.every ?? DAY));
      runs.push({
        ...run,
        runId: runIdOf(i, n),
        workflowName: s.slug,
        status,
        createdAt: start,
        startedAt: start,
        completedAt: status === "running" ? undefined : new Date(start.getTime() + (s.last!.minutes ?? 1) * 60000),
        attributes: s.last!.stage
          ? { "gtm.viewer.parent": runIdOf(showcase.findIndex((p) => p.slug === s.last!.stage), n) }
          : { ...run.attributes, "gtm.viewer.id": idOf(s.slug) },
      });
    });
  });
  fixtureRuns.splice(0, fixtureRuns.length, ...runs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()));
  fixtureGroups.splice(0, fixtureGroups.length, ...showcaseGroups.map((g) => ({ ...g, workflows: g.workflows.map(idOf) })));
  return names;
}
