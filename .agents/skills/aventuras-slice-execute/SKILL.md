---
name: aventuras-slice-execute
description: >-
  Execute an approved Aventuras slice implementation plan inline in
  the current session. Use when the user asks to implement, execute,
  start, or carry out an approved `.impl-plans/` plan or slice without
  subagents, especially for smaller or tightly coupled slices. Reads
  the plan, milestone, slice doc, required rules, and worktree;
  validates `Status: approved`, readiness, execution gates, scope, and
  evidence matrix; implements task clusters locally; stops on
  planning/design blockers; verifies with fresh evidence. Does not
  autonomously spawn subagents or commit.
---

# Aventuras Slice Execute

Execute one approved Aventuras slice plan inline in the current
session. This skill is for implementation, not planning. It assumes
`aventuras-slice-plan` already produced an approved plan under
`.impl-plans/`.

`aventuras-slice-plan` recommends one of the two execution skills
when a plan is approved. This skill fits a small, single-cluster, or
tightly-coupled slice that one working context can carry cleanly. Use
`aventuras-slice-execute-subagents` instead for a larger or
multi-cluster slice, where a fresh worker per cluster and independent
per-cluster review improve quality. Honor a direct developer choice
over the plan's recommendation.

## Hard Gates

- Do not execute a plan whose `Status` is not `approved`.
- Do not edit code while the working branch is `main` or `master`
  without explicit developer consent.
- Do not execute while an `Execution gate` remains unmet.
- Do not execute when the plan has an unresolved readiness state such
  as `needs-design`, `needs-slice-amendment`, `blocked`, or unanswered
  `needs-developer-decision`.
- Do not silently decide developer-owned questions.
- Do not cross the slice's `Scope: out`.
- Do not edit canonical specs to make implementation easier.
- Do not put execution logs, task checklists, or full reasoning notes
  in `docs/`.
- Do not invoke `aventuras-design` autonomously. If canonical product
  or architecture uncertainty appears, stop and recommend a
  developer-run design session.
- Do not spawn subagents from this skill. If subagent execution is
  wanted, switch to `aventuras-slice-execute-subagents`.
- Do not commit from this skill. The closing handoff to
  `aventuras-slice-finish` offers the commit, on explicit developer
  approval only.
- Do not claim completion without fresh verification evidence produced
  after the last edit.

## Workflow

### 1. Preflight

Read in parallel where possible:

- `AGENTS.md`
- `docs/implementation/conventions.md`
- the approved plan file
- the linked milestone doc
- the linked slice doc
- `.claude/rules/code.md` if source files may change
- `.claude/rules/docs.md` if docs may change
- `docs/followups.md`
- `git status --short --branch`

If the user gives a slice identifier instead of a plan path, find the
matching `.impl-plans/<milestone>-<slice-file-stem>.md`. Continue only
when exactly one matching plan exists.

Validate before editing:

- `Status: approved`
- readiness state is executable
- approval fields are filled or the plan otherwise clearly records
  developer approval
- execution gate is `none` or currently satisfied
- linked milestone and slice docs resolve
- slice `Scope: out` does not conflict with planned work
- task clusters have usable dependencies
- evidence matrix has concrete commands/checks
- stop conditions are understood
- worktree changes do not conflict with the files this plan owns
- the working branch is not `main`/`master`, or the developer has
  consented to editing it

Stop with a blocker report if any gate fails.

Then read the plan critically, as a reviewer rather than a
checklist: look for correctness risks, missing edge cases, weak or
unfalsifiable evidence, and route assumptions that look wrong. The
plan was approved, but execution is the last chance to catch a flaw
the planner and developer missed. If a concern would change the
implementation route, raise it with the developer before editing
rather than executing a plan you do not trust.

### 2. Reconcile With Current Checkout

Do a narrow drift check before implementation:

- Confirm planned existing files still exist.
- Confirm planned new files do not already exist with unrelated
  content.
- Confirm relevant scripts in `package.json` or repo tooling exist.
- Confirm important imports, exports, configs, schemas, and tests still
  match the plan's assumptions.
