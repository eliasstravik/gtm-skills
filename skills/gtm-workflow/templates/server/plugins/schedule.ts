import { Cron } from "croner";
import { definePlugin } from "nitro";
import { start } from "workflow/api";
import { workflows } from "../../workflows";
import vercelJson from "../../vercel.json";

/**
 * Local stand-in for Vercel Cron: while the dev server runs, each vercel.json cron starts its workflow
 * with defaultInput, in UTC like Vercel. Off on Vercel, where Vercel Cron calls GET /api/run/<slug>.
 */
export default definePlugin(() => {
  if (process.env.VERCEL) return;
  for (const { path, schedule } of vercelJson.crons as { path: string; schedule: string }[]) {
    const slug = path.replace(/^\/api\/run\//, "");
    const wf = workflows[slug as keyof typeof workflows];
    if (!wf) {
      console.warn(`[gtm] vercel.json schedules unknown workflow ${slug}`);
      continue;
    }
    new Cron(schedule, { timezone: "UTC", protect: true }, async () => {
      const run = await start(wf.run as never, [wf.defaultInput] as never);
      console.log(`[gtm] scheduled run of ${slug} started: ${run.runId}`);
    });
    console.log(`[gtm] local schedule: ${slug} at "${schedule}" UTC`);
  }
});
