import {
  EquivalentBlockInputError,
  bindEquivalentBlockForwardEvaluator,
  buildCapacitySurface,
  clipCapacitySurfaceByAxialCap,
  createBilinearSteelLaw,
  createElasticPerfectlyPlasticSteelLaw,
  createTabulatedSteelLaw,
  evaluateUniformSectionState,
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
  type SteelLaw,
  type SteelLawRegistry
} from '@pm/equivalent-block'

/**
 * A Custom profile has no clause traceability by construction, so it never claims one. The
 * verification status is fixed here rather than accepted from the caller.
 */
export const CUSTOM_BLOCK_PROVENANCE = {
  document: 'User-defined equivalent rectangular stress block',
  concrete: 'Project DesignBasis and concrete material (no code table)',
  resistance: 'Project DesignBasis strength-reduction factors and transition rule',
  methodId: 'custom-user-defined-equivalent-rectangular-block',
  implementationVersion: '1.0.0',
  verificationStatus: 'user-defined'
} as const

export type CustomTransverseReinforcement = 'other' | 'qualifying-spiral'

export type CustomSteelLawDefinition =
  | { type: 'elastic-perfectly-plastic' }
  | { type: 'bilinear'; hardeningRatio: number }
  | { type: 'user-curve'; points: ReadonlyArray<{ strain: number; stress: number }> }

export type CustomSteelDefinition = {
  elasticModulus: number
  yieldStress: number
  ultimateStrain?: number
  /** Defaults to elastic-perfectly-plastic so a minimal caller behaves like the code adapters. */
  law?: CustomSteelLawDefinition
}

/** Both rule shapes the DesignBasis can express; the user selects one. */
export type CustomTensionControlledLimitRule =
  | { type: 'yield-plus-strain'; extraStrain: number }
  | {
      type: 'fixed-or-yield-multiple'
      yieldStressThreshold: number
      fixedStrainLimit: number
      highStrengthYieldMultiple: number
    }

export type CustomBlockDefinition = {
  /** sigma_block = stressFactor * fck. The user owns the whole factor (e.g. eta*0.85 or 0.85). */
  stressFactor: number
  /** a = depthFactor * c. */
  depthFactor: number
  extremeCompressionStrain: number
  /** Concentric reference stress factor for the nominal P0 pole; defaults to `stressFactor`. */
  compressionReferenceStressFactor?: number
  /** Deduct concrete displaced by bars inside the block. Defaults to true, as both code adapters do. */
  subtractDisplacedConcrete?: boolean
}

export type CustomResistanceFactors = {
  phiCompressionOther: number
  phiCompressionSpiral: number
  phiTension: number
  axialCapOther: number
  axialCapSpiral: number
}

export type CreateCustomBlockModelInput = {
  concreteStrength: number
  block: CustomBlockDefinition
  steel: Readonly<Record<string, CustomSteelDefinition>>
  transverseReinforcement: CustomTransverseReinforcement
  transitionRule: CustomTensionControlledLimitRule
  resistanceFactors: CustomResistanceFactors
}

export type CustomResistanceClassification = 'compression-controlled' | 'transition' | 'tension-controlled'

export type CustomStrengthReduction = {
  phi: number
  classification: CustomResistanceClassification
  tensileStrain: number
  yieldStrain: number
  tensionControlledLimit: number
}

export type CustomDesignEvaluationSource = {
  nominal: NominalBlockEvaluation
  resistance: CustomStrengthReduction
}

type CustomSurfaceOptions = Omit<
  BuildCapacitySurfaceOptions,
  'extremeCompressionStrain' | 'tensionPole' | 'compressionPole'
>

const positiveFinite = (value: number) => Number.isFinite(value) && value > 0

export const customTensionControlledLimit = (
  rule: CustomTensionControlledLimitRule,
  yieldStrain: number,
  yieldStress: number
) =>
  rule.type === 'yield-plus-strain'
    ? yieldStrain + rule.extraStrain
    : yieldStress <= rule.yieldStressThreshold
      ? rule.fixedStrainLimit
      : rule.highStrengthYieldMultiple * yieldStrain

