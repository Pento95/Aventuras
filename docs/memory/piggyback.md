# Piggyback contract

The narrative model emits a structured trailing block alongside its
prose, in the same generation call. This block carries the per-turn
fast-mutating subset of state mutations.

## What piggyback writes

| Surface                                                      | Source       | Notes                                                                                                                                     |
| ------------------------------------------------------------ | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `story_entries.metadata.sceneEntities`                       | LLM-emitted  | Entity IDs present in this entry's scene (characters, items). Bracketed-ID prompt format gives the LLM stable handles.                    |
| `story_entries.metadata.currentLocationId`                   | LLM-emitted  | The singleton location entity that IS the current scene.                                                                                  |
| `story_entries.metadata.worldTime`                           | LLM-emitted  | Seconds delta added to previous entry's `worldTime`.                                                                                      |
| `entities.state.visual.*`                                    | LLM-emitted  | Observed visual changes (attire, hair-state, distinguishing marks).                                                                       |
| `entities.state.equipped_items` / `inventory` / `stackables` | LLM-emitted  | Item transfers between holders.                                                                                                           |
| `entities.state.current_location_id` (per-character)         | **Computed** | If character ∈ `sceneEntities`, set to scene's `currentLocationId`. Otherwise preserve `lastSeenAt.locationId`. No LLM extraction needed. |
| `entities.state.lastSeenAt`                                  | **Computed** | When a character was in `sceneEntities` last turn but isn't this turn, update `lastSeenAt` from the previous entry's metadata.            |

State that doesn't need an LLM to compute, shouldn't. Per-character
`current_location_id` and `lastSeenAt` derive cleanly from
scene-presence deltas.

## Trailing block format

A tagged block at the END of the narrative output, not interleaved.
Tagging beats raw JSON for parse robustness across models that don't
have a strict structured-output mode. Reference shape — IDs in the
emission are **placeholders**, not the underlying UUIDs (the
substitution layer swaps both directions; see
[`generation-pipeline.md → ID placeholder substitution`](../generation-pipeline.md#id-placeholder-substitution)):

```xml
<state>
  <scene_entities>c1, c2</scene_entities>
  <current_location>l1</current_location>
  <world_time_delta>120</world_time_delta>
  <visual_changes>
    <entity id="c2">attire: cloak now muddied to the waist</entity>
  </visual_changes>
  <transfers>
    <entity id="c1">+ amulet (from c3)</entity>
  </transfers>
  <summary>Aria pushed into the marshes; met an exiled noble who recognized House Eldrin's sigil.</summary>
</state>
```

`c1`, `c2`, `c3` are placeholders for characters; `l1` for the
location. The prompt's structured entity list maps each placeholder
to a name in the LLM's view; the LLM emits the placeholder
verbatim, and parse swaps it back to the underlying `char_<uuid>` /
`loc_<uuid>` before the action layer fires. The exact tagged
format firms up at implementation; the principle is "tagged-block
alongside prose, parsed best-effort, code-template fallback per
field on parse failure."

## jsonrepair fallback

The trailing block is parsed with jsonrepair (or its tagged-format
equivalent) before being given up on. If parse succeeds (clean or
repaired), the parsed fields are used. If parse fails entirely, the
LLM-emitted fields are skipped for this turn — the periodic classifier
eventually picks up the prose mention, and the structural-template
digest covers retrieval queries in the meantime.

## Auto-promote on staged-ID emission

When piggyback's `sceneEntities` contains an entity ID currently at
`status='staged'`, that's a strong signal of intentional introduction.
Piggyback processing auto-promotes the entity to `status='active'`
inline, in the same `action_id` as the turn's other writes. Single
delta, fully reversible if the user rolls back the turn.

This is the **fast path** to staged promotion. The
[slow path](./edge-cases.md#staged-entity-promotion) via the periodic
classifier covers cases where prose introduces a character without an
explicit ID emission.

## Capability gate

Piggyback's gate is the narrative model's **empirical reliability
emitting tagged trailing blocks at narrative-generation
temperatures** — not its structured-output capability. Forcing a
strict structured-output mode would lock the entire response to a
JSON schema and conflict with the prose narrative the same call
must produce; it can't be the mechanism here. The actual signal
is whether the model reliably appends a parseable tagged block
after the prose without breaking the narrative flow.

We track this via the standard provider-capability path:
`app_settings.providers[].cachedModels[].capabilities` carries a
flag for tagged-block reliability, populated from our curation +
detection and overridable by the user (capabilities are always
user-overridable — providers report inconsistently, and custom
endpoints may run models the provider's metadata doesn't
recognize). Story Settings exposes a
`piggybackMode: 'on' | 'off'` toggle — on by default when the
narrative model's capability flag is set; falls back to a per-turn
classifier pass when off.

## Mode-mixing across a story

Switching `piggybackMode` mid-story is fine. The data shape is
identical; only the agent that writes which fields differs. Going
piggyback → split rights itself in one turn (next turn's classifier
pass writes the subset piggyback would have). Inverse path is similarly
clean. No retroactive re-extraction.
