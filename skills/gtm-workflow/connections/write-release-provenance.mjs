import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { componentSource, sourceDigest, sourceProvenance } from "./local/install.mjs";
import { requireThat } from "./src/errors.mjs";

// Run after committing the reviewed component and synchronized shared files.
// The following metadata-only commit packages that source for skill installers
// which copy the skill directory without its Git checkout.
const provenance = sourceProvenance(componentSource);
requireThat(provenance.sourceCommit && !provenance.development, "commit_component_before_provenance", 409);
const { version } = JSON.parse(await readFile(join(componentSource, "package.json"), "utf8"));
await writeFile(join(componentSource, "release.json"), JSON.stringify({ version, sourceCommit: provenance.sourceCommit, sourceDigest: await sourceDigest(componentSource) }, null, 2) + "\n");
console.log(JSON.stringify({ status: "release_provenance_written", version, sourceCommit: provenance.sourceCommit }));
