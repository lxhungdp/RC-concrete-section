import {
  EquivalentBlockInputError,
  buildCapacitySurface,
  clipCapacitySurfaceByAxialCap,
  createElasticPerfectlyPlasticSteelLaw,
  evaluateEquivalentBlock,
  evaluateUniformSectionState,
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

export const KDS_142020_PROVENANCE = {
  concrete: 'KDS 14 20 20:2022, 4.1.1(8), Table 4.1-2',
  resistance: 'KDS 14 20 10:2021 strength-reduction provisions and KDS 14 20 20:2022, 4.1.2',
  methodId: 'kds-142020-2022-equivalent-rectangular-block',
  implementationVersion: '1.0.0',
  verificationStatus: 'clause-tested'
} as const

export type KdsTransverseReinforcement = 'other' | 'qualifying-spiral'

export type KdsSteelDefinition = {
  elasticModulus: number
  yieldStress: number
  ultimateStrain?: number
}

export type KdsBlockParameters = {
  concreteStrength: number
  eta: number
  beta1: number
  extremeCompressionStrain: number
  peakCompressionStrain: number
  source: 'table-4.1-2' | 'documented-override'
}

export type KdsBlockParameterOverride = {
  eta: number
  beta1: number
  extremeCompressionStrain: number
  peakCompressionStrain: number
  basis: string
}

export type CreateKds142020ModelInput = {
  concreteStrength: number
  steel: Readonly<Record<string, KdsSteelDefinition>>
  transverseReinforcement: KdsTransverseReinforcement
  blockParameterOverride?: KdsBlockParameterOverride
  resistanceFactors?: {
    phiCompressionOther: number
    phiCompressionSpiral: number
    phiTension: number
    transitionExtraStrain: number
    axialCapOther: number
    axialCapSpiral: number
  }
}

export type KdsResistanceClassification = 'compression-controlled' | 'transition' | 'tension-controlled'

export type KdsStrengthReduction = {
  phi: number
  classification: KdsResistanceClassification
  tensileStrain: number
  yieldStrain: number
  tensionControlledLimit: number
}

export type KdsDesignEvaluationSource = {
  nominal: NominalBlockEvaluation
  resistance: KdsStrengthReduction
}

type KdsSurfaceOptions = Omit<
  BuildCapacitySurfaceOptions,
  'extremeCompressionStrain' | 'tensionPole' | 'compressionPole'
>

const KDS_PARAMETER_TABLE = [
  { strength: 40, peak: 0.0020, ultimate: 0.0033, eta: 1.00, beta1: 0.80 },
  { strength: 50, peak: 0.0021, ultimate: 0.0032, eta: 0.97, beta1: 0.80 },
  { strength: 60, peak: 0.0022, ultimate: 0.0031, eta: 0.95, beta1: 0.76 },
  { strength: 70, peak: 0.0023, ultimate: 0.0030, eta: 0.91, beta1: 0.74 },
  { strength: 80, peak: 0.0024, ultimate: 0.0029, eta: 0.87, beta1: 0.72 },
  { strength: 90, peak: 0.0025, ultimate: 0.0028, eta: 0.84, beta1: 0.70 }
] as const

const positiveFinite = (value: number) => Number.isFinite(value) && value > 0

const interpolate = (left: number, right: number, fraction: number) => left + (right - left) * fraction

export const resolveKds142020BlockParameters = (
  concreteStrength: number,
  override?: KdsBlockParameterOverride
): KdsBlockParameters => {
  if (!positiveFinite(concreteStrength)) {
    throw new EquivalentBlockInputError('INVALID_BLOCK_LAW', 'KDS concrete strength fck must be positive and finite.')
  }
  if (override) {
    if (
      !positiveFinite(override.eta) || !positiveFinite(override.beta1) ||
      !positiveFinite(override.extremeCompressionStrain) || !positiveFinite(override.peakCompressionStrain) ||
      override.peakCompressionStrain > override.extremeCompressionStrain ||
      override.basis.trim().length === 0
    ) {
      throw new EquivalentBlockInputError('INVALID_BLOCK_LAW', 'A KDS block override requires positive parameters and a documented basis.')
    }
    return {
      concreteStrength,
      eta: override.eta,
      beta1: override.beta1,
      extremeCompressionStrain: override.extremeCompressionStrain,
      peakCompressionStrain: override.peakCompressionStrain,
      source: 'documented-override'
    }
  }
  if (concreteStrength > 90) {
    throw new EquivalentBlockInputError(
      'INVALID_BLOCK_LAW',
      'KDS 14 20 20 requires documented experimental/research parameters above fck = 90 MPa.'
    )
  }
  if (concreteStrength <= 40) {
    const first = KDS_PARAMETER_TABLE[0]
    return {
      concreteStrength,
      eta: first.eta,
      beta1: first.beta1,
      extremeCompressionStrain: first.ultimate,
      peakCompressionStrain: first.peak,
      source: 'table-4.1-2'
    }
  }
  const upperIndex = KDS_PARAMETER_TABLE.findIndex((entry) => concreteStrength <= entry.strength)
  const lower = KDS_PARAMETER_TABLE[upperIndex - 1]
  const upper = KDS_PARAMETER_TABLE[upperIndex]
  const fraction = (concreteStrength - lower.strength) / (upper.strength - lower.strength)
  return {
    concreteStrength,
    eta: interpolate(lower.eta, upper.eta, fraction),
    beta1: interpolate(lower.beta1, upper.beta1, fraction),
    extremeCompressionStrain: interpolate(lower.ultimate, upper.ultimate, fraction),
    peakCompressionStrain: interpolate(lower.peak, upper.peak, fraction),
    source: 'table-4.1-2'
  }
}

export const evaluateKds142010StrengthReduction = (
  tensileStrain: number,
  steel: KdsSteelDefinition,
  transverseReinforcement: KdsTransverseReinforcement,
  factors = {
    phiCompressionOther: 0.65,
    phiCompressionSpiral: 0.70,
    phiTension: 0.85,
    transitionExtraStrain: 0.003
  }
): KdsStrengthReduction => {
  if (!Number.isFinite(tensileStrain) || tensileStrain < 0 || !positiveFinite(steel.elasticModulus) || !positiveFinite(steel.yieldStress)) {
    throw new EquivalentBlockInputError('INVALID_BLOCK_LAW', 'KDS phi evaluation requires a nonnegative tensile strain and valid steel properties.')
  }
  const yieldStrain = steel.yieldStress / steel.elasticModulus
  const tensionControlledLimit = steel.yieldStress <= 400 ? yieldStrain + factors.transitionExtraStrain : 2.5 * yieldStrain
  const compressionPhi = transverseReinforcement === 'qualifying-spiral' ? factors.phiCompressionSpiral : factors.phiCompressionOther
  const tensionPhi = factors.phiTension
  if (tensileStrain <= yieldStrain) {
    return { phi: compressionPhi, classification: 'compression-controlled', tensileStrain, yieldStrain, tensionControlledLimit }
  }
  if (tensileStrain >= tensionControlledLimit) {
    return { phi: tensionPhi, classification: 'tension-controlled', tensileStrain, yieldStrain, tensionControlledLimit }
  }
  const fraction = (tensileStrain - yieldStrain) / (tensionControlledLimit - yieldStrain)
  return {
    phi: compressionPhi + (tensionPhi - compressionPhi) * fraction,
    classification: 'transition',
    tensileStrain,
    yieldStrain,
    tensionControlledLimit
  }
}

const scaleResultants = (resultants: CapacityResultants, factor: number): CapacityResultants => ({
  P: factor * resultants.P,
  Mx: factor * resultants.Mx,
  My: factor * resultants.My
})

const validateSteel = (steel: Readonly<Record<string, KdsSteelDefinition>>) => {
  if (Object.keys(steel).length === 0) {
    throw new EquivalentBlockInputError('INVALID_BLOCK_LAW', 'At least one KDS reinforcing-steel definition is required.')
  }
  for (const [id, definition] of Object.entries(steel)) {
    if (
      id.trim().length === 0 || !positiveFinite(definition.elasticModulus) || !positiveFinite(definition.yieldStress) ||
      (definition.ultimateStrain !== undefined && !positiveFinite(definition.ultimateStrain))
    ) {
      throw new EquivalentBlockInputError('INVALID_BLOCK_LAW', `KDS steel ${id} requires positive Es and fy.`)
    }
  }
}

export const createKds142020Model = (input: CreateKds142020ModelInput) => {
  if (input.transverseReinforcement !== 'other' && input.transverseReinforcement !== 'qualifying-spiral') {
    throw new EquivalentBlockInputError('INVALID_BLOCK_LAW', 'KDS transverse reinforcement must be other or qualifying-spiral.')
  }
  validateSteel(input.steel)
  const resistanceFactors = input.resistanceFactors ?? {
    phiCompressionOther: 0.65,
    phiCompressionSpiral: 0.70,
    phiTension: 0.85,
    transitionExtraStrain: 0.003,
    axialCapOther: 0.80,
    axialCapSpiral: 0.85
  }
  if (Object.values(resistanceFactors).some((value) => !positiveFinite(value))) {
    throw new EquivalentBlockInputError('INVALID_BLOCK_LAW', 'KDS resistance factors must be positive and finite.')
  }
  if ([
    resistanceFactors.phiCompressionOther,
    resistanceFactors.phiCompressionSpiral,
    resistanceFactors.phiTension,
    resistanceFactors.axialCapOther,
    resistanceFactors.axialCapSpiral
  ].some((value) => value > 1)) {
    throw new EquivalentBlockInputError('INVALID_BLOCK_LAW', 'KDS phi factors and axial-cap ratios must not exceed 1.0.')
  }
  const parameters = resolveKds142020BlockParameters(input.concreteStrength, input.blockParameterOverride)
  const steelLaws: SteelLawRegistry = Object.fromEntries(Object.entries(input.steel).map(([id, definition]) => [
    id,
    createElasticPerfectlyPlasticSteelLaw(definition.elasticModulus, definition.yieldStress, definition.ultimateStrain)
  ]))
  const blockLaw: EquivalentBlockLaw = {
    compressionStress: parameters.eta * 0.85 * input.concreteStrength,
    depthFactor: parameters.beta1,
    extremeCompressionStrain: parameters.extremeCompressionStrain,
    subtractDisplacedConcrete: true
  }
  const compressionPhi = input.transverseReinforcement === 'qualifying-spiral' ? resistanceFactors.phiCompressionSpiral : resistanceFactors.phiCompressionOther
  const axialCapRatio = input.transverseReinforcement === 'qualifying-spiral' ? resistanceFactors.axialCapSpiral : resistanceFactors.axialCapOther

  const bindNominalEvaluator = (section: PreparedEquivalentBlockSection): CapacityEvaluator<NominalBlockEvaluation> => (state) => {
    const nominal = evaluateEquivalentBlock(section, blockLaw, steelLaws, state)
    return { state, resultants: nominal.resultants, source: nominal }
  }
  const bindDesignEvaluator = (section: PreparedEquivalentBlockSection): CapacityEvaluator<KdsDesignEvaluationSource> => (state) => {
    const nominal = evaluateEquivalentBlock(section, blockLaw, steelLaws, state)
    const controllingBar = nominal.bars.find((bar) => bar.id === nominal.controllingBarId)
    if (!controllingBar) {
      throw new EquivalentBlockInputError('INVALID_REBAR', 'KDS design resistance requires at least one controlling longitudinal bar.')
    }
    const definition = input.steel[controllingBar.steelLawId]
    const resistance = evaluateKds142010StrengthReduction(
      nominal.controllingTensileStrain,
      definition,
      input.transverseReinforcement,
      resistanceFactors
    )
    return {
      state,
      resultants: scaleResultants(nominal.resultants, resistance.phi),
      source: { nominal, resistance },
      metadata: {
        phi: resistance.phi,
        classification: resistance.classification,
        controllingBarId: nominal.controllingBarId
      }
    }
  }
  const nominalEndpoints = (section: PreparedEquivalentBlockSection) => {
    const tension = evaluateUniformSectionState(section, steelLaws, {
      concreteStress: 0,
      steelStrain: -1,
      subtractDisplacedConcrete: false
    })
    const compression = evaluateUniformSectionState(section, steelLaws, {
      concreteStress: 0.85 * input.concreteStrength,
      steelStrain: 1,
      subtractDisplacedConcrete: true
    })
    return {
      tension: { resultants: tension.resultants, metadata: { state: 'pure-tension', standard: KDS_142020_PROVENANCE.methodId } } as CapacityEndpoint,
      compression: { resultants: compression.resultants, metadata: { state: 'pure-compression-P0', standard: KDS_142020_PROVENANCE.methodId } } as CapacityEndpoint
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
  const axialCap = (section: PreparedEquivalentBlockSection) =>
    axialCapRatio * designEndpoints(section).compression.resultants.P
  const buildNominalSurface = (section: PreparedEquivalentBlockSection, options: KdsSurfaceOptions = {}): CapacitySurface => {
    const endpoints = nominalEndpoints(section)
    return buildCapacitySurface(section, bindNominalEvaluator(section), {
      ...options,
      extremeCompressionStrain: parameters.extremeCompressionStrain,
      tensionPole: endpoints.tension,
      compressionPole: endpoints.compression
    })
  }
  const buildDesignSurface = (
    section: PreparedEquivalentBlockSection,
    options: KdsSurfaceOptions & { applyAxialCap?: boolean } = {}
  ): CapacitySurface => {
    const { applyAxialCap = true, ...surfaceOptions } = options
    const endpoints = designEndpoints(section)
    const surface = buildCapacitySurface(section, bindDesignEvaluator(section), {
      ...surfaceOptions,
      extremeCompressionStrain: parameters.extremeCompressionStrain,
      tensionPole: endpoints.tension,
      compressionPole: endpoints.compression
    })
    return applyAxialCap ? clipCapacitySurfaceByAxialCap(surface, axialCap(section)) : surface
  }

  return {
    provenance: KDS_142020_PROVENANCE,
    parameters,
    blockLaw,
    steelLaws,
    transverseReinforcement: input.transverseReinforcement,
    bindNominalEvaluator,
    bindDesignEvaluator,
    nominalEndpoints,
    designEndpoints,
    axialCap,
    buildNominalSurface,
    buildDesignSurface
  }
}
