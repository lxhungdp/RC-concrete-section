import {
  AnalysisInputError,
  activeDesignSurfaceDataset,
  activeNominalSurfaceDataset,
  buildCalculationAuditOriginStrainTrace,
  projectedBoundaryDepth,
  reconcileCalculationAuditResultant,
  sectionBoundaryPoints,
  stationDefinitionLabel,
  type AxialCapProjectionTrace,
  type DesignResistanceTrace,
  type CalculationAuditDepthProfile,
  type CalculationAuditRebar,
  type CalculationAuditStage,
  type EquivalentBlockStateTrace,
  type ExactDirectionCurve,
  type InversePreviewResult,
  type PreviewSurface,
  type PreviewSurfaceDataset,
  type PreviewSurfacePoint,
  type PointCalculationAudit,
  type ResultantLedger,
  type SectionFieldMap,
  type StrainAdmissibility,
  type StrainState,
  type StationDefinition,
  type SurfaceStation
} from '@pm/analysis'
import { ACI_318_19_PROVENANCE, createAci318Model } from '@pm/code-aci318'
import { AS_3600_2018_PROVENANCE, createAs3600Model } from '@pm/code-as3600'
import {
  CUSTOM_BLOCK_PROVENANCE,
  createCustomBlockModel,
  type CustomBlockDefinition,
  type CustomSteelLawDefinition
} from '@pm/code-custom'
import { KDS_142020_PROVENANCE, createKds142020Model } from '@pm/code-kds142020'
import {
  buildResistanceMaterialSets,
  minimumEccentricityCandidates,
  minimumEccentricityMessage,
  assertDesignMaterialApplicability,
  resolveMaterialFactorExpression,
  type DesignBasis,
  type GlobalStrengthReductionBasis
} from '@pm/design'
import {
  prepareEquivalentBlockSection,
  projectedOuterExtents,
  resolveEquivalentBlockExtremeCompressionStrain,
  solveFixedAxialCapacity,
  solveProportionalRayCapacity,
  type BlockSectionState,
  type CapacityEvaluation,
  type CapacityEvaluator,
  type CapacitySurface,
  type EquivalentBlockLaw,
  type NominalBlockEvaluation,
  type PreparedEquivalentBlockSection
} from '@pm/equivalent-block'
import { netConcreteCentroid, type GeometryInputRebarView, type SectionGeometry } from '@pm/geometry'
import {
  assertValidMaterialStore,
  describeSteelMaterialLaw,
  effectiveSteelYieldStress,
  userBlockCompressionStress,
  type MaterialStore
} from '@pm/materials'
import {
  cloneCalculationAnalysisOptions,
  isEquivalentBlockProfileId,
  type CalculationProfileId,
  type EquivalentBlockProfileId,
  type EquivalentBlockAnalysisOptions,
  type LoadCombination
} from '@pm/project'

type PreparedBlockModel =
  | ReturnType<typeof createAci318Model>
  | ReturnType<typeof createAs3600Model>
  | ReturnType<typeof createKds142020Model>
  | ReturnType<typeof createCustomBlockModel>

export type PreparedBlockAnalysis = {
  profileId: EquivalentBlockProfileId
  section: PreparedEquivalentBlockSection
  materialStore: MaterialStore
  designBasis: DesignBasis
  referenceModel: PreparedBlockModel
  designModel: PreparedBlockModel
  /** Design model retained under the historical name for field-map and inverse consumers. */
  model: PreparedBlockModel
  /**
   * True when the Appendix concentric design axial strength and the block's own `eta`-reduced
   * concentric limit are different points, so the last surface band between them is an
   * interpolation the block law itself does not evaluate.
   */
  appendixPoleDivergesFromBlockLimit: boolean
  geometry: SectionGeometry
  rebars: GeometryInputRebarView[]
}

/** Worker-cacheable core surface. It is independent of any load combination. */
export type EquivalentBlockDesignSurface = CapacitySurface

const TAU = 2 * Math.PI
const wrap = (angle: number) => ((angle % TAU) + TAU) % TAU

/**
 * Read the user's block law off the concrete material.
 *
 * A custom block profile has no code table to fall back on, so a concrete model without `β1` is a
 * typed input error rather than a silently defaulted one.
 */
const customBlockDefinition = (concrete: MaterialStore['concrete']): CustomBlockDefinition => {
  if (concrete.stressStrain.type !== 'user-block') {
    throw new Error(
      `The custom equivalent-block profile requires a user-block concrete model; material ${concrete.id} is ${concrete.stressStrain.type}.`
    )
  }
  return {
    /**
     * Through the material helper, not `stressStrain.alpha` directly, so the block stress the
     * kernel integrates is the same number the Materials panel and the workbook display. The two
     * differ whenever a partial factor is present.
     */
    stressFactor: userBlockCompressionStress(concrete) / concrete.fck,
    depthFactor: concrete.stressStrain.beta1,
    extremeCompressionStrain: concrete.stressStrain.epsCu,
    subtractDisplacedConcrete: true
  }
}

const customSteelLaw = (steel: MaterialStore['steel'][number]): CustomSteelLawDefinition => {
  if (steel.stressStrain.type === 'bilinear') {
    return { type: 'bilinear', hardeningRatio: steel.stressStrain.hardeningRatio }
  }
  if (steel.stressStrain.type === 'user-curve') {
    return { type: 'user-curve', points: steel.stressStrain.points }
  }
  return { type: 'elastic-perfectly-plastic' }
}

type BlockModelResolutionInput = {
  materialStore: MaterialStore
  basis: GlobalStrengthReductionBasis
  common: {
    concreteStrength: number
    steel: Record<string, {
      elasticModulus: number
      yieldStress: number
      ultimateStrain: number | undefined
    }>
  }
}

type BlockModelResolver = (input: BlockModelResolutionInput) => PreparedBlockModel

/**
 * Code-specific policy registry at the project bridge. The equivalent-block mechanics package
 * receives only the resolved model and remains independent of KDS, ACI, or future AS adapters.
 */
const BLOCK_MODEL_RESOLVERS: Record<EquivalentBlockProfileId, BlockModelResolver> = {
  'custom-equivalent-block': ({ materialStore, basis }) => createCustomBlockModel({
    concreteStrength: materialStore.concrete.fck,
    block: customBlockDefinition(materialStore.concrete),
    steel: Object.fromEntries(materialStore.steel.map((item) => [String(item.id), {
      elasticModulus: item.elasticModulus,
      yieldStress: item.fy,
      ultimateStrain: item.limits?.epsU,
      law: customSteelLaw(item)
    }])),
    resistanceFactors: basis.factors,
    transitionRule: basis.transition,
    transverseReinforcement: basis.transverseReinforcement
  }),
  'aci-318-19-22-equivalent-block': ({ common, basis }) => {
    if (basis.transition.type !== 'yield-plus-strain') {
      throw new Error('The ACI 318 profile requires a yield-plus-strain transition rule.')
    }
    return createAci318Model({
      ...common,
      resistanceFactors: {
        ...basis.factors,
        transitionExtraStrain: basis.transition.extraStrain
      },
      transverseReinforcement: basis.transverseReinforcement === 'qualifying-spiral'
        ? 'qualifying-spiral'
        : 'tied'
    })
  },
  'as-3600-2018-amd2-equivalent-block': ({ common, basis }) => {
    if (basis.transition.type !== 'yield-plus-strain') {
      throw new Error('The AS 3600 preview profile requires its declared capacity-factor policy.')
    }
    return createAs3600Model({
      ...common,
      compressionPhiClass: basis.transverseReinforcement === 'qualifying-spiral'
        ? 'short-column-high-permanent-load'
        : 'ordinary',
      resistanceFactors: {
        phiCompressionOrdinary: basis.factors.phiCompressionOther,
        phiCompressionShortColumnHighPermanentLoad: basis.factors.phiCompressionSpiral,
        phiBendingMinimum: basis.factors.phiCompressionSpiral,
        phiBendingMaximum: basis.factors.phiTension,
        phiTension: basis.factors.phiTension
      }
    })
  },
  'kds-142020-equivalent-block': ({ common, basis }) => {
    if (basis.transition.type !== 'fixed-or-yield-multiple') {
      throw new Error('The KDS profile requires a fixed-or-yield-multiple transition rule.')
    }
    return createKds142020Model({
      ...common,
      resistanceFactors: basis.factors,
      transitionLimitRule: {
        yieldStressThreshold: basis.transition.yieldStressThreshold,
        fixedStrainLimit: basis.transition.fixedStrainLimit,
        highStrengthYieldMultiple: basis.transition.highStrengthYieldMultiple
      },
      transverseReinforcement: basis.transverseReinforcement
    })
  }
}

