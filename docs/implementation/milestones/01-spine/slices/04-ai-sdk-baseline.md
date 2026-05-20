# Slice 1.4 — Vercel AI SDK baseline

## Metadata

- **Milestone:** [Milestone 1 — Spine](../milestone.md)
- **Depends on:** [Slice 1.3](./03-observability-foundations.md)
  — `httpCallSink` slice is declared empty in 1.3; this slice
  populates it. AI SDK calls route through `logger` from their
  first commit.
- **Blocks:** Slice 1.5 — the pipeline framework's stub LLM
  needs the provider abstraction even when the call is faked,
  and the orchestrator's ambient `actionId` mechanism reads
  from the sink-aware ID slot wired here.

## Goal

Lay down the AI SDK integration layer as `lib/ai/`, the third
`lib/*` module. By the end of this slice the project has a
typed `getModel(providerId, modelId)` abstraction over the
Vercel AI SDK, every outbound HTTP request goes through a
fetch wrapper that captures the call into `httpCallSink`, and
the `httpCallSink` itself is fully implemented (beginCall /
completeCall / failCall, ring buffer, header redaction at the
sink boundary, denylist drift mitigations). One provider type
(Anthropic) is wired through end-to-end to prove the
abstraction works; other provider types land as real features
need them.

## Background

Milestone 1 doesn't make real LLM calls — slice 1.5 ships a
fault-injectable stub at the pipeline layer that bypasses real
providers. So slice 1.4's job is to put the production HTTP and
provider plumbing in place such that when slice 1.5's stub is
swapped for real calls in later milestones, no scaffolding
needs to be retrofitted.

The HTTP capture pattern follows the observability spec
literally: the wrapper allocates an ID at `beginCall`, holds it
locally between begin and complete / fail, accumulates streaming
bodies internally, and emits one `completeCall` at stream end
with the final body and `streamed: true`. No event-bus routing,
no incremental store updates during streaming — diagnostics is a
parallel concern routed through direct sink calls.

Header redaction happens at the sink boundary, never at the
call site. API keys (Authorization, x-api-key, etc.) exist
unredacted only inside the wrapper's local scope during a
single request's lifecycle; they never reach the Zustand store,
so they can't leak via screenshot, export, or shared session
view.

## Required reading

