# gtm-lead-scoring eval: missing scoring criteria preview

- GTM home: <temporary>/gtm-home
- Project: northstar-compliance
- Workspace: fintech-compliance-outbound
- Pass rate: 3/3

## Assertions

- PASS: The output previews creating workspaces/fintech-compliance-outbound/scoring.md from workspace context, personas.md, and ADR 0006 fit bands. - Preview names scoring.md, personas.md, ADR 0006 fit bands, and creation scope.
- PASS: The preview says no lead scores will be finalized until criteria are confirmed and asks Proceed? - Preview blocks finalized scoring until confirmation and asks for approval.
- PASS: No scoring.md file is created before confirmation and no new commit is created after fixture initialization. - scoring.md exists=False; commit count=1; git status=<clean>.
