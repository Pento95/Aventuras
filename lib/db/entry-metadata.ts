import { z } from 'zod'

export const entryMetadataSchema = z.object({
  tokens: z
    .object({ prompt: z.number(), completion: z.number(), reasoning: z.number().optional() })
    .optional(),
  model: z.string().optional(),
  generationTimingMs: z.number().optional(),
  reasoning: z.string().optional(),
  sceneEntities: z.array(z.string()),
  currentLocationId: z.string().nullable(),
  worldTime: z.number().min(0),
  nextTurnSuggestions: z
    .object({
      items: z.array(z.object({ categoryId: z.string(), text: z.string() })),
      source: z.enum(['piggyback', 'classifier', 'refresh']),
      refreshGuidance: z.string().optional(),
    })
    .optional(),
})

export type EntryMetadata = z.infer<typeof entryMetadataSchema>
