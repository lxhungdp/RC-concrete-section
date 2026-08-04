import type { MaterialStandard, MaterialStore } from '@pm/materials'

export const DESIGN_BASIS_VERSION = 1 as const

export type ResistanceFormat = 'globalResultantFactor' | 'designMaterialReevaluation'
export type DesignProfileId =
  | 'kds-2024-current-set'
  /** Legacy identifier retained so previously saved project files remain readable. */
  | 'kds-basic-2021-2022'
  | 'aci-318-19-22'
  | 'en-1992-1-1-2004-default'
  /** User-owned resistance rules; carries no clause traceability by construction. */
  | 'custom-user-defined'

export type ProfileVerificationStatus = 'draft' | 'reviewed' | 'verified' | 'user-defined'
export type TransverseReinforcementClass = 'other' | 'qualifying-spiral'

export type DesignProfileIdentity = {
  organization: string
  document: string
  edition: string
  amendment?: string
  jurisdiction?: string
  nationalAnnex?: string
  methodId: string
  profileVersion: string
}

export type GlobalStrengthReductionFactors = {
  phiCompressionOther: number
  phiCompressionSpiral: number
  phiTension: number
  /** Maximum design compression as a fraction of the uncapped compression pole. */
  axialCapOther: number
  axialCapSpiral: number
}

/**
 * Code-owned definition of the tensile strain at which the tension-controlled
 * strength-reduction factor is reached.
 */
export type TensionControlledLimitRule =
  | {
      type: 'yield-plus-strain'
      extraStrain: number
    }
  | {
      type: 'fixed-or-yield-multiple'
      yieldStressThreshold: number
      fixedStrainLimit: number
      highStrengthYieldMultiple: number
    }

export type DesignMaterialFactors = {
  alphaCc: number
  gammaC: number
  gammaS: number
}

type DesignBasisCommon = {
  basisVersion: typeof DESIGN_BASIS_VERSION
  identity: DesignProfileIdentity
  profileId: DesignProfileId
  verificationStatus: ProfileVerificationStatus
  modified: boolean
  overrideReason: string
}

export type GlobalStrengthReductionBasis = DesignBasisCommon & {
  format: 'globalResultantFactor'
  transverseReinforcement: TransverseReinforcementClass
  factors: GlobalStrengthReductionFactors
  transition: TensionControlledLimitRule
  axialCapEnabled: boolean
}

export type DesignMaterialBasis = DesignBasisCommon & {
  format: 'designMaterialReevaluation'
  factors: DesignMaterialFactors
}

export type DesignBasis = GlobalStrengthReductionBasis | DesignMaterialBasis

export type ResistanceClassification = 'compression-controlled' | 'transition' | 'tension-controlled'

export type GlobalFactorEvaluation = {
  phi: number
  classification: ResistanceClassification
  controllingTensileStrain: number
  yieldStrain: number
  tensionControlledLimit: number
}

const identity = (
  organization: string,
  document: string,
  edition: string,
  methodId: string
): DesignProfileIdentity => ({
  organization,
  document,
  edition,
  methodId,
  profileVersion: '1.0.0'
})

export const createKdsBasicDesignBasis = (): GlobalStrengthReductionBasis => ({
  basisVersion: DESIGN_BASIS_VERSION,
  profileId: 'kds-2024-current-set',
  identity: {
    ...identity(
      'MOLIT/KDS',
      'KDS 2024 current set · resistance: KDS 14 20 10:2021 + KDS 14 20 20:2022',
      '2024 partial-revision framework (effective 2025-01-05)',
      'kds-2024-current-set-global-strength-reduction'
    ),
    amendment: 'MOLIT Notice 2024-879, 2024-12-30'
  },
  verificationStatus: 'draft',
  format: 'globalResultantFactor',
  transverseReinforcement: 'other',
  factors: {
    phiCompressionOther: 0.65,
    phiCompressionSpiral: 0.7,
    phiTension: 0.85,
    axialCapOther: 0.8,
    axialCapSpiral: 0.85
  },
  transition: {
    type: 'fixed-or-yield-multiple',
    yieldStressThreshold: 400,
    fixedStrainLimit: 0.005,
    highStrengthYieldMultiple: 2.5
  },
  axialCapEnabled: true,
  modified: false,
  overrideReason: ''
})

