import { describe, expect, it } from 'vitest'

import { loreWriteSchema } from './lore-schema'

describe('loreWriteSchema', () => {
  it('accepts a minimal row; columns with defaults may be omitted', () => {
    const parsed = loreWriteSchema.parse({ title: 'Magic system', injectionMode: 'auto' })
    expect(parsed).toEqual({ title: 'Magic system', injectionMode: 'auto' })
  })

  it('retypes tags/keywords to string arrays (rejects non-string elements)', () => {
    expect(
      loreWriteSchema.safeParse({ title: 'X', injectionMode: 'auto', tags: ['a'] }).success,
    ).toBe(true)
    expect(
      loreWriteSchema.safeParse({ title: 'X', injectionMode: 'auto', tags: [1] }).success,
    ).toBe(false)
  })

  it('rejects a non-integer priority', () => {
    expect(
      loreWriteSchema.safeParse({ title: 'X', injectionMode: 'auto', priority: 1.5 }).success,
    ).toBe(false)
  })

  it('rejects a priority above 100', () => {
    expect(
      loreWriteSchema.safeParse({ title: 'X', injectionMode: 'auto', priority: 200 }).success,
    ).toBe(false)
  })

  it('rejects a negative priority', () => {
    expect(
      loreWriteSchema.safeParse({ title: 'X', injectionMode: 'auto', priority: -1 }).success,
    ).toBe(false)
  })

  it('rejects an unknown injection mode', () => {
    expect(loreWriteSchema.safeParse({ title: 'X', injectionMode: 'sometimes' }).success).toBe(
      false,
    )
  })
})
