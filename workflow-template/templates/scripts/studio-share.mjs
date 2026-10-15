// The tailnet share the local viewer makes for Drizzle Studio (lib/local-studio.ts), recorded so it never outlives the
// dev server: `npm run dev` removes it when it stops, and the next share removes one a crash left behind. A leftover
// would hand the next program to take that loopback port to the whole tailnet.
import { spawnSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const file = (dir) => join(dir, "node_modules", ".gtm-studio-share.json");
const tailscaleSync = (args) => {
  const result = spawnSync("tailscale", args, { encoding: "utf8", timeout: 15_000 });
  if (result.status !== 0) throw new Error(`tailscale ${args.join(" ")}: ${(result.stderr || result.error?.message || "").trim()}`);
  return result.stdout;
};

/** Record a share this dev server made: `https` on `host` proxies to `target`. */
export function recordStudioShare(dir, share) {
  writeFileSync(file(dir), JSON.stringify(share));
}

/** Remove the recorded share, only while Serve still points that port at the recorded target. Never throws. */
export function removeStudioShare(dir, tailscale = tailscaleSync) {
  let share;
  try { share = JSON.parse(readFileSync(file(dir), "utf8")); } catch { return; }
  try {
    const status = JSON.parse(tailscale(["serve", "status", "--json"]) || "{}");
    if (status.Web?.[`${share.host}:${share.https}`]?.Handlers?.["/"]?.Proxy === share.target)
      tailscale(["serve", `--https=${share.https}`, "off"]);
    rmSync(file(dir), { force: true });
  } catch {}
}
