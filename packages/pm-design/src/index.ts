import type { MaterialStandard, MaterialStore } from '@pm/materials'
import { AS_3600_2018_PROVENANCE } from '@pm/code-as3600'
import { EN1992_2004_PROVENANCE } from '@pm/code-en1992'

export const DESIGN_BASIS_VERSION = 3 as const

export type ResistanceFormat = 'globalResultantFactor' | 'designMaterialReevaluation'
export type DesignProfileId =
  | 'kds-2024-current-set'
  | 'kds-142020-2022-appendix-material-factors'
  /** Legacy identifier retained so previously saved project files remain readable. */
  | 'kds-basic-2021-2022'
  | 'aci-318-19-22'
  | 'en-1992-1-1-2004-default'
  | 'as-3600-2018-amd2'
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

export type MaterialFactorOperation = 'multiply' | 'divide'

export type MaterialFactorComponent = {
  /** Stable semantic key used by editors and migrations, never a display label. */
  id: 'alphaCc' | 'gammaC' | 'gammaS' | 'phiC' | 'phiS'
  symbol: string
  label: string
  operation: MaterialFactorOperation
  value: number
  clauseRef: string
}

export type MaterialFactorExpression = {
  characteristicSymbol: 'fck' | 'fyk'
  designSymbol: 'fcd' | 'fyd'
  components: MaterialFactorComponent[]
}

/**
 * A standard-neutral recipe for compiling characteristic material definitions into design laws.
 * KDS Appendix and EN 1992 differ only in the declared factor components and clause provenance.
 */
export type DesignMaterialFactors = {
  concrete: MaterialFactorExpression
  reinforcement: MaterialFactorExpression
}

type DesignBasisCommon = {
  basisVersion: typeof DESIGN_BASIS_VERSION
  identity: DesignProfileIdentity
  profileId: DesignProfileId
  verificationStatus: ProfileVerificationStatus
  modified: boolean
  /** True when a user-selected material model replaces the profile's code-default model. */
  materialModelModified?: boolean
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
  /**
   * Uniform pure compression and the all-compression pivot use the concrete peak-stress strain
   * when the selected code declares one (KDS Appendix eps_c0; EN 1992 eps_c2). An internal neutral
   * axis still reaches the concrete ultimate strain eps_cu.
   */
  compressionEndpoint: 'ultimate-strain' | 'peak-stress-strain'
  minimumEccentricity?: {
    constantMm: number
    depthFactor: number
    clauseRef: string
  }
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
      EN1992_2004_PROVENANCE.document,
      '2004',
      'en-1992-design-material-reevaluation'
    ),
    jurisdiction: 'Default recommended values',
    nationalAnnex: 'None selected'
  },
  verificationStatus: 'draft',
  format: 'designMaterialReevaluation',
  factors: {
    concrete: {
      characteristicSymbol: 'fck',
      designSymbol: 'fcd',
      components: [
        {
          id: 'alphaCc',
          symbol: 'αcc',
          label: 'Concrete design-strength coefficient',
          operation: 'multiply',
          value: 1,
          clauseRef: 'EN 1992-1-1:2004, 3.1.6(1)P'
        },
        {
          id: 'gammaC',
          symbol: 'γC',
          label: 'Concrete material partial factor',
          operation: 'divide',
          value: 1.5,
          clauseRef: 'EN 1992-1-1:2004, 2.4.2.4 and selected National Annex'
        }
      ]
    },
    reinforcement: {
      characteristicSymbol: 'fyk',
      designSymbol: 'fyd',
      components: [{
        id: 'gammaS',
        symbol: 'γS',
        label: 'Reinforcement material partial factor',
        operation: 'divide',
        value: 1.15,
        clauseRef: 'EN 1992-1-1:2004, 2.4.2.4 and selected National Annex'
      }]
    }
  },
  // EN 1992 Figure 6.1, domain 5: pure compression reaches eps_c2 and the compatible strain plane
  // rotates about point C until the extreme fibre reaches eps_cu2 at c/h = 1.
  compressionEndpoint: 'peak-stress-strain',
  modified: false,
  overrideReason: ''
})

