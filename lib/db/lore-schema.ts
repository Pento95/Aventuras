import { createInsertSchema } from 'drizzle-zod'
import { z } from 'zod'

import { lore } from './schema'

// Writable (delta-logged) lore columns, derived from the Drizzle table
export const loreWriteSchema = createInsertSchema(lore, {
  tags: z.array(z.string()).optional(),
  keywords: z.array(z.string()).optional(),
  priority: (schema) => schema.min(0).max(100),
}).omit({ id: true, branchId: true, embeddingStale: true, createdAt: true, updatedAt: true })

export type LoreWrite = z.infer<typeof loreWriteSchema>
