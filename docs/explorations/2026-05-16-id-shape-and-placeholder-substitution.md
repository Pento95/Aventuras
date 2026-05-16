# ID shape and LLM placeholder substitution

How database IDs are shaped, and how the LLM sees them.

Sibling decision to the
[generation-pipeline framework](./2026-05-16-generation-pipeline-implementation.md)
landed earlier the same day. The framework needed an ID-emission
contract for piggyback / classifier / wizard-opening-gen; this
session pins it.

## Problem

Two competing concerns on database identity:

- **Internal/code side wants global uniqueness.** UUIDs (or
  equivalent) so Vault import, backup / restore, and any future
  cross-story coordination "just works." No counter-resync, no FK
  rewriting, no collision handling.
- **LLM side wants short, readable IDs.** UUIDs are 36 characters
  with a fixed format the LLM has to copy verbatim. Empirical
  failure rate is high: classifier piggyback emissions drop or
  corrupt UUIDs frequently. Token cost is also material
  (~12-20 tokens per UUID × dozens of IDs per turn × thousands of
  turns).

Previous design pass proposed sequential prefix-discriminated IDs
(`char_3`, `loc_5`) AS the primary key. Resolves the LLM concern
but creates: per-story counter coordination, branch-counter
interaction, Vault-import renumbering with FK rewriting, never-
reuse-after-delete tracking. Workable but heavy.

## Design

**Internal: prefix-tagged UUIDs.** Every ID is
`{kind-prefix}_{uuid}`. The prefix is part of the ID string, not a
column-level concept. Stripe-style.

**LLM-facing: ephemeral placeholders.** Before any LLM call that
emits entity-ID references, a substitution layer walks the
assembled context and swaps UUIDs for short placeholders (`c1`,
`c2`, `l1`, …). After parse, the reverse substitution maps
placeholders back to UUIDs.

The two concerns separate cleanly:

- DB stores UUIDs forever. No counter to track, no FKs to rewrite,
  Vault import is trivial.
- LLM sees short handles. Copy-fidelity solved, token cost
  minimized.

## Prefix convention

Universally applied across the data model — not just LLM-facing
kinds. Every ID column uses a prefix indicating what it identifies.

### LLM-facing (substituted to placeholders)

| Kind             | ID prefix | Placeholder prefix |
| ---------------- | --------- | ------------------ |
| Character entity | `char_`   | `c`                |
| Location entity  | `loc_`    | `l`                |
| Item entity      | `item_`   | `i`                |
| Faction entity   | `fact_`   | `f`                |
| Lore             | `lore_`   | `lo`               |
| Thread           | `thr_`    | `th`               |
| Happening        | `hap_`    | `hp`               |
| Chapter          | `chap_`   | `ck`               |

### Non-LLM-facing (never substituted)

| Concept                        | ID prefix |
| ------------------------------ | --------- |
| Story                          | `story_`  |
| Branch                         | `br_`     |
| Story entry                    | `entry_`  |
| Action (delta grouping)        | `act_`    |
| Pipeline run                   | `run_`    |
| Provider profile               | `prof_`   |
| Model profile                  | `mod_`    |
| Provider                       | `prov_`   |
| Pack                           | `pack_`   |
| Calendar definition            | `cal_`    |
| Entry asset                    | `ast_`    |
| Translation (singular PK case) | `tr_`     |

External IDs (provider responses from OpenAI / Anthropic / etc.)
keep their native format unchanged. Composite PKs (awareness rows,
involvements, translation lookups keyed by tuple) don't need a
prefix — there's no single ID to prefix.

## Substitution mechanism

### Walker — generic, pattern-driven

