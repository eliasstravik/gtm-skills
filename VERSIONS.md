# Versions and compatibility

This table is the public version record for the installable skills. Version `1.0.0` is the first tracked public-contract version for each skill. Earlier behavior remains visible in Git history.

| Skill | Skill version | Last behavior change | Purpose | Shipped library | Exercised loaders | Checked |
| --- | --- | --- | --- | --- | --- | --- |
| `gtm-workspace` | 1.3.0 | 2026-08-30 | Creates, imports, maintains, and repairs the shared organization workspace | None | Shared `.agents/skills` loader; project `.claude/skills` loader | 2026-08-30 |
| `gtm-icp` | 1.1.0 | 2026-08-30 | Owns node-local ideal customer profile creation, revision, deletion, and repair | None | Shared `.agents/skills` loader; project `.claude/skills` loader | 2026-08-30 |
| `gtm-persona` | 1.1.0 | 2026-08-30 | Owns node-local buyer and stakeholder persona creation, revision, deletion, and repair | None | Shared `.agents/skills` loader; project `.claude/skills` loader | 2026-08-30 |
| `gtm-workflow` | 1.0.0 | 2026-08-28 | Authors and runs typed, migrated workflows with cache, cost, approval, and deployment controls | `gtm-lib` v10 | Shared `.agents/skills` loader; project `.claude/skills` loader | 2026-08-28 |

The offline compatibility check copies all four skills into both loader directory shapes, parses every `SKILL.md`, validates the common Contract fields and shared data contracts, and resolves each local reference. Run it with:

```sh
python3 scripts/check_skill_compatibility.py
```

## Release tags

The current workflow library release is `gtm-lib-v10`. The tag points to the first reviewed `main` commit that contains the complete v10 library and its migration.

For every future workflow-library bump:

1. Update every managed header, content hash, migration, workflow contract, this table, and [CHANGELOG.md](CHANGELOG.md) in the reviewed change.
2. Merge the change to `main`.
3. Create the annotated tag `gtm-lib-v<version>` on that merge commit and push the tag.

Skill versions change only when the corresponding `SKILL.md` public behavior changes. Documentation corrections that do not change reads, writes, outputs, approvals, persistence, or handoffs do not require a skill-version bump.
