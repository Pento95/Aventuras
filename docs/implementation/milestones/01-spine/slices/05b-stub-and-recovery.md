# Slice 1.5b — Stub LLM, fault scenarios, crash recovery

## Metadata

- **Milestone:** [Milestone 1 — Spine](../milestone.md)
- **Depends on:** [Slice 1.5a](./05a-pipeline-core.md) (the
  orchestrator, action layer, `deltas` table, reverse-replay
  primitive, `pipeline_runs` writers, ambient `actionId` slot,
  and `turnCaptureSink` this slice drives); [Slice 1.4](./04-ai-sdk-baseline.md)
  (the provider abstraction, `httpCallSink`, and the
  `createFetchWithCapture` wrapper the stub routes its calls
  through).
- **Blocks:** [Slice 1.7](./07-ui-shells.md) (the milestone-1
  end-to-end smoke triggers the stub through the orchestrator
  and expects an `httpCallSink` entry).

## Goal

Complete the spine's engine side with the two pieces that need a
realistic call path: the fault-injectable **stub LLM** and the
boot-time **crash-recovery** pass. The stub is a real AI-SDK
provider model driven by a scenario-parameterized fault-injecting
`fetch` routed through `createFetchWithCapture`, so it exercises
the real SDK request / parse / stream machinery and emits a
captured `httpCallSink` entry threaded with the run's ambient
`actionId`. The recovery pass reverse-replays orphaned
`pipeline_runs` at startup and returns a `RecoveryReport`. By the
end of this slice the pipeline machinery has been exercised
against the spec's named failure modes in vitest, and an
interrupted shutdown leaves the database consistent on next boot.

## Background

`docs/generation-pipeline.md` is the canonical spec. Slice 1.5a
shipped the framework primitives and proved them with a synthetic
phase; this slice adds the realistic provider surface and the
recovery edge.