export const prepareBlockAnalysis = (
  profileId: CalculationProfileId,
  section: SectionGeometry,
  rebars: GeometryInputRebarView[],
  materialStore: MaterialStore,
  designBasis: DesignBasis
): PreparedBlockAnalysis => {
  if (!isEquivalentBlockProfileId(profileId)) {
    throw new Error(`The ${profileId} profile uses stress-strain integration and cannot be routed to the equivalent-block backend.`)
  }
  assertValidMaterialStore(materialStore)
  assertDesignMaterialApplicability(materialStore, designBasis)
  const origin = netConcreteCentroid(section)
  const preparedSection = prepareEquivalentBlockSection({
    solids: section.solids.map((solid) => ({
      outer: solid.outer.map(({ x, y }) => ({ x, y })),
      holes: solid.holes.map((hole) => hole.map(({ x, y }) => ({ x, y })))
    })),
    rebars: rebars.map((bar) => ({
      id: String(bar.id),
      x: bar.x,
      y: bar.y,
      area: Math.PI * bar.dia ** 2 / 4,
      steelLawId: String(bar.steelMaterialId ?? materialStore.defaults.steelMaterialId)
    })),
    referencePoint: origin,
    units: 'N-mm-MPa',
    signConvention: 'compression-positive'
  })
  const isCustom = profileId === 'custom-equivalent-block'
  const steel = Object.fromEntries(materialStore.steel.map((item) => {
    /**
     * Only the custom profile may register a hardening or tabulated steel law. A published block
     * profile is calibrated against the elastic-perfectly-plastic idealization, so accepting a
     * different law there would silently change what the code check means.
     */
    if (!isCustom && item.stressStrain.type !== 'elastic-perfectly-plastic') {
      throw new Error(`Equivalent-block code profiles currently require elastic-perfectly-plastic steel; material ${item.id} is ${item.stressStrain.type}.`)
    }
    return [String(item.id), {
      elasticModulus: item.elasticModulus,
      yieldStress: item.fy,
      ultimateStrain: item.limits?.epsU
    }]
  }))
  const common = {
    concreteStrength: materialStore.concrete.fck,
    steel
  }
  let referenceModel: PreparedBlockModel
  let designModel: PreparedBlockModel
  let appendixPoleDivergesFromBlockLimit = false
  if (designBasis.format === 'designMaterialReevaluation') {
    if (profileId !== 'kds-142020-equivalent-block') {
      throw new Error(`${profileId} does not declare an equivalent-block design-material recipe.`)
    }
    const identityFactors = {
      phiCompressionOther: 1,
      phiCompressionSpiral: 1,
      phiTension: 1,
      axialCapOther: 1,
      axialCapSpiral: 1
    }
    const commonInput = {
      ...common,
      transverseReinforcement: 'other' as const,
      resistanceFactors: identityFactors,
      compressionEndpoint: designBasis.compressionEndpoint === 'peak-stress-strain'
        ? 'peak-stress-strain' as const
        : 'steel-plateau' as const
    }
    referenceModel = createKds142020Model({
      ...commonInput,
      materialStrengthMultipliers: { concrete: 1, reinforcement: 1 }
    })
    const kdsDesignModel = createKds142020Model({
      ...commonInput,
      materialStrengthMultipliers: {
        concrete: resolveMaterialFactorExpression(designBasis.factors.concrete),
        reinforcement: resolveMaterialFactorExpression(designBasis.factors.reinforcement)
      }
    })
    appendixPoleDivergesFromBlockLimit = kdsDesignModel.appendixPoleDivergesFromBlockLimit
    designModel = kdsDesignModel
  } else {
    const model = BLOCK_MODEL_RESOLVERS[profileId]({ materialStore, basis: designBasis, common })
    referenceModel = model
    designModel = model
  }
  return {
    profileId,
    section: preparedSection,
    materialStore,
    designBasis,
    referenceModel,
    designModel,
    model: designModel,
    appendixPoleDivergesFromBlockLimit,
    geometry: section,
    rebars
  }
}

const componentResultants = (evaluation: CapacityEvaluation<unknown>) => {
  const source = evaluation.source as { nominal?: NominalBlockEvaluation } | NominalBlockEvaluation | undefined
  const nominal = source && 'nominal' in source ? source.nominal : source as NominalBlockEvaluation | undefined
  if (!nominal) return []
  const steel = nominal.bars.reduce(
    (sum, bar) => ({ P: sum.P + bar.force, Mx: sum.Mx + bar.Mx, My: sum.My + bar.My }),
    { P: 0, Mx: 0, My: 0 }
  )
  return [
    { P: nominal.concrete.force, Mx: nominal.concrete.Mx, My: nominal.concrete.My },
    steel
  ]
}

const surfaceOptions = (
  options: EquivalentBlockAnalysisOptions,
  componentAware = false,
  stationProbeAngles?: readonly number[],
  blockDepthFactor?: number
) => ({
  samplingMode: options.samplingMode,
  // Project/report order is compression -> tension, shared with the strain-domain DTO.
  // The low-level block mesher traverses increasing neutral-axis depth, so it consumes the reverse.
  stations: [...options.neutralAxisStations.values].reverse(),
  seedDirections: options.directions.seedCount,
  startAngle: options.directions.startDeg * Math.PI / 180,
  directionTolerance: options.directions.refinement.type === 'adaptive'
    ? options.directions.refinement.tolerance
    : 0,
  maxRefinementPasses: options.directions.refinement.type === 'adaptive'
    ? options.directions.refinement.maxPasses
    : 0,
  maxDirections: options.directions.refinement.type === 'adaptive'
    ? options.directions.refinement.maxDirections
    : options.directions.seedCount,
  stationTolerance: options.neutralAxisStations.refinement.type === 'adaptive'
    ? options.neutralAxisStations.refinement.tolerance
    : 0,
  maxStationRefinementPasses: options.neutralAxisStations.refinement.type === 'adaptive'
    ? options.neutralAxisStations.refinement.maxPasses
    : 0,
  maxStations: options.neutralAxisStations.refinement.type === 'adaptive'
    ? Math.max(
        options.neutralAxisStations.values.length,
        options.neutralAxisStations.refinement.maxStations - 2
      )
    : options.neutralAxisStations.values.length,
  ...(options.samplingMode === 'adaptive' && blockDepthFactor && blockDepthFactor > 0
    ? { adaptiveStationEvents: [{ type: 'depth-ratio' as const, ratio: 1 / blockDepthFactor }] }
    : {}),
  ...(stationProbeAngles?.length ? { stationProbeAngles } : {}),
  ...(componentAware ? { componentResultants } : {})
})

const projectedDepth = (section: PreparedEquivalentBlockSection, angle: number) => {
  const nx = Math.cos(angle)
  const ny = Math.sin(angle)
  return projectedOuterExtents(section, nx, ny).depth
}

const strainState = (
  section: PreparedEquivalentBlockSection,
  state: BlockSectionState | undefined,
  law: EquivalentBlockLaw
): StrainState => {
  if (!state) return { e0: 0, kx: 0, ky: 0 }
  const nx = Math.cos(state.neutralAxisAngle)
  const ny = Math.sin(state.neutralAxisAngle)
  const extents = projectedOuterExtents(section, nx, ny)
  const edge = extents.maximum
  const neutralAxis = edge - state.neutralAxisDepth
  const extremeCompressionStrain = resolveEquivalentBlockExtremeCompressionStrain(
    law,
    state.neutralAxisDepth,
    extents.depth
  )
  const scale = extremeCompressionStrain / state.neutralAxisDepth
  return {
    e0: scale * (nx * section.referencePoint.x + ny * section.referencePoint.y - neutralAxis),
    kx: scale * ny,
    ky: scale * nx
  }
}

const zeroLedger = (resultants: { P: number; Mx: number; My: number }): ResultantLedger => {
  const zero = { P: 0, Mx: 0, My: 0 }
  return {
    concrete: zero,
    steelGross: zero,
    displacedConcrete: zero,
    steel: zero,
    total: { ...resultants }
  }
}

