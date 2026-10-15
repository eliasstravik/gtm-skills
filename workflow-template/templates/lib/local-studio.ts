import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer as createHttpServer, request as httpRequest, type Server } from "node:http";
import { createServer, type AddressInfo } from "node:net";
import { join } from "node:path";
import { recordStudioShare, removeStudioShare } from "../scripts/studio-share.mjs";

/**
 * Drizzle Studio on this computer's database, started by the local viewer's Open database button and stopped with
 * `npm run dev`. One per dev server: a second press reuses it. Studio listens on 127.0.0.1 only.
 *
 * In tailnet mode the button is pressed on another device, where local.drizzle.studio would look for Studio on that
 * device's own localhost. So Studio is also shared on the tailnet: Tailscale Serve on a free HTTPS port, never Funnel,
 * in front of a loopback gate that lets only the owner's Tailscale login through (Studio can edit every row).
 */
let studio: Promise<number> | undefined;
let shared: Promise<string> | undefined;
let studioPort = 0;

const STUDIO_URL = /https:\/\/local\.drizzle\.studio\S*/;
const DEFAULT_PORT = 4983;
/** First HTTPS port tried for the tailnet share; ports other shares already use are skipped. */
const SERVE_PORT = 8443;

/** The first free loopback port from Studio's default, so two workspaces' Studios do not collide. */
async function freePort(from = DEFAULT_PORT): Promise<number> {
  for (let port = from; port < from + 20; port++) {
    const free = await new Promise<boolean>((resolve) => {
      const server = createServer()
        .once("error", () => resolve(false))
        .listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
    });
    if (free) return port;
  }
  throw new Error("No free port for Drizzle Studio.");
}

/** The address the Open database button sends the browser to: plain Studio locally, the tailnet share in tailnet mode. */
export async function openStudio(tailnet?: { owner: string; host: string } | null, dir = process.cwd()): Promise<string> {
  const port = (studioPort = await startStudio(dir));
  if (!tailnet) return `https://local.drizzle.studio/?port=${port}`;
  // The share outlives a Studio restart: its gate always relays to the current Studio.
  shared ??= shareStudio(() => studioPort, tailnet, dir).then((url) => {
    // Best effort when a reload replaces this worker; `npm run dev` removes it for certain when it stops.
    process.once("exit", () => removeStudioShare(dir));
    return url;
  }, (error) => {
    shared = undefined;
    throw error;
  });
  return shared;
}

function startStudio(dir: string): Promise<number> {
  studio ??= (async () => {
    const script = join(dir, "scripts", "studio.mjs");
    if (!existsSync(script)) throw new Error("Run npm run db:studio in the workflows folder.");
    const port = await freePort();
    const child = spawn(process.execPath, [script, "--port", String(port)], {
      cwd: dir,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stop = () => child.kill();
    process.once("exit", stop);
    return await new Promise<number>((resolve, reject) => {
      let output = "";
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error("Drizzle Studio did not start. Run npm run db:studio to see why."));
      }, 30_000);
      const read = (chunk: Buffer) => {
        // Strip colour codes before looking for the address Studio prints once it is ready.
        output = (output + chunk.toString()).replace(/\x1b\[[0-9;]*m/g, "").slice(-4000);
        if (STUDIO_URL.test(output)) {
          clearTimeout(timer);
          resolve(port);
        }
      };
      child.stdout.on("data", read);
      child.stderr.on("data", read);
      child.once("exit", () => {
        clearTimeout(timer);
        process.off("exit", stop);
        studio = undefined;
        const reason = output.trim().split("\n").at(-1);
        reject(new Error(`Drizzle Studio stopped${reason ? `: ${reason}` : "."}`));
      });
    });
  })().catch((error) => {
    studio = undefined;
    throw error;
  });
  return studio;
}

export type Tailscale = (args: string[]) => Promise<string>;
const tailscaleCli: Tailscale = (args) =>
  new Promise((resolve, reject) =>
    execFile("tailscale", args, { timeout: 15_000 }, (error, stdout, stderr) =>
      error ? reject(new Error(`tailscale ${args.join(" ")}: ${(stderr || error.message).trim()}`)) : resolve(stdout)));

type ServeStatus = { TCP?: Record<string, unknown>; Web?: Record<string, { Handlers?: Record<string, { Proxy?: string }> }>; AllowFunnel?: Record<string, boolean> };

/**
 * Share Studio (on loopback `port`, a function when Studio's port can change) with the owner over the tailnet and
 * return the local.drizzle.studio address for it. Takes the first HTTPS port no existing share uses, so nothing already
 * shared is replaced, and records the share in `dir` so `npm run dev` removes it when it stops. Tests pass stand-ins
 * for the tailscale command.
 */
export async function shareStudio(port: number | (() => number), tailnet: { owner: string; host: string }, dir: string,
  tailscale = tailscaleCli, tailscaleSync?: (args: string[]) => string) {
  const gate = await studioGate(port, tailnet.owner);
  try {
    // One a crash or a reload left behind goes first.
    removeStudioShare(dir, tailscaleSync);
    const host = tailnet.host.split(":")[0];
    const status = async () => JSON.parse((await tailscale(["serve", "status", "--json"])) || "{}") as ServeStatus;
    const used = new Set(Object.keys((await status()).TCP ?? {}).map(Number));
    used.add(Number(tailnet.host.split(":")[1] ?? 443));
    let https = SERVE_PORT;
    while (used.has(https)) https++;
    const target = `http://127.0.0.1:${(gate.address() as AddressInfo).port}`;
    await tailscale(["serve", "--bg", `--https=${https}`, target]);
    recordStudioShare(dir, { host, https, target });
    const after = await status();
    if (after.Web?.[`${host}:${https}`]?.Handlers?.["/"]?.Proxy !== target) throw new Error("Tailscale Serve did not take the Studio share.");
    if (after.AllowFunnel?.[`${host}:${https}`]) {
      removeStudioShare(dir, tailscaleSync);
      throw new Error("Funnel is on for that port; Studio is never public.");
    }
    return `https://local.drizzle.studio/?host=${host}&port=${https}`;
  } catch (error) {
    gate.close();
    throw new Error(`Could not share Drizzle Studio on the tailnet. ${(error as Error).message}`);
  }
}
/** A loopback relay to Studio that lets through only requests Tailscale Serve marks with the owner's login. */
export async function studioGate(port: number | (() => number), owner: string): Promise<Server> {
  const server = createHttpServer((req, res) => {
    const login = String(req.headers["tailscale-user-login"] ?? "").trim().toLowerCase();
    if (req.headers["tailscale-funnel-request"] || login !== owner.trim().toLowerCase()) {
      res.writeHead(403, { "content-type": "text/plain" }).end("Only the workspace owner's Tailscale login opens the database.");
      return;
    }
    const upstream = httpRequest({ host: "127.0.0.1", port: typeof port === "number" ? port : port(), method: req.method, path: req.url, headers: req.headers }, (answer) => {
      res.writeHead(answer.statusCode ?? 502, answer.headers);
      answer.pipe(res);
    });
    upstream.once("error", () => res.headersSent ? res.destroy() : res.writeHead(502).end("Drizzle Studio is not running."));
    req.pipe(upstream);
  });
  await new Promise<void>((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolve));
  server.unref();
  return server;
}
