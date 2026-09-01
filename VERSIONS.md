# Versions and compatibility

GTM Skills has one project version. Every installable skill ships at that version, and the release tag is `v<version>` on the reviewed `main` commit.

| Project version | Released | Skills | Workflow library generation | Checked |
| --- | --- | --- | --- | --- |
| 0.1.2 | 2026-09-01 | `gtm-workspace`, `gtm-icp`, `gtm-persona`, `gtm-qualify-prospects`, `gtm-workflow` | 13 | 2026-09-01 |
| 0.1.1 | 2026-09-01 | `gtm-workspace`, `gtm-icp`, `gtm-persona`, `gtm-qualify-prospects`, `gtm-workflow` | 12 | 2026-09-01 |
| 0.1.0 | 2026-09-01 | `gtm-workspace`, `gtm-icp`, `gtm-persona`, `gtm-qualify-prospects`, `gtm-workflow` | 11 | 2026-09-01 |

## What each number means

- **Project version** is the only version to track. It covers all five skills, their references, and the workflow templates as one release. Downstream hosts such as `gtm-agent` vendor the tagged commit.
- **Workflow library generation** is an internal compatibility marker for the managed workflow files. It appears as the `// gtm-lib v13` header, `gtm.libVersion` in the template `package.json`, and the content hashes under `gtm.libHashes`. `gtm check` compares a project against it and offers a recopy when headers or hashes differ. It increments only when a managed file changes; it is not a version to install or announce.

The offline compatibility check copies all five skills into both loader directory shapes, parses every `SKILL.md`, validates the common Contract fields and shared data contracts, and resolves each local reference. Run it with:

```sh
python3 scripts/check_skill_compatibility.py
```

## Release procedure

1. Update this table and [CHANGELOG.md](CHANGELOG.md) in the reviewed change. When managed workflow files change, also bump the library generation, every managed header, `gtm.libVersion`, and `gtm.libHashes`.
2. Merge the change to `main`.
3. Create the annotated tag `v<version>` on that merge commit and push the tag.

Earlier releases used per-skill versions and `gtm-lib-v<generation>` tags. The `gtm-lib-v10` tag remains in history; new releases use project tags only.
