import { and, eq, inArray, sql } from "drizzle-orm";
import { writeTransaction, type Executor } from "../db";
import { profileAttempts, profileInputs, profileRuns, profileWork } from "../schema/ledger";
import { companies, people, profileIdentifiers } from "../schema/profiles";

/** Remove one network import's membership and orphaned canonical records without touching shared profiles. */
export async function resetNetworkData(client: Executor, workflowId: string) {
  return writeTransaction(client, async (tx) => {
    const membership = JSON.stringify([{ workflow_id: workflowId }]);
    const targeted = await tx
      .select({ key: people.key, sources: people.sources_json, experiences: people.experiences_json })
      .from(people)
      .where(sql`${people.sources_json} @> ${membership}::jsonb`);
    const candidateCompanies = new Set<string>();
    let peopleDeleted = 0;
    let peopleUnlinked = 0;
    for (const row of targeted) {
      const experiences = Array.isArray(row.experiences) ? row.experiences : [];
      for (const role of experiences) {
        if (role && typeof role === "object" && typeof (role as { company_key?: unknown }).company_key === "string")
          candidateCompanies.add((role as { company_key: string }).company_key);
      }
      const remaining = (Array.isArray(row.sources) ? row.sources : []).filter(
        (source) => !(source && typeof source === "object" && (source as { workflow_id?: unknown }).workflow_id === workflowId),
      );
      if (remaining.length) {
        await tx.update(people).set({ sources_json: remaining }).where(eq(people.key, row.key));
        peopleUnlinked += 1;
      } else {
        await tx.delete(profileIdentifiers).where(and(eq(profileIdentifiers.entity, "people"), eq(profileIdentifiers.key, row.key)));
        await tx.delete(people).where(eq(people.key, row.key));
        peopleDeleted += 1;
      }
    }

    const referenced = await tx.execute(sql`
      SELECT DISTINCT role->>'company_key' AS key
      FROM gtm.people p,
        jsonb_array_elements(CASE WHEN jsonb_typeof(p.experiences_json) = 'array' THEN p.experiences_json ELSE '[]'::jsonb END) AS role
      WHERE role->>'company_key' IS NOT NULL
    `);
    const stillReferenced = new Set(
      (referenced.rows as { key: string | null }[]).map((row) => row.key).filter((key): key is string => Boolean(key)),
    );
    const orphanedCompanies = [...candidateCompanies].filter((key) => !stillReferenced.has(key));
    if (orphanedCompanies.length) {
      await tx.delete(profileIdentifiers).where(and(eq(profileIdentifiers.entity, "companies"), inArray(profileIdentifiers.key, orphanedCompanies)));
      await tx.delete(companies).where(inArray(companies.key, orphanedCompanies));
    }

    const runs = await tx.select({ id: profileRuns.id }).from(profileRuns).where(eq(profileRuns.workflow_id, workflowId));
    const runIds = runs.map((run) => run.id);
    if (runIds.length) {
      await tx.delete(profileAttempts).where(inArray(profileAttempts.run_id, runIds));
      await tx.delete(profileWork).where(inArray(profileWork.run_id, runIds));
      await tx.delete(profileRuns).where(inArray(profileRuns.id, runIds));
    }
    const inputs = await tx.delete(profileInputs).where(eq(profileInputs.workflow_id, workflowId)).returning({ row_id: profileInputs.row_id });
    return {
      peopleDeleted,
      peopleUnlinked,
      companiesDeleted: orphanedCompanies.length,
      runsDeleted: runIds.length,
      inputsDeleted: inputs.length,
    };
  });
}