```ts
const SUBSTITUTABLE_PREFIXES = [
  'char',
  'loc',
  'item',
  'fact',
  'lore',
  'thr',
  'hap',
  'chap',
] as const
const ID_PATTERN = new RegExp(
  `^(${SUBSTITUTABLE_PREFIXES.join('|')})_` +
    `[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`,
)

function substituteIds<T>(value: T, idMap: BiMap): T {
  if (typeof value === 'string' && ID_PATTERN.test(value)) {
    return (idMap.getPlaceholderFor(value) ?? idMap.allocate(value)) as T
  }
  if (Array.isArray(value)) {
    return value.map((v) => substituteIds(v, idMap)) as T
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, substituteIds(v, idMap)]),
    ) as T
  }
  return value
}
```

The walker doesn't know the data shape; it walks any value
recursively, substituting any string that matches an
**LLM-facing-prefix UUID** pattern. Non-LLM-facing prefixes
(`act_`, `entry_`, etc.) don't match — they pass through unchanged.

`idMap.allocate(uuid)` reads the prefix from the UUID itself
(`char_…` → `c`, `loc_…` → `l`, etc.) and produces the next
placeholder for that kind using a per-kind counter on the map.

### BiMap

```ts
class IdBiMap {
  private uuidToPlaceholder = new Map<string, string>()
  private placeholderToUuid = new Map<string, string>()
  private counters: Record<string, number> = {}

  allocate(uuid: string): string {
    const existing = this.uuidToPlaceholder.get(uuid)
    if (existing) return existing

    const kindPrefix = uuid.split('_')[0]
    const placeholderPrefix = PLACEHOLDER_PREFIX_BY_KIND[kindPrefix]
    const n = (this.counters[placeholderPrefix] ?? 0) + 1
    this.counters[placeholderPrefix] = n
    const placeholder = `${placeholderPrefix}${n}`

    this.uuidToPlaceholder.set(uuid, placeholder)
    this.placeholderToUuid.set(placeholder, uuid)
    return placeholder
  }

  getPlaceholderFor(uuid: string): string | undefined {
    return this.uuidToPlaceholder.get(uuid)
  }

  getUuidFor(placeholder: string): string | undefined {
    return this.placeholderToUuid.get(placeholder)
  }
}
```

### Lifecycle within a generation context

`idMap: IdBiMap` lives on the context object's intermediates.
Populated by the substitution pass before LLM call; read by the
parse-side reverse substitution after; discarded at run end.

Per-context-kind: each context type (`PerTurnContext`,
`ClassifierContext`, `WizardOpeningContext`, etc.) carries its own
idMap when its LLM consumer emits entity-ID references. Translation
contexts don't carry one (translation is prose-in / prose-out, no
IDs).

### Flow

```
1. Retrieval / context assembly produces context with UUIDs
2. substituteIds(context, idMap) — walker swaps UUIDs → placeholders
3. Liquid templates render against placeholder-bearing context
4. LLM call; emits placeholders in structured output (names in prose)
5. parseAndSubstitute(rawOutput, idMap) — reverse swap
6. Action layer receives UUIDs as it always does
```

Substitution is structured (data-side, pre-render) — not regex
post-processing on rendered prompt strings.

## Decisions captured during design

- **Prose never carries IDs.** Narrative content uses character
  names, not placeholders or UUIDs. Structured emission carries
  placeholders. Pinned as a contract.
- **`entity.id` IS the placeholder** for any template/template-
  author consumer. UUID is not exposed to templates; only the
  substitution layer and the action layer see it.
- **New-entity emission omits ID.** Classifier emits new entities
  as full objects (name, description, …) with no `id` field; parse
  allocates UUID. If the same response references the new entity
  multiple times, parse-time map mutates: first occurrence allocates,
  subsequent ones reuse via a transient placeholder the LLM emits.
- **Substitution scope is comprehensive.** Walker visits the entire
  context recursively, substituting UUIDs in nested fields
  (`metadata.sceneEntities: string[]`, awareness-row references,
  etc.) — not just top-level `entity.id`.
- **Translation phase does not substitute.** Prose in, prose out.
- **Wizard opening-generation DOES substitute.** Opening-gen emits
  scene metadata referencing wizard-curated cast IDs; needs the
  same substitution flow as per-turn. Its context type carries an
  idMap.
