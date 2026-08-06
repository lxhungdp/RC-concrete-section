import {
  createAci318DesignBasis,
  createAs3600DesignBasis,
  createCustomDesignBasis,
  createEn1992DesignBasis,
  createKdsAppendixDesignBasis,
  createKdsBasicDesignBasis,
  type DesignBasis,
  type DesignProfileId,
  type ResistanceFormat
} from '@pm/design'
import {
  applyAci318ConcreteDerived,
  applyAci318SteelDerived,
  applyAs3600ConcreteDerived,
  applyAs3600SteelDerived,
  applyEn1992ConcreteDerived,
  applyEn1992SteelDerived,
  applyKdsConcreteDerived,
  DEFAULT_USER_BLOCK_ALPHA,
  DEFAULT_USER_BLOCK_BETA1,
  DEFAULT_USER_BLOCK_EPS_CU,
  EN1992_ALPHA_CC,
  EN1992_GAMMA_C,
  EN1992_GAMMA_S,
  kdsConcreteParams,
  type ConcreteMaterial,
  type MaterialStandard,
  type MaterialStore,
  type SteelMaterial
} from '@pm/materials'
import {
  createDefaultAnalysisOptions,
  createDefaultEquivalentBlockAnalysisOptions,
  type CalculationAnalysisOptions
} from './analysis-options'

export const CALCULATION_PROFILE_IDS = [
  'kds-2024-stress-strain',
  'kds-142020-equivalent-block',
  'aci-318-19-22-equivalent-block',
  'en-1992-1-1-2004-stress-strain',
  'as-3600-2018-amd2-equivalent-block',
  'custom-stress-strain',
  'custom-equivalent-block'
] as const

export type CalculationProfileId = (typeof CALCULATION_PROFILE_IDS)[number]
export type CalculationMechanics = 'stress-strain-integration' | 'equivalent-rectangular-block'
export type DesignCodeId = 'KDS' | 'ACI' | 'EN' | 'AS'
export type ConcreteModelId =
  | 'kds-parabolic'
  | 'kds-equivalent-rectangular-block'
  | 'aci-whitney-equivalent-block'
  | 'en1992-parabolic-rectangular'
  | 'as3600-equivalent-rectangular-block'
  | 'user-stress-strain-curve'
  | 'user-equivalent-rectangular-block'

export type ConcreteModelCapability = {
  id: ConcreteModelId
  label: string
  materialModelType: ConcreteMaterial['stressStrain']['type'] | null
  source: 'code-default' | 'user-defined'
}

export type DesignCodeDescriptor = {
  id: DesignCodeId
  label: string
  description: string
  implementationStatus: 'available' | 'preview' | 'not-implemented'
  unavailableReason?: string
}

export type CalculationProfile = {
  id: CalculationProfileId
  label: string
  shortLabel: string
  /** User-facing code family. Legacy user-defined profiles deliberately have no code family. */
  code: DesignCodeId | null
  organization: string
  standard: string
  mechanics: CalculationMechanics
  methodLabel: string
  defaultConcreteModelId: ConcreteModelId
  concreteModels: readonly ConcreteModelCapability[]
  /**
   * The single owner of profile coherence: the material standard, resistance profile and mechanics
   * a project file must carry for this selection. Persistence validation and the atomic Materials
   * apply both read these instead of re-deriving them from the profile id.
   */
  materialStandard: MaterialStandard
  designProfileId: DesignProfileId
  resistanceFormat: ResistanceFormat
  /** Resistance methods compatible with this mechanics/material-standard selection. */
  allowedDesignProfileIds?: readonly DesignProfileId[]
  /** Availability of the calculation route; engineering approval remains on DesignBasis. */
  implementationStatus: 'available' | 'preview' | 'legacy'
  /** Legacy custom profiles remain readable but are not presented as design standards. */
  visibleInStandardWorkflow: boolean
}

const USER_CURVE: ConcreteModelCapability = {
  id: 'user-stress-strain-curve',
  label: 'User-defined stress–strain curve',
  materialModelType: 'user-curve',
  source: 'user-defined'
}

const USER_BLOCK: ConcreteModelCapability = {
  id: 'user-equivalent-rectangular-block',
  label: 'User-defined equivalent rectangular block',
  materialModelType: 'user-block',
  source: 'user-defined'
}