export const createAci318DesignBasis = (): GlobalStrengthReductionBasis => ({
  basisVersion: DESIGN_BASIS_VERSION,
  profileId: 'aci-318-19-22',
  identity: identity(
    'ACI',
    'ACI CODE-318-19 (Reapproved 2022)',
    '2019 (Reapproved 2022)',
    'aci-318-19-22-global-strength-reduction'
  ),
  verificationStatus: 'draft',
  format: 'globalResultantFactor',
  transverseReinforcement: 'other',
  factors: {
    phiCompressionOther: 0.65,
    phiCompressionSpiral: 0.75,
    phiTension: 0.9,
    axialCapOther: 0.8,
    axialCapSpiral: 0.85
  },
  transition: {
    type: 'yield-plus-strain',
    extraStrain: 0.003
  },
  axialCapEnabled: true,
  modified: false,
  overrideReason: ''
})

/**
 * Starting point for a user-owned resistance profile.
 *
 * The numbers below are a neutral, editable starting point, not a normative set: nothing here is
 * traced to a clause, and `verificationStatus` says so. A Custom basis is therefore never
 * "modified" relative to a code default, so it needs no override narrative — see
 * {@link designBasisRequiresOverrideReason}.
 */
export const createCustomDesignBasis = (): GlobalStrengthReductionBasis => ({
  basisVersion: DESIGN_BASIS_VERSION,
  profileId: 'custom-user-defined',
  identity: {
    ...identity(
      'User-defined',
      'User-defined resistance profile',
      'Project-specific',
      'custom-user-defined-global-strength-reduction'
    ),
    jurisdiction: 'Declared by the project, not by this software'
  },
  verificationStatus: 'user-defined',
  format: 'globalResultantFactor',
  transverseReinforcement: 'other',
  factors: {
    phiCompressionOther: 0.65,
    phiCompressionSpiral: 0.7,
    phiTension: 0.85,
    axialCapOther: 0.8,
    axialCapSpiral: 0.85
  },
  transition: {
    type: 'yield-plus-strain',
    extraStrain: 0.003
  },
  axialCapEnabled: true,
  modified: false,
  overrideReason: ''
})

export const createEn1992DesignBasis = (): DesignMaterialBasis => ({
  basisVersion: DESIGN_BASIS_VERSION,
  profileId: 'en-1992-1-1-2004-default',
  identity: {
    ...identity(
      'CEN',
      'EN 1992-1-1:2004',
      '2004',
      'en-1992-design-material-reevaluation'
    ),
    jurisdiction: 'Default recommended values',
    nationalAnnex: 'None selected'
  },
  verificationStatus: 'draft',
  format: 'designMaterialReevaluation',
  factors: {
    alphaCc: 0.85,
    gammaC: 1.5,
    gammaS: 1.15
  },
  modified: false,
  overrideReason: ''
})

export const createDefaultDesignBasisForStandard = (standard: MaterialStandard): DesignBasis => {
  if (standard === 'ACI318') return createAci318DesignBasis()
  if (standard === 'EC2') return createEn1992DesignBasis()
  if (standard === 'CUSTOM') return createCustomDesignBasis()
  return createKdsBasicDesignBasis()
}

export const createDefaultDesignBasis = (materials?: MaterialStore): DesignBasis =>
  createDefaultDesignBasisForStandard(materials?.concrete.standard ?? 'KDS')

export const cloneDesignBasis = <T extends DesignBasis>(basis: T): T =>
  JSON.parse(JSON.stringify(basis)) as T

const cloneMaterials = (materials: MaterialStore): MaterialStore =>
  JSON.parse(JSON.stringify(materials)) as MaterialStore

