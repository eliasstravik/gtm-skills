<p align="center"><img src="https://img.shields.io/badge/GTM%20Skills-Open%20source%20GTM%20skills%20for%20coding%20agents-2ea44f?style=flat-square&labelColor=24292f" alt="GTM Skills: open source GTM skills for coding agents" /></p>

<h3 align="center">Run your full GTM motion from one shared context</h3>

<p align="center">GTM Skills lets a GTM teammate keep one organization's facts, ideal customer profiles, and personas in a git-backed Markdown workspace, qualify prospects against them in conversation, and turn them into saved workflows that run locally or on Vercel.</p>

<p align="center"><img src="assets/gtm-skills-flow.svg" width="88%" alt="A user asks the agent to create an Enterprise SaaS ICP; the agent returns a factual proposal for review before saving it to the shared GTM workspace" /></p>

<p align="center"><a href="docs/getting-started.md"><img src="assets/buttons/install-gtm-skills.svg" alt="Install GTM Skills" /></a>&nbsp;&nbsp;<a href="https://cal.com/stravik/demo?projects=GTM%20Skills" target="_blank" rel="noopener noreferrer"><img src="assets/buttons/book-a-demo.svg" alt="Book a demo" /></a></p>

<p align="center"><sub>✓&nbsp;100%&nbsp;free&nbsp;and&nbsp;open&nbsp;source &nbsp; ✓&nbsp;One&nbsp;git-backed&nbsp;workspace &nbsp; ✓&nbsp;Runs&nbsp;locally&nbsp;or&nbsp;on&nbsp;Vercel</sub></p>

<br />

## Keep organization, market, buyer, and workflow knowledge in one place

The GTM workspace records what the organization knows about itself and its team. ICPs define the companies it sells to, personas define the people it sells to, and saved workflows turn that context into repeatable work. Every change is proposed in plain language, approved through your agent's normal write permission, and committed to git, so the history of what the team decided is always there.

## Choose between repeated prompts, standalone templates, custom agents — or one shared GTM workspace

| | **GTM Skills** | Repeated prompts | Standalone templates | Custom agents |
|---|:---:|:---:|:---:|:---:|
| **Installs into Claude Code, Codex, Cursor, OpenCode, and other skills.sh hosts with one command** | ✅ | ✅ | ❌ | ❌ |
| **Keeps organization facts, ICPs, and personas as Markdown in one git repository** | ✅ | ❌ | ❌ | ❌ |
| **Proposes every durable change in plain language before writing it** | ✅ | ❌ | ❌ | ❌ |
| **Checks a pasted list of people or companies against your ICPs and personas without writing anything** | ✅ | ❌ | ❌ | ❌ |
| **Gives every workflow a typed result table with a stable key, cost, and error per row** | ✅ | ❌ | ❌ | ❌ |
| **States the cost before every run and offers a one-row test before a new workflow runs at scale** | ✅ | ❌ | ❌ | ❌ |
| **Caps every run by rows and spend** | ✅ | ❌ | ❌ | ❌ |
| **Runs the same workflow file locally on SQLite and hosted on Vercel with Turso** | ✅ | ❌ | ❌ | ❌ |
| **Reaches people in Slack for approvals while a hosted run is in progress** | ✅ | ❌ | ❌ | ❌ |

Keep durable GTM knowledge and reusable automations in one repository, and let the agent you already use do the writing.

## Ask in your agent. Get a proposal, a verdict, or a run.

### 📈 Define the market and the buyer once

Say "create an ICP for lean B2B SaaS" or "create a persona for revenue leaders". The agent drafts the definition from your facts and public sources, shows it, and saves it to the workspace only when you approve.

### ⚡ Qualify prospects without leaving the conversation

Paste a list of people or companies and ask "are these a fit". The agent checks each one against the saved ICPs and personas and returns a verdict per row. Nothing is written.

### 💬 Turn a repeated question into a saved workflow

Say "build a workflow that scores our inbound companies". The agent writes the workflow and its result table, opens a diagram of what it does and what it costs, and runs it on your say-so, locally or on Vercel, on a schedule when you want one.

## Build your GTM foundation in three steps

<table>
<tr>
<td align="center" valign="top" width="33%"><h3>1️⃣</h3><b>Install GTM Skills</b><br /><sub>Run <code>npx skills add eliasstravik/gtm-skills -g</code> in a terminal. Every skill installs at once.</sub></td>
<td align="center" valign="top" width="33%"><h3>2️⃣</h3><b>Set up the workspace</b><br /><sub>Ask your agent to set up a GTM workspace for your organization. It creates the git-backed folder, fills in the organization record, and can share it as a private GitHub repository.</sub></td>
<td align="center" valign="top" width="33%"><h3>3️⃣</h3><b>Define, qualify, automate</b><br /><sub>Create an ICP and a persona, check a prospect against them, then build the first saved workflow.</sub></td>
</tr>
</table>

