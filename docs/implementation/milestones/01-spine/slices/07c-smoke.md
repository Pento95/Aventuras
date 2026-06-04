# Slice 1.7c — End-to-end smoke

## Metadata

- **Milestone:** [Milestone 1 — Spine](../milestone.md)
- **Depends on:** [Slice 1.7b](./07b-ui-shells.md) (the
  reader-composer route the trigger injects into);
  [Slice 1.7a](./07a-app-root-boot.md) (the `<Toaster>` the smoke
  toasts through, the bootstrap / crash-recovery wiring, and the
  i18n instance); [Slice 1.5b](./05b-stub-and-recovery.md) (the
  stub LLM and `recoverInFlightRuns()`; transitively
  [Slice 1.5a](./05a-pipeline-core.md)'s orchestrator, action
  layer, and generation store).
- **Blocks:** Nothing — this slice closes Milestone 1.

## Goal

Land the milestone's verifying smoke: a debug-only trigger in the
reader-composer that fires a stub-LLM pipeline run through the
orchestrator and proves the whole spine composes — the action
layer, the Path A delta handler, the logger, `httpCallSink`,
`turnCaptureSink`, `pipeline_runs`, the generation store, and the
`<Toaster>`. By the end of this slice the Milestone-1 Definition of
Done is met.

## Background

The smoke is debug scaffolding, not feature delivery. It needs a
story, a branch, and a current-branch reference to call
`orchestrator.beginRun`. Rather than building a real story-creation
flow, the trigger creates a synthetic story and branch via direct
`lib/db/` writes when no current story exists, then calls the
orchestrator with a `'smoke'` pipeline kind that uses the stub LLM
(happy scenario). This bypasses the action-layer-only-mutator
discipline for the database writes — accepted because the code is
scaffolding that will be removed when real story-creation UI lands.
Flag the file with a `TODO(spine)` comment to make the lifecycle
explicit.

## Required reading

