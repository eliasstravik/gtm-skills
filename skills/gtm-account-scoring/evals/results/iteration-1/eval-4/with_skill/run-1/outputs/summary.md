# gtm-account-scoring eval: missing ICP failure

- GTM home: <temporary>/gtm-home
- Project: northstar-compliance
- Workspace: fintech-compliance-outbound
- Pass rate: 3/3

## Assertions

- PASS: The output says the workspace has no usable workspaces/fintech-compliance-outbound/icps.md and routes to gtm-define-icp. - Transcript contains the missing-ICP wording and gtm-define-icp route.
- PASS: No scoring result is produced. - No scoring result files or score fields were produced.
- PASS: No new commit is created after the fixture initialization commit. - Commit count=1; git status=<clean>; scaffold problems=[].
