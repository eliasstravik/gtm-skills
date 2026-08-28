# Runtime upgrade procedure

Use this procedure for every change to a version recorded in `skills/gtm-workflow/templates/package.json` under `gtm.validatedAgainst`.

1. Record the current and proposed versions. Read the pinned package's release notes for every release between them. Note behavior changes that affect managed files, local recovery, inspection, engine support, persistence, hooks, or deployment.
2. List the known workarounds before editing a pin:

   ```sh
   python3 evals/run_quality.py --temporary
   ```

   Check each listed removal condition against the proposed version. Remove a marker only when its workaround is gone and a test covers the supported replacement.
3. Update the dependency pin and lockfile. Update the matching value under `gtm.validatedAgainst`. If a managed file changes, bump the library version and refresh its `gtm.libHashes` entry through the normal release process.
4. Run the deterministic template suite:

   ```sh
   node --test evals/gtm-workflow/scripts/test-templates.mjs
   ```

5. Run routing, description, and workaround checks:

   ```sh
   python3 evals/run_quality.py
   ```

6. Run `npm run gtm -- check` in a fresh copy of the template. Confirm that the installed versions match `gtm.validatedAgainst` and that every managed-file hash passes.
7. Record the upgrade result in the version-defect paragraph of `skills/gtm-workflow/references/contract.md`. State which defects the new library version fixes, which workarounds remain, and the version that should trigger the next review.

Do not merge a pin change with an unexplained marker removal or a stale `gtm.validatedAgainst` value.