- [`docs/observability.md` → `httpCallSink`](../../../../observability.md#httpcallsink)
  — the sink contract, record shape, beginCall / completeCall /
  failCall surfaces.
- [`docs/observability.md` → Pairing](../../../../observability.md#pairing)
  — wrapper-holds-id pattern; no correlation logic in the sink.
- [`docs/observability.md` → Streaming](../../../../observability.md#streaming)
  — body accumulation inside the wrapper; single completeCall
  at stream end.
- [`docs/observability.md` → Ring buffer behavior](../../../../observability.md#ring-buffer-behavior)
  — eviction rules, in-flight protection, turn-resident
  protection.
- [`docs/observability.md` → Header redaction](../../../../observability.md#header-redaction)
  — denylist, build-time completeness test, dev-build runtime
  heuristic warning.
- [`docs/observability.md` → Performance budget](../../../../observability.md#performance-budget)
  — target overhead for `beginCall` / `completeCall`.
- [`docs/data-model.md` → App settings storage](../../../../data-model.md#app-settings-storage)
  — `app_settings.providers` shape; provider instances are
  user-managed and reference `type` (anthropic / openai /
  google / openrouter / nanogpt / nvidia-nim / openai-compatible).

## Scope: in

- Add `ai` (Vercel AI SDK core) and `@ai-sdk/anthropic` to
  project dependencies. Other `@ai-sdk/*` providers land with
  the features that need them.
- Create `lib/ai/` as the third `lib/*` module under Slice 1.1's
  discipline:
  - **Public API in `index.ts`**: `getModel(providerId,
modelId): LanguageModelV1` — given a provider instance ID
    from `app_settings.providers` and a model ID, returns an
    AI SDK `LanguageModelV1`. Internal lookup reads from
    `lib/db` via the appSettings table, instantiates the
    matching `@ai-sdk/<type>` provider with the stored apiKey
    / endpoint / customHeaders, and returns `provider(modelId)`.
  - Internal organization: implementer's call. Likely shape:
    `model.ts` (the getModel function), `providers.ts`
    (provider-type-to-SDK mapping), `fetch.ts` (the
    fetchWithCapture wrapper), `headers.ts` (denylist and drift
    mitigations).
- Implement `fetchWithCapture` inside `lib/ai/`:
  - Wraps native `fetch`. Allocates an ID via
    `httpCallSink.beginCall` before the call; on success calls
    `completeCall` with status, headers, and final body
    (accumulated for streams); on error calls `failCall`.
  - Reads ambient `actionId` if available (the mechanism lands
    in slice 1.5; until then `actionId` is undefined and the
    sink handles undefined gracefully).
  - Accepts a `source` argument (e.g. `'provider:<id>'`) so the
    `HttpCall` record's `source` field is populated. Wrapper
    needs a thin layer that lets callers inject the source per
    call since AI SDK's `customFetch` doesn't pass arbitrary
    metadata; likely a per-provider closure that pre-binds
    source.
- Pass `fetchWithCapture` into AI SDK calls as the `customFetch`
  option on the provider factory or per-call options.
- Implement `httpCallSink` in `lib/diagnostics/` (the
  declared-empty slice from 1.3):
  - `beginCall` allocates a ULID, builds the in-flight
    `HttpCall` row with redacted headers, appends to the
    `httpCalls` ring buffer.
  - `completeCall` looks up the row by ID, mutates in place to
    `state: 'completed'` with status / response headers
    (redacted) / response body / streamed flag / durationMs.
    Row identity stays stable so React keys don't churn.
  - `failCall` mutates the row to `state: 'failed'` with error
    string.
  - Ring buffer capped at 200 entries; eviction protects
    in-flight entries and completed entries whose `actionId`
    is still resident in `turnCaptures` (the cross-tab nav
    contract). Slice 1.5 wires the `turnCaptures` resident set;
    until then, the protection just degrades to FIFO over
    completed rows.
- Header denylist and drift mitigations:
  - Static denylist seeded with `authorization`, `x-api-key`,
    `cookie`, `set-cookie` (case-insensitive).
  - Per-provider auth header names from each `@ai-sdk/*`
    package extend the denylist when their provider type is
    loaded.
  - **Build-time test**: walks the loaded provider type list,
    asserts every known auth header name appears in the
    denylist. Fails CI on drift when a new provider type adds
    a header name without a denylist update.
  - **Dev-build runtime warning**: when a request header name
    matches the heuristic regex
    (`/auth|key|token|secret|credential|cookie/i`) but isn't
    on the denylist, emit `logger.warn('provider.suspicious_header_unredacted', { headerName })`.
- Add the `provider.*` subsystem prefix to `LogSubsystem` if it
  isn't already in the union from slice 1.3 (the spec lists
  `provider` as one of the eight initial members — confirm
  during authoring).

## Scope: out

- Real LLM calls from milestone-1 user flows. Slice 1.5's stub
  LLM is what milestone-1's smoke triggers; this slice only
  ships the production plumbing.
- Multi-provider support beyond Anthropic. OpenAI / Google /
  OpenRouter / NanoGPT / NVIDIA NIM / openai-compatible all
  land as the features needing them ship. The abstraction is
  designed to make adding them a one-line entry in the
  provider-type-to-SDK map.
- Provider settings UI (Add / Edit provider instance, API key
  entry, capability detection). Settings shells in slice 1.7
  render layout only; provider config UI lands in a later
  milestone.
- `/models` endpoint fetching for capability detection. Out of
  scope; lands when the Provider Picker UI needs cached models.
- Embedder integration. The embedder is a future milestone; its
  HTTP calls will also flow through `fetchWithCapture` when
  built.
- Translation, classifier, suggestion, lore-mgmt, retrieval,
  wizard-assist agents. They wire to providers via the same
  abstraction once their orchestration lands.
- Memory probe persistent capture. Unrelated to this slice.

## Acceptance criteria

- `lib/ai/` exists under the public-API discipline; only
  `index.ts` is reachable from outside the module.
- `ai` + `@ai-sdk/anthropic` installed and locked.
- `getModel(providerId, modelId)` returns a valid
  `LanguageModelV1` for an Anthropic-typed provider instance in
  `app_settings.providers`; throws or returns a clear error for
  unsupported types.
- `fetchWithCapture` wraps every outbound call from the AI SDK
  through `httpCallSink`. Non-AI fetch is unchanged.
- `httpCallSink` is fully implemented: beginCall / completeCall
  / failCall mutate the ring buffer with stable row IDs.
- Static and per-provider denylist redacts auth headers at the
  sink boundary. A unit test sends an Anthropic-shaped request
  with `x-api-key: sk-...` and asserts the stored row has
  `'***'`, not the key.
- Build-time test catches drift when a synthetic provider
  package's auth header is missing from the denylist.
- Dev-build heuristic warning fires when a request includes a
  header name matching the regex but absent from the denylist.
- Ring buffer eviction at cap 200: in-flight rows are
  protected; FIFO over completed rows.
- `pnpm lint` passes (boundaries plus console ban).
- `pnpm lint:docs` passes.
- Vitest suite covers all of the above.

## Tests

- **beginCall / completeCall / failCall roundtrips.** Three
  vitest scenarios, one per terminal state. Assert state
  transitions, durationMs computation, and ULID stability across
  the transition.
- **Streaming.** Simulate a streaming response (mock the fetch
  Response with a ReadableStream); assert no incremental sink
  updates during the stream and one `completeCall` at stream
  end with `streamed: true` and full concatenated body.
- **Header redaction.** Request with `authorization: Bearer …`,
  `x-api-key: …`, plus a benign `content-type` header; assert
  the stored row redacts the auth-style headers to `'***'` and
  preserves `content-type` verbatim.
- **Denylist completeness build-time test.** Synthetic provider
  type with a fake auth header name fails the test; real
  provider types pass.
- **Heuristic warning.** Request with a custom
  `x-custom-secret-token` header not in the denylist; assert
  `logger.warn` fires with the header name in fields.
- **Ring buffer eviction.** Fill `httpCalls` to cap with a mix
  of in-flight and completed rows; allocate one more; assert
  the oldest completed (non-in-flight) row evicts and the
  in-flight rows persist.
- **Provider abstraction.** `getModel(providerId, modelId)` for
  an Anthropic provider returns a `LanguageModelV1` (probably
  asserted by structural type check rather than runtime
  behavior, since no real call is made). Unsupported provider
  type throws.
- **Public-API surface.** Fixture outside the module imports
  only via `lib/ai/index.ts`; deep-import attempt fails lint.

## Open questions

- **`source` injection through AI SDK's `customFetch`.** AI
  SDK's `customFetch` signature doesn't carry arbitrary
  metadata. Cleanest implementation likely binds the source via
  closure when constructing the per-provider fetch wrapper:
  `getModel(...)` builds a `fetchWithCapture` instance with
  `source: 'provider:<providerId>'` pre-bound, then passes it
  to the AI SDK. Confirm during authoring; alternative is a
  module-level ambient source register similar to ambient
  actionId, but that's heavier for a value that's known at
  provider-construction time.
- **Turn-resident protection without `turnCaptures`.** The
  spec's ring buffer eviction protects completed rows whose
  `actionId` is still in `turnCaptures`. Slice 1.5 ships
  `turnCaptures`; until then, the protection is a no-op and
  eviction is plain FIFO over completed rows. Acceptable for
  this slice; protection becomes load-bearing once
  `turnCaptures` populates.
- **Per-provider auth-header registration.** Each `@ai-sdk/*`
  package authenticates differently (Anthropic uses
  `x-api-key`, OpenAI uses `Authorization: Bearer`, etc.). The
  build-time denylist test needs a known mapping per provider
  type. For this slice, hand-encode Anthropic's; OpenAI's lands
  with `@ai-sdk/openai`; further providers add as they're
  installed. Acceptable as long as the mapping is co-located
  with the provider import (so adding a provider without
  updating the denylist is mechanically catchable).
- **Anthropic SDK version.** AI SDK provider packages version
  independently; pin to a specific minor at first install to
  avoid surprise upgrades during early milestones. Confirm
  versioning policy at authoring time.
