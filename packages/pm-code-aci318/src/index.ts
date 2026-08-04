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

export const ACI_318_19_PROVENANCE = {
  document: 'ACI CODE-318-19(22)',
  concrete: 'Sections 22.2.2.4.1 and 22.2.2.4.3',
  resistance: 'Chapter 21, Table 21.2.2 and Section 22.4.2.1',
  methodId: 'aci-318-19-22-whitney-equivalent-rectangular-block',
  implementationVersion: '1.0.0',
  verificationStatus: 'clause-tested'
} as const

export type AciTransverseReinforcement = 'tied' | 'qualifying-spiral'

export type AciSteelDefinition = {
  elasticModulus: number
  yieldStress: number
  ultimateStrain?: number
}

export type CreateAci318ModelInput = {
  concreteStrength: number
  steel: Readonly<Record<string, AciSteelDefinition>>
  transverseReinforcement: AciTransverseReinforcement
  resistanceFactors?: {
    phiCompressionOther: number
    phiCompressionSpiral: number
    phiTension: number
    transitionExtraStrain: number
    axialCapOther: number
    axialCapSpiral: number
  }
}

export type AciResistanceClassification = 'compression-controlled' | 'transition' | 'tension-controlled'

export type AciStrengthReduction = {
  phi: number
  classification: AciResistanceClassification
  tensileStrain: number
  yieldStrain: number
  tensionControlledLimit: number
}

export type AciDesignEvaluationSource = {
  nominal: NominalBlockEvaluation
  resistance: AciStrengthReduction
}

type AciSurfaceOptions = Omit<
  BuildCapacitySurfaceOptions,
  'extremeCompressionStrain' | 'tensionPole' | 'compressionPole'
>

const positiveFinite = (value: number) => Number.isFinite(value) && value > 0

export const aci318Beta1 = (concreteStrength: number) => {
  if (!positiveFinite(concreteStrength)) {
    throw new EquivalentBlockInputError('INVALID_BLOCK_LAW', "ACI concrete strength f'c must be positive and finite.")
  }
  if (concreteStrength <= 28) return 0.85
  return Math.max(0.65, 0.85 - 0.05 * (concreteStrength - 28) / 7)
}

