import { createInsertSchema } from 'drizzle-zod'
import type { z } from 'zod'

import { threads } from './schema'

// Writable (delta-logged) thread columns, derived from the Drizzle table
export const threadWriteSchema = createInsertSchema(threads).omit({
  id: true,
  branchId: true,
  embeddingStale: true,
  createdAt: true,
  updatedAt: true,
})

export type ThreadWrite = z.infer<typeof threadWriteSchema>
