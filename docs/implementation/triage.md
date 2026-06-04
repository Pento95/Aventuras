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

- **`turnCaptureSink` captures per run, not per user turn** (faulty spec —
  the name is the intent, the keying is the defect). The sink keys every
  capture on `actionId` (`lib/diagnostics/sinks/turn-capture-sink.ts`), so
  one capture = one pipeline run. But a user turn spans several runs — the
  per-turn run, a chained chapter-close successor, and any periodic-classifier
  passes each hold their own `actionId` — so one user-visible turn fragments
  into 2–3 captures. Design revisit: re-key / group captures on the
  originating story entry (+ branch) rather than `actionId`, likely riding on
  a story-entry ↔ run linking mechanism (today the only cross-run linkage is
  delta-level, via the survival anchor `deltas.entry_id`). Spec home:
  [`observability.md`](../observability.md); becomes user-visible in the M7
  memory-probe surface, where the fragmentation shows.