export const evaluateAci318StrengthReduction = (
  tensileStrain: number,
  steel: AciSteelDefinition,
  transverseReinforcement: AciTransverseReinforcement,
  factors = {
    phiCompressionOther: 0.65,
    phiCompressionSpiral: 0.75,
    phiTension: 0.90,
    transitionExtraStrain: 0.003
  }
): AciStrengthReduction => {
  if (!Number.isFinite(tensileStrain) || tensileStrain < 0 || !positiveFinite(steel.elasticModulus) || !positiveFinite(steel.yieldStress)) {
    throw new EquivalentBlockInputError('INVALID_BLOCK_LAW', 'ACI phi evaluation requires a nonnegative tensile strain and valid steel properties.')
  }
  const yieldStrain = steel.yieldStress / steel.elasticModulus
  const tensionControlledLimit = yieldStrain + factors.transitionExtraStrain
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

const validateSteel = (steel: Readonly<Record<string, AciSteelDefinition>>) => {
  if (Object.keys(steel).length === 0) {
    throw new EquivalentBlockInputError('INVALID_BLOCK_LAW', 'At least one ACI reinforcing-steel definition is required.')
  }
  for (const [id, definition] of Object.entries(steel)) {
    if (
      id.trim().length === 0 || !positiveFinite(definition.elasticModulus) || !positiveFinite(definition.yieldStress) ||
      (definition.ultimateStrain !== undefined && !positiveFinite(definition.ultimateStrain))
    ) {
      throw new EquivalentBlockInputError('INVALID_BLOCK_LAW', `ACI steel ${id} requires positive Es and fy.`)
    }
  }
}

export const createAci318Model = (input: CreateAci318ModelInput) => {
  if (!positiveFinite(input.concreteStrength)) {
    throw new EquivalentBlockInputError('INVALID_BLOCK_LAW', "ACI concrete strength f'c must be positive and finite.")
  }
  if (input.transverseReinforcement !== 'tied' && input.transverseReinforcement !== 'qualifying-spiral') {
    throw new EquivalentBlockInputError('INVALID_BLOCK_LAW', 'ACI transverse reinforcement must be tied or qualifying-spiral.')
  }
  validateSteel(input.steel)
  const resistanceFactors = input.resistanceFactors ?? {
    phiCompressionOther: 0.65,
    phiCompressionSpiral: 0.75,
    phiTension: 0.90,
    transitionExtraStrain: 0.003,
    axialCapOther: 0.80,
    axialCapSpiral: 0.85
  }
  if (Object.values(resistanceFactors).some((value) => !positiveFinite(value))) {
    throw new EquivalentBlockInputError('INVALID_BLOCK_LAW', 'ACI resistance factors must be positive and finite.')
  }
  if ([
    resistanceFactors.phiCompressionOther,
    resistanceFactors.phiCompressionSpiral,
    resistanceFactors.phiTension,
    resistanceFactors.axialCapOther,
    resistanceFactors.axialCapSpiral
  ].some((value) => value > 1)) {
    throw new EquivalentBlockInputError('INVALID_BLOCK_LAW', 'ACI phi factors and axial-cap ratios must not exceed 1.0.')
  }
  const beta1 = aci318Beta1(input.concreteStrength)
  const steelLaws: SteelLawRegistry = Object.fromEntries(Object.entries(input.steel).map(([id, definition]) => [
    id,
    createElasticPerfectlyPlasticSteelLaw(definition.elasticModulus, definition.yieldStress, definition.ultimateStrain)
  ]))
  const blockLaw: EquivalentBlockLaw = {
    compressionStress: 0.85 * input.concreteStrength,
    depthFactor: beta1,
    extremeCompressionStrain: 0.003,
    subtractDisplacedConcrete: true
  }
  const compressionPhi = input.transverseReinforcement === 'qualifying-spiral' ? resistanceFactors.phiCompressionSpiral : resistanceFactors.phiCompressionOther
  const axialCapRatio = input.transverseReinforcement === 'qualifying-spiral' ? resistanceFactors.axialCapSpiral : resistanceFactors.axialCapOther

  const bindNominalEvaluator = (section: PreparedEquivalentBlockSection): CapacityEvaluator<NominalBlockEvaluation> => (state: BlockSectionState) => {
    const nominal = evaluateEquivalentBlock(section, blockLaw, steelLaws, state)
    return { state, resultants: nominal.resultants, source: nominal }
  }
  const bindDesignEvaluator = (section: PreparedEquivalentBlockSection): CapacityEvaluator<AciDesignEvaluationSource> => (state: BlockSectionState) => {
    const nominal = evaluateEquivalentBlock(section, blockLaw, steelLaws, state)
    const controllingBar = nominal.bars.find((bar) => bar.id === nominal.controllingBarId)
    if (!controllingBar) {
      throw new EquivalentBlockInputError('INVALID_REBAR', 'ACI design resistance requires at least one controlling longitudinal bar.')
    }
    const definition = input.steel[controllingBar.steelLawId]
    const resistance = evaluateAci318StrengthReduction(
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
      tension: { resultants: tension.resultants, metadata: { state: 'pure-tension', standard: ACI_318_19_PROVENANCE.methodId } } as CapacityEndpoint,
      compression: { resultants: compression.resultants, metadata: { state: 'pure-compression-P0', standard: ACI_318_19_PROVENANCE.methodId } } as CapacityEndpoint
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
  const buildNominalSurface = (section: PreparedEquivalentBlockSection, options: AciSurfaceOptions = {}): CapacitySurface => {
    const endpoints = nominalEndpoints(section)
    return buildCapacitySurface(section, bindNominalEvaluator(section), {
      ...options,
      extremeCompressionStrain: blockLaw.extremeCompressionStrain,
      tensionPole: endpoints.tension,
      compressionPole: endpoints.compression
    })
  }
  const buildDesignSurface = (
    section: PreparedEquivalentBlockSection,
    options: AciSurfaceOptions & { applyAxialCap?: boolean } = {}
  ): CapacitySurface => {
    const { applyAxialCap = true, ...surfaceOptions } = options
    const endpoints = designEndpoints(section)
    const surface = buildCapacitySurface(section, bindDesignEvaluator(section), {
      ...surfaceOptions,
      extremeCompressionStrain: blockLaw.extremeCompressionStrain,
      tensionPole: endpoints.tension,
      compressionPole: endpoints.compression
    })
    return applyAxialCap ? clipCapacitySurfaceByAxialCap(surface, axialCap(section)) : surface
  }

  return {
    provenance: ACI_318_19_PROVENANCE,
    beta1,
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
