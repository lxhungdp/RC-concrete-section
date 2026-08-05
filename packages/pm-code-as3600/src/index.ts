import {
  EquivalentBlockInputError,
  bindEquivalentBlockForwardEvaluator,
  buildCapacitySurface,
  createElasticPerfectlyPlasticSteelLaw,
  evaluateUniformSectionState,
  projectedOuterExtents,
  uniformSteelEndpointStrain,
  type BlockSectionState,
  type BuildCapacitySurfaceOptions,
  type CapacityEndpoint,
  type CapacityEvaluator,
  type CapacityResultants,
  type CapacitySurface,
  type EquivalentBlockLaw,
  type NominalBlockEvaluation,
  type PreparedEquivalentBlockSection,
  type SteelLawRegistry
} from '@pm/equivalent-block'

export const AS_3600_2018_PROVENANCE = {
  document: 'AS 3600:2018 incorporating Amendments 1 and 2',
  concrete: 'Clause 8.1.3 equivalent rectangular stress block',
  resistance: 'Table 2.2.2 capacity reduction factors',
  methodId: 'as-3600-2018-amd2-equivalent-rectangular-block',
  implementationVersion: '1.0.0-preview',
  verificationStatus: 'draft-unverified'
} as const

export const AS3600_STEEL_ES = 200000
export const AS3600_EPS_CU = 0.003

const positiveFinite = (value: number) => Number.isFinite(value) && value > 0
const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value))

const assertConcreteStrength = (concreteStrength: number) => {
  if (!positiveFinite(concreteStrength) || concreteStrength > 100) {
    throw new EquivalentBlockInputError(
      'INVALID_BLOCK_LAW',
      "AS 3600 preview supports finite concrete strength 0 < f'c <= 100 MPa."
    )
  }
}

/** AS 3600:2018 rectangular-block stress factor for a general prismatic section. */
export const as3600Alpha2 = (concreteStrength: number) => {
  assertConcreteStrength(concreteStrength)
  return Math.max(0.67, 0.85 - 0.0015 * concreteStrength)
}

/** AS 3600:2018 rectangular-block depth factor. */
export const as3600Gamma = (concreteStrength: number) => {
  assertConcreteStrength(concreteStrength)
  return Math.max(0.67, 0.97 - 0.0025 * concreteStrength)
}

export type As3600SteelDefinition = {
  elasticModulus: number
  yieldStress: number
  ultimateStrain?: number
}

export type As3600CompressionPhiClass = 'ordinary' | 'short-column-high-permanent-load'

export type As3600ResistanceFactors = {
  phiCompressionOrdinary: number
  phiCompressionShortColumnHighPermanentLoad: number
  phiBendingMinimum: number
  phiBendingMaximum: number
  phiTension: number
}

export type CreateAs3600ModelInput = {
  concreteStrength: number
  steel: Readonly<Record<string, As3600SteelDefinition>>
  compressionPhiClass: As3600CompressionPhiClass
  resistanceFactors?: As3600ResistanceFactors
  /** 1.0 for a general prismatic section; 0.95 circular; 0.90 narrowing toward compression face. */
  stressBlockShapeFactor?: 1 | 0.95 | 0.9
}

export type As3600ResistanceClassification =
  | 'axial-compression-controlled'
  | 'combined-compression'
  | 'bending'
  | 'combined-tension'

export type As3600StrengthReduction = {
  phi: number
  classification: As3600ResistanceClassification
  neutralAxisRatio: number
  nominalAxial: number
  balancedAxial: number
  pureTensionAxial: number
}

export type As3600DesignEvaluationSource = {
  nominal: NominalBlockEvaluation
  resistance: As3600StrengthReduction
}

type As3600SurfaceOptions = Omit<
  BuildCapacitySurfaceOptions,
  'extremeCompressionStrain' | 'tensionPole' | 'compressionPole'
>

const defaultResistanceFactors: As3600ResistanceFactors = {
  phiCompressionOrdinary: 0.6,
  phiCompressionShortColumnHighPermanentLoad: 0.65,
  phiBendingMinimum: 0.65,
  phiBendingMaximum: 0.85,
  phiTension: 0.85
}

