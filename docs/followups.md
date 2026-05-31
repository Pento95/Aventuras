# Follow-ups

Top-level ledger of **active** outstanding items — design questions
or work the current milestone (v1) needs answered, or that block
other v1 work. Resolved items are **removed** (not crossed out); the
commit that resolves an item carries the resolution narrative.

Items confirmed for a future milestone or parked indefinitely
pending signal live in [`parked.md`](./parked.md). Movement between
the two files is normal as scope clarifies; see
[`conventions.md → Followups vs parked`](./conventions.md#followups-vs-parked)
for the placement rule.

## UX

- **`lib/toast` is behind the `toast.md` contract.** The shipped
  module implements only `success` / `error` / `info`; the canonical
  [`toast.md → Severity`](./ui/patterns/toast.md#severity) specs a
  fourth `warning` severity, and
  [`toast.md → Action button`](./ui/patterns/toast.md#action-button)
  specs an inline `ToastAction` slot. Both are unimplemented
  (swipe-dismiss and the cap-3 queue are done). v1 call-sites need
  them — the
  [`display-translation` misses toast](./architecture.md#display-translation-post-narrative)
  fires `warning` severity with a Retry action. Lands with the
  toast / UI build-out, not the spine milestone. Side note for
  whoever picks this up: the queue is a custom emitter rather than
  Zustand (a deliberate scaffold call, but its "avoid Zustand for one
  consumer" rationale is now stale since Zustand landed in 1.3 / 1.5a);
  migrating to a vanilla store for consistency with `diagnosticsStore`
  / `generationStore` is optional and non-functional.
