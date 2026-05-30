import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { branches, stories } from '@/lib/db'
import { createTestDb } from '@/lib/db/__tests__/test-db'

import { defineAction } from './define-action'

describe('defineAction', () => {
  it('runs the built ops atomically and returns the result', async () => {
    const { db, runInTransaction } = await createTestDb()
    const seed = defineAction(async (_args: void, ctx) => {
      const ops = [
        db.insert(stories).values({ id: 's1', title: 'T', createdAt: 1, updatedAt: 1 }).toSQL(),
        db.insert(branches).values({ id: 'b1', storyId: 's1', name: 'm', createdAt: 1 }).toSQL(),
      ]
      return { ops, result: 'done' as const }
    })
    const r = await seed(undefined, { db, runInTransaction })
    expect(r).toBe('done')
    expect((await db.select().from(branches).where(eq(branches.id, 'b1'))).length).toBe(1)
  })
})
