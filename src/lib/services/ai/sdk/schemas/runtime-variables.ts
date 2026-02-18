/**
 * Runtime Variables Schema Factory
 *
 * Dynamically builds Zod schemas from RuntimeVariable definitions at runtime.
 * Used by the ClassifierService to extend the base classification schema with
 * custom variable extraction when a story's pack defines runtime variables.
 *
 * Key design decisions:
 * - Single-element enums use z.literal() directly (z.union crashes with <2 items)
 * - Number min/max constraints are NOT enforced in the schema; we clamp after extraction
 * - Variables with defaultValue are marked .optional() in the schema
 * - The LLM sees variableName as the key, but stored values are keyed by defId
 */

import { z } from 'zod'
import type { RuntimeVariable, RuntimeEntityType } from '$lib/services/packs/types'
import {
  classificationResultSchema,
  characterUpdateSchema,
  newCharacterSchema,
  locationUpdateSchema,
  newLocationSchema,
  itemUpdateSchema,
  newItemSchema,
  storyBeatUpdateSchema,
  newStoryBeatSchema,
  sceneSchema,
  type ClassificationResult,
} from './classifier'

// ============================================================================
// Single Variable Schema Builder
// ============================================================================

/**
 * Build a Zod schema for a single runtime variable definition.
 *
 * - text: z.string()
 * - number: z.number() (no min/max -- clamped post-extraction)
 * - enum: z.literal() for 1 option, z.union() for 2+
 *
 * Variables with a defaultValue are marked .optional().
 */
export function buildVariableSchema(def: RuntimeVariable): z.ZodTypeAny {
  const desc = def.description || def.displayName
  const hasDefault = def.defaultValue !== undefined && def.defaultValue !== null

  switch (def.variableType) {
    case 'text': {
      const base = z.string().describe(desc)
      return hasDefault ? base.optional() : base
    }

    case 'number': {
      const base = z.number().describe(desc)
      return hasDefault ? base.optional() : base
    }

    case 'enum': {
      const options = def.enumOptions ?? []
      if (options.length === 0) {
        // No options defined -- fall back to string
        const base = z.string().describe(desc)
        return hasDefault ? base.optional() : base
      }

      if (options.length === 1) {
        // Single-element: use z.literal directly (z.union requires >= 2)
        const base = z.literal(options[0].value).describe(desc)
        return hasDefault ? base.optional() : base
      }

      // 2+ options: z.union of literals
      const literals = options.map((opt) => z.literal(opt.value)) as [
        z.ZodLiteral<string>,
        z.ZodLiteral<string>,
        ...z.ZodLiteral<string>[],
      ]
      const base = z.union(literals).describe(desc)
      return hasDefault ? base.optional() : base
    }

    default:
      // Fallback for unknown type
      return z.string().describe(desc).optional()
  }
}

// ============================================================================
// Entity Custom Vars Schema Builder
// ============================================================================

/**
 * Build a z.object schema for a set of runtime variables (already filtered to one entity type).
 * Each field key is the variable's variableName, value is the built schema.
 * Returns null if the variables array is empty.
 */
export function buildEntityCustomVarsSchema(
  variables: RuntimeVariable[],
): z.ZodObject<z.ZodRawShape> | null {
  if (variables.length === 0) return null

  const shape: z.ZodRawShape = {}
  for (const def of variables) {
    shape[def.variableName] = buildVariableSchema(def)
  }

  return z.object(shape).describe('Custom runtime variables for this entity')
}

// ============================================================================
// Extended Classification Schema Builder
// ============================================================================

/**
 * Map from RuntimeEntityType to the classifier schema field names.
 */
const ENTITY_TYPE_TO_SCHEMA_FIELDS: Record<RuntimeEntityType, { updates: string; new: string }> = {
  character: { updates: 'characterUpdates', new: 'newCharacters' },
  location: { updates: 'locationUpdates', new: 'newLocations' },
  item: { updates: 'itemUpdates', new: 'newItems' },
  story_beat: { updates: 'storyBeatUpdates', new: 'newStoryBeats' },
}

/**
 * Base update/new schemas per entity type -- used to extend with customVars.
 */
const BASE_UPDATE_SCHEMAS: Record<RuntimeEntityType, z.ZodObject<z.ZodRawShape>> = {
  character: characterUpdateSchema as unknown as z.ZodObject<z.ZodRawShape>,
  location: locationUpdateSchema as unknown as z.ZodObject<z.ZodRawShape>,
  item: itemUpdateSchema as unknown as z.ZodObject<z.ZodRawShape>,
  story_beat: storyBeatUpdateSchema as unknown as z.ZodObject<z.ZodRawShape>,
}

const BASE_NEW_SCHEMAS: Record<RuntimeEntityType, z.ZodObject<z.ZodRawShape>> = {
  character: newCharacterSchema as unknown as z.ZodObject<z.ZodRawShape>,
  location: newLocationSchema as unknown as z.ZodObject<z.ZodRawShape>,
  item: newItemSchema as unknown as z.ZodObject<z.ZodRawShape>,
  story_beat: newStoryBeatSchema as unknown as z.ZodObject<z.ZodRawShape>,
}

