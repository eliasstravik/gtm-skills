// Local only: while the dev server runs, a new or changed migration under drizzle/ (from `npm run db:generate`) is
// applied to the local database, so a new table or column works on the next run without restarting `npm run dev`.
// Hosted, migrations run in each production build.
import { existsSync, watch } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";

/** Migration children get no keys, as in scripts/local-launch.mjs: nothing a migration does needs one. */
const withoutKeys = (env) => Object.fromEntries(Object.entries(env).filter(([name]) => !/(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/i.test(name)));

export const migrateWatch = {
  name: "gtm-migrate-watch",
  setup(nitro) {
    if (!nitro.options.dev) return;
    const cwd = nitro.options.rootDir;
    const folder = join(cwd, "drizzle");
    if (!existsSync(folder)) return;
    let child, queued = false, timer;
    const apply = () => {
      if (child) return void (queued = true);
      queued = false;
      let output = "";
      child = spawn(process.execPath, ["scripts/migrate.mjs"], { cwd, env: withoutKeys(process.env), stdio: ["ignore", "pipe", "pipe"] });
      child.stdout.on("data", (chunk) => (output += chunk));
      child.stderr.on("data", (chunk) => (output += chunk));
      child.on("close", (code) => {
        child = undefined;
        // drizzle-kit writes the journal before the SQL file, so a first try can miss the file; the next write retries.
        if (code) console.error(`[gtm] New migration not applied; runs that use its tables fail until it is. Fix it and save again, or restart npm run dev.\n${output.trim().split("\n").slice(-5).join("\n")}`);
        else console.log("[gtm] Migrations applied");
        if (queued) apply();
      });
    };
    const watcher = watch(folder, { recursive: true }, (_event, file) => {
      if (!file || !/\.(?:sql|json)$/.test(file)) return;
      clearTimeout(timer);
      timer = setTimeout(apply, 300);
    });
    nitro.hooks.hook("close", () => {
      clearTimeout(timer);
      watcher.close();
      child?.kill();
    });
  },
};
