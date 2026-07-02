# gtm-account-segmentation eval: missing ICP failure

- GTM home: <temporary>/gtm-home
- Project: northstar-compliance
- Workspace: fintech-compliance-outbound
- Pass rate: 3/3

## Assertions

- PASS: The output says the workspace has no usable workspaces/fintech-compliance-outbound/icps.md and routes to gtm-define-icp. - Transcript contains the missing-ICP wording and gtm-define-icp route.
- PASS: No segmentation result is produced. - No segmentation output files were created in the GTM Context Repository.
- PASS: No new commit is created after the fixture initialization commit. - Commit count=1; git status=<clean>; scaffold problems=[].
