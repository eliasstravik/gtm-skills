# Account segmentation output

Use the file slug, not its H1, for `Label`. A root file `icps/regional-utilities.md` becomes `regional-utilities`; `suborgs/enterprise/icps/national-insurers.md` becomes `enterprise/national-insurers`.

For one account, render:

```markdown
Account: <company name>
Label: <qualified-label-or-no-match>
Reasoning: <quoted ICP language, supplied-fact comparison, and named losing alternatives>
Confidence: <high|medium|low>
Needs review: <true|false>
Open questions: <none or supplied-evidence gaps>
```

For several accounts, render the summary before item results:

```markdown
Counts by label:
- <label>: <count>
Low-confidence count: <count>
Review-needed count: <count>

Account: <company name>
Label: <qualified-label-or-no-match>
Reasoning: <quoted ICP language, supplied-fact comparison, and named losing alternatives>
Confidence: <high|medium|low>
Needs review: <true|false>
Open questions: <none or supplied-evidence gaps>
```

Repeat the six item fields once per account. The final line is exactly:

`No files, git history, or external systems changed.`
