/**
 * Seeds for the second Tier 2 pass.
 *
 * The first pass matches candidates against the player's action and the recent story. The
 * second one matches what is left against the *names* of what the first pass found, so an
 * entry nobody named directly still comes in when something that names it did.
 *
 * Names and aliases only, never descriptions: descriptions cross-reference each other by
 * construction, so seeding with them pulls in half a dense lorebook in one step.
 *
 * Shared by `EntryRetrievalService` and `WorldStateInjector`, which run the same two passes
 * over different candidate shapes.
 */

/** Below this a name is too generic to be a seed — it matches by accident, not by meaning. */
const MIN_SEED_LENGTH = 4

/**
 * The haystack for the second pass, or `''` when nothing survives the filters.
 *
 * Two filters, both against false positives. Matching is word-boundary based, so a short
 * generic name matches wherever it appears inside a longer one — "Iron" hits "Iron
 * Mountain" every time. So a seed is dropped when it is shorter than `MIN_SEED_LENGTH`,
 * and when another seed contains it: the longer name is the specific one, and the shorter
 * would only widen the match to everything the longer already covers.
 */
export function secondPassHaystack(names: (string | null | undefined)[]): string {
  const seeds = [...new Set(names.map((n) => n?.trim().toLowerCase()).filter(Boolean) as string[])]
    .filter((n) => n.length >= MIN_SEED_LENGTH)
    .sort((a, b) => b.length - a.length)

  const kept: string[] = []
  for (const seed of seeds) {
    if (kept.some((longer) => longer.includes(seed))) continue
    kept.push(seed)
  }

  return kept.join(' ')
}
