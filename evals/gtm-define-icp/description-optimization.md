# gtm-define-icp — description optimization record

Date: 2026-08-02. The candidate was evaluated with a custom serial Codex
ratchet because skill-creator's model-invoking scripts call `claude -p` and are
prohibited by the Task 2 model policy. The replacement preserved the protocol:
20 self-reviewed queries (10 positive / 10 near-miss negative), a stratified
60/40 train/test split, three independent runs per query, a maximum of five
iterations, and winner selection by held-out test accuracy.

## Outcome: original description wins and remains verbatim

Before and after are identical:

> Triggers when a user asks to create, define, or refine an ideal customer
> profile in a GTM context repository. Not for personas or for segmenting,
> scoring, or researching accounts or leads.

The candidate was visible exactly as written alongside descriptions for all
eight sibling GTM skills. Probes ran serially and installed no skill, command,
or decoy files. `gpt-5.6-terra` at low reasoning produced all 60 judgments.

| Split | Runs | TP | FP | TN | FN | Precision | Recall | Accuracy |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Train (6 positive + 6 negative ×3) | 36 | 18 | 0 | 18 | 0 | 100% | 100% | 100% |
| Test (4 positive + 4 negative ×3) | 24 | 12 | 0 | 12 | 0 | 100% | 100% | 100% |

Iteration 1 achieved perfect held-out accuracy, so the ratchet stopped early;
no improver candidate was needed. Under the test-score selection rule, the
original is the winner and is already `Triggers when` conforming. Full
per-query results, prompts, event streams, and timing are preserved in the
gitignored workspace; the committed query set is `trigger-eval.json`.

Harness caveats: this is an explicit catalog-routing simulation rather than
the prohibited shipped runner. Each process was independent and serial, which
avoids Task 1's competing-decoy failure. The catalog used the current Task 2
description and concise sibling descriptions; Task 10 remains the definitive
all-nine installed routing smoke. No `.claude/commands/` directory or transient
probe file was created.

## skill-issue ten-gate checklist

1. Every gate checked or N/A with a reason — **pass** (this list).
2. Requirements, assertions, preserved reference failures, and reference
   anatomy were read; accepted baseline transcripts prove the skill's need —
   **pass** (`no-skill-failures/`).
3. Each required behavior and observed failure maps to an objectively
   checkable assertion, with contractual behavior marked critical — **pass**
   (`assertions.md`; 17/18/18 applicable assertions).
4. Exactly one core primitive — **pass** (Recipe: a flat ordered operational
   sequence for defining or refining one ICP).
5. Bare core is H1 plus the mandated Recipe form at no more than 20 body lines
   — **pass** (20 body lines before Details).
6. Fresh with/without runs and blind forced comparison occurred on the bare
   core before any Details line — **pass** (iteration 1; with-skill won 2/3;
   assignment and comparator evidence preserved in the workspace).
7. One Details section, one line per failed assertion, at most 80 Details lines
   and 100 body lines — **pass** (6 Details lines; 29 body lines excluding
   frontmatter).
8. One-level Calls overflow — **N/A** (no overflow references or Calls are
   needed).
9. Frontmatter matches model invocation and validates — **pass** (`name` plus
   third-person `Triggers when` description; model-free `quick_validate.py`
   reports `Skill is valid!`).
10. Full treatment passes every critical assertion, the optimized description
    is applied verbatim, and evidence stays outside shipping files — **pass**
    (iteration 5: 53/53; shipping directory contains only `SKILL.md`).