export const createKdsAppendixDesignBasis = (): DesignMaterialBasis => ({
  basisVersion: DESIGN_BASIS_VERSION,
  profileId: 'kds-142020-2022-appendix-material-factors',
  identity: identity(
    'MOLIT/KDS',
    'KDS 14 20 20:2022 Appendix — Separate design using material factors',
    '2022',
    'kds-142020-2022-appendix-design-material-reevaluation'
  ),
  verificationStatus: 'draft',
  format: 'designMaterialReevaluation',
  factors: {
    concrete: {
      characteristicSymbol: 'fck',
      designSymbol: 'fcd',
      components: [{
        id: 'phiC',
        symbol: 'φc',
        label: 'Concrete material coefficient',
        operation: 'multiply',
        value: 0.65,
        clauseRef: 'KDS 14 20 20:2022 Appendix, 2.2(1)①'
      }]
    },
    reinforcement: {
      characteristicSymbol: 'fyk',
      designSymbol: 'fyd',
      components: [{
        id: 'phiS',
        symbol: 'φs',
        label: 'Reinforcement and prestressing-steel material coefficient',
        operation: 'multiply',
        value: 0.90,
        clauseRef: 'KDS 14 20 20:2022 Appendix, 2.2(1)②'
      }]
    }
  },
  compressionEndpoint: 'peak-stress-strain',
  minimumEccentricity: {
    constantMm: 15,
    depthFactor: 0.03,
    clauseRef: 'KDS 14 20 20:2022 Appendix, 3.2, equations (3-4) and (3-5)'
  },
  modified: false,
  overrideReason: ''
})

/**
 * AS 3600 Table 2.2.2 preview mapping.
 *
 * The shared global-factor shape retains persistence compatibility. For this profile only,
 * `phiCompressionOther` is phi_o for an ordinary column and `phiCompressionSpiral` stores the
 * alternative phi_o for a short column with Q/G >= 0.25. The AS adapter owns the actual
 * bending/axial interpolation and does not use the generic strain-transition evaluator.
 */
export const createAs3600DesignBasis = (): GlobalStrengthReductionBasis => ({
  basisVersion: DESIGN_BASIS_VERSION,
  profileId: 'as-3600-2018-amd2',
  identity: {
    ...identity(
      'Standards Australia',
      AS_3600_2018_PROVENANCE.document,
      '2018 incorporating Amendments 1 and 2',
      AS_3600_2018_PROVENANCE.methodId
    ),
    jurisdiction: 'Australia',
    amendment: 'Amendments 1 and 2'
  },
  verificationStatus: 'draft',
  format: 'globalResultantFactor',
  transverseReinforcement: 'other',
  factors: {
    phiCompressionOther: 0.6,
    phiCompressionSpiral: 0.65,
    phiTension: 0.85,
    axialCapOther: 1,
    axialCapSpiral: 1
  },
  /** Retained by the generic schema; the AS adapter evaluates Table 2.2.2 directly. */
  transition: { type: 'yield-plus-strain', extraStrain: 0.003 },
  axialCapEnabled: false,
  modified: false,
  overrideReason: ''
})

export const createDefaultDesignBasisForStandard = (standard: MaterialStandard): DesignBasis => {
  if (standard === 'ACI318') return createAci318DesignBasis()
  if (standard === 'EC2') return createEn1992DesignBasis()
  if (standard === 'AS3600') return createAs3600DesignBasis()
  if (standard === 'CUSTOM') return createCustomDesignBasis()
  return createKdsBasicDesignBasis()
}

export const createDefaultDesignBasis = (materials?: MaterialStore): DesignBasis =>
  createDefaultDesignBasisForStandard(materials?.concrete.standard ?? 'KDS')

export const cloneDesignBasis = <T extends DesignBasis>(basis: T): T =>
  JSON.parse(JSON.stringify(basis)) as T

const cloneMaterials = (materials: MaterialStore): MaterialStore =>
  JSON.parse(JSON.stringify(materials)) as MaterialStore

