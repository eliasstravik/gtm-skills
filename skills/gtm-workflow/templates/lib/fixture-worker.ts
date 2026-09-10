// gtm-lib v22
// Executed only by gtm check in a credential-free, read-only child process.
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { syncBuiltinESMExports } from "node:module";
import net from "node:net";
import tls from "node:tls";
import http from "node:http";
import https from "node:https";
import dgram from "node:dgram";
import workers from "node:worker_threads";
import { isDeepStrictEqual } from "node:util";

const blocked = () => { throw new Error("Fixture row checks cannot use the network"); };
globalThis.fetch = blocked;
net.Socket.prototype.connect = blocked;
tls.connect = blocked;
http.request = http.get = https.request = https.get = blocked;
dgram.Socket.prototype.send = dgram.Socket.prototype.connect = blocked;
// The loader has already created its compiler worker; authored code gets no new workers.
Object.defineProperty(workers, "Worker", { value: class { constructor() { throw new Error("Fixture row checks cannot create workers"); } } });
syncBuiltinESMExports();

const [workflow, fixtures, namesJson] = process.argv.slice(2);
const warnings: string[] = [];
let checked = 0;
let fixturesLoaded = false;
try {
  const cases = JSON.parse(await readFile(fixtures, "utf8"));
  fixturesLoaded = true;
  if (!Array.isArray(cases)) throw new Error(`${fixtures} must contain an array`);
  const loaded = await import(pathToFileURL(workflow).href);
  for (const step of JSON.parse(namesJson) as string[]) {
    const rows = cases.filter((item) => item.step === step);
    if (!rows.length) { warnings.push(`SHOULD FIX: Add a row for ${step} in ${fixtures}`); continue; }
    if (typeof loaded[step] !== "function") throw new Error(`Export ${step} to check it against ${fixtures}`);
    for (const fixture of rows) {
      try {
        const value = await loaded[step](fixture.row, { runKey: "fixture", slug: "fixture", rowKey: fixture.row?.key, step }, AbortSignal.timeout(5_000));
        if (!Object.hasOwn(fixture, "expected")) throw new Error(`Add expected output for ${step} in ${fixtures}`);
        if (!isDeepStrictEqual(value, fixture.expected)) throw new Error(`Fixture output differs for ${step}`);
        checked++;
      } catch (error) {
        if (error instanceof Error && error.message.includes("fixture_missing:")) warnings.push(`SHOULD FIX: ${error.message}`);
        else throw error;
      }
    }
  }
  process.stdout.write(JSON.stringify({ checked, warnings }));
} catch (error) {
  if (!fixturesLoaded && (error as NodeJS.ErrnoException).code === "ENOENT") process.stdout.write(JSON.stringify({ checked, warnings: [`SHOULD FIX: Add ${fixtures} with row-step inputs and expected outputs`] }));
  else { process.stderr.write(error instanceof Error ? error.message : "Fixture check failed"); process.exitCode = 1; }
}
