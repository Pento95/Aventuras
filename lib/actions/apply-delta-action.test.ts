import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { branches, deltas, stories, storyEntries } from '@/lib/db'
import { createTestDb } from '@/lib/db/__tests__/test-db'

import { applyDeltaAction } from './apply-delta-action'

async function seed(db: Awaited<ReturnType<typeof createTestDb>>['db']) {
  await db.insert(stories).values({ id: 's1', title: 'T', createdAt: 1, updatedAt: 1 })
  await db.insert(branches).values({ id: 'b1', storyId: 's1', name: 'm', createdAt: 1 })
}

describe('applyDeltaAction', () => {
  it('op=create: writes target row + delta(undo_payload=null) + log_position 1', async () => {
    const { db, runInTransaction } = await createTestDb()
    await seed(db)
    const res = await applyDeltaAction(
      {
        action: {
          kind: 'createStoryEntry',
          source: 'ai_classifier',
          payload: {
            entry: {
              id: 'entry_1',
              branchId: 'b1',
              position: 1,
              kind: 'ai_reply',
              content: 'hi',
              createdAt: 1,
            },
          },
        },
        actionId: 'act_1',
        branchId: 'b1',
        entryId: 'entry_1',
      },
      { db, runInTransaction },
    )
    expect(res).toEqual({ status: 'ok', logPosition: 1 })
    const [entry] = await db.select().from(storyEntries).where(eq(storyEntries.id, 'entry_1'))
    expect(entry.content).toBe('hi')
    const [delta] = await db.select().from(deltas).where(eq(deltas.actionId, 'act_1'))
    expect(delta.op).toBe('create')
    expect(delta.undoPayload).toBeNull()
    expect(delta.logPosition).toBe(1)
    expect(delta.source).toBe('ai_classifier')
  })

  it('op=update: undo_payload captures pre-change metadata partial; log_position increments', async () => {
    const { db, runInTransaction } = await createTestDb()
    await seed(db)
    await db.insert(storyEntries).values({
      id: 'entry_1',
      branchId: 'b1',
      position: 1,
      kind: 'ai_reply',
      content: 'hi',
      metadata: { sceneEntities: [], currentLocationId: 'loc_a', worldTime: 5 },
      createdAt: 1,
    })
    const res = await applyDeltaAction(
      {
        action: {
          kind: 'updateStoryEntryMetadata',
          source: 'ai_classifier',
          payload: {
            branchId: 'b1',
            id: 'entry_1',
            metadata: { sceneEntities: [], currentLocationId: 'loc_b', worldTime: 5 },
          },
        },
        actionId: 'act_2',
        branchId: 'b1',
        entryId: 'entry_1',
      },
      { db, runInTransaction },
    )
    expect(res.status).toBe('ok')
    const [entry] = await db.select().from(storyEntries).where(eq(storyEntries.id, 'entry_1'))
    expect((entry.metadata as { currentLocationId: string }).currentLocationId).toBe('loc_b')
    const [delta] = await db.select().from(deltas).where(eq(deltas.actionId, 'act_2'))
    expect(delta.op).toBe('update')
    // Column-keyed: { <column>: <pre-change partial> } — reverse-replay restores per column.
    expect(delta.undoPayload).toEqual({ metadata: { currentLocationId: 'loc_a' } })
  })
})