const resistanceTrace = (
  point: CapacitySurface['points'][number]
): DesignResistanceTrace | undefined => {
  const phi = typeof point.metadata?.phi === 'number' ? point.metadata.phi : null
  if (phi === null && point.kind !== 'axial-cap') return undefined
  const nominal = phi !== null && phi > 0
    ? {
        P: point.resultants.P / phi,
        Mx: point.resultants.Mx / phi,
        My: point.resultants.My / phi
      }
    : point.resultants
  return {
    nominalReference: { ...nominal },
    format: 'globalResultantFactor',
    factor: phi,
    classification: (point.metadata?.classification as DesignResistanceTrace['classification']) ?? 'compression-controlled',
    controllingTensileStrain: null,
    yieldStrain: null,
    axialCapApplied: point.kind === 'axial-cap',
    stages: point.kind === 'axial-cap'
      ? ['Nominal equivalent block', 'Code strength reduction', 'Maximum axial design strength cap']
      : ['Nominal equivalent block', 'Code strength reduction']
  }
}

const blockTrace = (
  section: PreparedEquivalentBlockSection,
  state: BlockSectionState | undefined,
  depthFactor: number,
  compressionStress: number
): EquivalentBlockStateTrace | undefined => state ? {
  neutralAxisAngle: state.neutralAxisAngle,
  neutralAxisDepth: state.neutralAxisDepth,
  blockDepth: depthFactor * state.neutralAxisDepth,
  beta1: depthFactor,
  projectedSectionDepth: projectedDepth(section, state.neutralAxisAngle),
  compressionStress
} : undefined

const axialCapTrace = (
  point: CapacitySurface['points'][number]
): AxialCapProjectionTrace | undefined => {
  const trace = point.axialCapTrace
  if (!trace) return undefined
  const convert = (source: { pointId: number; resultants: { P: number; Mx: number; My: number } }) => ({
    pointId: `block-source-${source.pointId}`,
    stationId: null,
    ...source.resultants
  })
  return {
    maximumAxialResistance: trace.maximumAxialResistance,
    capRatio: trace.capRatio,
    cap: trace.cap,
    source: trace.source.kind === 'source-vertex'
      ? {
          kind: 'source-vertex',
          point: convert(trace.source.point),
          crossing: { ...trace.source.crossing }
        }
      : {
          kind: 'edge-interpolation',
          compressionSide: convert(trace.source.compressionSide),
          admissibleSide: convert(trace.source.admissibleSide),
          interpolationRatio: trace.source.interpolationRatio,
          crossing: { ...trace.source.crossing }
        },
    projection: { kind: 'identity', factor: 1 }
  }
}

const nearestStation = (
  surface: CapacitySurface,
  section: PreparedEquivalentBlockSection,
  point: CapacitySurface['points'][number],
  epsCu: number
) => {
  const state = point.state
  if (!state) return 0
  if (point.station) {
    const sourceKey = JSON.stringify(point.station)
    const exactIndex = surface.stations.findIndex((station) => JSON.stringify(station) === sourceKey)
    if (exactIndex >= 0) return surface.stations.length - exactIndex
  }
  const ratio = state.neutralAxisDepth / projectedDepth(section, state.neutralAxisAngle)
  const stationRatio = (station: CapacitySurface['stations'][number]) => station.type === 'depth-ratio'
    ? station.ratio
    : station.type === 'bar-tension-yield-ratio'
      ? 1 / (1 + station.ratio * 0.002 / epsCu)
      : station.type === 'extreme-tension-strain' || station.type === 'bar-tension-strain'
        ? 1 / (1 + station.strain / epsCu)
        : Number.POSITIVE_INFINITY
  let best = 0
  for (let index = 1; index < surface.stations.length; index += 1) {
    if (Math.abs(stationRatio(surface.stations[index]) - ratio) < Math.abs(stationRatio(surface.stations[best]) - ratio)) best = index
  }
  return surface.stations.length - best
}

const convertSurfacePoints = (
  surface: CapacitySurface,
  section: PreparedEquivalentBlockSection,
  law: EquivalentBlockLaw,
  beta1: number,
  compressionStress: number,
  includeResistance = false,
  fixedValues?: EquivalentBlockAnalysisOptions['neutralAxisStations']['values']
): PreviewSurfacePoint[] => surface.points.map((point) => {
  const state = strainState(section, point.state, law)
  const surfaceRole = point.kind === 'state'
    ? 'physical-state'
    : point.kind === 'tension-pole'
      ? 'pure-tension'
      : point.kind === 'compression-pole'
        ? 'pure-compression'
        : point.kind
  // Poles and the synthetic axial-cap face have no unique neutral-axis direction. The zero value is
  // only a finite plotting placeholder; topology and station diagnostics must use surfaceRole.
  const meridianAngle = typeof point.metadata?.meridianAngle === 'number'
    ? point.metadata.meridianAngle
    : null
  const beta = point.state
    ? wrap(Math.PI / 2 - point.state.neutralAxisAngle)
    : meridianAngle === null
      ? 0
      : wrap(Math.PI / 2 - meridianAngle)
  const resultants = point.resultants
  const legacyStation = nearestStation(surface, section, point, law.extremeCompressionStrain)
  const physicalCoordinate = point.stationCoordinate === undefined
    ? legacyStation / Math.max(1, surface.stations.length + 1)
    : 1 - point.stationCoordinate
  const sourceStation = point.station
  const fixedIndex = sourceStation && fixedValues
    ? fixedValues.findIndex((value) => JSON.stringify(value) === JSON.stringify(sourceStation))
    : -1
  const stationId = sourceStation
    ? fixedIndex >= 0
      ? `station-${fixedIndex + 1}` as const
      : `adaptive-station-block-${stableStationHash(sourceStation)}` as const
    : null
  return {
    id: `block-${point.kind}-${point.id}`,
    beta,
    station: point.kind === 'tension-pole'
      ? 1
      : point.kind === 'compression-pole'
        ? 0
        : point.kind === 'axial-cap'
          ? -1
          : physicalCoordinate,
    stationCoordinate: point.kind === 'tension-pole'
      ? 1
      : point.kind === 'compression-pole'
        ? 0
        : point.kind === 'axial-cap'
          ? undefined
          : physicalCoordinate,
    stationId: point.kind === 'tension-pole'
      ? 'pure-tension'
      : point.kind === 'compression-pole'
        ? 'pure-compression'
        : point.kind === 'axial-cap'
          ? null
          : stationId,
    surfaceRole,
    onSampledDirection: point.kind === 'state' || (
      point.kind === 'axial-cap' && meridianAngle !== null
    ),
    state,
    ledger: zeroLedger(resultants),
    axialCapTrace: axialCapTrace(point),
    ...resultants,
    equivalentBlock: blockTrace(section, point.state, beta1, compressionStress),
    resistance: includeResistance ? resistanceTrace(point) : undefined
  }
})

const blockStationLabel = (station: CapacitySurface['stations'][number]) => {
  if (station.type === 'cover-gap-ratio') return `cover-gap = ${station.ratio}`
  if (station.type === 'tension-depth-ratio') return `c→0 = ${station.ratio}`
  if (station.type === 'adaptive-depth-interpolation') return `adaptive c = ${station.ratio}`
  return station.type
}