export const DESIGN_CODES: readonly DesignCodeDescriptor[] = [
  {
    id: 'KDS',
    label: 'KDS',
    description: 'Korean Design Standards',
    implementationStatus: 'available'
  },
  {
    id: 'ACI',
    label: 'ACI',
    description: 'ACI 318 concrete design',
    implementationStatus: 'available'
  },
  {
    id: 'EN',
    label: 'EN',
    description: 'Eurocode 2 concrete design',
    implementationStatus: 'preview'
  },
  {
    id: 'AS',
    label: 'AS',
    description: 'AS 3600 concrete structures',
    implementationStatus: 'preview',
    unavailableReason:
      'Preview calculation only: clause mapping and independent engineering verification are incomplete.'
  }
] as const

export const CALCULATION_PROFILES: readonly CalculationProfile[] = [
  {
    id: 'kds-2024-stress-strain',
    label: 'KDS 2024 — Stress–strain integration',
    shortLabel: 'KDS — Stress–strain',
    code: 'KDS',
    organization: 'KDS',
    standard: 'KDS 2024 current set',
    mechanics: 'stress-strain-integration',
    methodLabel: 'Stress-Strain Method',
    defaultConcreteModelId: 'kds-parabolic',
    concreteModels: [
      { id: 'kds-parabolic', label: 'KDS parabolic concrete law', materialModelType: 'kds-parabolic', source: 'code-default' },
      USER_CURVE
    ],
    materialStandard: 'KDS',
    designProfileId: 'kds-2024-current-set',
    resistanceFormat: 'globalResultantFactor',
    allowedDesignProfileIds: [
      'kds-2024-current-set',
      'kds-142020-2022-appendix-material-factors'
    ],
    implementationStatus: 'available',
    visibleInStandardWorkflow: true
  },
  {
    id: 'kds-142020-equivalent-block',
    label: 'KDS 14 20 20 — Equivalent rectangular block',
    shortLabel: 'KDS — Equivalent block',
    code: 'KDS',
    organization: 'KDS',
    standard: 'KDS 14 20 20:2022',
    mechanics: 'equivalent-rectangular-block',
    methodLabel: 'Equivalent Stress Block',
    defaultConcreteModelId: 'kds-equivalent-rectangular-block',
    concreteModels: [{
      id: 'kds-equivalent-rectangular-block',
      label: 'KDS equivalent rectangular block',
      /** Legacy schema stores the KDS material curve; the block law itself is resolved by the adapter. */
      materialModelType: 'kds-parabolic',
      source: 'code-default'
    }],
    materialStandard: 'KDS',
    designProfileId: 'kds-2024-current-set',
    resistanceFormat: 'globalResultantFactor',
    allowedDesignProfileIds: [
      'kds-2024-current-set',
      'kds-142020-2022-appendix-material-factors'
    ],
    implementationStatus: 'available',
    visibleInStandardWorkflow: true
  },
  {
    id: 'aci-318-19-22-equivalent-block',
    label: 'ACI 318-19(22) — Whitney equivalent block',
    shortLabel: 'ACI 318 — Equivalent block',
    code: 'ACI',
    organization: 'ACI',
    standard: 'ACI 318-19(22)',
    mechanics: 'equivalent-rectangular-block',
    methodLabel: 'Equivalent Stress Block',
    defaultConcreteModelId: 'aci-whitney-equivalent-block',
    concreteModels: [{
      id: 'aci-whitney-equivalent-block',
      label: 'ACI Whitney equivalent block',
      materialModelType: 'aci-whitney-block',
      source: 'code-default'
    }],
    materialStandard: 'ACI318',
    designProfileId: 'aci-318-19-22',
    resistanceFormat: 'globalResultantFactor',
    implementationStatus: 'available',
    visibleInStandardWorkflow: true
  },
  {
    id: 'en-1992-1-1-2004-stress-strain',
    label: 'EN 1992-1-1:2004 — Stress–strain integration (preview)',
    shortLabel: 'EN 1992-1-1 — Stress–strain',
    code: 'EN',
    organization: 'CEN',
    standard: 'EN 1992-1-1:2004 recommended values; no National Annex',
    mechanics: 'stress-strain-integration',
    methodLabel: 'Stress-Strain Method',
    defaultConcreteModelId: 'en1992-parabolic-rectangular',
    concreteModels: [{
      id: 'en1992-parabolic-rectangular',
      label: 'EN 1992 parabolic–rectangular law',
      materialModelType: 'ec2-parabolic-rectangular',
      source: 'code-default'
    }],
    materialStandard: 'EC2',
    designProfileId: 'en-1992-1-1-2004-default',
    resistanceFormat: 'designMaterialReevaluation',
    implementationStatus: 'preview',
    visibleInStandardWorkflow: true
  },
  {
    id: 'as-3600-2018-amd2-equivalent-block',
    label: 'AS 3600:2018 Amd 1–2 — Equivalent rectangular block (preview)',
    shortLabel: 'AS 3600 — Equivalent block',
    code: 'AS',
    organization: 'Standards Australia',
    standard: 'AS 3600:2018 incorporating Amendments 1 and 2',
    mechanics: 'equivalent-rectangular-block',
    methodLabel: 'Equivalent Stress Block',
    defaultConcreteModelId: 'as3600-equivalent-rectangular-block',
    concreteModels: [{
      id: 'as3600-equivalent-rectangular-block',
      label: 'AS 3600 equivalent rectangular block',
      materialModelType: 'as3600-equivalent-block',
      source: 'code-default'
    }],
    materialStandard: 'AS3600',
    designProfileId: 'as-3600-2018-amd2',
    resistanceFormat: 'globalResultantFactor',
    implementationStatus: 'preview',
    visibleInStandardWorkflow: true
  },
  {
    id: 'custom-stress-strain',
    label: 'Custom — Stress–strain integration',
    shortLabel: 'Custom — Stress–strain',
    code: null,
    organization: 'User-defined',
    standard: 'User-defined',
    mechanics: 'stress-strain-integration',
    methodLabel: 'Stress-Strain Method',
    defaultConcreteModelId: 'user-stress-strain-curve',
    concreteModels: [USER_CURVE],
    materialStandard: 'CUSTOM',
    designProfileId: 'custom-user-defined',
    resistanceFormat: 'globalResultantFactor',
    implementationStatus: 'legacy',
    visibleInStandardWorkflow: false
  },
  {
    id: 'custom-equivalent-block',
    label: 'Custom — Equivalent rectangular block',
    shortLabel: 'Custom — Equivalent block',
    code: null,
    organization: 'User-defined',
    standard: 'User-defined',
    mechanics: 'equivalent-rectangular-block',
    methodLabel: 'Equivalent Stress Block',
    defaultConcreteModelId: 'user-equivalent-rectangular-block',
    concreteModels: [USER_BLOCK],
    materialStandard: 'CUSTOM',
    designProfileId: 'custom-user-defined',
    resistanceFormat: 'globalResultantFactor',
    implementationStatus: 'legacy',
    visibleInStandardWorkflow: false
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

export const designCode = (id: DesignCodeId): DesignCodeDescriptor => {
  const descriptor = DESIGN_CODES.find((candidate) => candidate.id === id)
  if (!descriptor) throw new Error(`Unsupported design code: ${id}`)
  return descriptor
}

export const calculationProfilesForCode = (code: DesignCodeId): readonly CalculationProfile[] =>
  CALCULATION_PROFILES.filter((profile) => profile.visibleInStandardWorkflow && profile.code === code)

export const activeConcreteModelId = (
  profileId: CalculationProfileId,
  concrete: ConcreteMaterial
): ConcreteModelId => {
  const profile = calculationProfile(profileId)
  const explicit = profile.concreteModels.find((model) => model.materialModelType === concrete.stressStrain.type)
  return explicit?.id ?? profile.defaultConcreteModelId
}

/**
 * Profiles the equivalent-block backend may be asked to prepare.
 *
 * Narrowed by mechanics rather than by excluding one id, so adding a fibre profile can never leave
 * it silently routed to a block adapter.
 */
export type EquivalentBlockProfileId =
  | 'kds-142020-equivalent-block'
  | 'aci-318-19-22-equivalent-block'
  | 'as-3600-2018-amd2-equivalent-block'
  | 'custom-equivalent-block'

export const isEquivalentBlockProfileId = (id: CalculationProfileId): id is EquivalentBlockProfileId =>
  calculationProfile(id).mechanics === 'equivalent-rectangular-block'

export const createAnalysisOptionsForProfile = (id: CalculationProfileId): CalculationAnalysisOptions =>
  calculationProfile(id).mechanics === 'equivalent-rectangular-block'
    ? createDefaultEquivalentBlockAnalysisOptions()
    : createDefaultAnalysisOptions()

export const createDesignBasisForCalculationProfile = (id: CalculationProfileId): DesignBasis => {
  const designProfileId = calculationProfile(id).designProfileId
  switch (designProfileId) {
    case 'custom-user-defined': return createCustomDesignBasis()
    case 'aci-318-19-22': return createAci318DesignBasis()
    case 'en-1992-1-1-2004-default': return createEn1992DesignBasis()
    case 'as-3600-2018-amd2': return createAs3600DesignBasis()
    case 'kds-2024-current-set':
    case 'kds-basic-2021-2022': return createKdsBasicDesignBasis()
    case 'kds-142020-2022-appendix-material-factors': return createKdsAppendixDesignBasis()
    default: return designProfileId satisfies never
  }
}

export const calculationProfileAcceptsDesignBasis = (
  profileId: CalculationProfileId,
  basis: DesignBasis
) => {
  const profile = calculationProfile(profileId)
  const allowed = profile.allowedDesignProfileIds ?? [profile.designProfileId]
  return allowed.includes(basis.profileId)
}

/** Which concrete models a profile's mechanics can actually evaluate. */
export const CONCRETE_MODELS_FOR_MECHANICS: Record<
  CalculationMechanics,
  ReadonlyArray<ConcreteMaterial['stressStrain']['type']>
> = {
  'stress-strain-integration': ['user-curve', 'kds-parabolic', 'ec2-parabolic-rectangular'],
  'equivalent-rectangular-block': ['user-block', 'aci-whitney-block', 'as3600-equivalent-block', 'kds-parabolic']
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
  switch (id) {
    case 'custom-stress-strain':
    case 'custom-equivalent-block':
      return applyCustomProfileToMaterials(store, profile.mechanics)
    case 'aci-318-19-22-equivalent-block':
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
    case 'en-1992-1-1-2004-stress-strain':
      store.concrete = applyEn1992ConcreteDerived({
        ...store.concrete,
        standard: 'EC2',
        stressStrain: {
          type: 'ec2-parabolic-rectangular',
          n: 2,
          epsC2: 0.002,
          epsCu2: 0.0035,
          alpha: EN1992_ALPHA_CC
        },
        factors: {
          ...store.concrete.factors,
          alpha: EN1992_ALPHA_CC,
          gammaC: undefined,
          resistanceScale: undefined
        }
      })
      store.steel = store.steel.map((steel) => applyEn1992SteelDerived({
        ...steel,
        standard: 'EC2',
        stressStrain: { type: 'elastic-perfectly-plastic' },
        factors: { ...steel.factors, gammaS: undefined, resistanceScale: undefined }
      }))
      return store
    case 'as-3600-2018-amd2-equivalent-block':
      store.concrete = applyAs3600ConcreteDerived({
        ...store.concrete,
        standard: 'AS3600'
      })
      store.steel = store.steel.map((steel) => applyAs3600SteelDerived({
        ...steel,
        standard: 'AS3600'
      }))
      return store
    case 'kds-2024-stress-strain':
    case 'kds-142020-equivalent-block': {
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
    default:
      return id satisfies never
  }
}

const userCurveFromConcrete = (material: ConcreteMaterial): ConcreteMaterial['stressStrain'] => {
  if (material.stressStrain.type === 'user-curve') return material.stressStrain
  const eps0 = material.limits.eps0 ?? 0.002
  const peak = (material.factors?.alpha ?? 0.85) * material.fck / (material.factors?.gammaC ?? 1)
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

export const applyConcreteModelToMaterials = (
  source: MaterialStore,
  profileId: CalculationProfileId,
  modelId: ConcreteModelId
): MaterialStore => {
  const profile = calculationProfile(profileId)
  const capability = profile.concreteModels.find((model) => model.id === modelId)
  if (!capability) throw new Error(`${modelId} is not available for ${profileId}`)
  if (capability.source === 'code-default') return applyCalculationProfileToMaterials(source, profileId)

  const store = JSON.parse(JSON.stringify(source)) as MaterialStore
  if (modelId === 'user-stress-strain-curve') {
    store.concrete = { ...store.concrete, stressStrain: userCurveFromConcrete(store.concrete) }
    return store
  }
  if (modelId === 'user-equivalent-rectangular-block') {
    store.concrete = { ...store.concrete, stressStrain: seedUserBlockConcrete(store.concrete) }
    return store
  }
  throw new Error(`Unsupported user-defined concrete model: ${modelId}`)
}
