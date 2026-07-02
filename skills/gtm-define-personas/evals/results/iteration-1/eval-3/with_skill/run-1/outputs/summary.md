# gtm-define-personas eval: missing ICP prerequisite

- GTM home: <temporary>/gtm-home
- Project: northstar-compliance
- Workspace: fintech-compliance-outbound
- Pass rate: 3/3

## Assertions

- PASS: The output says the workspace has no usable workspaces/fintech-compliance-outbound/icps.md and routes to gtm-define-icp. - Transcript contains the missing-ICP prerequisite message and routes to gtm-define-icp.
- PASS: No personas.md file is created. - No personas.md file exists in the active workspace.
- PASS: No new commit is created after the fixture initialization commit. - Initial commit 1918ebbd remained HEAD.