- For dependency slices, confirm the dependency is merged or the plan
  pins a sufficient contract.

If drift changes the route, stop and return to planning. Name the plan
section that needs revision and the evidence you observed.

Then run a baseline check before implementing. Execute the full test
suite once (`pnpm test:run`) with its output redirected to a
temporary log file, and capture the exit code. Read the exit code and
the log tail; read more only when the tail does not explain the
result. A green baseline lets any later failure be attributed to this
slice. A red baseline means the branch did not start clean — report
the pre-existing failures and ask whether to proceed before editing.
If the suite is too noisy or slow to capture and classify cleanly,
say so; that is a test-infrastructure problem in its own right.

### 3. Execute By Cluster

Use the plan's Task Clusters as the local work unit.

- Respect `Depends on` ordering.
- Keep a cluster progress list; mark a cluster done only after both
  its implementation and its verification pass.
- Run dependency-free clusters in any safe order, but execute them
  inline in this session.
- Before editing a cluster, read the local patterns for the files being
  touched.
- Follow the plan's steps closely. Ordinary implementer choices already
  delegated by the plan may be made and recorded in the final report.
- Keep edits scoped to the cluster's files and the slice's scope.
- After each cluster, run the cluster-level verification when it is
  cheap enough to catch bad assumptions early.

For behavior-bearing code, use TDD discipline where practical: pin
observable behavior through public interfaces, get a failing signal
first when adding a new test, then make it pass and refactor while
green. When a regression test is added after a bug fix, prove it
catches the bug: revert the fix and confirm the test fails, then
restore the fix and confirm it passes.

### 4. Use Other Skills Deliberately

The plan's `Skill Plan` is the first source of truth.

Use direct domain skills when their trigger point arrives, such as
TypeScript, React/React Native, accessibility, API design, testing,
or docs skills.

Built-in execution discipline:

- Fresh evidence before completion claims.
- Public-interface tests for behavior-bearing code.
- Lint/test commands come from the evidence matrix by default.
- Read the final diff like a reviewer before reporting completion.

Use `debug-like-expert` only when execution hits an unexplained
failure, contradiction, or blocker that needs evidence and hypotheses.

### 5. Stop Conditions

Stop rather than invent when:

- the plan is not approved or no matching plan is unambiguous
- an execution gate is unmet
- current code contradicts the plan in a route-changing way
- a plan-delegated implementer choice becomes a developer decision
- a canonical spec change appears necessary
- a `Scope: out` item becomes required
- an acceptance criterion is impossible or not falsifiable
- required verification cannot run and no equivalent evidence exists
- a required dependency install or network operation is blocked

Report the affected plan section, observed evidence, and next route:
re-plan, design session, slice-doc amendment, or environment/tooling
fix.

### 6. Final Verification

After the last edit:

- Run every applicable evidence-matrix command/check.
- Run any extra checks made necessary by implementation discoveries.
- Inspect `git diff --stat` and relevant hunks.
- Confirm no unrelated user changes were reverted.
- Confirm the diff stays within slice and plan scope.
- Add or recommend a brief slice-doc `Implementation notes` entry only
  if a durable rationale emerged; never write a task log there.

If any required verification fails, fix and re-run, or report the
blocker. Do not claim the slice is complete on partial evidence.

## Completion Report

When done, report concisely:

- plan path and slice
- changed file groups
- evidence commands/checks and pass/fail results
- unresolved risks or skipped checks, if any
- any implementation note added or recommended

Do not update the plan file with run logs unless the user asks. The
final response is the execution record until a PR body or tracker
exists.

## Handoff

Step 6 verifies the slice against its plan — the evidence matrix and
acceptance criteria. It does not format, lint, or commit. After the
completion report, hand off to the `aventuras-slice-finish` skill: it
runs the repo-wide commit-readiness gates (format, lint, typecheck,
full test suite) and offers a commit on explicit developer approval.
Skip the handoff only when the developer asks to stop before
finishing.
