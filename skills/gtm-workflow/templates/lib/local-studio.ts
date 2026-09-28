import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";

/**
 * Drizzle Studio on this computer's database, started by the local viewer's Open database button and stopped with
 * `npm run dev`. One per dev server: a second press reuses it. Studio listens on 127.0.0.1 only.
 */
let studio: Promise<string> | undefined;

const STUDIO_URL = /https:\/\/local\.drizzle\.studio\S*/;
const DEFAULT_PORT = 4983;

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

export function openStudio(dir = process.cwd()): Promise<string> {
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
    return await new Promise<string>((resolve, reject) => {
      let output = "";
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error("Drizzle Studio did not start. Run npm run db:studio to see why."));
      }, 30_000);
      const read = (chunk: Buffer) => {
        // Strip colour codes before looking for the address Studio prints once it is ready.
        output = (output + chunk.toString()).replace(/\x1b\[[0-9;]*m/g, "").slice(-4000);
        const url = output.match(STUDIO_URL)?.[0];
        if (url) {
          clearTimeout(timer);
          resolve(url);
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
