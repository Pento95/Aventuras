# Theme contrast corrections and contract re-validation

Design session — fixes genuine contrast bugs across the curated
theme gallery, re-validates the contrast contract (which gated
several intentionally-low-contrast elements as if they were
WCAG-required), reconciles `themes-audit.ts` with the corrected
contract, and retunes the Aventuras semantic colors for
distinguishability.

This file is an exploration record. Once integrated, the canonical
homes are [`color.md`](../ui/foundations/color.md) (the contrast
contract and audit utility) and
[`themes.md`](../ui/foundations/themes.md) (the per-theme palette
values).

Every contrast figure below was computed with the project's own
`contrastRatio` (`lib/themes/contrast.ts`).

## What the audit showed

`pnpm themes:audit` reports fails in all 10 themes, but they are
not one problem. Categorized, with the audit script
(`scripts/themes-audit.ts`) checked against the
[`color.md`](../ui/foundations/color.md) contract:

1. **The audit had drifted from the contract** — it checked
   `--border-strong` against the wrong surface, skipped six
   contract pairs, and added AAA warnings the contract never asked
   for.
2. **Borders fail 3:1 in all 10 themes** — and so do
   `selection-bg` and `fg-disabled`, once the skipped pairs are
   checked.
3. **Genuine palette bugs** in four themes.
4. **Catppuccin Latte** fails several pairs by canonical design.

The CI gate is **out of scope** — this session makes the audit
_correct_ and advisory; wiring it as a gate stays a separate
decision.

## Part 1 — contract re-validation

Checking the contract pairs the audit skips, across all 10 themes,
surfaced the core finding: **the contract gated three things that
are low-contrast by design.**

| Pair                              | Contract | Reality                 | Why it is low-contrast by design                                          |
| --------------------------------- | -------- | ----------------------- | ------------------------------------------------------------------------- |
| `--border` × `--bg-base`          | 3:1      | 1.25–2.03, all 10 fail  | a resting hairline separator; the flat-depth aesthetic wants it subtle    |
| `--selection-bg` × `--bg-base`    | 3:1      | 1.15–2.27, all 10 fail  | a text-selection tint, ~20–30% accent mixed into the canvas by derivation |
| `--fg-disabled` × `--bg-disabled` | 3:1      | 1.45–2.64, 9 of 10 fail | a disabled control — and WCAG **explicitly exempts** inactive components  |

These are the same mistake: conflating "intentionally subtle
visual element" with "WCAG non-text contrast." WCAG 1.4.11 governs
information _required_ to identify a component or state. A resting
hairline, a selection tint, and a disabled control are not that.

**Resolution.** `--border` / `--border-strong`,
`--selection-bg × --bg-base`, and `--fg-disabled × --bg-disabled`
move to the **author-judged advisory tier** — the audit reports
the ratio, never fails — joining `--recently-classified-bg`, which
already sits there. The contract's claim (in
[`themes.md`](../ui/foundations/themes.md) "Common slot recipes")
that borders "clear the 3:1 floor" is corrected; it was never true.

