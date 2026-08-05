# GTM Context

This repository is the durable GTM context for one organization.

## Shape

- The root and every `suborgs/<slug>/` organization node has `org.md`; suborganizations may nest.
- People live only at root in `people/<person-slug>/person.md`. Their optional `Suborgs:` line lists affiliations.
- Slugs are lowercase kebab-case. Each `org.md` and `person.md` H1 is the display name; every person has an `Email:` line.
- Do not keep machine state, registries, pins, empty directories, or placeholder files.

## Changes

- Work only on `main`.
- Preview durable changes in chat and write them only after acceptance.
- Commit each accepted artifact. Git history is the undo mechanism.
- Persist accepted changes with the durable-write mechanism your environment declares; otherwise, if a remote exists, pull with rebase and push. Never force-push, and never report an unsaved change as saved.
