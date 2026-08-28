# Agent command permissions

Install the shipped classifier instead of broadly allowing the GTM CLI. It parses shell quoting and returns `allow` only for read-only inspection and zero-spend dry runs. It returns `ask` for real runs, decisions, cancellation, migrations, deployment, unknown commands, and commands containing substitution, chaining, redirects, escapes, or background operators.

## Command hook

The classifier is `skills/gtm-workflow/scripts/command-permission.mjs`. Test a command before installation:

```text
node <skill-path>/scripts/command-permission.mjs --classify "npm run gtm -- check"
```

For a host with `PreToolUse` command hooks, attach it to Bash in the user's settings:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "node <skill-path>/scripts/command-permission.mjs"
          }
        ]
      }
    ]
  }
}
```

The hook allows `gtm check`, `gtm query`, `gtm runs get`, `gtm providers list`, `gtm diagram`, `gtm run ... --dry-run`, `workflow inspect`, `workflow validate`, `db:generate`, `db:verify`, and both Studio commands. Everything else asks.

## Prefix-only hosts

When a host supports only argv-prefix rules, use narrow rules and keep every mutating family at `prompt`:

```python
prefix_rule(pattern=["npm", "run", "gtm", "--", "check"], decision="allow")
prefix_rule(pattern=["npm", "run", "gtm", "--", "query"], decision="allow")
prefix_rule(pattern=["npm", "run", "gtm", "--", "runs", "get"], decision="allow")
prefix_rule(pattern=["npm", "run", "db:generate"], decision="allow")
prefix_rule(pattern=["npm", "run", "db:verify"], decision="allow")
prefix_rule(pattern=["npm", "run", "db:studio"], decision="allow")
prefix_rule(pattern=["npm", "run", "db:studio:cloud"], decision="allow")
prefix_rule(pattern=["npx", "workflow", "inspect"], decision="allow")
prefix_rule(pattern=["npx", "workflow", "validate"], decision="allow")
prefix_rule(pattern=["npm", "run", "gtm", "--", "run"], decision="prompt")
prefix_rule(pattern=["npm", "run", "gtm", "--", "approve"], decision="prompt")
prefix_rule(pattern=["npm", "run", "gtm", "--", "cancel"], decision="prompt")
prefix_rule(pattern=["npm", "run", "db:migrate"], decision="prompt")
prefix_rule(pattern=["npm", "run", "db:migrate:cloud"], decision="prompt")
prefix_rule(pattern=["npx", "workflow", "cancel"], decision="prompt")
prefix_rule(pattern=["vercel"], decision="prompt")
```

A prefix-only host cannot express “run only with `--dry-run`” safely, so every `gtm run` remains prompted there.

## Boundaries

The hook prevents an unprompted real run; the skill's run gate provides the conversation and accepted scope. Neither mechanism preapproves migrations, deploys, approvals, cancellation, or destructive table changes. Secrets move through ignored environment files or brokered headers and never appear in command strings.

A hosted agent may expose trusted controls instead of production commands. Preview and status are read-only. Start, approval, cancellation, migration, and save remain approval-gated. The sandbox starts no real run and holds only read authority; the accepted `main` commit deploys through the connected project, while the host carries the fixed production URL and run bearer and waits for the exact commit SHA.