- **Failure mode is single-class.** Any unrecognized or malformed
  placeholder in LLM output → one recoverable error. Bare UUID
  emission is a prompt bug, not a runtime case to handle.

## Why this beats alternatives

- **vs. sequential prefix IDs (`char_3`) as PK:** No per-story
  counter, no branch coordination, no Vault renumbering, no
  reuse-after-delete tracking. UUID's global uniqueness is free.
- **vs. plain UUID with no prefix:** Walker has no way to know
  what's an entity ID and what's a string. Prefix-tagging makes
  the substitution generic.
- **vs. Zod schema-driven UUID-field introspection:** No
  `schema._def` archaeology, no brand-tracking-through-z.infer,
  no runtime metadata. The "schema" reduces to a tiny prefix
  registry (~10 strings). Walker is type-agnostic.
- **vs. hand-written per-context-kind walkers:** One generic
  walker handles every context kind. New kinds inherit substitution
  for free. New entity kinds just register a prefix.

## Adversarial findings

- **False positives.** Pattern is anchored `^(prefix)_uuid$`. A
  natural-language string accidentally matching exactly is
  implausible. And the walker only operates on the structured
  context, not user-supplied raw prose (which isn't substituted
  anyway, per the prose-never-carries-IDs contract).
- **Prefix collision with placeholder vocabulary.** Stripe-style
  prefixes (`char`, `loc`, `chap`) and short placeholder prefixes
  (`c`, `l`, `ck`) live in disjoint namespaces. A placeholder like
  `c1` never matches the substitutable UUID pattern (no UUID
  suffix). No risk.
- **Vault import collision.** Two stories could in theory hold
  entities with the same UUID if Vault import preserves the original
  UUID. crypto.randomUUID() collision probability is astronomical,
  so the risk is zero in practice — but the cleaner policy is "Vault
  import generates a fresh UUID in the receiving story" so identity
  is always local to a story.
- **SQLite index cost.** Prefixed UUID is ~41 chars vs 36. Index
  size grows ~14%. Negligible at the scales the app operates at
  (thousands of entities per story, not millions).
- **Backup / restore format.** Carries IDs as-is. Restore writes
  them as-is. No transformation. ✓
- **External provider IDs** (OpenAI model IDs, Anthropic
  conversation IDs, etc.) are NOT ours — never prefixed, stored as
  opaque strings.

## Followups created

- **`PLACEHOLDER_PREFIX_BY_KIND` registry placement.** Needs to live
  somewhere both the substitution layer (in pipeline code) and the
  ID-generation helpers (in data-model code) can import. Probably
  `src/ai/pipeline/id-substitution.ts` or `src/db/id.ts`. Module
  layout decision; not blocking.
- **Type-safe ID branding.** Template-literal types
  (`type CharacterId = \`char\_${string}\``) give compile-time safety
without runtime overhead. Should land alongside the generator
helpers (`generateCharacterId(): CharacterId`).

## Integration plan

- **`data-model.md`** — new "ID shape" section near the top of the
  schema discussion; documents the prefix convention universally,
  the LLM-facing-via-placeholder split, and the substitution
  mechanism reference (pointing at `generation-pipeline.md`).
- **`generation-pipeline.md`** — new "ID placeholder substitution"
  subsection under Phase function contract → Run-scoped state.
  Documents the walker, idMap, and substitution flow.
- **`memory/piggyback.md`** — emission examples updated to
  placeholder format (`c1`, `c2` instead of `ent_aria`, `ent_kael`).
- **`memory/classifier.md`** — emission examples updated; explicit
  note about new-entity emission omitting ID.
- **`architecture.md → Prompt templates and authoring`** — brief
  mention that `entity.id` exposed to templates is the placeholder,
  not the UUID; substitution is at context-construction time.

## Exploration record metadata

- **Session date:** 2026-05-16 (sibling session to the
  generation-pipeline framework integration earlier the same day)
- **Status:** ready for integration
