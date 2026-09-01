<p align="center"><img src="https://img.shields.io/badge/GTM%20Skills-Open%20source%20skills%20for%20GTM-2ea44f?style=flat-square&labelColor=24292f" alt="GTM Skills: open source skills for GTM" /></p>

<h3 align="center">Own the GTM data, the spend, and the code that runs</h3>

<p align="center">GTM Skills keeps accepted organization facts, market definitions, buyer definitions, workflow code, and workflow results under one contract.</p>

## Four guarantees you can inspect

1. **Results land in a typed table you own.** Each workflow declares its result table and commits every schema change as a migration. Query business rows and the paid-call ledger with the same read-only command.
2. **Every paid call is cached and costed.** Provider and model calls pass through one content-addressed cache and write one per-run ledger entry. An unchanged rerun records `cache_hit` at `$0`.
3. **The preview costs nothing, then the real run stops after three rows.** The dry run validates input, rows, stages, projected cost, and caps without calling a paid service. The first accepted run saves three rows and pauses that same run for inspection.
4. **Production runs the reviewed commit.** A production start waits for the deployed commit to match the accepted workspace commit and refuses a missing or different commit.

For an `account-scoring` workflow whose `account_scores.key` is the company domain, this command joins owned result rows to the latest run's paid-call ledger. It has no table or workflow placeholders:

```sh
npm run gtm -- query --sql "
SELECT scores.key AS domain, calls.status, calls.cost_usd
FROM account_scores AS scores
JOIN enrichment_cache AS cached
  ON json_extract(cached.inputs, '$.domain') = scores.key
JOIN enrichment_runs AS calls
  ON calls.provider = cached.provider
 AND calls.endpoint = cached.endpoint
 AND calls.inputs_hash = cached.inputs_hash
WHERE calls.run_key = (
  SELECT run_key
  FROM workflow_runs
  WHERE workflow = 'account-scoring'
  ORDER BY started_at DESC
  LIMIT 1
)
ORDER BY scores.key
" --format markdown
```

An unchanged rerun produces ledger rows like this:

| domain | status | cost_usd |
| --- | --- | ---: |
| northstar.example | cache_hit | 0 |

<p align="center"><img src="assets/gtm-skills-flow.svg" width="88%" alt="GTM Skills turns a shared GTM workspace into grounded ICPs, personas, and workflows" /></p>

<p align="center"><a href="https://github.com/eliasstravik/gtm-skills/blob/main/docs/getting-started.md"><img src="assets/buttons/install-gtm-skills.svg" alt="Install GTM Skills" /></a>&nbsp;&nbsp;<a href="https://cal.com/stravik/demo?projects=GTM%20Skills" target="_blank" rel="noopener noreferrer"><img src="assets/buttons/book-a-demo.svg" alt="Book a demo" /></a></p>

<p align="center"><sub>✓&nbsp;100%&nbsp;free&nbsp;and&nbsp;open&nbsp;source &nbsp; ✓&nbsp;One&nbsp;shared&nbsp;workspace &nbsp; ✓&nbsp;Typed&nbsp;results&nbsp;and&nbsp;costs</sub></p>

<br />

## Keep organization, market, buyer, and workflow knowledge in one place

The GTM workspace records durable facts about the business and its team. ICPs define the companies each organization serves, personas define the buyers and stakeholders it needs to understand, and saved workflows turn that context into repeatable work. Every durable change is previewed in full, accepted explicitly, and saved to history.

## Compare concrete behavior

