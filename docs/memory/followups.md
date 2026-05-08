# Followups, schema impact, and Settings UX

What needs to happen for this design to land: schema changes,
Settings UX implications, v1-blocking work, cross-doc updates, and
parked / post-v1 items.

---

## Schema impact summary

Changes that need to land in [`data-model.md`](../data-model.md) for
this design to be implementable:

### `entities`

- Add `name_collision_flag INTEGER DEFAULT 0` for collision review.
- Existing authorship contract preserved (no change).

### `lore`

- Add `keywords TEXT` (JSON `string[]`) for the keyword retrieval
  pathway. User-authored at create; lore-mgmt agent emits at chapter
  close.

### `happening_awareness`

- Add `decay_resistance REAL DEFAULT 0` ∈ `[0, 1]`.
- Add `retrieval_count INTEGER DEFAULT 0` — incremented by the
  ranker when a row is injected (post budget-fill). Drives the
  high-frequency candidate set surfaced to lore-mgmt phase 3d.
  **Delta-logged** under each turn's `action_id` so rollback
  cleanly reverses retrieval-driven counter increments along with
  the prose-revert. Without this, counters would remember
  retrievals from rolled-back turns, inflating phase 3d's
  candidate set with phantom history.
- Add `UNIQUE(branch_id, character_id, happening_id)` constraint.
  Classifier and user-edit paths use upsert semantics — duplicate
  awareness rows can't accumulate at the database level.
- **Drop** `salience REAL` — replaced by the
  `sim_blend × recency_factor` model in the ranker, where
  `recency_factor` integrates `decay_resistance` for the ageing
  story. Old `salience` was a content-blind single number per row;
  the new model is content-aware (`sim_blend` recomputes per turn
  against the current scene). `decay_resistance` carries the
  "resistance to ageing" signal that `salience` implicitly bundled
  with everything else.

### Injection-mode enum

- Rename `keyword_llm` → `auto` across `entities.injection_mode`,
  `lore.injection_mode`, `threads.injection_mode`. Schema migration.

### New table — `embeddings`

