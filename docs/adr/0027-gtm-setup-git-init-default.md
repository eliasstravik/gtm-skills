# ADR 0027: `gtm-setup` initializes git by default

## Status

Accepted, amended by ADR 0028

## Context

GTM Context Projects are intended to be durable context repositories. They may be local-only or pushed to a remote such as GitHub for team sharing. Git history is useful even for local workflows. Remotes are user/team decisions; initial setup commits are created by default after setup completes.

## Decision

`gtm-setup` initializes git by default for new GTM Context Project folders.

Rules:

1. If the project folder is not a git repository, run `git init` by default.
2. If the folder already has `.git/`, leave it alone.
3. Do not create a remote by default.
4. After successful setup, create an initial commit by default as specified in ADR 0028.
5. If the user explicitly asks for local-only/no-git, allow skipping git initialization.
6. If the user asks to connect to GitHub or another remote, treat that as a separate explicit step.

## Consequences

- Context projects are ready for versioning and team sharing.
- Setup remains safe because it creates no remote by default and commits only scaffolded durable context files.
- Users who do not want git can opt out.