The **real non-text gates hold and pass everywhere**:
`--focus-ring × --bg-*` (3:1) and `--accent × --bg-base` (3:1, all
10 pass). Component identifiability is carried by the focus ring,
not the resting border. The **real selection gate** —
`--fg-primary × --selection-bg` (4.5, "text stays readable under
selection") — passes all 10; only the unrealistic
"selection visible as a block" check is dropped.

Two further findings:

- **Spurious AAA warnings.** The audit warns below AAA 7 on
  `--fg-secondary`, `--accent-fg`, and `--fg-primary × --bg-raised`/
  `--bg-sunken`. The contract targets **AA 4.5** for those — only
  `--fg-primary × --bg-base` carries the AAA target. Drop the
  extra warnings.
- **A genuine gap: `--accent-fg × --accent-hover` is unchecked.**
  default-dark **fails** it (2.54) — dark themes lighten the accent
  on hover, which drops button-text contrast. Add the pair to the
  contract and audit. The hand-authored default-dark hover is
  fixed in Part 2; the accent-_derivation_ algorithm has the same
  latent bug for user-overridden accents — recorded as a followup.

### Reconciled audit pair set

- **Gated text (AA 4.5; `--fg-primary × --bg-base` also AAA 7):**
  `--fg-primary` × `--bg-base` / `--bg-raised` / `--bg-sunken` /
  `--bg-overlay`; `--fg-secondary × --bg-base`;
  `--fg-muted × --bg-base` (target 4.5, floor 3);
  `--accent-fg` × `--accent` and × `--accent-hover`; the four
  `*-fg` × state pairs; `--fg-primary` × `--selection-bg` and
  × `--recently-classified-bg`.
- **Gated non-text (3:1):** `--focus-ring` × `--bg-base` /
  `--bg-raised` / `--bg-overlay`; `--accent × --bg-base`.
- **Advisory (reported, never fails):** `--border` /
  `--border-strong` × `--bg-*`; `--selection-bg × --bg-base`;
  `--fg-disabled × --bg-disabled`;
  `--recently-classified-bg × --bg-base`.
- **Exempt (labeled, known canonical fail):** see Part 3.

The contract's `--fg-muted` dual floor (4.5 target / 3 floor —
placeholders may relax) is left as-is: a minor wrinkle, not worth
splitting the token. Post-fix `--fg-muted` warns (3–4.5) in five
themes are acceptable per that relaxation.

## Part 2 — genuine palette bugs (original themes)

Original themes are authored freely; minimal value changes to
clear AA 4.5.

**default-light** — the first-launch default; its primary button
currently fails AA.