/**
 * Build an extended classification schema that includes customVars fields
 * for entity types that have runtime variable definitions.
 *
 * For each entity type with runtime variables:
 * - Update schemas get customVars added inside their `changes` object
 * - New entity schemas get customVars added at the top level
 *
 * If no runtime variables exist for any entity type, returns the base schema unchanged.
 */
export function buildExtendedClassificationSchema(
  runtimeVarsByEntityType: Record<string, RuntimeVariable[]>,
): z.ZodType {
  // Check if there are any runtime variables at all
  const entityTypes = Object.keys(runtimeVarsByEntityType) as RuntimeEntityType[]
  const typesWithVars = entityTypes.filter(
    (type) => runtimeVarsByEntityType[type] && runtimeVarsByEntityType[type].length > 0,
  )

  if (typesWithVars.length === 0) {
    return classificationResultSchema
  }

  // Build extended sub-schemas for each entity type with variables
  const entryUpdatesShape: Record<string, z.ZodTypeAny> = {}

  for (const entityType of ['character', 'location', 'item', 'story_beat'] as RuntimeEntityType[]) {
    const fields = ENTITY_TYPE_TO_SCHEMA_FIELDS[entityType]
    const vars = runtimeVarsByEntityType[entityType]
    const customVarsSchema = vars ? buildEntityCustomVarsSchema(vars) : null

    if (customVarsSchema) {
      // Extend the update schema: add customVars inside the `changes` object
      const baseUpdate = BASE_UPDATE_SCHEMAS[entityType]
      const changesKey = entityType === 'story_beat' ? 'changes' : 'changes'
      const originalChanges = (baseUpdate.shape as Record<string, z.ZodTypeAny>)[changesKey]

      if (originalChanges && originalChanges instanceof z.ZodObject) {
        const extendedChanges = originalChanges.extend({
          customVars: customVarsSchema.optional(),
        })
        const extendedUpdate = baseUpdate.extend({ [changesKey]: extendedChanges })
        entryUpdatesShape[fields.updates] = z.array(extendedUpdate).default([])
      } else {
        // Fallback: use base schema as-is
        entryUpdatesShape[fields.updates] = z.array(baseUpdate).default([])
      }

      // Extend the new entity schema: add customVars at top level
      const baseNew = BASE_NEW_SCHEMAS[entityType]
      const extendedNew = baseNew.extend({
        customVars: customVarsSchema.optional(),
      })
      entryUpdatesShape[fields.new] = z.array(extendedNew).default([])
    } else {
      // No variables for this entity type: use base schemas
      entryUpdatesShape[fields.updates] = z.array(BASE_UPDATE_SCHEMAS[entityType]).default([])
      entryUpdatesShape[fields.new] = z.array(BASE_NEW_SCHEMAS[entityType]).default([])
    }
  }

  return z.object({
    entryUpdates: z.object(entryUpdatesShape),
    scene: sceneSchema,
  })
}

// ============================================================================
// Extended Classification Result Type
// ============================================================================

/** Classification result that may include customVars from runtime variable extraction. */
export type ExtendedClassificationResult = ClassificationResult & {
  entryUpdates: ClassificationResult['entryUpdates'] & {
    characterUpdates: Array<
      ClassificationResult['entryUpdates']['characterUpdates'][number] & {
        changes: { customVars?: Record<string, unknown> }
      }
    >
    newCharacters: Array<
      ClassificationResult['entryUpdates']['newCharacters'][number] & {
        customVars?: Record<string, unknown>
      }
    >
    locationUpdates: Array<
      ClassificationResult['entryUpdates']['locationUpdates'][number] & {
        changes: { customVars?: Record<string, unknown> }
      }
    >
    newLocations: Array<
      ClassificationResult['entryUpdates']['newLocations'][number] & {
        customVars?: Record<string, unknown>
      }
    >
    itemUpdates: Array<
      ClassificationResult['entryUpdates']['itemUpdates'][number] & {
        changes: { customVars?: Record<string, unknown> }
      }
    >
    newItems: Array<
      ClassificationResult['entryUpdates']['newItems'][number] & {
        customVars?: Record<string, unknown>
      }
    >
    storyBeatUpdates: Array<
      ClassificationResult['entryUpdates']['storyBeatUpdates'][number] & {
        changes: { customVars?: Record<string, unknown> }
      }
    >
    newStoryBeats: Array<
      ClassificationResult['entryUpdates']['newStoryBeats'][number] & {
        customVars?: Record<string, unknown>
      }
    >
  }
  /** Internal metadata: runtime variable definitions for use by applyClassificationResult. Not LLM output. */
  _runtimeVarDefs?: RuntimeVariable[]
}
