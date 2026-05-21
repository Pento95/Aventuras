# Accent-derivation contrast fixes — hover direction and foreground auto-flip

Design session — resolves the **Accent-hover contrast on dark-theme
overrides** followup, and folds in a companion fix to the
`accentFg` auto-flip (free-entry accent input is a planned feature
that exposes it, so it is fixed here rather than deferred).
`deriveAccent` is spec-only — no implementation exists yet,
`--accent-hover` is a hand-authored token slot today — so this is
a pure spec correction in
[`color.md → Accent-derivation algorithm`](../ui/foundations/color.md#accent-derivation-algorithm).

## Two bugs in `deriveAccent`

**1 — `accentHover` lightened _toward_ the text on dark themes.**
The hover delta sign was mode-aware (darken for light, lighten for
dark), while `accentFg` is chosen for the base accent. On a dark
theme, a base accent just dark enough to take white text gets
`accentHover` lightened further — white-on-hover can fall below
AA 4.5. The themes-session re-validation verified it: the old
default-dark `#3b82f6` / `#60a5fa` pair gave 2.54.

**2 — `accentFg` auto-flip used a luminance threshold, not a
contrast comparison.** The flip was `L_rel < 0.5 ? white :
near-black`. `0.5` is a heuristic; white and near-black give
_equal_ contrast at L_rel ≈ 0.19. For an accent with luminance in
roughly [0.19, 0.5) the algorithm picked white where near-black
contrasts far better — e.g. a `#808080`-luminance accent got white
text at 3.95 when near-black gives 5.01. Latent today (the curated
7-swatch picker is criterion-1 vetted) but live once free-entry
accent input ships.

## The fixes

**Hover direction → `accentFg`-aware.** The delta sign changes
from `mode === 'light' ? -10 : +10` to
`accentFg === '#ffffff' ? -10 : +10`. The hover always moves the
accent _away from the button text_: white text darkens the hover,
near-black text lightens it. Because HSL lightness is monotonic
with relative luminance at fixed hue and saturation, this
guarantees `accentFg × accentHover ≥ accentFg × accent` — a hover
can only improve button-text contrast. The existing curated-accent
criterion 1 (`accentFg × accent ≥ 4.5`) therefore covers the hover
pair transitively; no new criterion is needed.

_Approaches considered:_ a clamp that shrinks the mode-aware delta
until the pair clears (rejected — makes the hover step variable
and sometimes imperceptible); "always darken" (rejected — breaks
the near-black-`fg` case where lightening is the safe direction).

**`accentFg` → pick the better-contrasting foreground.** Replace
the `L_rel < 0.5` threshold with a direct comparison: return
whichever of `#ffffff` / `#0a0a0a` contrasts better with the
accent, via the project's existing `contrastRatio`. Optimal for
every input, no magic threshold.

The two fixes compose: `accentFg` is still one of two fixed
values, so the `accentFg`-aware hover direction is unaffected.
`accentFg` must be computed before `accentHover`; the algorithm
list is reordered to read in dependency order.

## Adversarial-pass findings

- **Load-bearing assumption — the monotonicity guarantee.** The
  hover fix relies on "lower HSL lightness ⇒ lower relative
  luminance" at fixed hue and saturation. Reducing HSL L reduces
  every RGB channel monotonically, so luminance falls
  monotonically. The guarantee holds. Verified.
- **`accentFg` residual.** Picking the better foreground is
  optimal, but for a mid-luminance accent (gray-ish, around
  `#777`) _no_ foreground reaches AA: the best-available contrast
  bottoms at ≈ **4.48** — 0.02 under the floor, within rounding.
  Verified against `contrastRatio` across the band. The old
  threshold could drop to ~3.95 across the _whole_ [0.19, 0.5)
  region; the fix raises the worst case to 4.48 over a narrow
  band. The residual is accepted and documented — same family as
  a mid-luminance filled pill, which no text can host at AA.
- **Pure black / pure white accent.** Still clamps with no
  perceived hover — unchanged; the existing known-limitation
  bullet stays.
- **Composition.** `accentFg` is computed first; `accentHover`
  reads its result. `selectionBg` still uses `mode`; `mode` stays
  a `deriveAccent` parameter.

## Followups

- **Resolved:** Accent-hover contrast on dark-theme overrides —
  removed from [`followups.md`](../followups.md). The spec is
  corrected before `deriveAccent` is ever implemented.
- **Introduced:** none. The `accentFg` exposure is fixed here, not
  deferred — the residual mid-luminance trough (≈ 4.48) is a
  documented accepted limitation, not open work.

## Integration plan

- **EDIT**
  [`color.md`](../ui/foundations/color.md#accent-derivation-algorithm)
  — in **Per-output algorithm**, reorder so `accentFg` is step 1
  (rewritten to the better-contrast comparison) and `accentHover`
  step 2 (rewritten to the `accentFg`-aware delta). Update the
  **Constants summary** rows. In **Known limitations**, remove the
  "Dark-theme hover contrast" bullet (resolved) and replace the
  "Accent at exactly the WCAG 0.5 threshold" bullet (no threshold
  now) with the mid-luminance-accent note. Fix the
  **Selection criteria** criterion 1 wording ("the WCAG 0.5
  auto-flip" → "the auto-flip") and the **Why mode-agnostic**
  sentence that still calls `accentHover` mode-aware.
- **EDIT** [`theming.md`](../ui/foundations/theming.md#accent-override-opt-in)
  — fix the `--accent-hover` bullet in **Accent override
  (opt-in)** (still says "mode-aware").
- **EDIT** [`followups.md`](../followups.md) — remove the resolved
  followup.

Renames: none. Patterns adopted: none. Wireframes: none.
Followups resolved: Accent-hover contrast on dark-theme overrides.
Followups introduced: none.

Exploration record fate: keep as the historical record.
