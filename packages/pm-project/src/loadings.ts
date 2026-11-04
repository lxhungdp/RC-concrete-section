import { nextAvailableId } from './ids'
import type { DemandCheckBasis, LoadCombination, LoadingsInput } from './types'
import { loadReferenceOf } from './load-reference'

export const DEFAULT_DEMAND_CHECK_BASIS: DemandCheckBasis = 'proportional3D'

export const parseDemandCheckBasis = (value: unknown): DemandCheckBasis => {
  if (value !== 'proportional3D' && value !== 'constantAxial') {
    throw new RangeError('Demand check basis must be proportional3D or constantAxial.')
  }
  return value
}

export const demandCheckBasisOf = (input: Pick<LoadingsInput, 'checkBasis'>): DemandCheckBasis =>
  input.checkBasis ?? DEFAULT_DEMAND_CHECK_BASIS

export const createEmptyLoadingsInput = (): LoadingsInput => ({
  reference: { kind: 'centroid-offset', offsetX: 0, offsetY: 0 },
  checkBasis: DEFAULT_DEMAND_CHECK_BASIS,
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
  checkBasis: demandCheckBasisOf(input),
  combinations: input.combinations.map((item) => ({ ...item }))
})
