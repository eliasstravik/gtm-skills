# GTM Skills

Nine agent skills for a local go-to-market context project.

## Install

```sh
npx skills add eliasstravik/gtmskills
```

## Skill Catalog

| Skill | Use First When |
| --- | --- |
| `gtm-setup` | Creating, selecting, validating, or repairing a GTM context project under `$GTM_HOME` |
| `gtm-define-icp` | Defining or refining account-level ICP segments in a workspace |
| `gtm-define-personas` | Defining or refining lead-level personas grounded in ICPs |
| `gtm-account-segmentation` | Classifying accounts against workspace ICP labels |
| `gtm-account-scoring` | Ranking account fit and timing after segmentation |
| `gtm-account-research` | Producing account briefs against ICP context |
| `gtm-lead-segmentation` | Classifying leads or contacts against workspace persona labels |
| `gtm-lead-scoring` | Ranking lead relevance and timing after segmentation |
| `gtm-lead-research` | Producing lead briefs against persona context |

Start with `gtm-setup`, then define ICPs and personas. Segmentation,
scoring, and research skills depend on that workspace context.

Maintainer eval sources and fixture conventions live in
[`dev/README.md`](dev/README.md).