const withoutPartialFactors = (materials: MaterialStore, concreteAlpha?: number): MaterialStore => {
  const reference = cloneMaterials(materials)
  reference.concrete.factors = {
    ...reference.concrete.factors,
    ...(concreteAlpha === undefined ? {} : { alpha: concreteAlpha }),
    gammaC: undefined
  }
  if (concreteAlpha !== undefined && 'alpha' in reference.concrete.stressStrain) {
    reference.concrete.stressStrain.alpha = concreteAlpha
  }
  reference.steel = reference.steel.map((steel) => ({
    ...steel,
    factors: { ...steel.factors, gammaS: undefined },
    limits: {
      ...steel.limits,
      epsY: steel.fy / steel.elasticModulus
    }
  }))
  return reference
}

export const buildResistanceMaterialSets = (
  materials: MaterialStore,
  basis: DesignBasis
): {
  stateMaterials: MaterialStore
  referenceMaterials: MaterialStore
  designMaterials: MaterialStore
} => {
  if (basis.format === 'globalResultantFactor') {
    const referenceMaterials = withoutPartialFactors(materials)
    return {
      stateMaterials: referenceMaterials,
      referenceMaterials,
      designMaterials: referenceMaterials
    }
  }

  const referenceMaterials = withoutPartialFactors(materials, 1)
  const designMaterials = cloneMaterials(materials)
  designMaterials.concrete.factors = {
    ...designMaterials.concrete.factors,
    alpha: basis.factors.alphaCc,
    gammaC: basis.factors.gammaC
  }
  if ('alpha' in designMaterials.concrete.stressStrain) {
    designMaterials.concrete.stressStrain.alpha = basis.factors.alphaCc
  }
  designMaterials.steel = designMaterials.steel.map((steel) => ({
    ...steel,
    factors: { ...steel.factors, gammaS: basis.factors.gammaS },
    limits: {
      ...steel.limits,
      epsY: steel.fy / basis.factors.gammaS / steel.elasticModulus
    }
  }))
  return {
    stateMaterials: designMaterials,
    referenceMaterials,
    designMaterials
  }
}

export const evaluateGlobalStrengthReduction = (
  basis: GlobalStrengthReductionBasis,
  controllingTensileStrain: number,
  yieldStrain: number,
  yieldStress: number
): GlobalFactorEvaluation => {
  const compressionPhi =
    basis.transverseReinforcement === 'qualifying-spiral'
      ? basis.factors.phiCompressionSpiral
      : basis.factors.phiCompressionOther
  const tensionLimit = resolveTensionControlledStrainLimit(basis, yieldStrain, yieldStress)

  if (controllingTensileStrain <= yieldStrain) {
    return {
      phi: compressionPhi,
      classification: 'compression-controlled',
      controllingTensileStrain,
      yieldStrain,
      tensionControlledLimit: tensionLimit
    }
  }
  if (controllingTensileStrain >= tensionLimit) {
    return {
      phi: basis.factors.phiTension,
      classification: 'tension-controlled',
      controllingTensileStrain,
      yieldStrain,
      tensionControlledLimit: tensionLimit
    }
  }

  const span = Math.max(1e-12, tensionLimit - yieldStrain)
  const ratio = (controllingTensileStrain - yieldStrain) / span
  return {
    phi: compressionPhi + ratio * (basis.factors.phiTension - compressionPhi),
    classification: 'transition',
    controllingTensileStrain,
    yieldStrain,
    tensionControlledLimit: tensionLimit
  }
}

export const resolveTensionControlledStrainLimit = (
  basis: GlobalStrengthReductionBasis,
  yieldStrain: number,
  yieldStress: number
): number => {
  if (basis.transition.type === 'yield-plus-strain') {
    return yieldStrain + basis.transition.extraStrain
  }
  return yieldStress <= basis.transition.yieldStressThreshold
    ? basis.transition.fixedStrainLimit
    : basis.transition.highStrengthYieldMultiple * yieldStrain
}

const finiteBetween = (value: number, min: number, max: number) =>
  Number.isFinite(value) && value >= min && value <= max