- Polymorphic FK across `entity` / `lore` / `happening` / `thread` /
  `chapter`, per-`field`, per-`model_id`, with `vector` blob and
  `source_hash` for staleness detection. Forks with branch.
  See [`retrieval.md → Storage`](./retrieval.md#storage--embeddings-table).

### `stories.settings`

- Add `recentBuffer: number` (default 10).
- Add `fullChapterInBuffer: boolean` (default false).
- Add `classifierCadence: { mode, value }`.
- Add `embeddingBackend: 'provider' | 'local'`.
- Add `retrievalMode: 'embedding' | 'llm-only'` (set at creation,
  immutable).
- Add per-type budget fields:
  `retrievalBudgets: { entities, lore, happenings, threads, chapters }`.
- Add `piggybackMode: 'on' | 'off'` (capability-gated).
- **Drop** `compactionDetail` (was a freeform user prose directive
  for the deprecated memory-compaction agent; chapter-close lore-mgmt
  subsumes its role and the soft-hint UX was deemed marginal value).

### `app_settings`

- Add `embedding_model_id` (canonical id; selectable in App Settings →
  Memory).
- Mirror the new `stories.settings` fields into
  `default_story_settings`.

### Tightening — `retired_reason` example list

- Drop "wandered off" from the example set in the `entities` schema
  description; the example contradicts the hard-finality retirement
  model.

---

## Settings UX implications

The Memory section in Story Settings gets denser:

- Existing: `chapterTokenThreshold`, `chapterAutoClose`.
- Dropped: `compactionDetail`.
- New: `recentBuffer`, `fullChapterInBuffer`, `classifierCadence`,
  `piggybackMode`, `embeddingBackend`, `retrievalMode` (read-only
  after creation), per-type retrieval budget sliders (5 sliders:
  entities, lore, happenings, threads, chapter summaries).

Worth structuring into sub-sections (Recent context / Classifier /
Retrieval / Models) at the design pass for the Memory tab. App
Settings → Memory gets a parallel Story Defaults shape plus the
global `embedding_model_id` selector and the model swap re-index
dialog.

Wireframe and per-control affordance design land at the Story
Settings Memory tab pass.

---

## Followups

### v1-blocking

- **Threshold tuning** — empirical calibration pass for the ranker's
  defaults (`λ_type` per candidate type, `λ_div`, `kw_boost`,
  `min_score_threshold`, `chapter_boost` magnitude, `τ_revive`
  high-similarity bypass), for name-collision reconciliation
  (`τ_high`, `τ_low`), for the frequency-driven candidate set size
  (top-N), and for the consolidation cluster threshold (cosine
  similarity, involvements overlap percentage, time-proximity
  window). Lands once test stories exist to calibrate against;
  defaults ship for v1, advanced settings expose them.
- **Local embedder integration + on-device perf demo (PoC done — production wiring remains)** —
  PoC ran on the `poc/embedder-demo` branch (kept as audit trail,
  not merged). The design is validated; v1-blocking work that
  remains is the production integration (downloader, license dialog,
  settings UI), tracked under that scope below.

  **Runtime path.** ONNX everywhere — `onnxruntime-react-native` on
  Expo, `onnxruntime-node` on Electron. Same ONNX file used on both
  platforms for vector consistency. Transformers.js dropped from
  consideration: pure-JS WASM inference unsuitable for mobile, and
  ONNX-export embeddings differ from transformers.js outputs in
  practice — going ONNX-only on both sides keeps stored vectors
  comparable.

  **Tokenizer (pivoted from original ort-extensions plan).** The
  original spec was `onnxruntime-extensions` custom ops baked into
  the ONNX graph. PoC proved this doesn't work on ORT-RN: its JSI
  string-tensor binding cannot pass strings into custom ops; every
  tested input-shape variant failed with the same buffer-size
  mismatch (`expected 24, got 8`) at `tokSession.run`. The
  tokenizer.onnx file itself is correct — verified in Python with
  cosine 1.000000 vs reference — the bug is in ORT-RN's binding
  layer.

  Pivoted to **`@huggingface/tokenizers`** in JS: pure JS/TS, zero
  dependencies, ~8 KB gzipped, supports BPE / WordPiece / Unigram /
  Legacy (covers every tokenizer family on production HF models).
  Same proven library transformers.js uses internally; consumes
  standard HF `tokenizer.json` directly. Tokenization happens in JS
  (Hermes-compatible — verified working in the PoC), model runs in
  ORT-RN's native code path. No JS-side numerics in the model
  inference; tokenizer is pure transformation.

  **Bundle format.**
  `{model.onnx, tokenizer.json, tokenizer_config.json, meta.json}`.
  The previous `tokenizer.onnx` format is dropped.

  **Sourcing (simplified by pivot).** Curated HF download is the
  in-app primary path with **live model-card fetch** at download
  time so the user agrees to the current license rather than a
  curation-time snapshot — defends against authors editing model
  cards post-curation. We store the agreed-to license text alongside
  the model file so the agreement is frozen even if the source
  changes later. Custom-URL dropped entirely; replaced with
  **custom file import** — user provides the three standard HF
  files (no Python conversion either side). License is user-attested
  for custom imports.

  **PoC findings (Galaxy Fold 7 — last-gen flagship; low-end
  testing parked, see below).**
  - **Warm per-embed:** CPU 10 ms mean / 1-30 ms range; NNAPI 13 ms
    mean, much tighter distribution. NNAPI's stability is more
    valuable for P99-bounded budgeting than its slightly higher
    mean.
  - **Cold init:** ~270 ms (asset extraction from APK dominates).
    Warm re-init: ~120 ms. Asset extraction accounts for ~150 ms of
    cold start.
  - **EP divergence:** CPU vs NNAPI cosine = 1.000000. Either ORT
    enforces fp32 at partition boundaries or the quantized-int8 ops
    are deterministic across implementations. The
    `(model_id, execution_provider)` cache-key broadening raised
    pre-PoC is **resolved as no** — single-key `embedding_model_id`
    is sufficient.
  - **xnnpack EP** crashes the app on embed. Op-coverage gap or
    quant incompatibility. Not blocking — CPU + NNAPI both work and
    are interchangeable.

  Numbers are 100x+ under the few-second pre-LLM gate budget.
  Mobile feasibility settled with significant headroom; a 4-year-old
  mid-range device could be 10x slower and still comfortably pass.

  **Open — cross-device tier-finding.** PoC tested only the flagship.
  Tier-finding question (one model serves all device classes vs
  tiered selection per detected class) is genuinely unanswered.
  Demo will be distributed to additional testers to gather
  cross-device perf data. v1 ships with the curated default
  (`Xenova/all-MiniLM-L6-v2-q8`); the off-ramp (demote local to
  desktop-only / opt-in, leave provider as mobile default if low-end
  devices fail) remains on the table until cross-device data lands.

  **Open — production integration.** What stays v1-blocking from
  this entry's scope:
  - Real downloader with progress UI, resumability, SHA256
    verification (for curated entries we ship known hashes).
  - License-fetch + agreement dialog at download time; agreed-to
    license text persisted alongside the model.
  - Settings UI: model picker, current-model display, re-index
    dialog wiring (already specified —
    [`retrieval.md → Model swap UX`](./retrieval.md#model-swap-ux)),
    "remove downloaded model" affordance.
  - Init-failure handling, EP selection per device, fallback to
    provider mode if local-embedder init fails.

- **Embedding compute lifecycle** — when do new-record embeddings
  get computed? Three plausible models:
  - **Lazy reactive** — only embed when retrieval first asks for the
    row. Cheap when no retrieval; pays the cost inline at the first
    retrieval that wants it.
  - **Eager queued** — embed proactively after classifier emit on a
    background worker. Amortized cost, but adds a worker and queue.
  - **Hybrid** — eager-queued for net-new records, lazy-at-retrieval
    for staleness-flagged modifications (`source_hash` mismatch).
    Probably the answer.

  Decision interacts with mobile perf (concurrent embedder cost on
  the device), classifier `'concurrent-allowed'` semantics (does
  classifier emit ever overlap a narrative stream in practice?),
  and the perf-demo findings. Lands once the embedder is wired into
  the production app; the perf demo doesn't need to commit to a
  lifecycle model going in. Contract boundary already named in
  [`classifier.md → Embedding compute boundary`](./classifier.md#embedding-compute-boundary)
  — classifier owns emit, not embed.

- **Background classifier UX** — pill (visible) vs. invisible; Story
  Settings affordance; manual "Run classifier now" override for users
  who want to force a pass.
- **Entity-merge UI** — for the residual collision-flag recovery path.
  Doesn't exist today. World-panel surface, design pass.
- **Memory probe affordance** — debug UI for "what was retrieved and
  why this turn." **Load-bearing for the empirical-tuning pass.**
  Decay rates, similarity thresholds, MMR diversity, chapter-boost
  magnitude all need testing against real stories at realistic
  scale (thousands of happenings, tens of thousands of awareness
  rows; see
  [`retrieval.md → Scale assumptions`](./retrieval.md#scale-assumptions)).
  Without the probe, tuning is guesswork. Surfaces rank scores and
  budget-fill decisions per turn so users can see what fell off and
  why.
- **Lore-creation cap tuning** — default 3 lore creates per chapter
  is a starting guess. Real usage will tune the right cap (might
  need to be lower for tight worlds, higher for first chapters of
  rich-worldbuilding stories). Belongs in the same empirical
  calibration pass as the threshold tuning.

### Cross-doc updates this design forces

These are integration-time changes to existing docs. Recommended to
land alongside (or before) the v1-blocking work above:

- **[`data-model.md`](../data-model.md)** — apply the
  [Schema impact summary](#schema-impact-summary). Tighten the
  `retired_reason` example list. Update the injection-mode enum. Add
  cross-references back to this folder from the
  [Chapters / memory system](../data-model.md#chapters--memory-system),
  [Happenings & character knowledge](../data-model.md#happenings--character-knowledge),
  and
  [Injection modes](../data-model.md#injection-modes--unified-enum--structural-invariant)
  sections.
- **[`architecture.md`](../architecture.md)** — adjust the pipeline
  phase model for piggyback-on-narrative; document the background
  classifier as a `concurrent-allowed` agent (the first real consumer
  of that declaration shape). Replace or shrink the
  [Retrieval / injection phase](../architecture.md#retrieval--injection-phase)
  section, linking to this folder as canonical.
- **[`followups.md`](../followups.md)** — substantially resolves the
  [Memory architecture — design landed](../followups.md#memory-architecture--design-landed)
  entry (move resolution narrative into this folder). Partially
  resolves the
  [Pipeline consolidation](../followups.md#next-turn-suggestions--design-pass)
  question (piggyback IS pipeline consolidation, with model-capability
  gating). Add the v1-blocking followups above.
- **[`parked.md`](../parked.md)** — the
  [Multi-axis salience — long-term memory revisit](../parked.md#multi-axis-salience--long-term-memory-revisit)
  parked entry partially resolves (multi-axis salience still parked,
  but `decay_resistance` answers the "pinned forever" override
  question and the "compaction philosophy" question). The
  [Concurrent pipeline / agent coordination — first consumer landed](../parked.md#concurrent-pipeline--agent-coordination--first-consumer-landed)
  parked entry is now answered (the periodic classifier is the first
  agent that uses the gate-declaration shape).

### Parked / post-v1

- **Multi-axis salience.** Single-number `decay_resistance` collapses
  orthogonal relevance dimensions. Real signal (long stories where
  retrieval misses load-bearing facts in scene-mismatched contexts)
  triggers the design.
- **Pin contradiction reconciliation.** Auto-detection that a `death`
  pin is invalidated by a later "actually alive" reveal. v1 floor:
  manual unpin.
- **Spillover policy on per-type budgets.** Hard partitions in v1;
  cross-type spillover when one type underfills lands post-v1.
- **Polymorphic naming support.** Schema-level support for two
  distinct entities with the same name (without one being renamed).
- **Auto-promotion `retired → active`.** Agent-driven path; v1 is
  user-only.
- **Per-type query pools.** Different queries per candidate type
  (e.g. lore retrieved against thematic queries vs. happenings against
  scene queries). v1 uses uniform query bundle.
- **Cutaway / multi-scene entries** — full structural support for
  meanwhile-style prose with multiple scenes per entry. v1 ships
  single-scene-per-entry.
- **Cross-chapter semantic dedup of happenings** — phase 3e handles
  the within-chapter case (clusters happenings by similarity + cast
  - time, agent decides merge / keep distinct / delete redundant;
    awareness rows merge as a side effect). The residual case is
    happenings that describe related events across chapter
    boundaries — phase 3e operates on the closed range only, so
    cross-chapter related happenings stay distinct. Probably rare;
    parked until signal.
- **Lore-mgmt cross-arc callback detection** — agent at chapter
  close identifies "this chapter calls back to chapter 3" patterns
  and re-pins relevant old rows. Powerful but expensive (agent
  needs wide context window) and hard to do reliably (LLM
  judgment on cross-chapter relationships at scale). v1 relies on
  the high-similarity bypass + retrieval-frequency feedback to
  surface revivals organically. Lands if real signal shows
  callbacks consistently miss.
- **Storage-tier triggers** — periodic stale pruning of cold
  awareness rows, per-character awareness volume cap, retrieval-
  frequency-driven pruning. Not in v1; levers if testing shows
  the awareness-graph long tail genuinely bites.
