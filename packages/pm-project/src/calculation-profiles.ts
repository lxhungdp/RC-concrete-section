import {
  createAci318DesignBasis,
  createCustomDesignBasis,
  createKdsBasicDesignBasis,
  type DesignBasis,
  type DesignProfileId
} from '@pm/design'
import {
  applyAci318ConcreteDerived,
  applyAci318SteelDerived,
  applyKdsConcreteDerived,
  DEFAULT_USER_BLOCK_ALPHA,
  DEFAULT_USER_BLOCK_BETA1,
  DEFAULT_USER_BLOCK_EPS_CU,
  kdsConcreteParams,
  type ConcreteMaterial,
  type MaterialStandard,
  type MaterialStore,
  type SteelMaterial
} from '@pm/materials'
import {
  createDefaultAnalysisOptions,
  createVerifiedEquivalentBlockAnalysisOptions,
  type CalculationAnalysisOptions
} from './analysis-options'

export const CALCULATION_PROFILE_IDS = [
  'kds-2024-stress-strain',
  'kds-142020-equivalent-block',
  'aci-318-19-22-equivalent-block',
  'custom-stress-strain',
  'custom-equivalent-block'
] as const

export type CalculationProfileId = (typeof CALCULATION_PROFILE_IDS)[number]
export type CalculationMechanics = 'stress-strain-integration' | 'equivalent-rectangular-block'

