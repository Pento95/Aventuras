# Implementation triage

Inbox for cross-cutting deferrals surfaced during implementation that
have **no single downstream slice to own them** — the items that would
otherwise be dropped straight into [`followups.md`](../followups.md) or
[`parked.md`](../parked.md) and lost.

Drop them here first. This file is a **queue, not a ledger**: an item
living here means "not yet triaged," not "deferred forever." Triage
happens as a separate pass — each item is read, then routed to its real
home (a specific slice's Open questions, the active
[`followups.md`](../followups.md) ledger, [`parked.md`](../parked.md), a
canonical spec change) or deleted if it dissolves on inspection. Keep
the queue short; a growing inbox is the signal to triage.

A deferral that a **specific downstream slice** will own does not belong
here — it goes straight into that slice's Open questions, where the
slice-planning gate forces its resolution before that slice is planned.

## Inbox

- **Orchestrator finalization-write leak window.** `runPipeline`'s
  `try`/`catch` wraps only the phase loop; if the terminal
  `pipeline_runs` marker write in `commitRun` / `abortRun` throws, the
  `clearCurrentActionId()` and `domain.clearActiveRun()` that follow are
  skipped, leaking both module-level singletons into the next run. The
  ambient half pre-dates 1.5b (1.5a); 1.5b widened it with `activeRunId`.
  Cheap fix is a `try`/`finally` guaranteeing the clears, but it wants a
  deliberate finalization-failure-semantics call (propagate vs swallow;
  turn-finalize on a failed marker write) and a regression test. Low
  probability on local SQLite. Source: Slice 1.5b final review.
- **Chained-execution context threading.** When chained pipelines are
  unparked, `commitRun` must hand the successor run its ambient
  `actionId`, active-run pointer, and intermediates — today all are
  cleared at the predecessor's commit. Source: Slice 1.5b (chaining is
  Scope: out / parked).
- **Structured `action-layer` PipelineError fields.** `tableName`,
  `targetId`, and `constraintViolated` are defined on the `action-layer`
  error variant but unpopulated; extracting them from a constraint throw
  needs a SQLite-error mapper. Diagnostics-Hub-adjacent. Source: Slice
  1.5b.
- **Shipped `CallRetryError` → `PipelineError` mapper.** The mapping that
  turns the retry helper's recoverable errors into pipeline errors lives
  only in the 1.5b fault test; the first concrete pipeline kind will need
  a shipped version. Source: Slice 1.5b.
- **Reconcile `generation-pipeline.md`'s `callWithRetry` sketch.** The
  canonical doc still shows the illustrative `{ result, recoverable }`
  signature; the shipped helper returns a discriminated `ok` / `failed` /
  `aborted` union over a `lib/ai`-local error type. Source: Slice 1.5b.