## How the skills fit together

Each skill owns one part of the workspace and hands off to the others. Install `gtm-workspace` in every case; the rest depend on it.

| Skill | Owns |
| --- | --- |
| `gtm-workspace` | The workspace itself: the organization record, members, and workspace health |
| `gtm-icp` | Ideal customer profiles: the companies the organization sells to |
| `gtm-persona` | Personas: the people the organization sells to |
| `gtm-qualify-prospects` | In-conversation fit checks of supplied people or companies |
| `gtm-workflow` | Saved workflows: code, tables, runs, schedules, and deploys |

## Choose how to get started

<table>
<tr>
<td align="center" valign="top" width="50%"><h3>Self-serve</h3><sub>For GTM builders and teams using coding agents</sub><br /><h2>Free</h2><div align="left">&nbsp;&nbsp;&nbsp;✓&nbsp; Every GTM skill, installed with one command<br />&nbsp;&nbsp;&nbsp;✓&nbsp; Git-backed GTM workspace<br />&nbsp;&nbsp;&nbsp;✓&nbsp; ICP and persona lifecycles<br />&nbsp;&nbsp;&nbsp;✓&nbsp; In-conversation prospect qualification<br />&nbsp;&nbsp;&nbsp;✓&nbsp; Local and Vercel workflows with schedules<br />&nbsp;&nbsp;&nbsp;✓&nbsp; Plain-language proposals, caps, and history</div></td>
<td align="center" valign="top" width="50%"><h3>Done-with-you</h3><sub>Hands-on setup and rollout for your GTM team</sub><br /><h2>Let's talk</h2><div align="left">&nbsp;&nbsp;&nbsp;✓&nbsp; Everything in self-serve<br />&nbsp;&nbsp;&nbsp;✓&nbsp; Full GTM Skills setup<br />&nbsp;&nbsp;&nbsp;✓&nbsp; GTM workspace repository configuration<br />&nbsp;&nbsp;&nbsp;✓&nbsp; ICP, persona, and workflow design<br />&nbsp;&nbsp;&nbsp;✓&nbsp; Vercel and Turso configuration for hosted workflows<br />&nbsp;&nbsp;&nbsp;✓&nbsp; Team rollout, training, and best practices<br />&nbsp;&nbsp;&nbsp;✓&nbsp; Ongoing maintenance and upgrades<br />&nbsp;&nbsp;&nbsp;✓&nbsp; Dedicated Slack channel support</div></td>
</tr>
<tr>
<td align="center"><a href="docs/getting-started.md"><img src="assets/buttons/install-gtm-skills.svg" alt="Install GTM Skills" /></a></td>
<td align="center"><a href="https://cal.com/stravik/demo?projects=GTM%20Skills" target="_blank" rel="noopener noreferrer"><img src="assets/buttons/book-a-demo.svg" alt="Book a demo" /></a></td>
</tr>
</table>

## Get your questions answered

### Do I need to write the workflow code myself?

No. The agent writes the workflow, its table, and its migration. You read the diagram, approve the cost, and look at the rows; the code is there when you want it.

### Which agents does it work with?

Any skills.sh host: Claude Code, Codex, Cursor, OpenCode, and others. One install command puts the skills where every host finds them.

### Where does the workspace live?

In `~/.gtm/<org-slug>/` on your computer, as Markdown with git as its memory. When you want to share it, the agent creates a private GitHub repository named `gtm-<slug>` and pushes to it.

### What does a saved workflow need to run?

Locally: Node and the SQLite file the scaffold creates. Hosted: a Vercel project connected to the workspace repository, a Turso database, and an AI Gateway key. Each workflow declares its row and spend caps, and every run states its cost before it starts.

### Can a workflow ask a person before it acts?

Yes. An agent stage can name the tools a person must approve. On a hosted run the request is posted to a Slack channel you choose, and the reply decides it.

### What does it cost?

GTM Skills is free, open source, and MIT licensed. Your AI provider, Vercel, and Turso may charge for usage within the limits you choose.

## Install GTM Skills and build from shared truth

<p align="center">One repository holds what your team knows about the organization, its market, its buyers, and the workflows they rely on. Your agent does the writing; you approve.</p>

<p align="center"><a href="docs/getting-started.md"><img src="assets/buttons/install-gtm-skills.svg" alt="Install GTM Skills" /></a>&nbsp;&nbsp;<a href="https://cal.com/stravik/demo?projects=GTM%20Skills" target="_blank" rel="noopener noreferrer"><img src="assets/buttons/book-a-demo.svg" alt="Book a demo" /></a></p>

<p align="center"><sub>✓&nbsp;100%&nbsp;free&nbsp;and&nbsp;open&nbsp;source &nbsp; ✓&nbsp;One&nbsp;git-backed&nbsp;workspace &nbsp; ✓&nbsp;Runs&nbsp;locally&nbsp;or&nbsp;on&nbsp;Vercel</sub></p>