- [`docs/generation-pipeline.md` → Phase function contract](../../../../generation-pipeline.md#phase-function-contract)
  — the shape of the phase the `'smoke'` kind defines.
- [`docs/observability.md` → `httpCallSink`](../../../../observability.md#httpcallsink)
  — the entry the stub's call produces.
- [`docs/observability.md` → actionId threading](../../../../observability.md#actionid-threading)
  — the join key threaded from the fetch wrapper through the call.
- [`patterns/toast.md`](../../../../ui/patterns/toast.md) — the
  success / failure toast that proves the queue → mount path.
- [Slice 1.5b → Implementation notes](./05b-stub-and-recovery.md#implementation-notes)
  — the stub scenarios, `beginRun` / `getPerTurnContext`, and the
  `__DEV__` stub-production guard.

## Scope: in

- **`'smoke'` pipeline kind** — one phase that calls the stub LLM
  with the `'happy'` scenario, emits one delta, and completes.
  Defined inline this slice. If a later milestone defines a real
  pipeline kind that overlaps this name, the smoke kind renames or
  moves to a `pipelines/smoke.ts` file scoped to debug builds.
- **Smoke trigger in the reader-composer:**
  - Debug-only affordance — visible in `pnpm dev` builds, gated by
    a build-time constant for production (omit the button or render
    it as a no-op). Note: the `'stub'` provider already throws in
    production via `__DEV__` (Slice 1.5b), so the button gating is
    belt-and-suspenders — the button must still be hidden / no-op
    in production, not rely on the provider throw.
  - On click: ensure a synthetic story and branch by fixed id
    (`story_smoke` / `branch_smoke`) via direct `lib/db/` writes
    (`TODO(spine)`, create-if-absent — not a `currentBranchId === null`
    guard; see [Implementation notes](#implementation-notes)), then
    call `setCurrentStory` / `setCurrentBranch`.
  - Then call `runPipeline('smoke', ctx)` (the public orchestrator
    entry).
  - Visual feedback: a non-blocking indicator showing
    in-flight / completed / failed state — in-flight from a
    `useGeneration` selector (`txState.runs.size`), terminal from the
    awaited `TxResult`.
  - A success / failure toast, proving the imperative `toast` →
    `<Toaster>` path Slice 1.7a mounted.
- **Removal followup** logged in
  [`docs/followups.md`](../../../../followups.md) at merge — the
  trigger and its synthetic-story bootstrap are removed when real
  story-creation UI ships.
- Storybook story for the stub-scenario picker if a developer-facing
  affordance proves useful; otherwise none ships.

## Scope: out

- Story-creation UI (real wizard, title input, cover image). The
  synthetic story is debug scaffolding; real story-creation lands
  in its own slice in a later milestone.
- Real LLM provider integration. The stub LLM is what runs; real
  providers come with the provider settings UI.
- The screens themselves and navigation —
  [Slice 1.7b](./07b-ui-shells.md).
- i18n install, `<Toaster>` mount, bootstrap order, diagnostics
  rework, recovery screen — [Slice 1.7a](./07a-app-root-boot.md).
  (The crash-recovery **pass** is wired in 1.7a; this slice does
  not re-own it.)
- Diagnostics Hub UI tabs (Logs, Calls, Per-turn inspector).

## Acceptance criteria

- The smoke trigger fires a stub-LLM pipeline run that completes
  end-to-end:
  - Synthetic story and branch created on first click if no current
    branch.
  - `runPipeline('smoke', ctx)` called (the public orchestrator
    entry; `beginRun` is an internal step).
  - `pipeline_runs` row inserted with `finished_at` NULL, then
    updated to `outcome='completed'`.
  - At least one `logger.warn` or `logger.error` emission shows up
    in `diagnosticsStore.logEntries`.
  - At least one `httpCallSink` entry shows up (the stub LLM's
    outbound call, threaded with the run's `actionId`).
  - One `TurnCapture` populated and finalized with
    `outcome='completed'`.
  - Generation store reflects the run lifecycle: `txState.runs`
    non-empty during, empty after (the store has no `currentRun`
    field).
  - A success / failure toast fires.
- Production-build debug-trigger gating: built with the
  production-mode constant, the trigger is either absent from the
  DOM or no-ops on click.
- Removal followup logged in
  [`docs/followups.md`](../../../../followups.md).
- `pnpm lint` passes.
- `pnpm lint:docs` passes.
- Vitest tests pass.
- Manual cross-platform smoke: the trigger fires on Electron
  desktop and an Android emulator; the toast appears; the run
  completes.

## Tests

- **Smoke trigger end-to-end.** Vitest integration test: click the
  trigger; assert the synthetic story and branch are created,
  `orchestrator.beginRun` is called, the full lifecycle completes,
  all sinks populate, and the toast is enqueued.
- **Production-build debug-trigger gating.** Build with the
  production-mode constant; assert the trigger is either absent
  from the DOM or no-ops on click.
- **Manual cross-platform smoke.** Documented checklist for the
  implementer to walk on Electron desktop and an Android emulator:
  trigger fires, run completes, toast appears.

## Open questions

None remaining. The four planning questions — synthetic story/branch
shape, `'smoke'` kind definition, trigger placement, and the removal
followup — were resolved during planning and implementation; the
notable choices are recorded in
[Implementation notes](#implementation-notes) and the followup is logged
in [`docs/followups.md`](../../../../followups.md). One forward-looking
contingency stands: if a later milestone defines a real pipeline kind
named `smoke`, this debug kind renames or moves to a `pipelines/smoke.ts`
scoped to debug builds.

## Implementation notes

- **`lib/ai` gained a `registerStubProvider()` dev seam — an unplanned
  public-API touch.** The temporary provider registry had only
  test-only writers (`set*ForTests` / `reset*ForTests`, unexported), so
  in a dev build `getModel('stub', 'happy')` threw "not configured" at
  runtime. `registerStubProvider()` (idempotent, returns the `'stub'`
  id) is the narrowest runtime seam and reuses the resolution path
  `getModel` already walks. It is part of what the removal followup rips
  out when real provider-settings UI lands.
- **The synthetic branch is keyed off a fixed id with create-if-absent,
  not the brief's `currentBranchId === null` guard.** Slice 1.7b's
  landing "Open reader (debug)" button seeds `currentStory` /
  `currentBranch = '__debug__'` — non-null but with no DB row — so a
  null-check would skip creation and the `createStoryEntry` delta would
  FK-fail. `runSmoke` ensures `story_smoke` / `branch_smoke` by fixed id
  (story title "Smoke test story", branch name "main"), robust to the
  sentinel and to repeat clicks.
- **The phase emits one benign `recoverable_error` on purpose.** The
  happy path otherwise logs only `pipeline.run_complete` at debug, and
  `isDebugEnabled` is not `__DEV__`-forced (only `isEnabled` is —
  `lib/boot/bootstrap.ts`), so that line is dropped by default in a dev
  build. The orchestrator logs `recoverable_error` at warn and the run
  still completes, which is what makes the "≥1 `logger.warn`" criterion
  hold on-device. Do not remove the emission without replacing the warn
  source.
- **In-flight state reads a `useGeneration` selector
  (`txState.runs.size`); the terminal outcome comes from the awaited
  `TxResult`, not the store.** The generation store has no `currentRun`
  field and empties `txState.runs` on finish, so there is no terminal
  record for a selector — the acceptance criterion's "non-null during,
  null after" maps to `txState.runs` non-empty during / empty after.
- **Tested at the `runSmoke(deps)` seam against `createTestDb()`, not a
  route render + click.** The `unit` vitest project is node-env, the
  runtime `db` is an Electron-IPC singleton with no vitest backing, and
  the repo exercises component interaction via Storybook. `runSmoke`
  fires its own toast so the success path is node-testable; a second
  test proves the production no-op. No Storybook story / inventory row
  ships for the throwaway trigger. The public orchestrator entry is
  `runPipeline(kind, ctx)` — the brief's `orchestrator.beginRun` is an
  internal step.
