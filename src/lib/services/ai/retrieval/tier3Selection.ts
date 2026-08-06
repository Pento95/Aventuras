/**
 * Tier 3 Selection
 *
 * The LLM selection step shared by `EntryRetrievalService` (lorebook entries) and
 * `WorldStateInjector` (live world state). Only the call itself is shared: how candidates
 * are built, and what cap and priority the result gets, stays with each caller.
 *
 * Both agree that nothing uncovered is silently dropped — each has a "small leftover"
 * branch that includes it without asking, and calls the model only for what is too big to
 * include (records for the injector, words for the retrieval service).
 */

import type { StoryEntry } from '$lib/types'
import { ContextBuilder } from '$lib/services/context'
import { createLogger } from '$lib/log'
import { entitySelectionSchema } from '../sdk/schemas/context'
import { generateStructured } from '../sdk/generate'
import { recentContent, AS_PROSE } from '$lib/utils/recentContent'
import { TIER3_SELECTION_CACHE_POSITIONS } from '../core/defaults'

const log = createLogger('Tier3Selection')

/**
 * Generic in `type` so a caller with a narrower vocabulary keeps it. `WorldStateInjector`
 * turns these straight into `WorldStateContextEntry`, whose `type` is a union of four
 * literals; a plain `string` here would force a cast at that boundary for no gain.
 */
export interface Tier3Candidate<TType extends string = string> {
  id: string
  type: TType
  name: string
  description: string | null
}

export interface Tier3SelectionResult {
  selectedIndices: Set<string>
  reasoning?: string
}

export interface Tier3SelectionRequest {
  candidates: Tier3Candidate[]
  userInput: string
  recentEntries: StoryEntry[]
  recentEntriesCount: number
  presetId: string
  /**
   * Which caller this is, as it appears in the API Debug Logs.
   *
   * Both callers used to pass the same string, so the two selections were
   * indistinguishable in the log -- and since the view also filters by this value, there
   * was no way to look at one without the other. It does not affect which preset or
   * profile is used; that is `presetId`.
   */
  serviceLabel: string
  /**
   * The entry `userInput` was read from, so the prompt does not render the same action
   * twice. Matched by id rather than by text: translation rewrites the stored content, so
   * a text comparison stops recognising it exactly when the two diverge.
   */
  userActionEntryId?: string
  /**
   * Current story position, used to age the selection cache. Omit to bypass the cache — a
   * caller that cannot say "when" cannot say whether a hit is still fresh.
   */
  currentPosition?: number
  signal?: AbortSignal
}

interface CachedSelection {
  position: number
  result: Tier3SelectionResult
}

/**
 * The last selection per caller. Module-level because the services are constructed once by
 * `ServiceFactory`, and the cache has to outlive a turn to be worth anything.
 *
 * Reset on story switch: entry ids are UUIDs and cannot collide, but a stale entry left
 * behind would still be answering about the wrong story if the same pool came back.
 */
const selectionCache = new Map<string, CachedSelection>()

/**
 * What a cached answer is an answer *to*: this caller, this pool, in this order, for this
 * player action.
 *
 * Order matters because the answer is in index space — `"3"` means "the fourth candidate
 * in the list the prompt numbered". An order-independent key would resolve those indices
 * against a different ordering and name entirely different entries, which is reachable:
 * `WorldStateInjector` builds candidates from world state the classifier rewrites.
 *
 * The input matters because the answer is a judgement about a scene, not about the pool.
 * Keying on it means a reused answer is only ever reused for the same question — which is
 * what a retry or a second pass in the same turn asks — instead of answering a new action
 * with the previous one's verdict.
 */
function cacheKeyFor(
  serviceLabel: string,
  candidates: Tier3Candidate[],
  userInput: string,
): string {
  return [serviceLabel, userInput, ...candidates.map((c) => c.id)].join('\u0000')
}

/** Exported for tests, and called on story switch. */
export function clearTier3SelectionCache(): void {
  selectionCache.clear()
}

/**
 * Ask the LLM to select the most relevant candidates for this turn.
 * Returns `null` on failure — both callers treat that as "no Tier 3 entries".
 */