const withoutResistanceFactors = (materials: MaterialStore): MaterialStore => {
  const reference = cloneMaterials(materials)
  /**
   * Older EN project files stored the design alpha in the model and the characteristic alpha in
   * factors.alpha. Recover the characteristic law while migrating them into the two-pass model.
   */
  const referenceAlpha = reference.concrete.factors?.gammaC !== undefined
    ? reference.concrete.factors?.alpha
    : undefined
  reference.concrete.factors = {
    ...reference.concrete.factors,
    ...(referenceAlpha === undefined ? {} : { alpha: referenceAlpha }),
    gammaC: undefined,
    resistanceScale: undefined
  }
  if (referenceAlpha !== undefined && 'alpha' in reference.concrete.stressStrain) {
    reference.concrete.stressStrain.alpha = referenceAlpha
  }
  reference.steel = reference.steel.map((steel) => ({
    ...steel,
    factors: { ...steel.factors, gammaS: undefined, resistanceScale: undefined },
    limits: {
      ...steel.limits,
      epsY: steel.fy / steel.elasticModulus
    }
  }))
  return reference
}

export const resolveMaterialFactorExpression = (expression: MaterialFactorExpression): number =>
  expression.components.reduce(
    (value, component) => component.operation === 'multiply'
      ? value * component.value
      : value / component.value,
    1
  )

export const materialFactorComponent = (
  basis: DesignMaterialBasis,
  id: MaterialFactorComponent['id']
): MaterialFactorComponent | undefined => [
  ...basis.factors.concrete.components,
  ...basis.factors.reinforcement.components
].find((component) => component.id === id)

export const setMaterialFactorComponentValue = (
  basis: DesignMaterialBasis,
  id: MaterialFactorComponent['id'],
  value: number
): DesignMaterialBasis => {
  const next = cloneDesignBasis(basis)
  for (const expression of [next.factors.concrete, next.factors.reinforcement]) {
    const component = expression.components.find((candidate) => candidate.id === id)
    if (component) component.value = value
  }
  return next
}

export type ResistanceMaterialSets = {
  /** Material set whose events govern the Design surface strain-state schedule. */
  stateMaterials: MaterialStore
  referenceMaterials: MaterialStore
  designMaterials: MaterialStore
  concreteDesignMultiplier: number
  reinforcementDesignMultiplier: number
}

export const buildResistanceMaterialSets = (
  materials: MaterialStore,
  basis: DesignBasis
): ResistanceMaterialSets => {
  const referenceMaterials = withoutResistanceFactors(materials)
  if (basis.format === 'globalResultantFactor') {
    return {
      stateMaterials: referenceMaterials,
      referenceMaterials,
      designMaterials: referenceMaterials,
      concreteDesignMultiplier: 1,
      reinforcementDesignMultiplier: 1
    }
  }

  const concreteDesignMultiplier = resolveMaterialFactorExpression(basis.factors.concrete)
  const reinforcementDesignMultiplier = resolveMaterialFactorExpression(basis.factors.reinforcement)
  const designMaterials = cloneMaterials(referenceMaterials)
  designMaterials.concrete.factors = {
    ...designMaterials.concrete.factors,
    gammaC: undefined,
    resistanceScale: concreteDesignMultiplier
  }
  designMaterials.steel = designMaterials.steel.map((steel) => ({
    ...steel,
    factors: {
      ...steel.factors,
      gammaS: undefined,
      resistanceScale: reinforcementDesignMultiplier
    },
    limits: {
      ...steel.limits,
      epsY: steel.fy * reinforcementDesignMultiplier / steel.elasticModulus
    }
  }))
  return {
    stateMaterials: designMaterials,
    referenceMaterials,
    designMaterials,
    concreteDesignMultiplier,
    reinforcementDesignMultiplier
  }
}

export type MinimumEccentricityCandidate = {
  Mx: number
  My: number
  eccentricityMm: number
}

/**
 * KDS 14 20 20:2022 Appendix 3.2(2) with equations (3-4) and (3-5) is a factored-demand rule, not a
 * horizontal capacity cap. This resolves the candidate demands a caller must check; returning an
 * empty list means the raw demand already satisfies the clause and must be checked unchanged.
 *
 * `projectedDepth(nx, ny)` returns the outer-boundary extent of the section along `(nx, ny)`.
 *
 * A single candidate is returned when the demand already has a moment direction: the clause sets a
 * floor on that direction, so the moment is scaled up along it. With no moment at all the clause
 * gives no direction, so both principal axes are offered and the caller retains the governing one.
 */
