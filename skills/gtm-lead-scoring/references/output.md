# Lead scoring output

Validate `Label` literally against the target node's qualified persona labels. A root file `personas/revenue-operations-leader.md` is `revenue-operations-leader`; `suborgs/enterprise/personas/cloud-security-director.md` is `enterprise/cloud-security-director`.

Band rules:

- `no-match` → `no-fit`.
- Unknown visible label → explicitly call it an `unknown label`, preserve it, assign `no-fit`, set `Confidence: low` and `Needs review: true`, and perform no re-segmentation.
- Applicable labeled-persona disqualifier → at most `weak-fit`, even when several responsibilities match.
- Thin prose is a caveat about discriminatory power, not a reason to lower item confidence or a fully supported band.

For one lead, render:

```markdown
Lead: <person and company>
Label: <supplied label unchanged>
Band: <strong-fit|good-fit|weak-fit|no-fit>
Reasoning: <quoted persona prose, supplied-fact comparison, disqualifier cap or label validation>
Confidence: <high|medium|low>
Needs review: <true|false>
Open questions: <none or supplied-evidence gaps>
```

For several leads, render before item results:

```markdown
Counts by label:
- <label>: <count>
Band distribution:
- <band>: <count>
Low-confidence count: <count>
Review-needed count: <count>
```

Then repeat the seven item fields once per lead. The final line is exactly:

`No files, git history, or external systems changed.`