export type CalculationProfile = {
  id: CalculationProfileId
  label: string
  shortLabel: string
  organization: 'KDS' | 'ACI' | 'User-defined'
  standard: 'KDS 2024 current set' | 'KDS 14 20 20:2022' | 'ACI 318-19(22)' | 'User-defined'
  mechanics: CalculationMechanics
  /**
   * The single owner of profile coherence: the material standard, resistance profile and mechanics
   * a project file must carry for this selection. Persistence validation and the atomic Materials
   * apply both read these instead of re-deriving them from the profile id.
   */
  materialStandard: MaterialStandard
  designProfileId: DesignProfileId
  /** `implemented` describes the code path, never the engineering approval status. */
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
    materialStandard: 'KDS',
    designProfileId: 'kds-2024-current-set',
    verificationStatus: 'implemented'
  },
  {
    id: 'kds-142020-equivalent-block',
    label: 'KDS 14 20 20 — Equivalent rectangular block',
    shortLabel: 'KDS — Equivalent block',
    organization: 'KDS',
    standard: 'KDS 14 20 20:2022',
    mechanics: 'equivalent-rectangular-block',
    materialStandard: 'KDS',
    designProfileId: 'kds-2024-current-set',
    verificationStatus: 'implemented'
  },
  {
    id: 'aci-318-19-22-equivalent-block',
    label: 'ACI 318-19(22) — Whitney equivalent block',
    shortLabel: 'ACI 318 — Equivalent block',
    organization: 'ACI',
    standard: 'ACI 318-19(22)',
    mechanics: 'equivalent-rectangular-block',
    materialStandard: 'ACI318',
    designProfileId: 'aci-318-19-22',
    verificationStatus: 'implemented'
  },
  {
    id: 'custom-stress-strain',
    label: 'Custom — Stress–strain integration',
    shortLabel: 'Custom — Stress–strain',
    organization: 'User-defined',
    standard: 'User-defined',
    mechanics: 'stress-strain-integration',
    materialStandard: 'CUSTOM',
    designProfileId: 'custom-user-defined',
    verificationStatus: 'implemented'
  },
  {
    id: 'custom-equivalent-block',
    label: 'Custom — Equivalent rectangular block',
    shortLabel: 'Custom — Equivalent block',
    organization: 'User-defined',
    standard: 'User-defined',
    mechanics: 'equivalent-rectangular-block',
    materialStandard: 'CUSTOM',
    designProfileId: 'custom-user-defined',
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

export const isCustomCalculationProfile = (id: CalculationProfileId) =>
  calculationProfile(id).materialStandard === 'CUSTOM'

/**
 * Profiles the equivalent-block backend may be asked to prepare.
 *
 * Narrowed by mechanics rather than by excluding one id, so adding a fibre profile can never leave
 * it silently routed to a block adapter.
 */
export type EquivalentBlockProfileId = 'kds-142020-equivalent-block' | 'aci-318-19-22-equivalent-block' | 'custom-equivalent-block'

export const isEquivalentBlockProfileId = (id: CalculationProfileId): id is EquivalentBlockProfileId =>
  calculationProfile(id).mechanics === 'equivalent-rectangular-block'

export const createAnalysisOptionsForProfile = (id: CalculationProfileId): CalculationAnalysisOptions =>
  calculationProfile(id).mechanics === 'equivalent-rectangular-block'
    ? createVerifiedEquivalentBlockAnalysisOptions()
    : createDefaultAnalysisOptions()

export const createDesignBasisForCalculationProfile = (id: CalculationProfileId): DesignBasis => {
  const designProfileId = calculationProfile(id).designProfileId
  if (designProfileId === 'custom-user-defined') return createCustomDesignBasis()
  if (designProfileId === 'aci-318-19-22') return createAci318DesignBasis()
  return createKdsBasicDesignBasis()
}

/** Which concrete models a profile's mechanics can actually evaluate. */
export const CONCRETE_MODELS_FOR_MECHANICS: Record<
  CalculationMechanics,
  ReadonlyArray<ConcreteMaterial['stressStrain']['type']>
> = {
  'stress-strain-integration': ['user-curve', 'kds-parabolic', 'ec2-parabolic-rectangular'],
  'equivalent-rectangular-block': ['user-block']
}

export const CUSTOM_STEEL_MODELS: ReadonlyArray<SteelMaterial['stressStrain']['type']> = [
  'elastic-perfectly-plastic',
  'bilinear',
  'user-curve'
]

const seedFibreConcrete = (material: ConcreteMaterial): ConcreteMaterial['stressStrain'] => {
  /** A parabolic law is already a fibre law; only a block law has to be replaced. */
  if (CONCRETE_MODELS_FOR_MECHANICS['stress-strain-integration'].includes(material.stressStrain.type)) {
    return material.stressStrain
  }
  const eps0 = material.limits.eps0 ?? 0.002
  const peak = (material.factors?.alpha ?? 0.85) * material.fck
  return {
    type: 'user-curve',
    interpolation: 'linear',
    zeroTension: material.limits.ignoreTension,
    points: [
      { strain: 0, stress: 0 },
      { strain: eps0, stress: peak },
      { strain: material.limits.epsCu, stress: peak }
    ]
  }
}

const seedUserBlockConcrete = (material: ConcreteMaterial): ConcreteMaterial['stressStrain'] => {
  if (material.stressStrain.type === 'user-block') return material.stressStrain
  const beta1 = material.stressStrain.type === 'aci-whitney-block'
    ? material.stressStrain.beta1
    : DEFAULT_USER_BLOCK_BETA1
  const alpha = 'alpha' in material.stressStrain
    ? material.stressStrain.alpha
    : material.factors?.alpha ?? DEFAULT_USER_BLOCK_ALPHA
  return {
    type: 'user-block',
    beta1,
    alpha,
    epsCu: material.limits.epsCu > 0 ? material.limits.epsCu : DEFAULT_USER_BLOCK_EPS_CU
  }
}

/**
 * Custom profiles seed a valid starting point for the selected mechanics, then stop editing.
 *
 * Re-selecting the same custom profile must not overwrite a curve the user has already tuned, so
 * every seed helper is a no-op once the model already matches the mechanics.
 */
const applyCustomProfileToMaterials = (store: MaterialStore, mechanics: CalculationMechanics): MaterialStore => {
  const concrete: ConcreteMaterial = {
    ...store.concrete,
    standard: 'CUSTOM',
    stressStrain: mechanics === 'equivalent-rectangular-block'
      ? seedUserBlockConcrete(store.concrete)
      : seedFibreConcrete(store.concrete),
    factors: { ...store.concrete.factors, gammaC: undefined }
  }
  return {
    ...store,
    concrete,
    steel: store.steel.map((steel) => ({
      ...steel,
      standard: 'CUSTOM',
      factors: { ...steel.factors, gammaS: undefined },
      limits: { ...steel.limits, epsY: steel.limits?.epsY ?? steel.fy / steel.elasticModulus }
    }))
  }
}

/** Apply a profile atomically so material labels/models cannot drift away from the selected code. */
export const applyCalculationProfileToMaterials = (
  source: MaterialStore,
  id: CalculationProfileId
): MaterialStore => {
  const store = JSON.parse(JSON.stringify(source)) as MaterialStore
  const profile = calculationProfile(id)
  if (profile.materialStandard === 'CUSTOM') {
    return applyCustomProfileToMaterials(store, profile.mechanics)
  }
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