export async function runTier3Selection({
  candidates,
  userInput,
  recentEntries,
  recentEntriesCount,
  presetId,
  serviceLabel,
  userActionEntryId,
  currentPosition,
  signal,
}: Tier3SelectionRequest): Promise<Tier3SelectionResult | null> {
  if (candidates.length === 0) {
    return { selectedIndices: new Set() }
  }

  const cacheKey = cacheKeyFor(serviceLabel, candidates, userInput)
  const cached = currentPosition === undefined ? undefined : selectionCache.get(cacheKey)
  if (
    cached &&
    currentPosition !== undefined &&
    // Either direction: a retry moves the position back, and it is the same question.
    Math.abs(currentPosition - cached.position) <= TIER3_SELECTION_CACHE_POSITIONS
  ) {
    log('Tier 3 selection reused from cache', {
      serviceLabel,
      candidates: candidates.length,
      selected: cached.result.selectedIndices.size,
    })
    return cached.result
  }

  // `recentEntries` ends with the action in `userInput`, and the prompt renders both.
  // Sending it twice reads as emphasis the player never gave.
  const filteredRecent = userActionEntryId
    ? recentEntries.filter((e) => e.id !== userActionEntryId)
    : recentEntries

  const entrySummaries = candidates
    .map(
      (c, i) =>
        `${i}. [${c.type}] ${c.name}${c.description ? `: ${c.description.slice(0, 100)}` : ''}`,
    )
    .join('\n')

  const ctx = new ContextBuilder()
  ctx.add({
    recentContent: recentContent(filteredRecent, recentEntriesCount, AS_PROSE, true),
    userInput,
    entrySummaries,
  })
  const { system, user: prompt } = await ctx.render('tier3-entry-selection')

  try {
    const result = await generateStructured(
      { presetId, schema: entitySelectionSchema, system, prompt, signal },
      serviceLabel,
    )
    const selection = {
      selectedIndices: new Set(result.selectedIndices),
      reasoning: result.reasoning,
    }
    if (currentPosition !== undefined) {
      selectionCache.set(cacheKey, { position: currentPosition, result: selection })
    }
    return selection
  } catch (error) {
    // Not cached: a failure says nothing about which candidates matter, and storing it
    // would suppress the retry that might succeed.
    log('Tier 3 LLM selection failed', error)
    return null
  }
}

/**
 * Words the wholesale branch would put in the prompt for `entries`.
 *
 * Prices what the context block emits — `- <name>: <description>` per entry, with the
 * description truncated to `maxWordsPerEntry` — so the name counts too and nothing past
 * the truncation point does.
 */
export function countWholesaleWords(
  entries: { name?: string | null; description?: string | null }[],
  maxWordsPerEntry = 0,
): number {
  const wordsIn = (text: string | null | undefined) =>
    text?.trim() ? text.trim().split(/\s+/).length : 0

  let total = 0
  for (const entry of entries) {
    const description = wordsIn(entry.description)
    total +=
      wordsIn(entry.name) +
      (maxWordsPerEntry > 0 ? Math.min(description, maxWordsPerEntry) : description)
  }
  return total
}

/**
 * The prompt numbers the candidates and never renders an id, so the answer is an index.
 * The listing format (`0. [type] Name`) invites `"1."`, `"#1"` and `"[1]"` back, and each
 * is unambiguous once the only question is which digits.
 */
function extractIndex(raw: string): number | null {
  const match = /\d+/.exec(String(raw))
  if (!match) return null
  const index = Number.parseInt(match[0], 10)
  return Number.isSafeInteger(index) ? index : null
}

/**
 * Map a selection result back onto the candidate list by index. `candidates` must be in the
 * order `runTier3Selection` built the prompt from.
 *
 * Returned in the model's order, not candidate order: both callers cap the result, and
 * candidate order is an artifact of assembly — `WorldStateInjector` groups by type, so a
 * cap applied to it drops whole categories regardless of relevance.
 */
export function resolveTier3Selection<T extends { id: string }>(
  candidates: T[],
  result: Tier3SelectionResult,
): T[] {
  const selected: T[] = []
  const seen = new Set<number>()

  for (const raw of result.selectedIndices) {
    const index = extractIndex(raw)
    if (index === null) {
      log('Tier 3 selection dropped an unparseable entry', { raw })
      continue
    }
    if (index < 0 || index >= candidates.length || seen.has(index)) continue
    seen.add(index)
    selected.push(candidates[index])
  }

  return selected
}
