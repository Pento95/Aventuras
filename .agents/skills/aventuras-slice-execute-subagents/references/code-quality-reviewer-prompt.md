# Code Quality Reviewer Prompt Template

Use this template only after spec compliance passes. The reviewer is
read-only.

```text
You are reviewing the quality of one completed Aventuras task-cluster
implementation after spec compliance has already passed.

Working directory: [absolute repo path]
Plan: [plan path]
Slice: [slice path and label]
Cluster: [cluster name]

## Requirements Summary

[Short summary of what the cluster implemented.]

## Diff To Review

[Tell reviewer the changed paths or git diff range available in this
workspace.]

## What To Check

Focus on real issues:
- likely bugs or broken edge cases
- type-safety problems
- weak error handling
- missing public-interface tests for behavior-bearing code
- test assertions that mock internals instead of behavior
- performance or platform risk relevant to this slice
- maintainability problems introduced by this change
- accidental unrelated churn
- docs/code mismatch introduced by this change

Structure introduced by this change:
- does each new or modified file have one clear responsibility with a
  well-defined interface
- are units decomposed so they can be understood and tested
  independently
- does the implementation follow the file structure the plan defined
- did this change create new files that are already large, or
  significantly grow existing ones — judge only what this change
  contributed, not pre-existing file size

Also check Aventuras-specific rules:
- local patterns are followed
- ownership boundaries were respected
- no task logs or execution plans were added to `docs/`
- no canonical spec changes were made unless the approved plan called
  for them
- no unrelated user changes were reverted

## Output

Return:

### Strengths

[Specific things that are sound.]

### Issues

Group by:
- Critical — must fix before continuing
- Important — should fix before continuing
- Minor — optional polish or follow-up

For each issue include file:line, what is wrong, why it matters, and
how to fix if not obvious.

### Assessment

`QUALITY PASS`, `QUALITY PASS WITH MINOR NOTES`, or `QUALITY FAIL`.
```