export const minimumEccentricityCandidates = (
  basis: DesignBasis,
  demand: { P: number; Mx: number; My: number },
  projectedDepth: (nx: number, ny: number) => number
): MinimumEccentricityCandidate[] => {
  const rule = basis.format === 'designMaterialReevaluation' ? basis.minimumEccentricity : undefined
  if (!rule || !(demand.P > 0)) return []
  const eccentricity = (nx: number, ny: number) =>
    rule.constantMm + rule.depthFactor * projectedDepth(nx, ny)

  const moment = Math.hypot(demand.Mx, demand.My)
  if (moment > 1e-12) {
    /**
     * `Mx` is the moment about the section x-axis and therefore pairs with the y-eccentricity, so
     * the demand eccentricity direction is `(My, Mx)/|M|` in this codebase's sign convention.
     */
    const limit = demand.P * eccentricity(demand.My / moment, demand.Mx / moment)
    if (moment >= limit) return []
    const scale = limit / moment
    return [{
      Mx: demand.Mx * scale,
      My: demand.My * scale,
      eccentricityMm: limit / demand.P
    }]
  }

  const aboutX = eccentricity(0, 1)
  const aboutY = eccentricity(1, 0)
  return [
    { Mx: demand.P * aboutX, My: 0, eccentricityMm: aboutX },
    { Mx: 0, My: demand.P * aboutY, eccentricityMm: aboutY }
  ]
}

export const minimumEccentricityMessage = (eccentricityMm: number) =>
  `KDS Appendix minimum eccentricity e_min = ${eccentricityMm.toFixed(3)} mm governs the checked moment.`

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
 * coefficient override. The transverse-reinforcement classification is likewise a section-design
 * choice, not a modified coefficient. Both remain serialized through `modified`, but neither needs
 * a narrative justification; changes to resistance factors or transition rules still do.
 */
export const designBasisRequiresOverrideReason = (basis: DesignBasis): boolean => {
  if (!basis.modified) return false
  /** A user-defined profile has no code default to deviate from; every value is already the user's. */
  if (basis.profileId === 'custom-user-defined') return false
  if (basis.materialModelModified) return true
  const defaults =
    basis.profileId === 'aci-318-19-22'
      ? createAci318DesignBasis()
      : basis.profileId === 'kds-142020-2022-appendix-material-factors'
        ? createKdsAppendixDesignBasis()
      : basis.profileId === 'en-1992-1-1-2004-default'
        ? createEn1992DesignBasis()
        : basis.profileId === 'as-3600-2018-amd2'
          ? createAs3600DesignBasis()
        : createKdsBasicDesignBasis()

  if (basis.format !== defaults.format) return true
  if (basis.format === 'globalResultantFactor' && defaults.format === 'globalResultantFactor') {
    return (
      !sameNumbers(basis.factors, defaults.factors) ||
      JSON.stringify(basis.transition) !== JSON.stringify(defaults.transition)
    )
  }
  return (
    basis.format === 'designMaterialReevaluation' &&
    defaults.format === 'designMaterialReevaluation' &&
    (
      JSON.stringify(basis.factors) !== JSON.stringify(defaults.factors) ||
      basis.compressionEndpoint !== defaults.compressionEndpoint ||
      JSON.stringify(basis.minimumEccentricity) !== JSON.stringify(defaults.minimumEccentricity)
    )
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
    for (const [family, expression] of [
      ['concrete', basis.factors.concrete],
      ['reinforcement', basis.factors.reinforcement]
    ] as const) {
      if (expression.components.length === 0) issues.push(`${family} material-factor expression is empty.`)
      for (const component of expression.components) {
        if (!finiteBetween(component.value, 0.1, 3)) {
          issues.push(`${component.id} is outside the supported range.`)
        }
      }
      const multiplier = resolveMaterialFactorExpression(expression)
      if (!finiteBetween(multiplier, 0.1, 1.5)) {
        issues.push(`${family} resolved design-strength multiplier is outside the supported range.`)
      }
    }
    if (
      basis.compressionEndpoint !== 'ultimate-strain' &&
      basis.compressionEndpoint !== 'peak-stress-strain'
    ) {
      issues.push('compressionEndpoint is unsupported.')
    }
    if (basis.minimumEccentricity) {
      if (!finiteBetween(basis.minimumEccentricity.constantMm, 0, 100)) {
        issues.push('minimumEccentricity.constantMm is outside the supported range.')
      }
      if (!finiteBetween(basis.minimumEccentricity.depthFactor, 0, 1)) {
        issues.push('minimumEccentricity.depthFactor is outside the supported range.')
      }
    }
  }
  return issues
}

