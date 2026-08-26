# Agent command permissions

These snippets allow the narrow command prefixes used by the workflow skill. Review them before adding them to a user-level agent configuration. Keep file edits, Git actions, and arbitrary shell commands outside this list.

## Claude Code

Add the required entries under `permissions.allow` in `settings.json`:

```json
{
  "permissions": {
    "allow": [
      "Bash(npm run gtm --:*)",
      "Bash(npm run db:generate:*)",
      "Bash(npm run db:migrate:*)",
      "Bash(npm run db:migrate:cloud:*)",
      "Bash(npm run db:studio:*)",
      "Bash(npm run db:studio:cloud:*)",
      "Bash(npx workflow inspect:*)",
      "Bash(npx workflow validate:*)",
      "Bash(npx workflow cancel:*)",
      "Bash(npx workflow web:*)",
      "Bash(npx drizzle-kit:*)",
      "Bash(vercel:*)"
    ]
  }
}
```

## Codex

Put the rules in a `.rules` file under the user's Codex rules directory. The `pattern` is an argv prefix, so keep each token separate:

```python
prefix_rule(pattern=["npm", "run", "gtm", "--"], decision="allow")
prefix_rule(pattern=["npm", "run", "db:generate"], decision="allow")
prefix_rule(pattern=["npm", "run", "db:migrate"], decision="allow")
prefix_rule(pattern=["npm", "run", "db:migrate:cloud"], decision="allow")
prefix_rule(pattern=["npm", "run", "db:studio"], decision="allow")
prefix_rule(pattern=["npm", "run", "db:studio:cloud"], decision="allow")
prefix_rule(pattern=["npx", "workflow", "inspect"], decision="allow")
prefix_rule(pattern=["npx", "workflow", "validate"], decision="allow")
prefix_rule(pattern=["npx", "workflow", "cancel"], decision="allow")
prefix_rule(pattern=["npx", "workflow", "web"], decision="allow")
prefix_rule(pattern=["npx", "drizzle-kit"], decision="allow")
prefix_rule(pattern=["vercel"], decision="prompt")
```

Keep Vercel at `prompt` because link, environment, integration, deploy, and removal commands change external state. The user still approves deployment through the skill's deployment gate.

## Boundaries

These rules do not make a real run, migration, deploy, approval, or destructive table change preapproved. They only let the agent invoke the bounded CLI after the skill's human gate has granted the action. Secrets still move through ignored environment files or shell input and never appear in an allowed command string.