export const evaluateCustomStrengthReduction = (
  tensileStrain: number,
  steel: CustomSteelDefinition,
  transverseReinforcement: CustomTransverseReinforcement,
  factors: Pick<CustomResistanceFactors, 'phiCompressionOther' | 'phiCompressionSpiral' | 'phiTension'>,
  transitionRule: CustomTensionControlledLimitRule
): CustomStrengthReduction => {
  if (
    !Number.isFinite(tensileStrain) || tensileStrain < 0 ||
    !positiveFinite(steel.elasticModulus) || !positiveFinite(steel.yieldStress)
  ) {
    throw new EquivalentBlockInputError(
      'INVALID_BLOCK_LAW',
      'Custom phi evaluation requires a nonnegative tensile strain and valid steel properties.'
    )
  }
  const yieldStrain = steel.yieldStress / steel.elasticModulus
  const tensionControlledLimit = customTensionControlledLimit(transitionRule, yieldStrain, steel.yieldStress)
  const compressionPhi = transverseReinforcement === 'qualifying-spiral'
    ? factors.phiCompressionSpiral
    : factors.phiCompressionOther
  const tensionPhi = factors.phiTension
  const strainTolerance = 1e-12 * Math.max(1, tensionControlledLimit)
  if (tensileStrain <= yieldStrain + strainTolerance) {
    return { phi: compressionPhi, classification: 'compression-controlled', tensileStrain, yieldStrain, tensionControlledLimit }
  }
  if (tensileStrain >= tensionControlledLimit - strainTolerance) {
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

const buildSteelLaw = (id: string, definition: CustomSteelDefinition): SteelLaw => {
  const law = definition.law ?? { type: 'elastic-perfectly-plastic' }
  if (law.type === 'bilinear') {
    return createBilinearSteelLaw(
      definition.elasticModulus,
      definition.yieldStress,
      law.hardeningRatio,
      definition.ultimateStrain
    )
  }
  if (law.type === 'user-curve') {
    if (law.points.length < 2) {
      throw new EquivalentBlockInputError('INVALID_BLOCK_LAW', `Custom steel ${id} needs at least two curve points.`)
    }
    return createTabulatedSteelLaw(
      law.points,
      definition.yieldStress / definition.elasticModulus,
      definition.ultimateStrain
    )
  }
  return createElasticPerfectlyPlasticSteelLaw(
    definition.elasticModulus,
    definition.yieldStress,
    definition.ultimateStrain
  )
}

const validateSteel = (steel: Readonly<Record<string, CustomSteelDefinition>>) => {
  if (Object.keys(steel).length === 0) {
    throw new EquivalentBlockInputError('INVALID_BLOCK_LAW', 'At least one custom reinforcing-steel definition is required.')
  }
  for (const [id, definition] of Object.entries(steel)) {
    if (
      id.trim().length === 0 || !positiveFinite(definition.elasticModulus) || !positiveFinite(definition.yieldStress) ||
      (definition.ultimateStrain !== undefined && !positiveFinite(definition.ultimateStrain))
    ) {
      throw new EquivalentBlockInputError('INVALID_BLOCK_LAW', `Custom steel ${id} requires positive Es and fy.`)
    }
  }
}

const validateTransitionRule = (rule: CustomTensionControlledLimitRule) => {
  if (rule.type === 'yield-plus-strain') {
    if (!positiveFinite(rule.extraStrain)) {
      throw new EquivalentBlockInputError('INVALID_BLOCK_LAW', 'A custom yield-plus-strain transition needs a positive extra strain.')
    }
    return
  }
  if (
    !positiveFinite(rule.yieldStressThreshold) ||
    !positiveFinite(rule.fixedStrainLimit) ||
    !positiveFinite(rule.highStrengthYieldMultiple)
  ) {
    throw new EquivalentBlockInputError('INVALID_BLOCK_LAW', 'A custom fixed-or-yield-multiple transition needs positive parameters.')
  }
}

export const createCustomBlockModel = (input: CreateCustomBlockModelInput) => {
  if (!positiveFinite(input.concreteStrength)) {
    throw new EquivalentBlockInputError('INVALID_BLOCK_LAW', 'Custom concrete strength fck must be positive and finite.')
  }
  if (input.transverseReinforcement !== 'other' && input.transverseReinforcement !== 'qualifying-spiral') {
    throw new EquivalentBlockInputError('INVALID_BLOCK_LAW', 'Custom transverse reinforcement must be other or qualifying-spiral.')
  }
  validateSteel(input.steel)
  validateTransitionRule(input.transitionRule)

  const { resistanceFactors } = input
  if (Object.values(resistanceFactors).some((value) => !positiveFinite(value))) {
    throw new EquivalentBlockInputError('INVALID_BLOCK_LAW', 'Custom resistance factors must be positive and finite.')
  }
  if (Object.values(resistanceFactors).some((value) => value > 1)) {
    throw new EquivalentBlockInputError('INVALID_BLOCK_LAW', 'Custom phi factors and axial-cap ratios must not exceed 1.0.')
  }
  if (!positiveFinite(input.block.stressFactor) || !positiveFinite(input.block.depthFactor)) {
    throw new EquivalentBlockInputError('INVALID_BLOCK_LAW', 'Custom block stress factor and β1 must be positive and finite.')
  }
  if (input.block.depthFactor > 1) {
    throw new EquivalentBlockInputError('INVALID_BLOCK_LAW', 'Custom β1 must not exceed 1.0: the block cannot be deeper than the compression zone.')
  }
  if (!positiveFinite(input.block.extremeCompressionStrain)) {
    throw new EquivalentBlockInputError('INVALID_BLOCK_LAW', 'Custom extreme compression strain must be positive and finite.')
  }
  const referenceStressFactor = input.block.compressionReferenceStressFactor ?? input.block.stressFactor
  if (!positiveFinite(referenceStressFactor) || referenceStressFactor < input.block.stressFactor) {
    throw new EquivalentBlockInputError(
      'INVALID_BLOCK_LAW',
      'The custom concentric reference stress factor must be positive and at least the block stress factor.'
    )
  }

  const steelLaws: SteelLawRegistry = Object.fromEntries(
    Object.entries(input.steel).map(([id, definition]) => [id, buildSteelLaw(id, definition)])
  )
  const blockLaw: EquivalentBlockLaw = {
    compressionStress: input.block.stressFactor * input.concreteStrength,
    depthFactor: input.block.depthFactor,
    extremeCompressionStrain: input.block.extremeCompressionStrain,
    subtractDisplacedConcrete: input.block.subtractDisplacedConcrete ?? true
  }
  const referenceCompressionStress = referenceStressFactor * input.concreteStrength
  /** The reference pole is only a separate surface pole when it is physically unreachable. */
  const referenceExceedsBlock = referenceCompressionStress > blockLaw.compressionStress * (1 + 1e-12)

  const barStrainEvents = Object.values(input.steel).flatMap((definition) => {
    const yieldStrain = definition.yieldStress / definition.elasticModulus
    const tensionLimit = customTensionControlledLimit(input.transitionRule, yieldStrain, definition.yieldStress)
    return [
      ...Array.from({ length: 9 }, (_, index) => yieldStrain + (index / 8) * (tensionLimit - yieldStrain)),
      ...(definition.ultimateStrain === undefined ? [] : [definition.ultimateStrain])
    ]
  })
  const compressionPhi = input.transverseReinforcement === 'qualifying-spiral'
    ? resistanceFactors.phiCompressionSpiral
    : resistanceFactors.phiCompressionOther
  const axialCapRatio = input.transverseReinforcement === 'qualifying-spiral'
    ? resistanceFactors.axialCapSpiral
    : resistanceFactors.axialCapOther

  const bindNominalEvaluator = (section: PreparedEquivalentBlockSection): CapacityEvaluator<NominalBlockEvaluation> => {
    const evaluate = bindEquivalentBlockForwardEvaluator(section, blockLaw, steelLaws)
    return (state: BlockSectionState) => {
      const nominal = evaluate(state)
      return { state, resultants: nominal.resultants, source: nominal }
    }
  }
  const bindDesignEvaluator = (section: PreparedEquivalentBlockSection): CapacityEvaluator<CustomDesignEvaluationSource> => {
    const evaluate = bindEquivalentBlockForwardEvaluator(section, blockLaw, steelLaws)
    return (state: BlockSectionState) => {
      const nominal = evaluate(state)
      const controllingBar = nominal.bars.find((bar) => bar.id === nominal.controllingBarId)
      if (!controllingBar) {
        throw new EquivalentBlockInputError('INVALID_REBAR', 'Custom design resistance requires at least one controlling longitudinal bar.')
      }
      const definition = input.steel[controllingBar.steelLawId]
      const resistance = evaluateCustomStrengthReduction(
        nominal.controllingTensileStrain,
        definition,
        input.transverseReinforcement,
        resistanceFactors,
        input.transitionRule
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
  }
  const nominalEndpoints = (section: PreparedEquivalentBlockSection) => {
    const endpointStrain = uniformSteelEndpointStrain(section, steelLaws)
    const tension = evaluateUniformSectionState(section, steelLaws, {
      concreteStress: 0,
      steelStrain: -endpointStrain,
      subtractDisplacedConcrete: false
    })
    const compression = evaluateUniformSectionState(section, steelLaws, {
      concreteStress: referenceCompressionStress,
      steelStrain: endpointStrain,
      subtractDisplacedConcrete: true
    })
    return {
      tension: {
        resultants: tension.resultants,
        metadata: { state: 'pure-tension', standard: CUSTOM_BLOCK_PROVENANCE.methodId }
      } as CapacityEndpoint,
      compression: {
        resultants: compression.resultants,
        metadata: { state: 'pure-compression-P0', standard: CUSTOM_BLOCK_PROVENANCE.methodId }
      } as CapacityEndpoint
    }
  }
  /**
   * The compression pole the surface may actually close on.
   *
   * When the user gives a concentric reference stress above the block stress — the KDS pattern —
   * `P0` stays a named reference point and the surface closes on the reachable block limit instead,
   * so no triangle interpolates through a capacity band no neutral-axis state can produce.
   */
  const physicalCompressionEndpoint = (section: PreparedEquivalentBlockSection): CapacityEndpoint => {
    const endpointStrain = uniformSteelEndpointStrain(section, steelLaws)
    const compression = evaluateUniformSectionState(section, steelLaws, {
      concreteStress: blockLaw.compressionStress,
      steelStrain: endpointStrain,
      subtractDisplacedConcrete: true
    })
    return {
      resultants: compression.resultants,
      metadata: {
        state: referenceExceedsBlock ? 'equivalent-block-compression-limit' : 'pure-compression-P0',
        standard: CUSTOM_BLOCK_PROVENANCE.methodId,
        stressFactor: input.block.stressFactor
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
  const axialCap = (section: PreparedEquivalentBlockSection) =>
    axialCapRatio * designEndpoints(section).compression.resultants.P
  const buildNominalSurface = (
    section: PreparedEquivalentBlockSection,
    options: CustomSurfaceOptions = {}
  ): CapacitySurface => {
    const endpoints = nominalEndpoints(section)
    return buildCapacitySurface(section, bindNominalEvaluator(section), {
      ...options,
      steelLaws,
      barStrainEvents,
      extremeCompressionStrain: blockLaw.extremeCompressionStrain,
      tensionPole: endpoints.tension,
      compressionPole: physicalCompressionEndpoint(section)
    })
  }
  const buildDesignSurface = (
    section: PreparedEquivalentBlockSection,
    options: CustomSurfaceOptions & { applyAxialCap?: boolean } = {}
  ): CapacitySurface => {
    const { applyAxialCap = true, ...surfaceOptions } = options
    const endpoints = designEndpoints(section)
    const physicalCompression = physicalCompressionEndpoint(section)
    const surface = buildCapacitySurface(section, bindDesignEvaluator(section), {
      ...surfaceOptions,
      steelLaws,
      barStrainEvents,
      extremeCompressionStrain: blockLaw.extremeCompressionStrain,
      tensionPole: endpoints.tension,
      compressionPole: {
        resultants: scaleResultants(physicalCompression.resultants, compressionPhi),
        metadata: { ...physicalCompression.metadata, phi: compressionPhi }
      }
    })
    return applyAxialCap ? clipCapacitySurfaceByAxialCap(surface, axialCap(section)) : surface
  }

  return {
    provenance: CUSTOM_BLOCK_PROVENANCE,
    parameters: {
      concreteStrength: input.concreteStrength,
      stressFactor: input.block.stressFactor,
      beta1: input.block.depthFactor,
      extremeCompressionStrain: input.block.extremeCompressionStrain,
      compressionReferenceStressFactor: referenceStressFactor,
      source: 'user-defined' as const
    },
    blockLaw,
    steelLaws,
    transitionRule: input.transitionRule,
    transverseReinforcement: input.transverseReinforcement,
    bindNominalEvaluator,
    bindDesignEvaluator,
    nominalEndpoints,
    physicalCompressionEndpoint,
    designEndpoints,
    axialCap,
    buildNominalSurface,
    buildDesignSurface
  }
}