| | **GTM Skills** | Repeated prompts | Standalone templates | Custom agents |
|---|:---:|:---:|:---:|:---:|
| **Accepted facts and definitions live in one Git repository** | ✅ | ❌ | ❌ | ❌ |
| **Root and nested organizations own separate ICP and persona files** | ✅ | ❌ | ❌ | ❌ |
| **The agent previews complete durable changes before writing** | ✅ | ❌ | ❌ | ❌ |
| **Every result table has types, a stable key, and committed migrations** | ✅ | ❌ | ❌ | ❌ |
| **Every paid call passes through one content-addressed cache** | ✅ | ❌ | ❌ | ❌ |
| **Every paid call writes status and cost to a per-run ledger** | ✅ | ❌ | ❌ | ❌ |
| **A dry run validates input and caps without paid calls** | ✅ | ❌ | ❌ | ❌ |
| **The first real run saves three rows before pausing for review** | ✅ | ❌ | ❌ | ❌ |
| **Production refuses to run a commit other than the accepted commit** | ✅ | ❌ | ❌ | ❌ |
| **The same workflow file runs locally or in a hosted deployment** | ✅ | ❌ | ❌ | ❌ |

Keep durable GTM knowledge and reusable automations in one repository. Each skill reads only the artifacts visible to the selected organization node and preserves accepted durable changes in history.

## How the five skills fit together

Four Lifecycle Skills form one chain of durable ownership; one Task Skill performs bounded in-session work from their shared facts. They resolve the same organization node, while durable changes use the same review-before-write rule and Git history.

| Skill | Owns | Hands off |
| --- | --- | --- |
| `gtm-workspace` | Organization structure, members, repository health, and connections | The selected organization node and its visible files |
| `gtm-icp` | The companies that node serves, including disqualifiers and uncertainty | An accepted market definition at a stable path |
| `gtm-persona` | The buyers and stakeholders that node needs to understand | An accepted buyer definition at a stable path |
| `gtm-qualify-prospects` | In-session person-to-persona and company-to-ICP fit qualification | Per-row fit verdicts in the conversation |
| `gtm-workflow` | Typed workflow code, migrations, runs, results, cache entries, and costs | Database-backed outcomes tied to the accepted workspace context |

Project records: [versions and compatibility](VERSIONS.md) · [changelog](CHANGELOG.md) · [security policy](SECURITY.md) · [contribution rules](CONTRIBUTING.md)

## Build your GTM foundation in four steps

<table>
<tr>
<td align="center" valign="top" width="25%"><h3>1</h3><b>Install GTM Skills</b><br /><sub>Run <code>npx skills add eliasstravik/gtm-skills -g</code> to install all five skills.</sub></td>
<td align="center" valign="top" width="25%"><h3>2</h3><b>Build your GTM workspace</b><br /><sub>Run <code>/gtm-workspace</code> to create or import the organization repository and add the members and business units it owns.</sub></td>
<td align="center" valign="top" width="25%"><h3>3</h3><b>Define the market and buyer</b><br /><sub>Run <code>/gtm-icp</code> and <code>/gtm-persona</code> to create the definitions each organization needs.</sub></td>
<td align="center" valign="top" width="25%"><h3>4</h3><b>Build your first workflow</b><br /><sub>Run <code>/gtm-workflow</code>, declare its table and caps, review a zero-spend dry run, then inspect the first saved rows at a checkpoint.</sub></td>
</tr>
</table>

## Choose how to get started

