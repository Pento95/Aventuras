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

- **`turnCaptureSink` code lags the revised turn-grouping contract**
  (sooner rather than later). The capture contract was revised to group
  captures into turns —
  [`observability.md → turnCaptureSink`](../observability.md#turncapturesink):
  `TurnCapture` gains `kind` + `anchorEntryId`, `beginTurn` takes
  `{ actionId; kind; branchId; anchorEntryId? }`, a `recordTargetEntry`
  setter lands the (currently never-set) `targetEntryId` + the per-turn
  anchor, and `recordClassifierOutput` / `classifierOutputRaw` are
  dropped (the classifier's output is read from its LLM call's response
  body in the inspector's Calls section). The shipped M1 code
  (`lib/diagnostics/sinks/turn-capture-sink.ts`) and its only consumer
  (the `__DEV__` smoke producer) still implement the pre-revision
  shape, and the M1 slice doc
  [`05a-pipeline-core.md`](./milestones/01-spine/slices/05a-pipeline-core.md)
  restates it. Align the sink shape (+ its smoke consumer + the 05a
  restatement) to the revised contract now; orchestrator-side stamping
  of `kind` / `anchorEntryId` lands with the real capture producers in
  M2 / M3 per [`roadmap.md`](./roadmap.md).