export const assertValidDesignBasis = (basis: DesignBasis) => {
  const issues = designBasisIssues(basis)
  if (issues.length > 0) throw new Error(issues.join(' '))
}

export type DesignMaterialApplicabilityIssue = {
  path: string
  message: string
  reference: string
}

/**
 * Material limits that belong to the selected design standard rather than to constitutive-law
 * physics. Keeping this separate from `@pm/materials` lets custom calculations use broader,
 * explicitly user-owned definitions without presenting them as KDS-compliant.
 */
export const designMaterialApplicabilityIssues = (
  materials: MaterialStore,
  basis: DesignBasis
): DesignMaterialApplicabilityIssue[] => {
  if (!basis.profileId.startsWith('kds-')) return []
  const issues: DesignMaterialApplicabilityIssue[] = []
  materials.steel.forEach((steel, index) => {
    if (steel.fy > 600) {
      issues.push({
        path: `materials.steel[${index}].fy`,
        message: `KDS non-prestressing reinforcement yield strength must not exceed 600 MPa (received ${steel.fy} MPa).`,
        reference: 'KDS 14 20 20:2022, 4.1.1'
      })
    }
  })
  if (materials.concrete.fck > 90) {
    const documentedUserModel =
      materials.concrete.stressStrain.type === 'user-curve' &&
      basis.materialModelModified === true &&
      basis.modified === true &&
      basis.overrideReason.trim().length > 0
    if (!documentedUserModel) {
      issues.push({
        path: 'materials.concrete.fck',
        message: `KDS table parameters stop at fck = 90 MPa (received ${materials.concrete.fck} MPa). A documented user-defined stress-strain model and modified-design basis are required above this limit.`,
        reference: 'KDS 14 20 20:2022, 4.1.1(8), Table 4.1-2'
      })
    }
  }
  return issues
}

export const assertDesignMaterialApplicability = (materials: MaterialStore, basis: DesignBasis) => {
  const issues = designMaterialApplicabilityIssues(materials, basis)
  if (issues.length > 0) {
    throw new Error(issues.map((issue) => `${issue.path}: ${issue.message} [${issue.reference}]`).join(' '))
  }
}

export const designBasisLabel = (basis: DesignBasis) =>
  `${basis.identity.document} — ${basis.format === 'globalResultantFactor' ? 'Global strength reduction' : 'Design material strengths'}`

export const designBasisHash = (basis: DesignBasis) => JSON.stringify(basis)

export type DesignProfileReference = {
  document: string
  clause: string
  subject: string
  url?: string
}

export type DesignProfileGuidance = {
  title: string
  summary: string
  referenceCurve: string
  designCurve: string
  doNotCombine: string
  references: DesignProfileReference[]
}

const KDS_142010_KCSC_URL = 'https://www.kcsc.re.kr/standardCode/viewer/KDS%2014%2020%2010:2022-01-11'
const KDS_142020_KCSC_URL = 'https://www.kcsc.re.kr/standardCode/viewer/KDS%2014%2020%2020:2022-01-11'
const JRC_EC2_URL = 'https://eurocodes.jrc.ec.europa.eu/EN-Eurocodes/eurocode-2-design-concrete-structures'

