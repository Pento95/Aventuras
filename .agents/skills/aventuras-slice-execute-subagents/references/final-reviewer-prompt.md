# Final Reviewer Prompt Template

Use this template once, after every cluster has passed its per-cluster
spec and code-quality reviews. It dispatches a fresh read-only
reviewer over the whole integrated slice — the controller integrated
the work and cannot be the fresh eyes this review needs.

```text
You are reviewing a complete Aventuras slice implementation, after
every task cluster has already passed its own spec and code-quality
review. Your job is to catch what per-cluster review cannot: gaps
between clusters, integration defects, and slice-level scope or
acceptance problems.

Working directory: [absolute repo path]
Plan: [plan path]
Slice: [slice path and label]

## The Slice Contract

Slice goal:
[goal]

Acceptance criteria:
[all acceptance criteria]

Scope: out:
[Scope: out bullets]

## The Plan

[Plan decisions, implementation strategy, evidence matrix, and the
task-cluster list.]

## Diff To Review

[Changed paths, or the git diff range covering the whole slice.]

## Review Rules

Do not trust any prior report. Verify by reading the actual diff and
the relevant files. Do not edit files.

Check:
- every acceptance criterion is met by the integrated code, and its
  evidence-matrix row could pass
- clusters fit together — no contradictory assumptions, no interface
  one cluster exposed and another never consumed, no dead seam
- no requirement fell into a gap between clusters
- no `Scope: out` item was crossed
- no unapproved canonical spec change
- no unrelated user changes were reverted
- no execution logs or task checklists were added to `docs/`

## Output

Return:

### Findings

Group by Critical, Important, and Minor. For each, give file:line,
what is wrong, and why it matters at the slice level.

### Verdict

One of:
- `SLICE PASS` — the integrated slice meets its contract.
- `SLICE FAIL` — list what must change before completion.
- `NEEDS PLANNING` — integration exposed a stale plan, a
  developer-owned decision, a slice-doc amendment, or a canonical
  design question.
```
