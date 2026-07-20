export type VisualChangeNote = { id: string; type: string; text: string }
export type ItemTransfer = {
  id: string
  slot: 'equipped_items' | 'inventory'
  to?: string
  from?: string
}
export type StackableTransfer = { key: string; amount: number; to?: string; from?: string }
export type ParsedTransfers = { items: ItemTransfer[]; stackables: StackableTransfer[] }

export type ParsedStateBlock = {
  sceneEntities?: string[]
  currentLocation?: string
  worldTimeDelta?: number
  visualChanges?: VisualChangeNote[]
  transfers?: ParsedTransfers
  summary?: string
}

export type ParseFieldFailure = { field: keyof ParsedStateBlock; detail: string }

export type ParseStateBlockResult = {
  block: ParsedStateBlock
  failures: ParseFieldFailure[]
  blockFound: boolean
}
