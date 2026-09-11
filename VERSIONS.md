# Versions and compatibility

GTM Skills has one project version. Every installable skill ships at that version, and the release tag is `v<version>` on the reviewed `main` commit.

| Project version | Released | Skills | Checked |
| --- | --- | --- | --- |
| 1.0.0 | unreleased | `gtm-workspace`, `gtm-icp`, `gtm-persona`, `gtm-qualify-prospects`, `gtm-workflow` | pending acceptance |
| 0.9.0 | 2026-09-10 | `gtm-workspace`, `gtm-icp`, `gtm-persona`, `gtm-qualify-prospects`, `gtm-workflow` | 2026-09-10 |
| 0.8.0 | 2026-09-10 | same five skills | 2026-09-10 |
| 0.7.0 | 2026-09-10 | same five skills | 2026-09-10 |
| 0.6.0 | 2026-09-10 | same five skills | 2026-09-10 |
| 0.5.3 | 2026-09-10 | same five skills | 2026-09-10 |
| 0.5.2 | 2026-09-09 | same five skills | 2026-09-09 |
| 0.5.1 | 2026-09-09 | same five skills | 2026-09-09 |
| 0.5.0 | 2026-09-09 | same five skills | 2026-09-09 |
| 0.4.4–0.1.0 | 2026-09-01–09 | earlier compatible releases | see tag history |

Downstream hosts pin the release tag whose skill text they install. Workflow projects own their copied template and use `gtm upgrade` to replace only library-owned files while preserving workflow, table, and provider files.
