import { getTableName } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { tables as workspaceTables } from "../db/tables";
import { cache } from "./schema/cache";
import { profileAttempts, profileInputs, profileRuns, profileWork } from "./schema/ledger";
import { companies, people, profileIdentifiers } from "./schema/profiles";
import { gtmViewerGrants } from "./schema/viewer-grants";

/** Runtime tables: schema gtm, owned by the template, migrated from drizzle-runtime/. */
export const runtimeTables = { cache, people, companies, profileIdentifiers, profileRuns, profileWork, profileAttempts, profileInputs, gtmViewerGrants };

/** A workspace table may not reuse a runtime table's registry name or SQL name. */
export function mergeTables<W extends Record<string, PgTable>>(workspace: W) {
  const reserved = new Set<string>(Object.values(runtimeTables).map((t) => getTableName(t)));
  for (const [name, t] of Object.entries(workspace)) {
    if (name in runtimeTables || reserved.has(getTableName(t)))
      throw new Error(`Table name ${name in runtimeTables ? name : getTableName(t)} is reserved by the runtime; rename the workspace table in db/tables/`);
  }
  return { ...runtimeTables, ...workspace };
}

/** Registry by name: steps receive table names (strings) and resolve them here. */
export const tables = mergeTables(workspaceTables);
