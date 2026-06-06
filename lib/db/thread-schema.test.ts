import { describe, expect, it } from 'vitest'

import { threadWriteSchema } from './thread-schema'

describe('threadWriteSchema', () => {
  it('accepts a minimal row; nullable columns may be omitted', () => {
    const parsed = threadWriteSchema.parse({
      title: 'Find the sword',
      status: 'active',
      injectionMode: 'auto',
    })
    expect(parsed).toEqual({
      title: 'Find the sword',
      status: 'active',
      injectionMode: 'auto',
    })
  })

  it('accepts explicit null and string values for nullable columns', () => {
    const parsed = threadWriteSchema.parse({
      title: 'Find the sword',
      status: 'active',
      injectionMode: 'auto',
      description: null,
      triggeredAtEntryId: 'se_5',
    })
    expect(parsed).toMatchObject({ description: null, triggeredAtEntryId: 'se_5' })
  })

  it('rejects a missing required column', () => {
    expect(threadWriteSchema.safeParse({ status: 'active', injectionMode: 'auto' }).success).toBe(
      false,
    )
  })

  it('rejects an unknown status', () => {
    expect(
      threadWriteSchema.safeParse({ title: 'X', status: 'abandoned', injectionMode: 'auto' })
        .success,
    ).toBe(false)
  })

  it('rejects an unknown injection mode', () => {
    expect(
      threadWriteSchema.safeParse({ title: 'X', status: 'pending', injectionMode: 'sometimes' })
        .success,
    ).toBe(false)
  })
})
