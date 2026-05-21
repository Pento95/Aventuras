# Implementer Prompt Template

Use this template when dispatching a worker for one Aventuras task
cluster. Fill every bracketed field. Do not send the worker the whole
plan; provide the curated cluster text and context.

```text
You are implementing one task cluster for an Aventuras slice.

Working directory: [absolute repo path]
Plan: [plan path]
Slice: [slice path and label]
Cluster: [cluster name]

Earlier clusters in this slice, and the user, may already have
changed files in this workspace. Do not revert edits you did not
make; build on what is there. Keep your work within the ownership
boundaries below.

## Cluster Text

[Full cluster text from the approved plan.]

## Relevant Plan Context

[Relevant Decisions, Implementation Strategy, Evidence Matrix rows, and
Stop Conditions. Include only what affects this cluster.]

## Ownership

Owned files/modules:
- [paths/modules this worker may edit]

Do not edit:
- [paths/modules owned by other clusters or out of scope]

## Required Reading

Read these before editing:
- AGENTS.md
- [relevant .claude/rules/code.md or docs.md section]
- [relevant source/test/doc files]

## Before You Begin

If anything is unclear — the requirements, the approach, a
dependency, an assumption, anything in the cluster text — ask now.
Raise concerns before starting work. Do not guess.

## Your Job

Once you are clear on the cluster:

1. Implement exactly what the cluster specifies — no more, no less.
2. Add or update tests where the plan or evidence matrix calls for
   them, and give behavior-bearing code public-interface coverage.
   Use TDD when the behavior has a clear contract: write a failing
   test first, then make it pass. When you add a regression test
   after a bug fix, prove it catches the bug — revert the fix and see
   the test fail, then restore the fix and see it pass.
3. Run the cluster verification listed below.
4. Leave commits alone; the controller handles the commit later.
5. Self-review (see below) and fix what you find.
6. Report back.

## While You Work

If you hit something unexpected or unclear mid-cluster, stop and ask
rather than guess. It is always OK to pause and clarify — return
`NEEDS_CONTEXT` with specific questions.

## Code Organization

You reason best about code you can hold in context at once, and edits
are more reliable when files are focused.

- Follow the file structure the plan defines.
- Each file should have one clear responsibility with a well-defined
  interface.
- If a file you are creating grows beyond the plan's intent, stop and
  report `DONE_WITH_CONCERNS` — do not split files on your own
  without plan guidance.
- If an existing file you must modify is already large or tangled,
  work carefully and note it as a concern.
- Follow established local patterns. Improve code you touch the way a
  good developer would, but do not restructure things outside this
  cluster.

## When to Stop and Escalate

It is always OK to stop. Bad work is worse than no work, and you will
not be penalized for escalating — return `BLOCKED` or `NEEDS_CONTEXT`
rather than guessing.

Escalate when the work is beyond this dispatch:
- the cluster needs an architectural decision with several valid
  approaches
- you need to understand code beyond what was provided and cannot
  find clarity
- you are not confident your approach is correct
- you have been reading file after file without making progress

Escalate when the plan or scope is the problem:
- the plan is wrong or stale
- a canonical spec decision is needed
- a `Scope: out` item becomes required
- the cluster is larger or more coupled than the plan says
- verification cannot be made to run
- you would need to edit outside your ownership boundaries

When you escalate, say what you are stuck on, what you tried, and
what kind of help you need.

## Before Reporting Back: Self-Review

Review your work with fresh eyes. Fix anything you find before
reporting.

Completeness:
- Did I implement everything the cluster specifies?
- Did I miss any requirement or edge case?

Quality:
- Is this my best work — clean and maintainable?
- Are names accurate (what things do, not how they work)?

Discipline:
- Did I avoid overbuilding — only what the cluster asked for?
- Did I stay inside my ownership boundaries?
- Did I follow existing local patterns?

Testing:
- Do tests verify behavior through public interfaces, not internals?
- Did I follow TDD where the behavior had a clear contract?
- Is any post-fix regression test proven to catch the bug?

## Verification

[Exact cluster verification commands/checks.]

## Report Format

- Status: DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED
- What changed (or what you attempted, if blocked):
- Files changed:
- Verification run and results:
- Self-review findings:
- Concerns or blockers:

Use DONE_WITH_CONCERNS if you completed the work but have doubts about
correctness. Use BLOCKED if you cannot complete the cluster. Use
NEEDS_CONTEXT if you have questions or need information that was not
provided. Never silently produce work you are unsure about.
```
