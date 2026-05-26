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

### Sheet vs Modal — general-use review

Two related questions about the project's overlay strategy that
need an explicit decision before more dialog / sheet surfaces
land:

1. **Sheet vs Dialog/Modal for general use.** Should the project
   keep the current dual `Sheet` + `Dialog` primitives, or
   consolidate around `Dialog`/`Modal` and retire `Sheet`? The
   `ImportDialog` design pass picked `Dialog` outright (per
   [import-dialog.md](./ui/patterns/import-dialog.md)); other
   shipped dialog compounds use `@rn-primitives/dialog` too. If
   `Sheet` lacks load-bearing consumers v1 doesn't already have,
   consolidating would simplify the overlay story.

2. **Native form-sheet `Modal` vs `@rn-primitives/dialog`.** The
   [`ui-native-modals.md` rule](../.agents/skills/vercel-react-native-skills/rules/ui-native-modals.md)
   recommends native `Modal` with `presentationStyle="formSheet"`
   on native (built-in gestures, accessibility, better
   performance). Current dialog compounds use
   `@rn-primitives/dialog`, which is overlay-based. Worth a
   focused review of whether to migrate native dialogs to the
   native form-sheet `Modal`, given the cross-platform behavior
   delta.

Both axes affect every existing dialog compound
(`CollisionResolveDialog`, `EmbedderDownloadDialog`,
`ImportDialog`), so the decision should land before the v1 ship
gate.

### Diagnostics hub — per-tab body design passes

[`diagnostics.md`](./ui/screens/diagnostics/diagnostics.md) is
at "surface inventory only" — the hub shell (top-bar, tab strip,
story selector, cross-tab nav, empty states, mobile expression)
is designed, plus tab 1 (memory probe) which is the existing
spec. Tabs 2–5 (per-turn inspector / call log / logs / delta
log) each have body content described but at the "what's in
this tab" level, not pixel-level interaction. Each needs its
own per-tab detail design pass before
[M7.3](./implementation/roadmap.md#m7--app-settings--diagnostics--onboarding)
can scaffold it. The passes can sequence (one per tab) or batch;
likely owned by the implementer of M7.3 with design support
per tab.