export const as3600BendingPhi = (
  neutralAxisRatio: number,
  factors: Pick<As3600ResistanceFactors, 'phiBendingMinimum' | 'phiBendingMaximum'> = defaultResistanceFactors
) => {
  if (!Number.isFinite(neutralAxisRatio) || neutralAxisRatio < 0) {
    throw new EquivalentBlockInputError('INVALID_STATE', 'AS 3600 k_uo must be finite and nonnegative.')
  }
  return clamp(
    1.24 - 13 * neutralAxisRatio / 12,
    factors.phiBendingMinimum,
    factors.phiBendingMaximum
  )
}

export const evaluateAs3600StrengthReduction = (input: {
  nominalAxial: number
  balancedAxial: number
  pureTensionAxial: number
  neutralAxisRatio: number
  compressionPhi: number
  factors?: As3600ResistanceFactors
}): As3600StrengthReduction => {
  const factors = input.factors ?? defaultResistanceFactors
  const values = [
    input.nominalAxial,
    input.balancedAxial,
    input.pureTensionAxial,
    input.neutralAxisRatio,
    input.compressionPhi,
    ...Object.values(factors)
  ]
  if (values.some((value) => !Number.isFinite(value))) {
    throw new EquivalentBlockInputError('INVALID_STATE', 'AS 3600 phi evaluation requires finite inputs.')
  }
  if (!(input.balancedAxial > 0) || !(input.pureTensionAxial < 0)) {
    throw new EquivalentBlockInputError(
      'INVALID_STATE',
      'AS 3600 phi evaluation requires a positive balanced axial force and a negative pure-tension force.'
    )
  }
  const bendingPhi = as3600BendingPhi(input.neutralAxisRatio, factors)
  if (input.nominalAxial >= input.balancedAxial) {
    return {
      phi: input.compressionPhi,
      classification: 'axial-compression-controlled',
      neutralAxisRatio: input.neutralAxisRatio,
      nominalAxial: input.nominalAxial,
      balancedAxial: input.balancedAxial,
      pureTensionAxial: input.pureTensionAxial
    }
  }
  if (input.nominalAxial > 0) {
    const ratio = input.nominalAxial / input.balancedAxial
    return {
      phi: input.compressionPhi + (bendingPhi - input.compressionPhi) * (1 - ratio),
      classification: 'combined-compression',
      neutralAxisRatio: input.neutralAxisRatio,
      nominalAxial: input.nominalAxial,
      balancedAxial: input.balancedAxial,
      pureTensionAxial: input.pureTensionAxial
    }
  }
  if (input.nominalAxial < 0) {
    const tensionRatio = clamp(input.nominalAxial / input.pureTensionAxial, 0, 1)
    return {
      phi: bendingPhi + (factors.phiTension - bendingPhi) * tensionRatio,
      classification: 'combined-tension',
      neutralAxisRatio: input.neutralAxisRatio,
      nominalAxial: input.nominalAxial,
      balancedAxial: input.balancedAxial,
      pureTensionAxial: input.pureTensionAxial
    }
  }
  return {
    phi: bendingPhi,
    classification: 'bending',
    neutralAxisRatio: input.neutralAxisRatio,
    nominalAxial: input.nominalAxial,
    balancedAxial: input.balancedAxial,
    pureTensionAxial: input.pureTensionAxial
  }
}

const scaleResultants = (resultants: CapacityResultants, factor: number): CapacityResultants => ({
  P: factor * resultants.P,
  Mx: factor * resultants.Mx,
  My: factor * resultants.My
})

const validateFactors = (factors: As3600ResistanceFactors) => {
  if (Object.values(factors).some((value) => !positiveFinite(value) || value > 1)) {
    throw new EquivalentBlockInputError('INVALID_BLOCK_LAW', 'AS 3600 phi factors must be in (0, 1].')
  }
  if (factors.phiBendingMinimum > factors.phiBendingMaximum) {
    throw new EquivalentBlockInputError('INVALID_BLOCK_LAW', 'AS 3600 bending phi bounds are reversed.')
  }
}

