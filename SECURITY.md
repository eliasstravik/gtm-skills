# Security policy

## Report a vulnerability

Email `elias@eliasstravik.com` with the affected skill or file, the impact, reproduction steps, and any suggested mitigation. Do not open a public issue for an unpatched vulnerability or include live credentials in the report.

## Secret handling

Secrets enter through ignored environment files, shell input, or host-brokered headers. They do not belong in prompts, conversations, tracked files, workflow step input or output, cache inputs, ledgers, comments, or command output.

Hosted mode keeps production run credentials, database write credentials, and other write capabilities in the host. The model receives only the bounded access needed to author, validate, dry-run, and inspect. It cannot start a real hosted run without the host's separate approval-gated control.

If a credential appears in a conversation or tracked file, treat it as compromised. Revoke or rotate it, then store the replacement through the environment.

## Local model trust boundary

A local model backend runs with the operating-system access granted to its host process. Only a backend that enforces `tools: "none"` may receive untrusted row or provider content. The workflow stops before spawning a backend that cannot enforce that restriction unless the operator explicitly accepts host-default tool access for trusted input.

Local environment isolation remains the operator's responsibility. Keep workflow credentials in the ignored environment files named by the workflow contract, restrict their file permissions, and review any backend-specific access before a real run.

## Defensive redaction

The v10 workflow library redacts error text before it reaches the paid-call ledger, run rows, route responses, or command output. It removes URL query strings, bearer values, sensitive assignments such as keys and passwords, and values matching non-empty environment variables whose names end in `_KEY`, `_TOKEN`, or `_SECRET`. It limits retained error text to 500 characters.

Redaction is a fallback, not a storage mechanism for secrets. Adapters should throw short errors without request URLs or credentials, and callers should keep secret values out of workflow data from the start.

## Supported versions

The current skill and workflow-library versions are listed in [VERSIONS.md](VERSIONS.md). Security fixes target the current release. Upgrade older workflow projects through the skill's reviewed recopy and migration path.