const sameNumbers = <T extends Record<string, number>>(left: T, right: T) =>
  (Object.keys(left) as Array<keyof T>).every((key) => left[key] === right[key])

/**
 * Disabling the optional maximum-axial-resistance cap is an explicit analysis choice, not a
 * coefficient override. It remains serialized through `modified`, but does not need a narrative
 * justification. Changes to factors or reinforcement classification still require one.
 */
export const designBasisRequiresOverrideReason = (basis: DesignBasis): boolean => {
  if (!basis.modified) return false
  /** A user-defined profile has no code default to deviate from; every value is already the user's. */
  if (basis.profileId === 'custom-user-defined') return false
  const defaults =
    basis.profileId === 'aci-318-19-22'
      ? createAci318DesignBasis()
      : basis.profileId === 'en-1992-1-1-2004-default'
        ? createEn1992DesignBasis()
        : createKdsBasicDesignBasis()

  if (basis.format !== defaults.format) return true
  if (basis.format === 'globalResultantFactor' && defaults.format === 'globalResultantFactor') {
    return (
      basis.transverseReinforcement !== defaults.transverseReinforcement ||
      !sameNumbers(basis.factors, defaults.factors) ||
      JSON.stringify(basis.transition) !== JSON.stringify(defaults.transition)
    )
  }
  return (
    basis.format === 'designMaterialReevaluation' &&
    defaults.format === 'designMaterialReevaluation' &&
    !sameNumbers(basis.factors, defaults.factors)
  )
}

export const designBasisIssues = (basis: DesignBasis): string[] => {
  const issues: string[] = []
  if (basis.basisVersion !== DESIGN_BASIS_VERSION) issues.push('Unsupported design-basis version.')
  if (designBasisRequiresOverrideReason(basis) && basis.overrideReason.trim().length === 0) {
    issues.push('A reason is required for a modified resistance profile.')
  }
  if (basis.format === 'globalResultantFactor') {
    const entries = Object.entries(basis.factors) as Array<[keyof GlobalStrengthReductionFactors, number]>
    for (const [key, value] of entries) {
      const valid = finiteBetween(value, 0.1, 1)
      if (!valid) issues.push(`${key} is outside the supported range.`)
    }
    if (basis.transition.type === 'yield-plus-strain') {
      if (!finiteBetween(basis.transition.extraStrain, 1e-6, 0.02)) {
        issues.push('transition.extraStrain is outside the supported range.')
      }
    } else {
      if (!finiteBetween(basis.transition.yieldStressThreshold, 100, 1000)) {
        issues.push('transition.yieldStressThreshold is outside the supported range.')
      }
      if (!finiteBetween(basis.transition.fixedStrainLimit, 1e-4, 0.05)) {
        issues.push('transition.fixedStrainLimit is outside the supported range.')
      }
      if (!finiteBetween(basis.transition.highStrengthYieldMultiple, 1, 10)) {
        issues.push('transition.highStrengthYieldMultiple is outside the supported range.')
      }
    }
    if (basis.factors.phiTension < basis.factors.phiCompressionOther) {
      issues.push('Tension-controlled phi must not be below compression-controlled phi.')
    }
  } else {
    if (!finiteBetween(basis.factors.alphaCc, 0.1, 1.5)) issues.push('alphaCc is outside the supported range.')
    if (!finiteBetween(basis.factors.gammaC, 1, 3)) issues.push('gammaC is outside the supported range.')
    if (!finiteBetween(basis.factors.gammaS, 1, 3)) issues.push('gammaS is outside the supported range.')
  }
  return issues
}

export const assertValidDesignBasis = (basis: DesignBasis) => {
  const issues = designBasisIssues(basis)
  if (issues.length > 0) throw new Error(issues.join(' '))
}

export const designBasisLabel = (basis: DesignBasis) =>
  `${basis.identity.document} — ${basis.format === 'globalResultantFactor' ? 'Global strength reduction' : 'Design material strengths'}`

export const designBasisHash = (basis: DesignBasis) => JSON.stringify(basis)
