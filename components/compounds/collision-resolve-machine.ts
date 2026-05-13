import type { DiffPayload, ScalarField } from './collision-resolve-diff'

export type MergeState = {
  canonicalId: string
  fieldChoices: Record<ScalarField, 'A' | 'B'>
  deselectedTags: string[]
}

export type MergeAction =
  | { type: 'pick-canonical'; id: string; entityAId: string }
  | { type: 'pick-field'; field: ScalarField; side: 'A' | 'B' }
  | { type: 'toggle-tag'; tag: string }
  | {
      type: 'reset'
      diff: DiffPayload
      defaultCanonicalId: string
      entityAId: string
    }

function sideForCanonical(canonicalId: string, entityAId: string): 'A' | 'B' {
  return canonicalId === entityAId ? 'A' : 'B'
}

function fieldChoicesForCanonical(
  fields: readonly ScalarField[],
  side: 'A' | 'B',
): Record<ScalarField, 'A' | 'B'> {
  const result: Partial<Record<ScalarField, 'A' | 'B'>> = {}
  for (const f of fields) result[f] = side
  return result as Record<ScalarField, 'A' | 'B'>
}

export function initMergeState(
  diff: DiffPayload,
  defaultCanonicalId: string,
  entityAId: string,
): MergeState {
  const side = sideForCanonical(defaultCanonicalId, entityAId)
  return {
    canonicalId: defaultCanonicalId,
    fieldChoices: fieldChoicesForCanonical(diff.divergentScalars, side),
    deselectedTags: [],
  }
}

export function mergeReducer(state: MergeState, action: MergeAction): MergeState {
  switch (action.type) {
    case 'pick-canonical': {
      const newSide = sideForCanonical(action.id, action.entityAId)
      const fields = Object.keys(state.fieldChoices) as ScalarField[]
      return {
        ...state,
        canonicalId: action.id,
        fieldChoices: fieldChoicesForCanonical(fields, newSide),
        // deselectedTags preserved — tag choices are independent of canonical pick.
      }
    }
    case 'pick-field': {
      return {
        ...state,
        fieldChoices: { ...state.fieldChoices, [action.field]: action.side },
      }
    }
    case 'toggle-tag': {
      const has = state.deselectedTags.includes(action.tag)
      return {
        ...state,
        deselectedTags: has
          ? state.deselectedTags.filter((t) => t !== action.tag)
          : [...state.deselectedTags, action.tag],
      }
    }
    case 'reset': {
      return initMergeState(action.diff, action.defaultCanonicalId, action.entityAId)
    }
  }
}