<table>
<tr>
<td align="center" valign="top" width="50%"><h3>Self-serve</h3><sub>For GTM builders and teams using AI agents</sub><br /><h2>Free</h2><div align="left">&nbsp;&nbsp;&nbsp;✓&nbsp; Five installable GTM skills<br />&nbsp;&nbsp;&nbsp;✓&nbsp; Git-backed GTM workspace<br />&nbsp;&nbsp;&nbsp;✓&nbsp; ICP lifecycle management<br />&nbsp;&nbsp;&nbsp;✓&nbsp; Persona lifecycle management<br />&nbsp;&nbsp;&nbsp;✓&nbsp; Local and Vercel workflows<br />&nbsp;&nbsp;&nbsp;✓&nbsp; Guided previews, caps, and history</div></td>
<td align="center" valign="top" width="50%"><h3>Done-with-you</h3><sub>Hands-on setup and rollout for your GTM team</sub><br /><h2>Let's talk</h2><div align="left">&nbsp;&nbsp;&nbsp;✓&nbsp; Everything in self-serve<br />&nbsp;&nbsp;&nbsp;✓&nbsp; Full GTM Skills setup<br />&nbsp;&nbsp;&nbsp;✓&nbsp; GTM workspace repository configuration<br />&nbsp;&nbsp;&nbsp;✓&nbsp; ICP, persona, and workflow design<br />&nbsp;&nbsp;&nbsp;✓&nbsp; Team rollout, training, and best practices<br />&nbsp;&nbsp;&nbsp;✓&nbsp; Ongoing maintenance and upgrades<br />&nbsp;&nbsp;&nbsp;✓&nbsp; Dedicated Slack channel support</div></td>
</tr>
<tr>
<td align="center"><a href="https://github.com/eliasstravik/gtm-skills/blob/main/docs/getting-started.md"><img src="assets/buttons/install-gtm-skills.svg" alt="Install GTM Skills" /></a></td>
<td align="center"><a href="https://cal.com/stravik/demo?projects=GTM%20Skills" target="_blank" rel="noopener noreferrer"><img src="assets/buttons/book-a-demo.svg" alt="Book a demo" /></a></td>
</tr>
</table>

## Get your questions answered

### Do I need to write the workflow code myself?

No. The agent writes the workflow code and migrations. You review the complete tracked diff, the zero-spend dry run, and the first three saved rows. You need `npx`, an AI agent that loads installed skills, and Git for the GTM workspace repository.

### What gets installed?

The install command adds GTM Workspace, GTM ICP, GTM Persona, GTM Qualify Prospects, and GTM Workflow. Run `/gtm-workspace` first, use `/gtm-icp` and `/gtm-persona` for the definitions your organization owns, `/gtm-qualify-prospects` for bounded in-session fit checks, and `/gtm-workflow` for reusable automations.

### What does GTM Workspace store?

It stores your organization’s durable self-knowledge: organization facts, members, suborganizations, ICPs, personas, and a root workflow project. The canonical root is `~/.gtm/<org-slug>/`; suborganizations use `suborgs/<suborg-slug>/`, member records use `members/<member-slug>/MEMBER.md`, and reusable workflow files live under root `workflows/workflows/`.

### Can different teams keep different ICPs and personas?

Yes. The root organization and its suborganizations can own their own definitions. Each authoring skill reads only the artifacts visible to the selected organization node.

### Where do workflows run?

You choose per workflow. Local workflows use a supported CLI agent and `data/gtm.db`. Vercel workflows use the same committed file, Turso, the optional Vercel CLI, and a Vercel AI Gateway key with a spending budget. A hosted Slack agent authors, dry-runs, and queries in its sandbox but runs, approves, and cancels only on Vercel through approval-gated controls.

### What does it cost?

GTM Skills is free, open source, and MIT licensed. Your AI or model provider may charge for usage. Vercel execution is optional and uses the spending budget you set on its Gateway key.

## Install GTM Skills and build from shared truth

<p align="center">One repository holds what your team knows about the organization, its market, its buyers, and the workflows they rely on.</p>

<p align="center"><a href="https://github.com/eliasstravik/gtm-skills/blob/main/docs/getting-started.md"><img src="assets/buttons/install-gtm-skills.svg" alt="Install GTM Skills" /></a>&nbsp;&nbsp;<a href="https://cal.com/stravik/demo?projects=GTM%20Skills" target="_blank" rel="noopener noreferrer"><img src="assets/buttons/book-a-demo.svg" alt="Book a demo" /></a></p>

<p align="center"><sub>✓&nbsp;100%&nbsp;free&nbsp;and&nbsp;open&nbsp;source &nbsp; ✓&nbsp;One&nbsp;shared&nbsp;workspace &nbsp; ✓&nbsp;Typed&nbsp;results&nbsp;and&nbsp;costs</sub></p>
