# Lead segmentation output

Use the file slug, not its H1, for `Label`. A root file `personas/revenue-operations-leader.md` becomes `revenue-operations-leader`; `suborgs/enterprise/personas/cloud-security-director.md` becomes `enterprise/cloud-security-director`.

For one lead, render:

```markdown
Lead: <person name>
Label: <qualified-label-or-no-match>
Reasoning: <quoted persona language, supplied responsibility/scope comparison, and named losing alternatives>
Confidence: <high|medium|low>
Needs review: <true|false>
Open questions: <none or supplied-evidence gaps>
```

For several leads, render the summary before item results:

```markdown
Counts by label:
- <label>: <count>
Low-confidence count: <count>
Review-needed count: <count>

Lead: <person name>
Label: <qualified-label-or-no-match>
Reasoning: <quoted persona language, supplied responsibility/scope comparison, and named losing alternatives>
Confidence: <high|medium|low>
Needs review: <true|false>
Open questions: <none or supplied-evidence gaps>
```

Repeat the six item fields once per lead. The final line is exactly:

`No files, git history, or external systems changed.`
