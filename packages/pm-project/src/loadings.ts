import { nextAvailableId } from './ids'
import type { LoadCombination, LoadingsInput } from './types'
import { loadReferenceOf } from './load-reference'

export const createEmptyLoadingsInput = (): LoadingsInput => ({
  reference: { kind: 'centroid-offset', offsetX: 0, offsetY: 0 },
  combinations: []
})

export const createLoadCombination = (
  patch: Partial<LoadCombination> = {},
  usedIds: Iterable<number> = []
): LoadCombination => ({
  id: patch.id ?? nextAvailableId(usedIds),
  name: patch.name ?? 'Combination',
  actionBasis: 'factoredULS',
  P: patch.P ?? 0,
  Mx: patch.Mx ?? 0,
  My: patch.My ?? 0
})

export const cloneLoadingsInput = (input: LoadingsInput): LoadingsInput => ({
  reference: { ...loadReferenceOf(input) },
  combinations: input.combinations.map((item) => ({ ...item }))
})
