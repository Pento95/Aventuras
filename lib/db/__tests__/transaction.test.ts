import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { branches, stories } from '../schema'
import { createTestDb } from './test-db'

describe('runInTransaction (test executor)', () => {
  it('commits all ops atomically', async () => {
    const { db, runInTransaction } = await createTestDb()
    const s = db
      .insert(stories)
      .values({ id: 's1', title: 'T', createdAt: 1, updatedAt: 1 })
      .toSQL()
    const b = db
      .insert(branches)
      .values({ id: 'b1', storyId: 's1', name: 'm', createdAt: 1 })
      .toSQL()
    await runInTransaction([s, b])
    expect((await db.select().from(stories).where(eq(stories.id, 's1'))).length).toBe(1)
  })

  it('rolls back every op when one throws (FK violation)', async () => {
    const { db, runInTransaction } = await createTestDb()
    const s = db
      .insert(stories)
      .values({ id: 's1', title: 'T', createdAt: 1, updatedAt: 1 })
      .toSQL()
    const badBranch = db
      .insert(branches)
      .values({ id: 'b1', storyId: 'missing', name: 'm', createdAt: 1 })
      .toSQL()
    await expect(runInTransaction([s, badBranch])).rejects.toThrow()
    // story insert rolled back too
    expect((await db.select().from(stories).where(eq(stories.id, 's1'))).length).toBe(0)
  })
})
