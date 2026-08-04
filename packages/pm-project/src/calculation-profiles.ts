import { createAci318DesignBasis, createKdsBasicDesignBasis, type DesignBasis } from '@pm/design'
import {
  applyAci318ConcreteDerived,
  applyAci318SteelDerived,
  applyKdsConcreteDerived,
  kdsConcreteParams,
  type MaterialStore
} from '@pm/materials'
import {
  createDefaultAnalysisOptions,
  createVerifiedEquivalentBlockAnalysisOptions,
  type CalculationAnalysisOptions
} from './analysis-options'

export const CALCULATION_PROFILE_IDS = [
  'kds-2024-stress-strain',
  'kds-142020-equivalent-block',
  'aci-318-19-22-equivalent-block'
] as const

export type CalculationProfileId = (typeof CALCULATION_PROFILE_IDS)[number]
export type CalculationMechanics = 'stress-strain-integration' | 'equivalent-rectangular-block'

export type CalculationProfile = {
  id: CalculationProfileId
  label: string
  shortLabel: string
  organization: 'KDS' | 'ACI'
  standard: 'KDS 2024 current set' | 'KDS 14 20 20:2022' | 'ACI 318-19(22)'
  mechanics: CalculationMechanics
  verificationStatus: 'implemented'
}

export const CALCULATION_PROFILES: readonly CalculationProfile[] = [
  {
    id: 'kds-2024-stress-strain',
    label: 'KDS 2024 — Stress–strain integration',
    shortLabel: 'KDS — Stress–strain',
    organization: 'KDS',
    standard: 'KDS 2024 current set',
    mechanics: 'stress-strain-integration',
    verificationStatus: 'implemented'
  },
  {
    id: 'kds-142020-equivalent-block',
    label: 'KDS 14 20 20 — Equivalent rectangular block',
    shortLabel: 'KDS — Equivalent block',
    organization: 'KDS',
    standard: 'KDS 14 20 20:2022',
    mechanics: 'equivalent-rectangular-block',
    verificationStatus: 'implemented'
  },
  {
    id: 'aci-318-19-22-equivalent-block',
    label: 'ACI 318-19(22) — Whitney equivalent block',
    shortLabel: 'ACI 318 — Equivalent block',
    organization: 'ACI',
    standard: 'ACI 318-19(22)',
    mechanics: 'equivalent-rectangular-block',
    verificationStatus: 'implemented'
  }
] as const

export const DEFAULT_CALCULATION_PROFILE_ID: CalculationProfileId = 'kds-2024-stress-strain'

export const calculationProfile = (id: CalculationProfileId): CalculationProfile => {
  const profile = CALCULATION_PROFILES.find((candidate) => candidate.id === id)
  if (!profile) throw new Error(`Unsupported calculation profile: ${id}`)
  return profile
}

export const isCalculationProfileId = (value: unknown): value is CalculationProfileId =>
  typeof value === 'string' && (CALCULATION_PROFILE_IDS as readonly string[]).includes(value)

export const createAnalysisOptionsForProfile = (id: CalculationProfileId): CalculationAnalysisOptions =>
  calculationProfile(id).mechanics === 'equivalent-rectangular-block'
    ? createVerifiedEquivalentBlockAnalysisOptions()
    : createDefaultAnalysisOptions()

export const createDesignBasisForCalculationProfile = (id: CalculationProfileId): DesignBasis =>
  id === 'aci-318-19-22-equivalent-block' ? createAci318DesignBasis() : createKdsBasicDesignBasis()

/** Apply a profile atomically so material labels/models cannot drift away from the selected code. */
export const applyCalculationProfileToMaterials = (
  source: MaterialStore,
  id: CalculationProfileId
): MaterialStore => {
  const store = JSON.parse(JSON.stringify(source)) as MaterialStore
  if (id === 'aci-318-19-22-equivalent-block') {
    store.concrete = applyAci318ConcreteDerived({
      ...store.concrete,
      standard: 'ACI318',
      factors: { ...store.concrete.factors, alpha: 0.85, gammaC: undefined }
    })
    store.steel = store.steel.map((steel) => applyAci318SteelDerived({
      ...steel,
      standard: 'ACI318',
      stressStrain: { type: 'elastic-perfectly-plastic' }
    }))
    return store
  }
  const params = kdsConcreteParams(store.concrete.fck)
  store.concrete = applyKdsConcreteDerived({
    ...store.concrete,
    standard: 'KDS',
    stressStrain: { type: 'kds-parabolic', ...params },
    factors: { ...store.concrete.factors, alpha: params.alpha, gammaC: undefined }
  })
  store.steel = store.steel.map((steel) => ({
    ...steel,
    standard: 'KDS',
    stressStrain: { type: 'elastic-perfectly-plastic' },
    limits: { ...steel.limits, epsY: steel.fy / steel.elasticModulus }
  }))
  return store
}
