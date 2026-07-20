import { z } from 'zod'

import { generateStructured } from '@/lib/ai'
import type { ModelCapabilities } from '@/lib/ai'
import { buildPiggybackActions } from '@/lib/piggyback'
import type {
  PhaseContext,
  PhaseEmittedEvent,
  PhaseResult,
  ResolverInput,
} from '@/lib/pipeline/types'
import { appSettingsStore, currentStoryStore, entitiesStore, entriesStore } from '@/lib/stores'

export const PIGGYBACK_FALLBACK_PHASE_NAME = 'piggyback-fallback-classifier'

export function resolvePiggybackFires(opts: {
  piggybackMode: 'on' | 'off'
  narrativeModelCapabilities?: ModelCapabilities
}): boolean {
  if (opts.piggybackMode !== 'on') return false
  return opts.narrativeModelCapabilities?.taggedBlockReliable === true
}

export type PiggybackOutcome = { attempted: boolean; succeeded: boolean }

export function shouldFallbackFire(outcome?: PiggybackOutcome): boolean {
  if (!outcome) return true
  return !outcome.attempted || !outcome.succeeded
}

const fallbackClassifierSchema = z.object({
  sceneEntities: z.array(z.string()),
  currentLocation: z.string().optional(),
  worldTimeDelta: z.number(),
  visualChanges: z
    .array(
      z.object({
        id: z.string(),
        type: z.enum(['physique', 'face', 'hair', 'eyes', 'attire', 'distinguishing']),
        text: z.string(),
      }),
    )
    .default([]),
  transfers: z
    .object({
      items: z
        .array(
          z.object({
            id: z.string(),
            slot: z.enum(['equipped_items', 'inventory']),
            to: z.string().optional(),
            from: z.string().optional(),
          }),
        )
        .default([]),
      stackables: z
        .array(
          z.object({
            key: z.string(),
            amount: z.number(),
            to: z.string().optional(),
            from: z.string().optional(),
          }),
        )
        .default([]),
    })
    .default({ items: [], stackables: [] }),
  summary: z.string().optional(),
})

export async function* piggybackFallbackClassifierPhase(
  ctx: PhaseContext,
): AsyncGenerator<PhaseEmittedEvent, PhaseResult> {
  const open = currentStoryStore.getCurrentStory()
  if (!open)
    return {
      status: 'failed',
      error: { kind: 'orchestrator', detail: 'piggyback-fallback: no open story' },
    }

  const outcome = ctx.intermediates.piggybackOutcome as PiggybackOutcome | undefined
  if (!shouldFallbackFire(outcome)) return { status: 'completed' }

  const entries = [...entriesStore.getEntries().values()]
    .filter((e) => e.branchId === ctx.branchId)
    .sort((a, b) => a.position - b.position)
  const tail = entries.at(-1)
  if (!tail) return { status: 'completed' }

  const appSettings = appSettingsStore.getAppSettings()
  const result = await generateStructured(
    'classifier',
    `Extract scene state from this reply:\n\n${tail.content}`,
    fallbackClassifierSchema,
    {
      providers: appSettings.providers,
      profiles: appSettings.profiles,
      assignments: appSettings.assignments,
      defaultProviderId: appSettings.defaultProviderId,
      storyModels: open.settings.models,
    },
    ctx.abortSignal,
  )
  if (result.status !== 'ok') {
    ctx.log.warn('classifier.piggyback_fallback_failed', { status: result.status })
    return { status: 'completed' }
  }

  const entities = [...entitiesStore.getEntities().values()].filter(
    (e) => e.branchId === ctx.branchId,
  )
  const previousEntry = entries.at(-2)
  const { metadata: scenePatch, actions } = buildPiggybackActions({
    entryId: tail.id,
    block: result.value,
    entities,
    previousMetadata: previousEntry?.metadata ?? {
      sceneEntities: [],
      currentLocationId: null,
      worldTime: 0,
    },
    branchId: ctx.branchId,
  })

  yield {
    type: 'delta_emitted',
    action: {
      kind: 'updateStoryEntryMetadata',
      source: 'periodic_classifier',
      payload: {
        branchId: ctx.branchId,
        id: tail.id,
        metadata: { ...tail.metadata, ...scenePatch },
      },
    },
  }
  for (const action of actions) {
    yield { type: 'delta_emitted', action }
  }
  return { status: 'completed' }
}

export const PIGGYBACK_FALLBACK_RESOLVES: readonly ResolverInput[] = [
  {
    target: 'classifier',
    when: (snapshot) =>
      !resolvePiggybackFires({
        piggybackMode: snapshot.storySettings?.piggybackMode ?? 'off',
        narrativeModelCapabilities: undefined,
      }),
  },
]
