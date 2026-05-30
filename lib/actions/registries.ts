import type { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core'
import type { ZodType } from 'zod'

import { entryMetadataSchema, storyEntries } from '@/lib/db'

// target_table string -> descriptor for reverse-replay re-INSERT / DELETE /
// UPDATE. branchCol is present only for composite-keyed tables (match on
// (branch_id, id)); single-keyed tables match on idCol alone. Grows as
// delta-logged tables land.
export type TargetTableDescriptor = {
  table: SQLiteTable
  idCol: SQLiteColumn
  branchCol?: SQLiteColumn
}

export const TARGET_TABLES: Record<string, TargetTableDescriptor> = {
  story_entries: { table: storyEntries, idCol: storyEntries.id, branchCol: storyEntries.branchId },
}

// target_table -> { column -> Zod schema } for the op=update diff/apply engines.
// Only columns whose value is a nested JSON object need a schema; scalar columns
// are handled as whole-value replace by the engines.
export const COLUMN_SCHEMAS: Record<string, Record<string, ZodType>> = {
  story_entries: { metadata: entryMetadataSchema },
}