export const designProfileGuidance = (profileId: DesignProfileId): DesignProfileGuidance => {
  if (profileId === 'kds-142020-2022-appendix-material-factors') {
    return {
      title: 'Material Factor — KDS 14 20 20 Appendix',
      summary:
        'An alternative section-strength method. Concrete and reinforcement laws are reevaluated with phi_c = 0.65 and phi_s = 0.90 at each compatible strain state.',
      referenceCurve:
        'Reference uses the same Appendix strain domain with material coefficients set to 1.0. It is an audit curve, not the KDS Main-method nominal curve.',
      designCurve:
        'Design uses reduced material strengths from the beginning. Per Appendix 3.1: pure compression reaches eps_c0, an internal neutral axis uses eps_cu, and the all-compression domain transitions continuously between those limits; minimum eccentricity is a demand verification rule.',
      doNotCombine:
        'Do not additionally apply the KDS Main global phi or its 0.80/0.85 maximum axial-compression cap. Appendix 2.2(2) is a localized pretensioned-member transfer/development-length modifier, not a general RC P-M factor.',
      references: [
        { document: 'KDS 14 20 20:2022 Appendix', clause: '1.1', subject: 'Scope and status as an alternative method', url: KDS_142020_KCSC_URL },
        { document: 'KDS 14 20 20:2022 Appendix', clause: '2.1 and 2.2(1)', subject: 'Design-strength assumptions and material coefficients', url: KDS_142020_KCSC_URL },
        { document: 'KDS 14 20 20:2022 Appendix', clause: '2.2(2)', subject: 'Separate strength modifier for pretensioned members with insufficient tendon development; outside this reinforced-concrete section scope', url: KDS_142020_KCSC_URL },
        { document: 'KDS 14 20 20:2022 Appendix', clause: '3.1', subject: 'Strain and neutral-axis limits', url: KDS_142020_KCSC_URL },
        { document: 'KDS 14 20 20:2022 Appendix', clause: '3.2, equations (3-4)–(3-5)', subject: 'Design axial strength and minimum factored moment/eccentricity', url: KDS_142020_KCSC_URL }
      ]
    }
  }
  if (profileId === 'en-1992-1-1-2004-default') {
    return {
      title: 'EN 1992 design-material method',
      summary:
        'Characteristic material laws are reevaluated with fcd = alpha_cc fck / gamma_C and fyd = fyk / gamma_S. Recommended values are used until a National Annex is selected.',
      referenceCurve:
        'Reference uses characteristic strengths and is supplied for audit and comparison; EC2 design verification is based on the Design curve.',
      designCurve:
        'Design preserves elastic modulus and characteristic-strength-dependent strain parameters while replacing the concrete and steel strength ordinates.',
      doNotCombine:
        'Do not add an ACI/KDS-style global strength-reduction factor unless an explicitly selected EN edition or National Annex requires another stage.',
      references: [
        { document: 'EN 1992-1-1:2004', clause: '2.4.2.4', subject: 'Partial factors for materials', url: JRC_EC2_URL },
        { document: 'EN 1992-1-1:2004', clause: '3.1.6–3.1.7 and Table 3.1', subject: 'Concrete design strength and stress-strain laws', url: JRC_EC2_URL },
        { document: 'EN 1992-1-1:2004', clause: '3.2.7–3.2.8', subject: 'Reinforcement design stress-strain laws', url: JRC_EC2_URL }
      ]
    }
  }
  if (profileId === 'kds-2024-current-set' || profileId === 'kds-basic-2021-2022') {
    return {
      title: 'Strength Reduction Factor — KDS 14 20 10 / 20',
      summary:
        'The section is first evaluated with nominal material laws. A strain-state-dependent global phi is then applied to the complete P-M resultant.',
      referenceCurve: 'Nominal is the unfactored section-strength curve from the selected KDS material model.',
      designCurve:
        'Design applies the KDS compression/transition/tension phi and then the applicable 0.80 or 0.85 maximum axial-compression limit.',
      doNotCombine: 'Do not also reduce concrete by 0.65 and reinforcement by 0.90; those belong to the separate Appendix method.',
      references: [
        { document: 'KDS 14 20 10:2021', clause: '4.2.3', subject: 'Design strength and strength-reduction factors', url: KDS_142010_KCSC_URL },
        { document: 'KDS 14 20 20:2022', clause: '4.1.1–4.1.2', subject: 'Section-strength assumptions and maximum axial strength', url: KDS_142020_KCSC_URL }
      ]
    }
  }
  return {
    title: 'Resistance profile information',
    summary: 'The selected profile defines how reference section strength becomes design resistance.',
    referenceCurve: 'Reference is evaluated before resistance treatment.',
    designCurve: 'Design includes every resistance stage declared by the selected profile.',
    doNotCombine: 'Only stages declared by the selected profile are applied.',
    references: [{ document: 'Selected design standard', clause: 'See profile identity', subject: 'Resistance provisions' }]
  }
}
