# Account scoring output

Validate `Label` literally against the target node's qualified ICP labels. A root file `icps/regional-utilities.md` is `regional-utilities`; `suborgs/enterprise/icps/regulated-financial-platforms.md` is `enterprise/regulated-financial-platforms`.

Band rules:

- `no-match` → `no-fit`.
- Unknown visible label → preserve label, `no-fit`, `Confidence: low`, `Needs review: true`, and no re-segmentation.
- Applicable labeled-ICP disqualifier → at most `weak-fit`, even when several fit signals match.
- Thin prose may support only a cautious band; report its limited discriminatory power separately from item confidence.

For one account, render:

```markdown
Account: <company name>
Label: <supplied label unchanged>
Band: <strong-fit|good-fit|weak-fit|no-fit>
Reasoning: <quoted ICP prose, supplied-fact comparison, disqualifier cap or label validation>
Confidence: <high|medium|low>
Needs review: <true|false>
Open questions: <none or supplied-evidence gaps>
```

For several accounts, render before item results:

```markdown
Counts by label:
- <label>: <count>
Band distribution:
- <band>: <count>
Low-confidence count: <count>
Review-needed count: <count>
```

Then repeat the seven item fields once per account. The final line is exactly:

`No files, git history, or external systems changed.`
