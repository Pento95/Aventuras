import { MalformedPlaceholderError, parseAndSubstitute, type IdBiMap } from '@/lib/ids'

import type { ParseFieldFailure, ParsedStateBlock } from './types'

type SubstituteResult = { block: ParsedStateBlock; failures: ParseFieldFailure[] }

function resolveField<K extends keyof ParsedStateBlock>(
  block: ParsedStateBlock,
  field: K,
  idMap: IdBiMap,
  failures: ParseFieldFailure[],
): void {
  const value = block[field]
  if (value === undefined) return
  try {
    block[field] = parseAndSubstitute(value, idMap)
  } catch (e) {
    delete block[field]
    failures.push({
      field,
      detail: e instanceof MalformedPlaceholderError ? e.message : String(e),
    })
  }
}

// The model emits bracketed-ID placeholders (c1, l1, i1...), never the
// underlying UUIDs — this swaps them back before any lookup against real
// entity rows. Granularity matches parseStateBlock's: an unresolvable
// placeholder fails only the field it lives in, never a sibling field
// (docs/memory/piggyback.md → Parse strategy and failure recovery).
export function substitutePiggybackIds(block: ParsedStateBlock, idMap: IdBiMap): SubstituteResult {
  const result: ParsedStateBlock = { ...block }
  const failures: ParseFieldFailure[] = []

  resolveField(result, 'sceneEntities', idMap, failures)
  resolveField(result, 'currentLocation', idMap, failures)
  resolveField(result, 'visualChanges', idMap, failures)
  resolveField(result, 'transfers', idMap, failures)

  return { block: result, failures }
}
