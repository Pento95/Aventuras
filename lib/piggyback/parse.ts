import { jsonrepair } from 'jsonrepair'

import { STATE_ROOT_TAG, STATE_TAGS } from './tags'
import type {
  ItemTransfer,
  ParseFieldFailure,
  ParsedStateBlock,
  ParsedTransfers,
  ParseStateBlockResult,
  StackableTransfer,
  VisualChangeNote,
} from './types'

// Segment isolation: extract the raw inner text of one top-level tag from a
// well-formed-or-truncated outer block. Returns undefined if the OPEN tag
// itself is missing (nothing to attempt); returns the inner text (possibly
// truncated / unterminated) if the open tag is present.
function extractSegment(source: string, tag: string): string | undefined {
  const openIdx = source.indexOf(`<${tag}>`)
  if (openIdx === -1) return undefined
  const start = openIdx + tag.length + 2
  const closeIdx = source.indexOf(`</${tag}>`, start)
  return closeIdx === -1 ? source.slice(start) : source.slice(start, closeIdx)
}

function parseIdList(segment: string): string[] {
  return segment
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

// Coerces a possibly-decorated numeric segment ("  120, // seconds  ") down to
// a finite number via jsonrepair. Narrow use — jsonrepair coerces this one
// scalar leaf's text, it never repairs the surrounding XML structure (see
// docs/memory/piggyback.md → Parse strategy and failure recovery).
function parseNumeric(segment: string): number {
  const trimmed = segment.trim()
  const direct = Number(trimmed)
  if (Number.isFinite(direct)) return direct
  const repaired = JSON.parse(jsonrepair(`[${trimmed}]`)) as unknown[]
  const value = repaired[0]
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`not a finite number: ${JSON.stringify(segment)}`)
  }
  return value
}

// key="value" pairs from a tag's attribute region (no surrounding < / >).
function parseAttributes(attrText: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const re = /(\w+)="([^"]*)"/g
  for (const match of attrText.matchAll(re)) {
    const [, key, value] = match
    if (key !== undefined && value !== undefined) attrs[key] = value
  }
  return attrs
}

// A segment that has real content but yields zero structured entries is a
// truncation/malformation, not a legitimate "nothing to report" — an empty or
// whitespace-only segment (self-closed tag) is legitimate and yields [].
function assertNotTruncated(segment: string, extractedCount: number, tagLabel: string): void {
  if (segment.trim().length > 0 && extractedCount === 0) {
    throw new Error(`${tagLabel}: content present but no well-formed entries extracted`)
  }
}

// <entity id="..." type="...">text</entity> — full-replace visual change,
// one entry per changed category (docs/memory/piggyback.md → Trailing block format).
function parseVisualChanges(segment: string): VisualChangeNote[] {
  const notes: VisualChangeNote[] = []
  const re = /<entity\s+([^>]*)>([^<]*)<\/entity>/g
  for (const match of segment.matchAll(re)) {
    const [, attrText, text] = match
    if (attrText === undefined || text === undefined) continue
    const attrs = parseAttributes(attrText)
    if (attrs.id === undefined || attrs.type === undefined) continue
    notes.push({ id: attrs.id, type: attrs.type, text: text.trim() })
  }
  assertNotTruncated(segment, notes.length, 'visual_changes')
  return notes
}

// <item id="..." to="..." from="..." slot="..." /> and
// <stackable key="..." amount="..." to="..." from="..." /> — self-closing,
// attribute-only. Both reference only already-existing entities.
function parseTransfers(segment: string): ParsedTransfers {
  const items: ItemTransfer[] = []
  const itemRe = /<item\s+([^>]*)\/?>/g
  for (const match of segment.matchAll(itemRe)) {
    const [, attrText] = match
    if (attrText === undefined) continue
    const attrs = parseAttributes(attrText)
    if (attrs.id === undefined) continue
    const slot = attrs.slot === 'equipped_items' ? 'equipped_items' : 'inventory'
    items.push({
      id: attrs.id,
      slot,
      ...(attrs.to !== undefined ? { to: attrs.to } : {}),
      ...(attrs.from !== undefined ? { from: attrs.from } : {}),
    })
  }

  const stackables: StackableTransfer[] = []
  const stackableRe = /<stackable\s+([^>]*)\/?>/g
  for (const match of segment.matchAll(stackableRe)) {
    const [, attrText] = match
    if (attrText === undefined) continue
    const attrs = parseAttributes(attrText)
    if (attrs.key === undefined || attrs.amount === undefined) continue
    const amount = Number(attrs.amount)
    if (!Number.isFinite(amount)) continue
    stackables.push({
      key: attrs.key,
      amount,
      ...(attrs.to !== undefined ? { to: attrs.to } : {}),
      ...(attrs.from !== undefined ? { from: attrs.from } : {}),
    })
  }

  assertNotTruncated(segment, items.length + stackables.length, 'transfers')
  return { items, stackables }
}

type FieldParser = {
  field: keyof ParsedStateBlock
  tag: string
  parse: (segment: string) => unknown
}

const FIELD_PARSERS: readonly FieldParser[] = [
  { field: 'sceneEntities', tag: STATE_TAGS.sceneEntities, parse: parseIdList },
  { field: 'currentLocation', tag: STATE_TAGS.currentLocation, parse: (s) => s.trim() },
  { field: 'worldTimeDelta', tag: STATE_TAGS.worldTimeDelta, parse: parseNumeric },
  { field: 'visualChanges', tag: STATE_TAGS.visualChanges, parse: parseVisualChanges },
  { field: 'transfers', tag: STATE_TAGS.transfers, parse: parseTransfers },
  { field: 'summary', tag: STATE_TAGS.summary, parse: (s) => s.trim() },
]

// Segment isolation + per-field best-effort parse: one failing top-level tag
// never blocks another (docs/memory/piggyback.md, C2 contract). Called on the
// FULL raw model output (prose + trailing block) — extracts <state> first.
export function parseStateBlock(raw: string): ParseStateBlockResult {
  const stateSegment = extractSegment(raw, STATE_ROOT_TAG)
  if (stateSegment === undefined) return { block: {}, failures: [], blockFound: false }

  const block: ParsedStateBlock = {}
  const failures: ParseFieldFailure[] = []

  for (const { field, tag, parse } of FIELD_PARSERS) {
    const segment = extractSegment(stateSegment, tag)
    if (segment === undefined) continue
    try {
      const value = parse(segment)
       
      ;(block as any)[field] = value
    } catch (e) {
      failures.push({ field, detail: e instanceof Error ? e.message : String(e) })
    }
  }

  return { block, failures, blockFound: true }
}