const validateSteel = (steel: Readonly<Record<string, As3600SteelDefinition>>) => {
  if (Object.keys(steel).length === 0) {
    throw new EquivalentBlockInputError('INVALID_BLOCK_LAW', 'At least one AS 3600 steel definition is required.')
  }
  for (const [id, definition] of Object.entries(steel)) {
    if (
      id.trim().length === 0 || !positiveFinite(definition.elasticModulus) ||
      !positiveFinite(definition.yieldStress) ||
      (definition.ultimateStrain !== undefined && !positiveFinite(definition.ultimateStrain))
    ) {
      throw new EquivalentBlockInputError('INVALID_BLOCK_LAW', `AS 3600 steel ${id} requires positive Es and fsy.`)
    }
  }
}

export const createAs3600Model = (input: CreateAs3600ModelInput) => {
  assertConcreteStrength(input.concreteStrength)
  validateSteel(input.steel)
  const resistanceFactors = input.resistanceFactors ?? defaultResistanceFactors
  validateFactors(resistanceFactors)
  const shapeFactor = input.stressBlockShapeFactor ?? 1
  const alpha2 = shapeFactor * as3600Alpha2(input.concreteStrength)
  const gamma = as3600Gamma(input.concreteStrength)
  const steelLaws: SteelLawRegistry = Object.fromEntries(Object.entries(input.steel).map(([id, definition]) => [
    id,
    createElasticPerfectlyPlasticSteelLaw(
      definition.elasticModulus,
      definition.yieldStress,
      definition.ultimateStrain
    )
  ]))
  const blockLaw: EquivalentBlockLaw = {
    compressionStress: alpha2 * input.concreteStrength,
    depthFactor: gamma,
    extremeCompressionStrain: AS3600_EPS_CU,
    subtractDisplacedConcrete: true
  }
  const compressionPhi = input.compressionPhiClass === 'short-column-high-permanent-load'
    ? resistanceFactors.phiCompressionShortColumnHighPermanentLoad
    : resistanceFactors.phiCompressionOrdinary
  const barStrainEvents = Object.values(input.steel).flatMap((definition) => [
    definition.yieldStress / definition.elasticModulus,
    ...(definition.ultimateStrain === undefined ? [] : [definition.ultimateStrain])
  ])

  const bindNominalEvaluator = (
    section: PreparedEquivalentBlockSection
  ): CapacityEvaluator<NominalBlockEvaluation> => {
    const evaluate = bindEquivalentBlockForwardEvaluator(section, blockLaw, steelLaws)
    return (state: BlockSectionState) => {
      const nominal = evaluate(state)
      return { state, resultants: nominal.resultants, source: nominal }
    }
  }

  const nominalEndpoints = (section: PreparedEquivalentBlockSection) => {
    const endpointStrain = uniformSteelEndpointStrain(section, steelLaws)
    const tension = evaluateUniformSectionState(section, steelLaws, {
      concreteStress: 0,
      steelStrain: -endpointStrain,
      subtractDisplacedConcrete: false
    })
    const compression = evaluateUniformSectionState(section, steelLaws, {
      concreteStress: blockLaw.compressionStress,
      steelStrain: endpointStrain,
      subtractDisplacedConcrete: true
    })
    return {
      tension: {
        resultants: tension.resultants,
        metadata: { state: 'pure-tension', standard: AS_3600_2018_PROVENANCE.methodId }
      } as CapacityEndpoint,
      compression: {
        resultants: compression.resultants,
        metadata: { state: 'pure-compression', standard: AS_3600_2018_PROVENANCE.methodId }
      } as CapacityEndpoint
    }
  }

  const directionalResistance = (
    section: PreparedEquivalentBlockSection,
    evaluateNominal: ReturnType<typeof bindEquivalentBlockForwardEvaluator>,
    state: BlockSectionState,
    nominal: NominalBlockEvaluation,
    pureTensionAxial: number
  ) => {
    const normalX = Math.cos(state.neutralAxisAngle)
    const normalY = Math.sin(state.neutralAxisAngle)
    const extents = projectedOuterExtents(section, normalX, normalY)
    let outermostDepth = 0
    let outermostYieldStrain = Number.POSITIVE_INFINITY
    for (const bar of section.rebars) {
      const projection = normalX * bar.x + normalY * bar.y
      const depth = extents.maximum - projection
      if (depth > outermostDepth) {
        outermostDepth = depth
        outermostYieldStrain = steelLaws[bar.steelLawId]?.yieldStrain ?? Number.POSITIVE_INFINITY
      }
    }
    if (!(outermostDepth > 0) || !positiveFinite(outermostYieldStrain)) {
      throw new EquivalentBlockInputError(
        'INVALID_REBAR',
        'AS 3600 phi evaluation requires an outermost tension bar with a defined yield strain.'
      )
    }
    const balancedDepth = AS3600_EPS_CU / (AS3600_EPS_CU + outermostYieldStrain) * outermostDepth
    const balanced = evaluateNominal({ ...state, neutralAxisDepth: balancedDepth })
    return evaluateAs3600StrengthReduction({
      nominalAxial: nominal.resultants.P,
      balancedAxial: balanced.resultants.P,
      pureTensionAxial,
      neutralAxisRatio: state.neutralAxisDepth / outermostDepth,
      compressionPhi,
      factors: resistanceFactors
    })
  }

  const bindDesignEvaluator = (
    section: PreparedEquivalentBlockSection
  ): CapacityEvaluator<As3600DesignEvaluationSource> => {
    const evaluate = bindEquivalentBlockForwardEvaluator(section, blockLaw, steelLaws)
    const pureTensionAxial = nominalEndpoints(section).tension.resultants.P
    return (state: BlockSectionState) => {
      const nominal = evaluate(state)
      const resistance = directionalResistance(section, evaluate, state, nominal, pureTensionAxial)
      return {
        state,
        resultants: scaleResultants(nominal.resultants, resistance.phi),
        source: { nominal, resistance },
        metadata: {
          phi: resistance.phi,
          classification: resistance.classification,
          kuO: resistance.neutralAxisRatio,
          balancedAxial: resistance.balancedAxial
        }
      }
    }
  }

  const designEndpoints = (section: PreparedEquivalentBlockSection) => {
    const nominal = nominalEndpoints(section)
    return {
      tension: {
        resultants: scaleResultants(nominal.tension.resultants, resistanceFactors.phiTension),
        metadata: { ...nominal.tension.metadata, phi: resistanceFactors.phiTension }
      } as CapacityEndpoint,
      compression: {
        resultants: scaleResultants(nominal.compression.resultants, compressionPhi),
        metadata: { ...nominal.compression.metadata, phi: compressionPhi }
      } as CapacityEndpoint
    }
  }

  const buildNominalSurface = (
    section: PreparedEquivalentBlockSection,
    options: As3600SurfaceOptions = {}
  ): CapacitySurface => {
    const endpoints = nominalEndpoints(section)
    return buildCapacitySurface(section, bindNominalEvaluator(section), {
      ...options,
      steelLaws,
      barStrainEvents,
      extremeCompressionStrain: blockLaw.extremeCompressionStrain,
      tensionPole: endpoints.tension,
      compressionPole: endpoints.compression
    })
  }

  const buildDesignSurface = (
    section: PreparedEquivalentBlockSection,
    options: As3600SurfaceOptions & { applyAxialCap?: boolean } = {}
  ): CapacitySurface => {
    const { applyAxialCap: _ignored, ...surfaceOptions } = options
    const endpoints = designEndpoints(section)
    return buildCapacitySurface(section, bindDesignEvaluator(section), {
      ...surfaceOptions,
      steelLaws,
      barStrainEvents,
      extremeCompressionStrain: blockLaw.extremeCompressionStrain,
      tensionPole: endpoints.tension,
      compressionPole: endpoints.compression
    })
  }

  return {
    provenance: AS_3600_2018_PROVENANCE,
    alpha2,
    gamma,
    blockLaw,
    steelLaws,
    compressionPhiClass: input.compressionPhiClass,
    resistanceFactors,
    bindNominalEvaluator,
    bindDesignEvaluator,
    nominalEndpoints,
    designEndpoints,
    buildNominalSurface,
    buildDesignSurface
  }
}