| Slot             | Old       | New       | Pair fixed                                                            |
| ---------------- | --------- | --------- | --------------------------------------------------------------------- |
| `--accent`       | `#3b82f6` | `#2563eb` | accent-fg 3.68 → 5.17 (and matches the curated accent palette's blue) |
| `--accent-hover` | `#2563eb` | `#1d4ed8` | re-derived (darken from the new accent)                               |
| `--focus-ring`   | `#3b82f6` | `#2563eb` | tracks the accent (conventionally equal)                              |
| `--success`      | `#16a34a` | `#15803d` | success-fg 3.30 → 5.02                                                |
| `--warning`      | `#d97706` | `#b45309` | warning-fg 3.19 → 5.02                                                |
| `--info`         | `#0284c7` | `#0369a1` | info-fg 4.10 → 5.93                                                   |

**default-dark** — accent group mirrors default-light (per
[`themes.md`](../ui/foundations/themes.md)'s existing "accent
mirrors Default Light" note).

| Slot             | Old       | New       | Pair fixed                           |
| ---------------- | --------- | --------- | ------------------------------------ |
| `--accent`       | `#3b82f6` | `#2563eb` | accent-fg 3.68 → 5.17                |
| `--accent-hover` | `#60a5fa` | `#1d4ed8` | accent-fg × accent-hover 2.54 → 6.70 |
| `--focus-ring`   | `#3b82f6` | `#2563eb` | tracks the accent                    |
| `--danger`       | `#ef4444` | `#f87171` | danger-fg 4.29 → 5.84                |

default-dark's hover thus **darkens** rather than lightens. This
is deliberate: lightening the accent on hover drops white
button-text below AA (the Part 1 finding). Consistency with
default-light's accent group wins over the dark-theme
lighten-on-hover convention.

**parchment**

| Slot        | Old       | New       | Pair fixed             |
| ----------- | --------- | --------- | ---------------------- |
| `--warning` | `#b8560e` | `#9a4a0c` | warning-fg 3.88 → 5.06 |

## Part 3 — established themes

Catppuccin and Tokyo Night are **established palettes** —
session 6 committed them verbatim. The rule for fixing their
contrast: **re-map a slot to a different color from the same
canonical palette; never invent an off-palette color.** Deviate
only where no canonical color can satisfy a real gate.

### Tokyo Night

`--fg-muted` is canonically Tokyo Night's `comment` `#565f89`
(2.76 — fails even the 3:1 muted floor). Re-mapped to the next
gray up the canonical scale, **`dark5` `#737aa2`** → **4.10**:
clears the 3:1 floor, stays 100% canonical Tokyo Night, stays
distinct from `--fg-secondary` (`fg_dark` `#a9b1d6`). It lands a
warn (under the 4.5 target) — the honest cost of source
adherence, and acceptable for muted text.

### Catppuccin Mocha

**Clean** after Part 1 — its only audit fails were borders, now
advisory. Zero changes.

### Catppuccin Latte — text scale

Each Catppuccin flavor defines a fixed gray ladder
(Text → Subtext1 → Subtext0 → Overlay2 → Overlay1 → Overlay0).
Latte's mapping skipped steps and ran too light. Re-mapped down
the canonical ladder:

| Slot             | Old (canonical name) | New (canonical name) | Pair fixed  |
| ---------------- | -------------------- | -------------------- | ----------- |
| `--fg-secondary` | `#6c6f85` Subtext0   | `#5c5f77` Subtext1   | 4.37 → 5.53 |
| `--fg-muted`     | `#8c8fa1` Overlay1   | `#6c6f85` Subtext0   | 2.83 → 4.37 |

Ladder stays canonical: Text / Subtext1 / Subtext0 / Overlay0.

### Catppuccin Latte — semantic pills

Tested every foreground (Base, Text, white) on Latte's semantic
colors:

- **Red** (`#d20f39`) and **Blue/accent** (`#1e66f5`) clear AA
  with white text (5.43 / 4.91) — `--accent-fg` re-mapped to
  `#ffffff` (was `#eff1f5`, 4.34 fail → 4.91); `--danger` already
  passes.
- **Green** (`#40a02b`), **Yellow** (`#df8e1d`), **Sky**
  (`#04a5e5`) **cannot reach AA 4.5 with any foreground** — the
  best case is 3.34 / 3.05 / 2.86. They are mid-luminance
  pastels; a filled pill with text is mathematically sub-AA, and
  Catppuccin defines no darker green/yellow to re-map to.

Per the verbatim-Catppuccin decision, the three semantic pairs
(`--success-fg × --success`, `--warning-fg × --warning`,
`--info-fg × --info`) are **exempt** — kept verbatim, labeled
`exempt` by the audit so the output reads honestly. All four
Latte semantic `-fg` slots are set uniformly to `#ffffff` (the
exempt three are then as readable as a uniform filled-pill
treatment allows). This is a bounded, documented accessibility
cost: semantic pills are small UI, always reinforced by icon and
text, and the user chose an established pastel theme.

## Part 4 — Aventuras retune

Aventuras' semantic colors **pass contrast** — the problem is
mutual hue-distance. `--success` sage `#a3b88c` and `--danger`
coral `#d49494` were muted so hard to fit the cream-navy identity
that they blur into each other and into `--fg-primary` cream
`#d4c9a8` (`--danger` even shares `R=212` with it). `--info` reads
clearly blue and `--warning` clearly amber — left unchanged.

| Slot        | Old       | New       | Rationale                                                 |
| ----------- | --------- | --------- | --------------------------------------------------------- |
| `--success` | `#a3b88c` | `#98c96e` | clearly green, off the olive axis; the lighter of the two |
| `--danger`  | `#d49494` | `#d97070` | clearly red, off the warm-tan axis; the darker of the two |

The two carry a **lightness delta** (success lighter, danger
darker), not only a hue delta — so they stay distinguishable
under red-green color-blindness, where hue alone would not
separate them. Both stay in Aventuras' slightly-desaturated
register (not neon) and clear the `-fg` floor against the
near-bg navy text (`#0e2240`): success 8.26, danger 4.92. Final
values are eyeballed against the navy canvas in
[`theming.html`](../ui/foundations/theming.html).

## Adversarial-pass findings

- **Load-bearing assumption: subtle borders are an acceptable
  aesthetic trade-off.** WCAG 1.4.11 for a _resting_ input
  boundary is arguably not fully met once borders are advisory —
  default-light's `--bg-raised` / `--bg-base` fill delta is itself
  tiny. Accepted: the flat-depth aesthetic is deliberate, the
  focus ring (gated, passes everywhere) carries keyboard
  identifiability, and the audit still _reports_ border ratios so
  authors see them. Confirmed acceptable when Part 2's border
  decision was approved.
- **Accent-derivation latent bug.** The Part 1 `accent-fg ×
accent-hover` gap is fixed for the hand-authored default themes,
  but `deriveAccent` (per
  [`color.md`](../ui/foundations/color.md#accent-derivation-algorithm))
  lightens accent-hover for dark themes — a user-overridden accent
  on default-dark can still produce a sub-AA hover. Recorded as a
  followup; not fixed here (it belongs to the accent-override
  system, not palette correction).
- **Color-blindness.** Aventuras `--success` / `--danger` are the
  red-green pair — the hardest for the most common color-blindness.
  Mitigated by the deliberate lightness delta (Part 4) plus the
  fact that semantic state is always reinforced by icon and text,
  never color alone.
- **tokyo-night `--fg-muted` resolves to a warn (4.10), not a
  full pass.** This is the honest ceiling of source adherence —
  the only canonical Tokyo Night gray that clears 4.5 is already
  `--fg-secondary`, and collapsing the two would flatten the text
  hierarchy.
- **Read-site impact: none.** Components read color _tokens_; the
  values change underneath. No component code is touched.
- **`fg-primary × bg-overlay`** — added to the audit by the
  reconciliation — passes in all 10 themes (lowest 6.04). No new
  fail.

## Followups

- **Introduced — accent-derivation hover-contrast.** `deriveAccent`
  lightens `--accent-hover` for dark themes, which can drop
  `--accent-fg × --accent-hover` below AA for a user-overridden
  accent. Lands with the accent-override system's next pass. Added
  to [`followups.md`](../followups.md).
- **Resolved — none.** (No existing followup tracked these
  contrast bugs.)
- **Out of scope — the Theme-audit CI gate.** Untouched; this
  session leaves the audit correct and advisory, which is the
  right precondition for that decision whenever it is made.

## Integration plan

Canonical files changed:

- **EDIT** [`color.md`](../ui/foundations/color.md) — the contract
  re-validation: in "Non-text contrast", keep only
  `--focus-ring × --bg-*` and `--accent × --bg-base`; move
  `--border` and `--selection-bg × --bg-base` out. Broaden the
  "Faint-signal exception" into an author-judged advisory tier
  also covering borders, `--selection-bg × --bg-base`, and
  `--fg-disabled × --bg-disabled` (grep inbound anchors before any
  heading rename). Add `--accent-fg × --accent-hover` to the
  text-on-background table. Correct the "Theme audit utility"
  section to the reconciled pair set plus the exempt-labeling
  concept. Drop the AAA framing from `--fg-secondary` /
  `--accent-fg`. Note the accent-derivation hover followup.
- **EDIT** [`themes.md`](../ui/foundations/themes.md) — palette
  value updates for default-light, default-dark, parchment,
  tokyo-night, catppuccin-latte, aventuras (Parts 2–4); update
  each affected theme's "Audit expectations" line; correct the
  "Common slot recipes" Border and Disabled entries (the false
  "clears 3:1" claims); record Tokyo Night's `comment → dark5`
  and Catppuccin Latte's ladder re-map as canonical-color
  re-mappings; document the three exempt Latte semantic pairs.
- **EDIT** [`theming.html`](../ui/foundations/theming.html) —
  wireframe: update the rendered palette values for the six
  changed themes; this is the visual-confirmation surface for the
  Aventuras retune.
- **EDIT** [`followups.md`](../followups.md) — add the
  accent-derivation hover-contrast followup under `## UX`.

Implementation follow-through (code, not this design session's
scope — tracked separately): apply the corrected values to
`global.css` and `lib/themes/registry.ts`, and update
`scripts/themes-audit.ts` to the reconciled pair set plus the
Catppuccin Latte exempt entries.

Renames: possibly `color.md` "Faint-signal exception" → an
advisory-tier heading; grep `color.md#faint-signal` first.

Patterns adopted on a new surface: none.

Followups resolved: none. Followups introduced: accent-derivation
hover-contrast.

Wireframes updated: `theming.html` (six themes).

Exploration record fate: keep as the historical record.
