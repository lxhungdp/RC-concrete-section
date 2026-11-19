import { nextAvailableId } from './ids'
import type { DemandCheckBasis, LoadCombination, LoadingsInput } from './types'
import { loadReferenceOf } from './load-reference'

export const DEFAULT_DEMAND_CHECK_BASIS: DemandCheckBasis = 'proportional3D'

/** The removed 2D Load Ray basis (development/02 §7); stored files may still carry it. */
export const LEGACY_DIRECT_2D_CHECK_BASIS = 'direct2D'

export const LEGACY_DIRECT_2D_WARNING =
  'The removed 2D Load Ray check basis was read as the 3D Load Ray: it took its angle from the 3D strength point and gave the same ratio up to meridian discretization.'

/**
 * development/02 §7: `'direct2D'` written before 2026-11-19 reads as `'proportional3D'`; the document
 * reader reports `LEGACY_DIRECT_2D_WARNING`. Any other unknown value is rejected.
 */
export const parseDemandCheckBasis = (value: unknown): DemandCheckBasis => {
  if (value === LEGACY_DIRECT_2D_CHECK_BASIS) return 'proportional3D'
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