const stableStationHash = (value: unknown) => {
  const text = JSON.stringify(value)
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

const blockStations = (
  surface: CapacitySurface,
  fixedValues: EquivalentBlockAnalysisOptions['neutralAxisStations']['values']
): SurfaceStation[] => [
  { id: 'pure-compression', label: 'Pure compression', definition: { kind: 'pure-compression' }, fixed: true },
  ...[...surface.stations].reverse().map((station) => {
    const definition = station.type === 'depth-ratio'
      ? { kind: 'block-depth-ratio' as const, ratio: station.ratio }
      : station.type === 'bar-tension-yield-ratio'
        ? { kind: 'bar-tension-yield-ratio' as const, ratio: station.ratio }
      : station.type === 'bar-tension-strain'
        ? { kind: 'bar-tension-strain' as const, strain: station.strain }
      : station.type === 'extreme-tension-strain'
        ? { kind: 'extreme-tension-strain' as const, strain: station.strain }
        : { kind: 'block-adaptive' as const, label: blockStationLabel(station) }
    const fixedIndex = fixedValues.findIndex((value) => JSON.stringify(value) === JSON.stringify(station))
    return {
      id: fixedIndex >= 0
        ? `station-${fixedIndex + 1}` as const
        : `adaptive-station-block-${stableStationHash(station)}` as const,
      label: stationDefinitionLabel(definition),
      definition,
      fixed: fixedIndex >= 0
    }
  }),
  { id: 'pure-tension', label: 'Pure tension', definition: { kind: 'pure-tension' }, fixed: true }
]

const bounds = (points: PreviewSurfacePoint[]) => {
  const result = {
    P: [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY] as [number, number],
    Mx: [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY] as [number, number],
    My: [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY] as [number, number]
  }
  for (const point of points) {
    result.P[0] = Math.min(result.P[0], point.P)
    result.P[1] = Math.max(result.P[1], point.P)
    result.Mx[0] = Math.min(result.Mx[0], point.Mx)
    result.Mx[1] = Math.max(result.Mx[1], point.Mx)
    result.My[0] = Math.min(result.My[0], point.My)
    result.My[1] = Math.max(result.My[1], point.My)
  }
  return result
}

export const buildEquivalentBlockDesignSurfaceFromPrepared = (
  prepared: PreparedBlockAnalysis,
  options: EquivalentBlockAnalysisOptions,
  stationProbeAngles?: readonly number[]
): EquivalentBlockDesignSurface => prepared.designBasis.format === 'designMaterialReevaluation'
  ? prepared.designModel.buildNominalSurface(
      prepared.section,
      surfaceOptions(options, false, stationProbeAngles, prepared.designModel.blockLaw.depthFactor)
    )
  : prepared.designModel.buildDesignSurface(prepared.section, {
      ...surfaceOptions(options, false, stationProbeAngles, prepared.designModel.blockLaw.depthFactor),
      applyAxialCap: prepared.designBasis.axialCapEnabled
    })

export const buildEquivalentBlockPreviewSurfaceFromPrepared = (
  prepared: PreparedBlockAnalysis,
  options: EquivalentBlockAnalysisOptions,
  preparedDesignSurface?: EquivalentBlockDesignSurface,
  stationProbeAngles?: readonly number[]
): PreviewSurface => {
  const settings = surfaceOptions(
    options,
    false,
    stationProbeAngles,
    prepared.referenceModel.blockLaw.depthFactor
  )
  const nominal = prepared.referenceModel.buildNominalSurface(prepared.section, settings)
  const design = preparedDesignSurface ?? buildEquivalentBlockDesignSurfaceFromPrepared(
    prepared,
    options,
    stationProbeAngles
  )
  const beta1 = prepared.designModel.blockLaw.depthFactor
  const compressionStress = prepared.designModel.blockLaw.compressionStress
  const nominalStationDescriptors = blockStations(nominal, options.neutralAxisStations.values)
  const designStationDescriptors = blockStations(design, options.neutralAxisStations.values)
  const nominalPoints = convertSurfacePoints(
    nominal,
    prepared.section,
    prepared.referenceModel.blockLaw,
    prepared.referenceModel.blockLaw.depthFactor,
    prepared.referenceModel.blockLaw.compressionStress,
    false,
    options.neutralAxisStations.values
  )
  const points = convertSurfacePoints(
    design,
    prepared.section,
    prepared.designModel.blockLaw,
    beta1,
    compressionStress,
    prepared.designBasis.format === 'globalResultantFactor',
    options.neutralAxisStations.values
  )
  if (prepared.designBasis.format === 'designMaterialReevaluation') {
    const referenceEvaluator = prepared.referenceModel.bindNominalEvaluator(prepared.section)
    const referenceEndpoints = prepared.referenceModel.nominalEndpoints(prepared.section)
    const referenceCompressionPole = nominal.points.find((point) => point.kind === 'compression-pole')
    for (let index = 0; index < points.length; index += 1) {
      const designPoint = design.points[index]
      const referenceResultants = designPoint.state
        ? referenceEvaluator(designPoint.state).resultants
        : designPoint.kind === 'tension-pole'
          ? referenceEndpoints.tension.resultants
          : designPoint.kind === 'compression-pole'
            ? referenceCompressionPole?.resultants ?? referenceEndpoints.compression.resultants
            : designPoint.resultants
      points[index].resistance = {
        nominalReference: { ...referenceResultants },
        format: 'designMaterialReevaluation',
        factor: null,
        classification: 'design-material',
        controllingTensileStrain: null,
        yieldStrain: null,
        axialCapApplied: false,
        stages: ['reference-equivalent-block', 'design-material-reevaluation']
      }
    }
  }
  const nominalP0 = prepared.referenceModel.nominalEndpoints(prepared.section).compression.resultants
  const warnings = [
    ...(options.directions.refinement.type === 'adaptive' && !design.directionRefinementConverged
      ? ['Equivalent-block direction refinement did not reach its requested tolerance.']
      : []),
    ...(options.neutralAxisStations.refinement.type === 'adaptive' && !design.stationRefinementConverged
      ? ['Equivalent-block neutral-axis refinement did not reach its requested tolerance.']
      : []),
    ...(!design.topology.closed ? [`Equivalent-block surface is not closed (${design.topology.boundaryEdges} boundary edges).`] : []),
    ...(prepared.appendixPoleDivergesFromBlockLimit
      ? ['KDS Appendix 3.2(1) equations (3-2) and (3-3) carry no eta, so the concentric design axial strength closing this surface is above the equivalent block\'s own concentric limit. The final band up to that point is an interpolation between the two.']
      : [])
  ]
  const tolerance = options.directions.refinement.type === 'adaptive'
    ? options.directions.refinement.tolerance
    : 0
  const designSurface: PreviewSurfaceDataset = {
    points,
    triangles: design.triangles,
    directions: design.directions.map((angle) => wrap(Math.PI / 2 - angle)).sort((a, b) => a - b),
    stations: designStationDescriptors
  }
  const nominalSurface: PreviewSurfaceDataset = {
    points: nominalPoints,
    triangles: nominal.triangles,
    directions: nominal.directions.map((angle) => wrap(Math.PI / 2 - angle)).sort((a, b) => a - b),
    stations: nominalStationDescriptors
  }
  return {
    mechanics: 'equivalent-rectangular-block',
    points,
    nominalPoints,
    triangles: design.triangles,
    nominalTriangles: nominal.triangles,
    designSurface,
    nominalSurface,
    designFixed: designSurface,
    nominalFixed: nominalSurface,
    codeReferencePoints: [{
      id: 'nominal-p0',
      label: prepared.designBasis.format === 'designMaterialReevaluation'
        ? 'Characteristic concentric compression reference'
        : 'Nominal concentric compression P0',
      kind: 'code-endpoint',
      ...nominalP0
    }],
    sectionBoundaryPoints: sectionBoundaryPoints(prepared.section),
    bounds: bounds(points),
    mesh: {
      cellSize: 0,
      minCaliperWidth: prepared.section.characteristicLength,
      gridX: 0,
      gridY: 0,
      cells: 0,
      components: prepared.section.solids.length,
      triangles: 0,
      points: 0,
      exact: { area: prepared.section.grossArea, firstMomentX: 0, firstMomentY: 0 },
      meshed: { area: prepared.section.grossArea, firstMomentX: 0, firstMomentY: 0 },
      areaError: 0,
      firstMomentXError: 0,
      firstMomentYError: 0,
      discardedArea: 0,
      ok: true,
      warnings: ['No integration mesh: concrete compression is evaluated by exact polygon clipping.']
    },
    stations: designStationDescriptors,
    directions: design.directions.map((angle) => wrap(Math.PI / 2 - angle)).sort((a, b) => a - b),
    analysisOptions: cloneCalculationAnalysisOptions(options),
    directionError: {
      directions: design.directions.length,
      probedStations: design.stations.map((_, index) => index + 1),
      probedStationIds: designStationDescriptors.slice(1, -1).map((station) => station.id),
      maxRelativeP: design.maxDirectionalInterpolationError,
      maxRelativeMoment: design.maxDirectionalInterpolationError,
      maxRelativeComponent: design.maxDirectionalInterpolationError,
      worstBeta: design.worstDirection === undefined
        ? Number.NaN
        : wrap(Math.PI / 2 - design.worstDirection),
      refinementPasses: design.directionRefinementPasses,
      withinTolerance: design.directionRefinementConverged,
      tolerance
    },
    stationError: {
      stations: design.maxStationsPerDirection ?? design.stations.length + 2,
      fixedStations: options.neutralAxisStations.values.length + 2,
      minStations: design.minStationsPerDirection ?? design.stations.length + 2,
      maxStations: design.maxStationsPerDirection ?? design.stations.length + 2,
      averageStations: design.averageStationsPerDirection ?? design.stations.length + 2,
      totalStates: points.length,
      evaluations: design.evaluationCount ?? points.length,
      maxRelative: design.maxStationInterpolationError,
      refinementPasses: design.stationRefinementPasses,
      withinTolerance: design.stationRefinementConverged,
      tolerance: options.neutralAxisStations.refinement.type === 'adaptive'
        ? options.neutralAxisStations.refinement.tolerance
        : Number.POSITIVE_INFINITY
    },
    strainDomain: 'concrete-pivot-ultimate',
    warnings,
    designBasis: JSON.parse(JSON.stringify(prepared.designBasis)) as DesignBasis
  }
}

export const buildEquivalentBlockPreviewSurface = (
  profileId: CalculationProfileId,
  section: SectionGeometry,
  rebars: GeometryInputRebarView[],
  materialStore: MaterialStore,
  designBasis: DesignBasis,
  options: EquivalentBlockAnalysisOptions
) => buildEquivalentBlockPreviewSurfaceFromPrepared(
  prepareBlockAnalysis(profileId, section, rebars, materialStore, designBasis),
  options
)

const angularDistance = (left: number, right: number) => {
  const difference = Math.abs(wrap(left) - wrap(right))
  return Math.min(difference, TAU - difference)
}

/**
 * Evaluate the requested β exactly. The low-level closed mesher needs four support meridians for
 * topology, but only the requested meridian is returned and no angular interpolation enters it.
 */
export const buildEquivalentBlockExactDirectionCurveFromPrepared = (
  prepared: PreparedBlockAnalysis,
  options: EquivalentBlockAnalysisOptions,
  beta: number
): ExactDirectionCurve => {
  const normalizedBeta = wrap(beta)
  const exactOptions = cloneCalculationAnalysisOptions(options)
  exactOptions.directions.seedCount = 4
  exactOptions.directions.startDeg = wrap(Math.PI / 2 - normalizedBeta) * 180 / Math.PI
  if (exactOptions.samplingMode === 'adaptive') {
    const refinement = exactOptions.directions.refinement
    if (refinement.type !== 'adaptive') throw new Error('Adaptive mode requires adaptive directions.')
    exactOptions.directions.refinement = { ...refinement, maxPasses: 0, maxDirections: 4 }
  } else {
    exactOptions.neutralAxisStations.refinement = { type: 'fixed' }
    exactOptions.directions.refinement = { type: 'fixed' }
  }
  const exactNeutralAxisAngle = wrap(Math.PI / 2 - normalizedBeta)
  const surface = buildEquivalentBlockPreviewSurfaceFromPrepared(
    prepared,
    exactOptions,
    undefined,
    [exactNeutralAxisAngle]
  )
  const meridian = (points: PreviewSurfacePoint[]) => points
    .filter((point) =>
      point.surfaceRole === 'pure-compression' ||
      point.surfaceRole === 'pure-tension' ||
      (point.onSampledDirection !== false && angularDistance(point.beta, normalizedBeta) <= 1e-10)
    )
    .sort((left, right) => left.station - right.station)
  const designSurface = activeDesignSurfaceDataset(surface)
  const nominalSurface = activeNominalSurfaceDataset(surface)
  return {
    beta: normalizedBeta,
    designCurve: meridian(designSurface.points),
    nominalCurve: meridian(nominalSurface.points),
    designAdaptive: meridian(surface.points),
    designFixed: meridian(designSurface.points),
    nominalFixed: meridian(nominalSurface.points),
    stations: surface.stations,
    nominalStations: nominalSurface.stations,
    stationError: surface.stationError
  }
}

const evaluationTrace = (
  prepared: PreparedBlockAnalysis,
  state: BlockSectionState,
  evaluation: CapacityEvaluation
): EquivalentBlockStateTrace => {
  const source = (evaluation.source as { nominal?: NominalBlockEvaluation } | NominalBlockEvaluation | undefined)
  const nominal = source && 'nominal' in source ? source.nominal : source as NominalBlockEvaluation | undefined
  const base = blockTrace(
    prepared.section,
    state,
    prepared.model.blockLaw.depthFactor,
    prepared.model.blockLaw.compressionStress
  )!
  return nominal ? {
    ...base,
    concreteBlockArea: nominal.concrete.area,
    concreteForce: nominal.concrete.force,
    controllingTensileStrain: nominal.controllingTensileStrain,
    controllingBarId: nominal.controllingBarId,
    componentForceResidual: nominal.diagnostics.componentForceResidual,
    componentMomentXResidual: nominal.diagnostics.componentMomentXResidual,
    componentMomentYResidual: nominal.diagnostics.componentMomentYResidual
  } : base
}

const nominalEvaluationFrom = (evaluation: CapacityEvaluation | undefined) => {
  const source = evaluation?.source as { nominal?: NominalBlockEvaluation } | NominalBlockEvaluation | undefined
  return source && 'nominal' in source ? source.nominal : source as NominalBlockEvaluation | undefined
}

const blockAuditProvenance = (prepared: PreparedBlockAnalysis) => {
  if (prepared.profileId === 'aci-318-19-22-equivalent-block') return ACI_318_19_PROVENANCE
  if (prepared.profileId === 'as-3600-2018-amd2-equivalent-block') return AS_3600_2018_PROVENANCE
  if (prepared.profileId === 'custom-equivalent-block') return CUSTOM_BLOCK_PROVENANCE
  return {
    document: prepared.designBasis.identity.document,
    ...KDS_142020_PROVENANCE
  }
}

const blockAuditScale = (ledger: ResultantLedger, factor: number): ResultantLedger => {
  const scale = (value: { P: number; Mx: number; My: number }) => ({
    P: value.P * factor,
    Mx: value.Mx * factor,
    My: value.My * factor
  })
  return {
    concrete: scale(ledger.concrete),
    steelGross: scale(ledger.steelGross),
    displacedConcrete: scale(ledger.displacedConcrete),
    steel: scale(ledger.steel),
    total: scale(ledger.total)
  }
}

const blockAuditLedger = (
  evaluation: NominalBlockEvaluation,
  referencePoint: { x: number; y: number }
): ResultantLedger => {
  const concrete = {
    P: evaluation.concrete.force,
    Mx: evaluation.concrete.Mx,
    My: evaluation.concrete.My
  }
  const steelGross = { P: 0, Mx: 0, My: 0 }
  const displacedConcrete = { P: 0, Mx: 0, My: 0 }
  for (const bar of evaluation.bars) {
    const grossForce = bar.steelStress * bar.area
    const displacedForce = -bar.displacedConcreteStress * bar.area
    steelGross.P += grossForce
    steelGross.Mx += grossForce * (bar.y - referencePoint.y)
    steelGross.My += grossForce * (bar.x - referencePoint.x)
    displacedConcrete.P += displacedForce
    displacedConcrete.Mx += displacedForce * (bar.y - referencePoint.y)
    displacedConcrete.My += displacedForce * (bar.x - referencePoint.x)
  }
  const steel = {
    P: steelGross.P + displacedConcrete.P,
    Mx: steelGross.Mx + displacedConcrete.Mx,
    My: steelGross.My + displacedConcrete.My
  }
  return {
    concrete,
    steelGross,
    displacedConcrete,
    steel,
    total: {
      P: concrete.P + steel.P,
      Mx: concrete.Mx + steel.Mx,
      My: concrete.My + steel.My
    }
  }
}

/** Lazy exact-clipping calculation trace for one stored equivalent-block surface vertex. */
export const buildEquivalentBlockPointCalculationAudit = (
  prepared: PreparedBlockAnalysis,
  stage: CalculationAuditStage,
  point: PreviewSurfacePoint,
  stationDefinition: StationDefinition | null = null
): PointCalculationAudit => {
  if (point.surfaceRole === 'axial-cap') {
    const trace = point.axialCapTrace
    if (trace) {
      const expected = trace.source.crossing
      return {
        kind: 'axial-cap',
        pointId: point.id,
        stage,
        trace,
        displayedLedger: point.ledger,
        reconciliation: reconcileCalculationAuditResultant(
          expected,
          point,
          Math.max(1, Math.abs(trace.maximumAxialResistance), Math.abs(point.P)),
          Math.max(1, Math.abs(point.Mx / Math.max(1, point.P)), Math.abs(point.My / Math.max(1, point.P)))
        )
      }
    }
    return {
      kind: 'unavailable',
      pointId: point.id,
      stage,
      reason: 'synthetic-axial-cap',
      message: 'The maximum-axial-resistance cap is a geometric face and has no unique neutral-axis state. Audit the physical source station and the cap stage instead.'
    }
  }
  const trace = point.equivalentBlock
  if (!trace) {
    return {
      kind: 'unavailable',
      pointId: point.id,
      stage,
      reason: 'missing-physical-state',
      message: 'This pole/reference point has no unique neutral-axis depth. The software will not invent a block geometry for it.'
    }
  }
  const blockState: BlockSectionState = {
    neutralAxisAngle: trace.neutralAxisAngle,
    neutralAxisDepth: trace.neutralAxisDepth
  }
  const evaluation = stage === 'nominal'
    ? prepared.referenceModel.bindNominalEvaluator(prepared.section)(blockState)
    : prepared.designBasis.format === 'designMaterialReevaluation'
      ? prepared.designModel.bindNominalEvaluator(prepared.section)(blockState)
      : prepared.designModel.bindDesignEvaluator(prepared.section)(blockState)
  const nominal = nominalEvaluationFrom(evaluation)
  if (!nominal) {
    throw new AnalysisInputError(
      'AUDIT_RECONCILIATION_FAILED',
      'The equivalent-block evaluator did not retain its nominal component calculation.',
      { pointId: point.id }
    )
  }
  const zero = () => ({ P: 0, Mx: 0, My: 0 })
  const add = (target: { P: number; Mx: number; My: number }, value: { P: number; Mx: number; My: number }) => {
    target.P += value.P
    target.Mx += value.Mx
    target.My += value.My
  }
  const concrete = {
    P: nominal.concrete.force,
    Mx: nominal.concrete.Mx,
    My: nominal.concrete.My
  }
  const steelGross = zero()
  const displacedConcrete = zero()
  const materialSets = buildResistanceMaterialSets(prepared.materialStore, prepared.designBasis)
  const calculationMaterials = stage === 'nominal'
    ? materialSets.referenceMaterials
    : prepared.designBasis.format === 'designMaterialReevaluation'
      ? materialSets.designMaterials
      : materialSets.referenceMaterials
  const rebars: CalculationAuditRebar[] = nominal.bars.map((bar) => {
    const source = prepared.rebars.find((candidate) => String(candidate.id) === bar.id)
    if (!source) {
      throw new AnalysisInputError('AUDIT_RECONCILIATION_FAILED', `Equivalent-block audit rebar ${bar.id} is missing from the input.`, { pointId: point.id })
    }
    const grossForce = bar.steelStress * bar.area
    const displacedForce = -bar.displacedConcreteStress * bar.area
    const gross = {
      P: grossForce,
      Mx: grossForce * (bar.y - prepared.section.referencePoint.y),
      My: grossForce * (bar.x - prepared.section.referencePoint.x)
    }
    const displaced = {
      P: displacedForce,
      Mx: displacedForce * (bar.y - prepared.section.referencePoint.y),
      My: displacedForce * (bar.x - prepared.section.referencePoint.x)
    }
    const net = {
      P: gross.P + displaced.P,
      Mx: gross.Mx + displaced.Mx,
      My: gross.My + displaced.My
    }
    add(steelGross, gross)
    add(displacedConcrete, displaced)
    return {
      id: source.id,
      diameter: source.dia,
      steelMaterialId: source.steelMaterialId ?? calculationMaterials.defaults.steelMaterialId,
      x: bar.x - prepared.section.referencePoint.x,
      y: bar.y - prepared.section.referencePoint.y,
      area: bar.area,
      strain: bar.strain,
      stress: bar.netStress,
      force: bar.force,
      Mx: bar.Mx,
      My: bar.My,
      steelStress: bar.steelStress,
      displacedConcreteStress: -bar.displacedConcreteStress,
      netStress: bar.netStress,
      steelGross: gross,
      displacedConcrete: displaced,
      net
    }
  })
  const steel = {
    P: steelGross.P + displacedConcrete.P,
    Mx: steelGross.Mx + displacedConcrete.Mx,
    My: steelGross.My + displacedConcrete.My
  }
  const mechanicalLedger: ResultantLedger = {
    concrete,
    steelGross,
    displacedConcrete,
    steel,
    total: {
      P: concrete.P + steel.P,
      Mx: concrete.Mx + steel.Mx,
      My: concrete.My + steel.My
    }
  }
  const resistanceFactor = stage === 'design' && prepared.designBasis.format === 'globalResultantFactor'
    ? point.resistance?.factor ?? null
    : null
  if (stage === 'design' && prepared.designBasis.format === 'globalResultantFactor' && resistanceFactor === null) {
    throw new AnalysisInputError(
      'AUDIT_RECONCILIATION_FAILED',
      'A Design equivalent-block state has no stored strength-reduction factor.',
      { pointId: point.id }
    )
  }
  const displayedLedger = resistanceFactor === null
    ? mechanicalLedger
    : blockAuditScale(mechanicalLedger, resistanceFactor)
  const nominalReferenceEvaluation = nominalEvaluationFrom(
    prepared.referenceModel.bindNominalEvaluator(prepared.section)(blockState)
  )
  if (!nominalReferenceEvaluation) {
    throw new AnalysisInputError(
      'AUDIT_RECONCILIATION_FAILED',
      'The reference equivalent-block evaluator did not retain its component calculation.',
      { pointId: point.id }
    )
  }
  const nominalReferenceLedger = blockAuditLedger(
    nominalReferenceEvaluation,
    prepared.section.referencePoint
  )
  const storedNominalReference = stage === 'nominal'
    ? point.ledger.total
    : point.resistance?.nominalReference
  if (!storedNominalReference) {
    throw new AnalysisInputError(
      'AUDIT_RECONCILIATION_FAILED',
      'A Design equivalent-block point has no stored nominal/reference resultant.',
      { pointId: point.id }
    )
  }
  const forceScale = Math.max(1, Math.abs(mechanicalLedger.total.P), nominal.concrete.stress * prepared.section.grossArea)
  const nominalReferenceReconciliation = reconcileCalculationAuditResultant(
    nominalReferenceLedger.total,
    storedNominalReference,
    forceScale,
    prepared.section.characteristicLength
  )
  const reconciliation = reconcileCalculationAuditResultant(
    displayedLedger.total,
    { P: point.P, Mx: point.Mx, My: point.My },
    forceScale,
    prepared.section.characteristicLength
  )
  if (!nominalReferenceReconciliation.ok || !reconciliation.ok) {
    throw new AnalysisInputError(
      'AUDIT_RECONCILIATION_FAILED',
      `The exact-block audit does not reproduce its stored reference/selected result (relative deltas ${nominalReferenceReconciliation.relativeMaximum}/${reconciliation.relativeMaximum}).`,
      { pointId: point.id, nominalReferenceReconciliation, reconciliation }
    )
  }
  const depth = nominal.diagnostics.projectedSectionDepth
  const blockDepth = nominal.state.blockDepth
  const profileDepths = [...Array.from({ length: 41 }, (_, index) => depth * index / 40), blockDepth]
    .filter((value) => value >= 0 && value <= depth)
    .sort((left, right) => left - right)
    .filter((value, index, values) => index === 0 || Math.abs(value - values[index - 1]) > 1e-10 * Math.max(1, depth))
  const samples: CalculationAuditDepthProfile['samples'] = profileDepths.flatMap((sampleDepth) => {
    const sample = {
      depth: sampleDepth,
      strain: nominal.diagnostics.extremeCompressionStrain * (1 - sampleDepth / blockState.neutralAxisDepth),
      stress: sampleDepth <= blockDepth ? nominal.concrete.stress : 0
    }
    return Math.abs(sampleDepth - blockDepth) <= 1e-10 * Math.max(1, depth) && blockDepth < depth
      ? [sample, { ...sample, stress: 0 }]
      : [sample]
  })
  const depthProfileBasis = {
    normalX: Math.cos(blockState.neutralAxisAngle),
    normalY: Math.sin(blockState.neutralAxisAngle),
    tensionEdgeProjection: nominal.diagnostics.compressionEdgeProjection - depth - (
      Math.cos(blockState.neutralAxisAngle) * prepared.section.referencePoint.x +
      Math.sin(blockState.neutralAxisAngle) * prepared.section.referencePoint.y
    ),
    compressionEdgeProjection: nominal.diagnostics.compressionEdgeProjection - (
      Math.cos(blockState.neutralAxisAngle) * prepared.section.referencePoint.x +
      Math.sin(blockState.neutralAxisAngle) * prepared.section.referencePoint.y
    ),
    projectedSectionDepth: depth,
    neutralAxisProjection: nominal.diagnostics.neutralAxisProjection - (
      Math.cos(blockState.neutralAxisAngle) * prepared.section.referencePoint.x +
      Math.sin(blockState.neutralAxisAngle) * prepared.section.referencePoint.y
    ),
    neutralAxisDepth: blockState.neutralAxisDepth,
    neutralAxisInsideSection: blockState.neutralAxisDepth <= depth,
    samples
  }
  const originStrainContext = (() => {
    if (
      stationDefinition?.kind === 'neutral-axis-depth-ratio' ||
      stationDefinition?.kind === 'block-depth-ratio'
    ) {
      return {
        kind: 'depth-ratio' as const,
        criterionLabel: stationDefinitionLabel(stationDefinition),
        ratio: stationDefinition.ratio
      }
    }
    if (stationDefinition?.kind !== 'bar-tension-yield-ratio') {
      return {
        kind: 'resolved-compatible-state' as const,
        criterionLabel: stationDefinition ? stationDefinitionLabel(stationDefinition) : null
      }
    }
    const controllingBar = nominal.controllingBarId === undefined
      ? undefined
      : nominal.bars.find((bar) => bar.id === nominal.controllingBarId)
    const sourceRebar = controllingBar
      ? prepared.rebars.find((bar) => String(bar.id) === controllingBar.id)
      : undefined
    const steelMaterialId = sourceRebar?.steelMaterialId ?? calculationMaterials.defaults.steelMaterialId
    const steel = calculationMaterials.steel.find((material) => material.id === steelMaterialId)
    if (!controllingBar || controllingBar.yieldStrain === undefined || !steel) {
      return {
        kind: 'resolved-compatible-state' as const,
        criterionLabel: stationDefinitionLabel(stationDefinition)
      }
    }
    const effectiveYieldStress = effectiveSteelYieldStress(steel)
    const yieldFromStress = effectiveYieldStress / steel.elasticModulus
    const yieldStrainBasis = Math.abs(controllingBar.yieldStrain - yieldFromStress) <=
      1e-12 * Math.max(1, Math.abs(controllingBar.yieldStrain))
      ? 'effective-yield-stress-over-elastic-modulus' as const
      : 'declared-material-limit' as const
    return {
      kind: 'controlling-bar-strain' as const,
      criterionLabel: stationDefinitionLabel(stationDefinition),
      ratio: stationDefinition.ratio,
      controllingRebarId: Number(controllingBar.id),
      steelMaterialId,
      effectiveYieldStress,
      elasticModulus: steel.elasticModulus,
      yieldStrain: controllingBar.yieldStrain,
      yieldStrainBasis,
      requestedSteelStrain: -stationDefinition.ratio * controllingBar.yieldStrain,
      controllingSteelStrain: controllingBar.strain,
      controllingBarProjection: depthProfileBasis.compressionEdgeProjection - controllingBar.projectedDepth,
      compressionEdgeToBarDepth: controllingBar.projectedDepth
    }
  })()
  const depthProfile: CalculationAuditDepthProfile = {
    ...depthProfileBasis,
    originStrainTrace: buildCalculationAuditOriginStrainTrace(
      depthProfileBasis,
      samples[0].strain,
      originStrainContext
    )
  }
  return {
    kind: 'equivalent-block',
    pointId: point.id,
    stage,
    origin: { ...prepared.section.referencePoint },
    state: { ...point.state },
    depthProfile,
    provenance: blockAuditProvenance(prepared),
    block: {
      neutralAxisAngle: blockState.neutralAxisAngle,
      neutralAxisDepth: blockState.neutralAxisDepth,
      projectedSectionDepth: depth,
      extremeCompressionStrain: nominal.diagnostics.extremeCompressionStrain,
      beta1: nominal.state.blockDepth / blockState.neutralAxisDepth,
      blockDepth: nominal.state.blockDepth,
      compressionStress: nominal.concrete.stress,
      compressionEdgeProjection: nominal.diagnostics.compressionEdgeProjection,
      neutralAxisProjection: nominal.diagnostics.neutralAxisProjection,
      blockBoundaryProjection: nominal.diagnostics.blockBoundaryProjection,
      area: nominal.concrete.area,
      centroidX: nominal.concrete.centroid.x - prepared.section.referencePoint.x,
      centroidY: nominal.concrete.centroid.y - prepared.section.referencePoint.y,
      geometry: nominal.concrete.geometry,
      resultant: concrete
    },
    steelLaws: calculationMaterials.steel.map((material) => ({
      materialId: material.id,
      name: material.name,
      law: describeSteelMaterialLaw(material)
    })),
    rebars,
    mechanicalLedger,
    nominalReferenceLedger,
    displayedLedger,
    resistanceFactor,
    nominalReferenceReconciliation,
    reconciliation
  }
}

const evaluateBlockAdmissibility = (
  prepared: PreparedBlockAnalysis,
  state: BlockSectionState | undefined,
  nominal: NominalBlockEvaluation | undefined,
  codeEnvelopeAccepted: boolean
): StrainAdmissibility => {
  const concreteLimit = prepared.model.blockLaw.extremeCompressionStrain
  if (!state || !nominal) {
    return {
      evaluated: false,
      ok: codeEnvelopeAccepted,
      maxConcreteCompression: 0,
      concreteLimit,
      maxSteelTension: 0,
      steelTensionLimit: null,
      violations: []
    }
  }
  const strain = strainState(prepared.section, state, prepared.model.blockLaw)
  let maxConcreteCompression = 0
  for (const solid of prepared.section.solids) {
    for (const point of solid.outer) {
      const localX = point.x - prepared.section.referencePoint.x
      const localY = point.y - prepared.section.referencePoint.y
      maxConcreteCompression = Math.max(
        maxConcreteCompression,
        strain.e0 + strain.kx * localY + strain.ky * localX
      )
    }
  }
  let maxSteelTension = 0
  let steelTensionLimit: number | null = null
  const violations: StrainAdmissibility['violations'] = []
  for (const bar of nominal.bars) {
    maxSteelTension = Math.max(maxSteelTension, Math.max(0, -bar.strain))
    if (bar.ultimateStrain === undefined) continue
    steelTensionLimit = steelTensionLimit === null
      ? bar.ultimateStrain
      : Math.min(steelTensionLimit, bar.ultimateStrain)
    if (Math.abs(bar.strain) <= bar.ultimateStrain * (1 + 1e-9)) continue
    const sourceBar = prepared.rebars.find((candidate) => String(candidate.id) === bar.id)
    violations.push({
      code: 'STEEL_STRAIN_EXCEEDS_ULTIMATE',
      rebarId: sourceBar?.id ?? Number(bar.id),
      value: bar.strain,
      limit: bar.ultimateStrain
    })
  }
  if (maxConcreteCompression > concreteLimit * (1 + 1e-9)) {
    violations.unshift({
      code: 'CONCRETE_STRAIN_EXCEEDS_ULTIMATE',
      value: maxConcreteCompression,
      limit: concreteLimit
    })
  }
  return {
    evaluated: true,
    ok: violations.length === 0,
    maxConcreteCompression,
    concreteLimit,
    maxSteelTension,
    steelTensionLimit,
    violations
  }
}

const solveEquivalentBlockDemandRaw = (
  prepared: PreparedBlockAnalysis,
  options: EquivalentBlockAnalysisOptions,
  loadcase: LoadCombination,
  preparedDesignSurface?: EquivalentBlockDesignSurface
): InversePreviewResult => {
  const designSurface = preparedDesignSurface ?? buildEquivalentBlockDesignSurfaceFromPrepared(prepared, options)
  const evaluator = (
    prepared.designBasis.format === 'designMaterialReevaluation'
      ? prepared.designModel.bindNominalEvaluator(prepared.section)
      : prepared.designModel.bindDesignEvaluator(prepared.section)
  ) as CapacityEvaluator
  const solved = solveProportionalRayCapacity(designSurface, loadcase, evaluator)
  const fixedAxial = Math.hypot(loadcase.Mx, loadcase.My) > 0
    ? solveFixedAxialCapacity(
        prepared.section,
        evaluator,
        loadcase.P,
        { Mx: loadcase.Mx, My: loadcase.My },
        {
          axialCap: designSurface.axialCap,
          eventStations: designSurface.stations,
          extremeCompressionStrain: prepared.model.blockLaw.extremeCompressionStrain,
          steelLaws: prepared.model.steelLaws
        }
      )
    : null
  const diagnostic = solved.refinement
  const state = diagnostic?.state ?? solved.state
  const response = diagnostic?.capacity ?? solved.capacity ?? { P: 0, Mx: 0, My: 0 }
  const lambda = diagnostic?.loadFactor ?? solved.loadFactor ?? 0
  const target = { P: lambda * loadcase.P, Mx: lambda * loadcase.Mx, My: lambda * loadcase.My }
  const residual = diagnostic?.residual ?? {
    P: response.P - target.P,
    Mx: response.Mx - target.Mx,
    My: response.My - target.My
  }
  const strain = strainState(prepared.section, state, prepared.model.blockLaw)
  const exact = state ? evaluator(state) : undefined
  const nominal = nominalEvaluationFrom(exact)
  const metadata = exact?.metadata
  const factor = typeof metadata?.phi === 'number' ? metadata.phi : null
  const equivalentBlock = state && exact ? evaluationTrace(prepared, state, exact) : null
  const utilization = solved.utilization ?? null
  const converged = solved.status === 'converged' || solved.status === 'cap-face-governed'
  const admissibility = evaluateBlockAdmissibility(
    prepared,
    state,
    nominal,
    solved.status === 'cap-face-governed'
  )
  const referenceAtState = state
    ? prepared.referenceModel.bindNominalEvaluator(prepared.section)(state).resultants
    : response
  const resistance: DesignResistanceTrace | null = converged
    ? prepared.designBasis.format === 'designMaterialReevaluation'
      ? {
          nominalReference: { ...referenceAtState },
          format: 'designMaterialReevaluation',
          factor: null,
          classification: 'design-material',
          controllingTensileStrain: equivalentBlock?.controllingTensileStrain ?? null,
          yieldStrain: null,
          axialCapApplied: false,
          stages: ['Reference equivalent block', 'Design-material reevaluation']
        }
      : {
          nominalReference: exact && factor ? {
            P: exact.resultants.P / factor,
            Mx: exact.resultants.Mx / factor,
            My: exact.resultants.My / factor
          } : response,
          format: 'globalResultantFactor',
          factor,
          classification: (metadata?.classification as DesignResistanceTrace['classification']) ?? 'compression-controlled',
          controllingTensileStrain: equivalentBlock?.controllingTensileStrain ?? null,
          yieldStrain: null,
          axialCapApplied: solved.status === 'cap-face-governed',
          stages: solved.status === 'cap-face-governed'
            ? ['Nominal equivalent block', 'Code strength reduction', 'Maximum axial design strength cap']
            : ['Nominal equivalent block', 'Code strength reduction']
        }
    : null
  return {
    ok: converged && utilization !== null && admissibility.ok,
    converged,
    admissibility,
    loadcaseId: loadcase.id,
    demand: loadcase,
    state: strain,
    response,
    residual,
    residualNorm: solved.residualNorm ?? 0,
    iterations: solved.iterations,
    utilization,
    proportionalUtilization: utilization,
    fixedPUtilization: fixedAxial?.utilization ?? null,
    designCapacityPoint: solved.capacity ?? null,
    resistance,
    equivalentBlock,
    contourPoint: null,
    message: solved.status === 'cap-face-governed'
      ? 'Factored ULS demand is governed by the code axial-cap face; no unique physical neutral-axis state exists on that face.'
      : solved.status === 'mesh-fallback'
        ? 'An approximate capacity was found on the faceted surface, but exact equilibrium refinement did not converge. The result is not accepted as an equilibrium state.'
      : converged
        ? 'Factored ULS demand checked by the equivalent-block proportional-ray solver.'
        : 'No intersection was found on the equivalent-block design surface.'
  }
}

export const solveEquivalentBlockDemandFromPrepared = (
  prepared: PreparedBlockAnalysis,
  options: EquivalentBlockAnalysisOptions,
  loadcase: LoadCombination,
  preparedDesignSurface?: EquivalentBlockDesignSurface
): InversePreviewResult => {
  const designSurface = preparedDesignSurface ?? buildEquivalentBlockDesignSurfaceFromPrepared(prepared, options)
  const boundary = sectionBoundaryPoints(prepared.section)
  const candidates = minimumEccentricityCandidates(prepared.designBasis, loadcase, (nx, ny) =>
    projectedBoundaryDepth(boundary, nx, ny))
  if (candidates.length === 0) {
    return solveEquivalentBlockDemandRaw(prepared, options, loadcase, designSurface)
  }

  const solved = candidates.map((candidate) => {
    const adjusted = { ...loadcase, Mx: candidate.Mx, My: candidate.My }
    const result = solveEquivalentBlockDemandRaw(prepared, options, adjusted, designSurface)
    return {
      ...result,
      demand: loadcase,
      codeAdjustedDemand: adjusted,
      minimumEccentricityMm: candidate.eccentricityMm,
      message: `${result.message} ${minimumEccentricityMessage(candidate.eccentricityMm)}`
    }
  })
  return solved.reduce((governing, candidate) =>
    (candidate.proportionalUtilization ?? Number.POSITIVE_INFINITY) >
    (governing.proportionalUtilization ?? Number.POSITIVE_INFINITY)
      ? candidate
      : governing
  )
}

/**
 * Solve a load-combination batch against one loadcase-independent design surface.
 *
 * Keeping construction here makes surface reuse the default for reports and batch consumers.
 */
export const solveEquivalentBlockDemandsFromPrepared = (
  prepared: PreparedBlockAnalysis,
  options: EquivalentBlockAnalysisOptions,
  loadcases: readonly LoadCombination[],
  preparedDesignSurface?: EquivalentBlockDesignSurface
): InversePreviewResult[] => {
  if (loadcases.length === 0) return []
  const designSurface =
    preparedDesignSurface ?? buildEquivalentBlockDesignSurfaceFromPrepared(prepared, options)
  return loadcases.map((loadcase) =>
    solveEquivalentBlockDemandFromPrepared(prepared, options, loadcase, designSurface)
  )
}

export const buildEquivalentBlockFieldMapFromPrepared = (
  prepared: PreparedBlockAnalysis,
  state: BlockSectionState
): SectionFieldMap => {
  const nominalEvaluation = prepared.model.bindNominalEvaluator(prepared.section)(state)
  const nominal = nominalEvaluation.source as NominalBlockEvaluation
  const strain = strainState(prepared.section, state, prepared.model.blockLaw)
  const at = (x: number, y: number) => {
    const localX = x - prepared.section.referencePoint.x
    const localY = y - prepared.section.referencePoint.y
    return strain.e0 + strain.kx * localY + strain.ky * localX
  }
  const rebars = prepared.rebars.map((bar) => {
    const barStrain = at(bar.x, bar.y)
    const steelLawId = String(bar.steelMaterialId ?? prepared.materialStore.defaults.steelMaterialId)
    const stress = prepared.model.steelLaws[steelLawId].stressAt(barStrain)
    const area = Math.PI * bar.dia ** 2 / 4
    return { id: bar.id, x: bar.x, y: bar.y, dia: bar.dia, area, strain: barStrain, stress, force: stress * area }
  })
  return {
    mechanics: 'equivalent-rectangular-block',
    origin: { ...prepared.section.referencePoint },
    samples: [],
    triangles: [],
    rebars,
    bounds: {
      minX: prepared.section.bounds.minX,
      maxX: prepared.section.bounds.maxX,
      minY: prepared.section.bounds.minY,
      maxY: prepared.section.bounds.maxY
    },
    mesh: {
      cellSize: 0,
      minCaliperWidth: prepared.section.characteristicLength,
      gridX: 0,
      gridY: 0,
      cells: 0,
      components: prepared.section.solids.length,
      triangles: 0,
      points: 0,
      exact: { area: prepared.section.grossArea, firstMomentX: 0, firstMomentY: 0 },
      meshed: { area: prepared.section.grossArea, firstMomentX: 0, firstMomentY: 0 },
      areaError: 0,
      firstMomentXError: 0,
      firstMomentYError: 0,
      discardedArea: 0,
      ok: true,
      warnings: ['No mesh: strain is analytic and concrete compression uses exact block clipping.']
    },
    equivalentBlock: {
      neutralAxisAngle: state.neutralAxisAngle,
      neutralAxisDepth: state.neutralAxisDepth,
      blockDepth: prepared.model.blockLaw.depthFactor * state.neutralAxisDepth,
      compressionStress: prepared.model.blockLaw.compressionStress,
      geometry: nominal.concrete.geometry
    }
  }
}
