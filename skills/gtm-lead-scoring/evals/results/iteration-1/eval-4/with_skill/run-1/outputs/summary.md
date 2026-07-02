# gtm-lead-scoring eval: missing persona failure

- GTM home: <temporary>/gtm-home
- Project: northstar-compliance
- Workspace: fintech-compliance-outbound
- Pass rate: 3/3

## Assertions

- PASS: The output says the workspace has no usable workspaces/fintech-compliance-outbound/personas.md and routes to gtm-define-personas. - Transcript contains the missing-personas wording and gtm-define-personas route.
- PASS: No scoring result is produced. - No scoring result files or score fields were produced.
- PASS: No new commit is created after the fixture initialization commit. - Commit count=1; git status=<clean>; scaffold problems=[].
