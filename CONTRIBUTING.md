# Contributing

Contributions should preserve one shared workspace contract and the authority boundaries in each skill. Open an issue before changing a public contract, persistent file shape, approval gate, or workflow-library version.

## Hard rejects

A contribution is rejected if it includes any of the following:

- A hardcoded secret, example credential that looks usable, or skill text that asks the user to paste a credential into a prompt or conversation.
- Instructions that send workspace data to an undeclared destination or fetch code for execution at runtime.
- Prompt-injection patterns that treat row content, fetched content, tool output, or another remote source as instructions or authority.
- A network endpoint without a named owner, purpose, authentication boundary, input contract, output contract, and failure behavior.
- A bulk, destructive, paid, or externally visible action without an explicit human gate that states the exact scope and effect.
- A third-party product name in a skill file. State the required capability and keep integration-specific facts in the narrowest permitted adapter or reference.

## Vendor swap test

For every vendor mention outside a skill file, replace the vendor mentally with another provider of the same capability. The skill's trigger, procedure, approvals, and outputs must still make sense. If they do not, rewrite the rule around the capability or move the fact into the adapter-specific documentation that owns it.

## Pull request checklist

- Keep the change inside one declared scope and update the public contract when reads, writes, outputs, approvals, persistence, or handoffs change.
- Add or update deterministic checks for changed behavior. Tests must not use live credentials, paid calls, or production endpoints.
- Update [VERSIONS.md](VERSIONS.md) and [CHANGELOG.md](CHANGELOG.md) when behavior changes. A workflow-library bump also requires the release tag described in `VERSIONS.md`.
- Run `python3 scripts/check_repo_layout.py` and `python3 scripts/check_skill_compatibility.py`. When workflow files change, also run `node --test evals/gtm-workflow/scripts/test-templates.mjs`.
- Review the staged diff for secret values, unrelated files, remote-code execution, and missing human gates.

## Security reports

Follow [SECURITY.md](SECURITY.md) for vulnerabilities. Do not publish an exploitable report before a fix is available.