**The stub LLM is a real `LanguageModelV3`** per the AI SDK
contract — the installed `ai@6` / `@ai-sdk/provider@3` use the V3
model spec (any "V1" framing in older spec prose predates the
v6 install). Rather than a transport-bypassing mock
(`MockLanguageModelV3` from `ai/test` never calls `fetch`), the
stub drives a real provider model whose `fetch` is a
scenario-driven fault injector wired through
`createFetchWithCapture`. That choice is load-bearing: it routes
the stub through `httpCallSink` (so the milestone DoD's "one
`httpCallSink` entry" holds and the ambient `actionId` threads
through the fetch wrapper's `getActionId`), and it runs the real
SDK parse path so a `malformed-json` scenario genuinely fails the
parser instead of a hand-faked error. The stream-shaping uses
`ai/test`'s `simulateReadableStream` / `convertArrayToReadableStream`.
The stub is exposed via a `'stub'` provider type added to the
`ProviderType` union from Slice 1.4; production builds reject
`'stub'` creation so it can't leak into a shipped app.

The crash-recovery pass runs in the fixed boot slot per the spec
(after migrations, before the first user-facing surface renders).
It reads `pipeline_runs WHERE finished_at IS NULL`, reverse-replays
each dirty orphan (marking `outcome='recovered'`), deletes
pre-first-delta clean orphans (delta count = 0), and returns a
`RecoveryReport`. Per-orphan `DeltaReplayError` is caught and
logged (`pipeline.recovery_failed`); boot is never blocked and
the orphan retries next boot. For milestone 1 the report is
merely logged via `logger` on any orphans recovered; the recovery
modal that consumes it lands with the Diagnostics Hub later.

## Required reading

- [`docs/generation-pipeline.md` → Phase function contract](../../../../generation-pipeline.md#phase-function-contract)
  — abort-as-value, the recoverable vs fatal error severity
  split that maps each fault scenario to an outcome.
- [`docs/generation-pipeline.md` → Fatal error categories](../../../../generation-pipeline.md#fatal-error-categories)
  — which provider failures are fatal and how they surface.
- [`docs/generation-pipeline.md` → User cancel = abort (no error path)](../../../../generation-pipeline.md#user-cancel--abort-no-error-path)
  — cancellation drains in-flight phases and reverse-replays;
  `outcome='aborted'`, not an error.
- [`docs/generation-pipeline.md` → Crash recovery via pipeline_runs marker table](../../../../generation-pipeline.md#crash-recovery-via-pipeline_runs-marker-table)
  — orphan-row reverse-replay; startup recovery pass;
  pre-first-delta delete semantics; recovery-failure policy.
- [`docs/generation-pipeline.md` → Reverse-replay](../../../../generation-pipeline.md#reverse-replay)
  — the substrate primitive (shipped in 1.5a) that
  `recoverInFlightRuns` consumes.
- [`docs/observability.md` → `httpCallSink`](../../../../observability.md#httpcallsink)
  — the sink the stub's call routes through; the `actionId`
  join key threaded from the fetch wrapper.
- [`docs/observability.md` → Ambient actionId mechanism](../../../../observability.md#ambient-actionid-mechanism)
  — the contract the `httpCallSink` threading verifies for a
  real call path.

## Scope: in

- Implement the fault-injectable stub LLM at `lib/ai/` internals:
  - A real AI-SDK provider model whose `fetch` is a
    scenario-driven fault injector routed through
    `createFetchWithCapture` (so `httpCallSink` captures it and
    the ambient `actionId` threads through the wrapper's
    `getActionId`). Stream bodies shaped with `ai/test`'s
    `simulateReadableStream` / `convertArrayToReadableStream`.
  - Scenario configs: `'happy'`, `'malformed-json'`,
    `'mid-stream-timeout'`, `'refusal'`, `'cancellation-respects'`.
  - Exposed via the `'stub'` provider type added to the
    `ProviderType` union (`lib/ai/types.ts`); the `'stub'` case
    wired into `createProviderModel` (`lib/ai/providers.ts`).
  - Production builds reject `'stub'` provider creation
    (compile-time build-mode constant, or runtime throw at the
    provider factory if the build flag isn't set).
- Implement `recoverInFlightRuns()` + `RecoveryReport` in
  `lib/pipeline/` (added to the public API; the app-startup
  bootstrap wiring lands in Slice 1.7):
  - Runs after migrations complete (per Slice 1.2's bootstrap
    order), before the first user-facing surface renders.
  - Reads the orphan rows (`pipeline_runs` where `finished_at`
    is null), oldest-first.
  - For each orphan: reverse-replay deltas (via 1.5a's
    primitive); on a non-zero delta count, update the marker
    with `outcome='recovered'`; on a zero count (pre-first-delta
    orphan) delete the row instead.
  - Per-orphan `DeltaReplayError` caught, logged
    `pipeline.recovery_failed` at `error` severity, orphan left
    `finished_at = NULL` for next boot; loop continues.
  - Returns a `RecoveryReport` with `reversed` and `failures`;
    M1 logs recovered orphans via `logger` — no UI consumer.
- `httpCallSink` `actionId` threading verification — the half
  deferred from Slice 1.5a (no call went out there): a stub run
  populates `HttpCall.actionId` with the run's `actionId`.
- Vitest suite:
  - **Malformed JSON** — stub returns unparseable structured
    output → phase fails with structural-error severity →
    `abortRun` → reverse-replay → `outcome='failed'`.
  - **Mid-stream timeout** — stub starts streaming, never
    completes within timeout → phase aborts → reverse-replay →
    `outcome='failed'`.
  - **Refusal** — stub returns a model-refusal pattern → phase
    aborts → reverse-replay → `outcome='aborted'` or `'failed'`
    per the error-severity split.
  - **User cancellation** — `abortController.abort()` mid-run →
    drain in-flight phases → reverse-replay → `outcome='aborted'`.
  - **Crash recovery** — seed `pipeline_runs` + `deltas` with
    synthetic orphans (with and without associated deltas);
    `recoverInFlightRuns()` reverse-replays the dirty orphans,
    deletes the clean ones, returns the expected `RecoveryReport`.
  - **Production stub-provider rejection** — with the
    production-mode flag set, attempting to construct a `'stub'`
    provider throws.
  - **httpCallSink actionId threading** — inside a stub run,
    assert `httpCallSink.beginCall` populates `HttpCall.actionId`
    with the run's `actionId`.
- Storybook stories for the stub LLM scenario picker if a
  developer-facing affordance is useful in Slice 1.7's smoke
  trigger; otherwise no UI ships here.

## Scope: out

- The pipeline core — orchestrator, action layer, `deltas` table,
  reverse-replay primitive, `pipeline_runs` writers, generation
  store, `turnCaptureSink`, ambient `actionId` slot. Slice 1.5a.
- Real LLM provider use through the framework — this slice uses
  the stub; real providers come in later milestones.
- Recovery modal UI. The spec describes it; `RecoveryReport` is
  plumbed and logged only. The surface lands with the
  Diagnostics Hub or its own pass later.
- Per-turn inspector UI, Call log, Logs tab — Diagnostics Hub
  work, separate milestone.
- Streaming-aware retry / partial-content persistence. V1 loses
  mid-stream partial content on failure (per the spec's
  deferred list).

## Acceptance criteria

- The stub LLM exposes a parameterized fault-injection surface; a
  stub run routes through `createFetchWithCapture` and produces
  an `httpCallSink` entry carrying the run's `actionId`.
- Production builds reject `'stub'` provider creation.
- All four vitest fault scenarios pass (malformed JSON,
  mid-stream timeout, refusal, cancellation), each taking the
  abort path with the correct outcome and logger emission shape.
- Crash recovery identifies orphans on a synthetic dirty startup,
  reverse-replays them (`outcome='recovered'`), deletes
  pre-first-delta orphans, and returns a `RecoveryReport`.
- `pnpm lint` passes.
- `pnpm lint:docs` passes.

## Tests

- **Stub LLM fault scenarios.** Four separate tests, one per
  fault mode (malformed JSON, mid-stream timeout, refusal,
  cancellation). Each asserts the pipeline takes the abort path
  with the correct outcome and logger emission shape.
- **httpCallSink actionId threading.** Inside a stub run, assert
  `httpCallSink.beginCall` populates `HttpCall.actionId`; pairs
  with Slice 1.5a's logger-side assertion to close the ambient
  `actionId` contract across both sinks.
- **Crash recovery.** Pre-populate `pipeline_runs` and `deltas`
  to simulate a dirty shutdown; assert the recovery pass reverses
  deltas, marks rows `'recovered'`, deletes clean orphans, and
  returns the expected `RecoveryReport`.
- **Production stub-provider rejection.** Build with the
  production-mode flag; assert attempting to construct a `'stub'`
  provider throws.

## Open questions

- **Stub wire format.** `createFetchWithCapture` wraps a real
  provider model, so the stub must drive _some_ provider factory
  under the hood — reuse Slice 1.4's `createAnthropic` path with
  Anthropic-shaped canned SSE (lowest friction; 1.4 already wires
  `createAnthropic` + `createFetchWithCapture`, but couples
  scenarios to Anthropic's wire format) or add a minimal
  `openai-compatible` factory. The choice fixes the canned body
  shape the fault injector emits. Resolve at implementation. (If
  a transport-bypassing `MockLanguageModelV3` is chosen instead,
  the milestone DoD's "one `httpCallSink` entry" can't be met by
  the stub — that would need a DoD revisit, so prefer the
  fetch-routed approach.)
- **Production-build guard mechanism.** Compile-time build-mode
  constant vs runtime throw at the provider factory — pick
  whichever the Expo / Electron build config exposes cleanly.
  Either satisfies "stub can't leak into a shipped app."
- **Stub scenario set completeness.** Five scenarios cover the
  spec's named failure modes. If Slice 1.7's smoke surfaces a
  scenario the stub can't represent, extend the scenario enum
  here; not expected.
- **Recovery report consumer.** `RecoveryReport` is plumbed but
  no UI consumes it this slice. Lands with the recovery modal
  (Diagnostics-Hub-adjacent) in a later milestone. For milestone
  1, the report is logged via `logger` on any orphans recovered;
  the user sees nothing.
- **Error-surfacing contract through the orchestrator and action
  layer** (carried from [Slice 1.5a](./05a-pipeline-core.md)).
  1.5a's orchestrator models phase failure only as a returned
  `PhaseResult.failed`; an exception thrown from a phase — e.g.
  `applyDeltaAction` hitting a DB constraint — currently escapes
  `runPipeline` without reverse-replaying or clearing the ambient
  `actionId` / ending the turn. Relatedly, `MutationResult.rejected`
  exists in the action-layer type but is never produced (the action
  is throw-only) and the orchestrator discards the return. This
  slice's fault scenarios are the first code to produce real phase
  errors, so they force the decision: do stub phases catch and
  return `PhaseResult.failed` (no orchestrator change), or throw
  (the orchestrator needs a `try`/`catch` around the phase loop
  routing to `abortRun`, and `applyDeltaAction` either returns
  `rejected` for the orchestrator to branch on or the dead arm is
  dropped)? Resolve before building the fault suite — the chosen
  path determines how each scenario reaches its `'failed'` /
  `'aborted'` outcome. (`PipelineError`'s M1-subset optional fields
  are self-correcting: the stub's first provider error forces them,
  since TypeScript rejects populating a field absent from the type.)

## Implementation notes

_Populated at finish: notable deviations from the plan and resolved developer decisions._
