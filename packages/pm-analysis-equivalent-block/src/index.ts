import {
  stationDefinitionLabel,
  type DesignResistanceTrace,
  type EquivalentBlockStateTrace,
  type InversePreviewResult,
  type PreviewSurface,
  type PreviewSurfacePoint,
  type ResultantLedger,
  type SectionFieldMap,
  type StrainAdmissibility,
  type StrainState,
  type SurfaceStation
} from '@pm/analysis'
import { createAci318Model } from '@pm/code-aci318'
import { createKds142020Model } from '@pm/code-kds142020'
import type { DesignBasis, GlobalStrengthReductionBasis } from '@pm/design'
import {
  prepareEquivalentBlockSection,
  projectedOuterExtents,
  solveFixedAxialCapacity,
  solveProportionalRayCapacity,
  type BlockSectionState,
  type CapacityEvaluation,
  type CapacityEvaluator,
  type CapacitySurface,
  type NominalBlockEvaluation,
  type PreparedEquivalentBlockSection
} from '@pm/equivalent-block'
import { buildConcreteMesh, netConcreteCentroid, type GeometryInputRebarView, type SectionGeometry } from '@pm/geometry'
import type { MaterialStore } from '@pm/materials'
import {
  cloneCalculationAnalysisOptions,
  type CalculationProfileId,
  type EquivalentBlockAnalysisOptions,
  type LoadCombination
} from '@pm/project'

export type PreparedBlockAnalysis = {
  profileId: Exclude<CalculationProfileId, 'kds-2024-stress-strain'>
  section: PreparedEquivalentBlockSection
  materialStore: MaterialStore
  designBasis: GlobalStrengthReductionBasis
  model: ReturnType<typeof createAci318Model> | ReturnType<typeof createKds142020Model>
  geometry: SectionGeometry
  rebars: GeometryInputRebarView[]
}

/** Worker-cacheable core surface. It is independent of any load combination. */
export type EquivalentBlockDesignSurface = CapacitySurface

const TAU = 2 * Math.PI
const wrap = (angle: number) => ((angle % TAU) + TAU) % TAU

const assertBlockBasis = (basis: DesignBasis): GlobalStrengthReductionBasis => {
  if (basis.format !== 'globalResultantFactor') {
    throw new Error('Equivalent-block analysis requires a global resultant strength-reduction basis.')
  }
  return basis
}

export const prepareBlockAnalysis = (
  profileId: CalculationProfileId,
  section: SectionGeometry,
  rebars: GeometryInputRebarView[],
  materialStore: MaterialStore,
  designBasis: DesignBasis
): PreparedBlockAnalysis => {
  if (profileId === 'kds-2024-stress-strain') {
    throw new Error('The stress–strain profile cannot be routed to the equivalent-block backend.')
  }
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
  const basis = assertBlockBasis(designBasis)
  const steel = Object.fromEntries(materialStore.steel.map((item) => {
    if (item.stressStrain.type !== 'elastic-perfectly-plastic') {
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
  const model = profileId === 'aci-318-19-22-equivalent-block'
    ? (() => {
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
      })()
    : (() => {
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
      })()
  return { profileId, section: preparedSection, materialStore, designBasis: basis, model, geometry: section, rebars }
}

const surfaceOptions = (options: EquivalentBlockAnalysisOptions) => ({
  stations: options.neutralAxisStations.values,
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
    ? options.neutralAxisStations.refinement.maxStations
    : options.neutralAxisStations.values.length
})

const projectedDepth = (section: PreparedEquivalentBlockSection, angle: number) => {
  const nx = Math.cos(angle)
  const ny = Math.sin(angle)
  return projectedOuterExtents(section, nx, ny).depth
}

const strainState = (
  section: PreparedEquivalentBlockSection,
  state: BlockSectionState | undefined,
  extremeCompressionStrain: number
): StrainState => {
  if (!state) return { e0: 0, kx: 0, ky: 0 }
  const nx = Math.cos(state.neutralAxisAngle)
  const ny = Math.sin(state.neutralAxisAngle)
  const edge = projectedOuterExtents(section, nx, ny).maximum
  const neutralAxis = edge - state.neutralAxisDepth
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

const nearestStation = (
  surface: CapacitySurface,
  section: PreparedEquivalentBlockSection,
  point: CapacitySurface['points'][number],
  epsCu: number
) => {
  const state = point.state
  if (!state) return 0
  if (point.station) {
    const sourceKey = point.station.type === 'depth-ratio'
      ? `${point.station.type}:${point.station.ratio}`
      : `${point.station.type}:${point.station.strain}`
    const exactIndex = surface.stations.findIndex((station) => {
      const key = station.type === 'depth-ratio'
        ? `${station.type}:${station.ratio}`
        : `${station.type}:${station.strain}`
      return key === sourceKey
    })
    if (exactIndex >= 0) return exactIndex + 1
  }
  const ratio = state.neutralAxisDepth / projectedDepth(section, state.neutralAxisAngle)
  const stationRatio = (station: CapacitySurface['stations'][number]) => station.type === 'depth-ratio'
    ? station.ratio
    : 1 / (1 + station.strain / epsCu)
  let best = 0
  for (let index = 1; index < surface.stations.length; index += 1) {
    if (Math.abs(stationRatio(surface.stations[index]) - ratio) < Math.abs(stationRatio(surface.stations[best]) - ratio)) best = index
  }
  return best + 1
}

const convertSurfacePoints = (
  surface: CapacitySurface,
  section: PreparedEquivalentBlockSection,
  epsCu: number,
  beta1: number,
  compressionStress: number,
  includeResistance = false
): PreviewSurfacePoint[] => surface.points.map((point) => {
  const state = strainState(section, point.state, epsCu)
  const beta = point.state ? wrap(Math.PI / 2 - point.state.neutralAxisAngle) : 0
  const resultants = point.resultants
  const station = nearestStation(surface, section, point, epsCu)
  return {
    id: `block-${point.kind}-${point.id}`,
    beta,
    station: point.kind === 'tension-pole'
      ? 0
      : point.kind === 'compression-pole'
        ? surface.stations.length + 1
        : station,
    stationId: point.kind === 'tension-pole'
      ? 'pure-tension'
      : point.kind === 'compression-pole'
        ? 'pure-compression'
        : `station-${station}`,
    state,
    ledger: zeroLedger(resultants),
    ...resultants,
    equivalentBlock: blockTrace(section, point.state, beta1, compressionStress),
    resistance: includeResistance ? resistanceTrace(point) : undefined
  }
})

const blockStations = (surface: CapacitySurface): SurfaceStation[] => [
  { id: 'pure-tension', label: 'Pure tension', definition: { kind: 'pure-tension' } },
  ...surface.stations.map((station, index) => {
    const definition = station.type === 'depth-ratio'
      ? { kind: 'block-depth-ratio' as const, ratio: station.ratio }
      : station.type === 'bar-tension-strain'
        ? { kind: 'bar-tension-strain' as const, strain: station.strain }
        : { kind: 'extreme-tension-strain' as const, strain: station.strain }
    return { id: `station-${index + 1}` as const, label: stationDefinitionLabel(definition), definition }
  }),
  { id: 'pure-compression', label: 'Pure compression', definition: { kind: 'pure-compression' } }
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
  options: EquivalentBlockAnalysisOptions
): EquivalentBlockDesignSurface => prepared.model.buildDesignSurface(prepared.section, {
  ...surfaceOptions(options),
  applyAxialCap: prepared.designBasis.axialCapEnabled
})

export const buildEquivalentBlockPreviewSurfaceFromPrepared = (
  prepared: PreparedBlockAnalysis,
  options: EquivalentBlockAnalysisOptions,
  preparedDesignSurface?: EquivalentBlockDesignSurface
): PreviewSurface => {
  const settings = surfaceOptions(options)
  const nominal = prepared.model.buildNominalSurface(prepared.section, settings)
  const design = preparedDesignSurface ?? buildEquivalentBlockDesignSurfaceFromPrepared(prepared, options)
  const epsCu = prepared.model.blockLaw.extremeCompressionStrain
  const beta1 = prepared.model.blockLaw.depthFactor
  const compressionStress = prepared.model.blockLaw.compressionStress
  const nominalPoints = convertSurfacePoints(nominal, prepared.section, epsCu, beta1, compressionStress)
  const points = convertSurfacePoints(design, prepared.section, epsCu, beta1, compressionStress, true)
  const nominalP0 = prepared.model.nominalEndpoints(prepared.section).compression.resultants
  const warnings = [
    ...(!design.directionRefinementConverged ? ['Equivalent-block direction refinement did not reach its requested tolerance.'] : []),
    ...(!design.stationRefinementConverged ? ['Equivalent-block neutral-axis refinement did not reach its requested tolerance.'] : []),
    ...(!design.topology.closed ? [`Equivalent-block surface is not closed (${design.topology.boundaryEdges} boundary edges).`] : [])
  ]
  const tolerance = options.directions.refinement.type === 'adaptive'
    ? options.directions.refinement.tolerance
    : 0
  return {
    mechanics: 'equivalent-rectangular-block',
    points,
    nominalPoints,
    triangles: design.triangles,
    nominalTriangles: nominal.triangles,
    codeReferencePoints: [{
      id: 'nominal-p0',
      label: 'Nominal concentric compression P0',
      kind: 'code-endpoint',
      ...nominalP0
    }],
    bounds: bounds(points),
    comparison: {
      workbook: 'Independent exact polygon-clipping equivalent-block backend',
      notes: ['Compression-positive; moments are reported about the net-concrete centroid.']
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
      warnings: ['No integration mesh: concrete compression is evaluated by exact polygon clipping.']
    },
    stations: blockStations(design),
    directions: design.directions.map((angle) => wrap(Math.PI / 2 - angle)).sort((a, b) => a - b),
    analysisOptions: cloneCalculationAnalysisOptions(options),
    directionError: {
      directions: design.directions.length,
      probedStations: design.stations.map((_, index) => index + 1),
      probedStationIds: design.stations.map((_, index) => `station-${index + 1}` as const),
      maxRelativeP: design.maxDirectionalInterpolationError,
      maxRelativeMoment: design.maxDirectionalInterpolationError,
      worstBeta: 0,
      refinementPasses: 0,
      withinTolerance: design.directionRefinementConverged,
      tolerance
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
  const strain = strainState(prepared.section, state, concreteLimit)
  let maxConcreteCompression = 0
  for (const solid of prepared.section.solids) {
    for (const point of solid.outer) {
      maxConcreteCompression = Math.max(
        maxConcreteCompression,
        strain.e0 + strain.kx * point.y + strain.ky * point.x
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

export const solveEquivalentBlockDemandFromPrepared = (
  prepared: PreparedBlockAnalysis,
  options: EquivalentBlockAnalysisOptions,
  loadcase: LoadCombination,
  preparedDesignSurface?: EquivalentBlockDesignSurface
): InversePreviewResult => {
  const designSurface = preparedDesignSurface ?? buildEquivalentBlockDesignSurfaceFromPrepared(prepared, options)
  const evaluator = prepared.model.bindDesignEvaluator(prepared.section) as CapacityEvaluator
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
  const strain = strainState(prepared.section, state, prepared.model.blockLaw.extremeCompressionStrain)
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
  const resistance: DesignResistanceTrace | null = converged ? {
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
  } : null
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

export const buildEquivalentBlockFieldMapFromPrepared = (
  prepared: PreparedBlockAnalysis,
  state: BlockSectionState
): SectionFieldMap => {
  const nominalEvaluation = prepared.model.bindNominalEvaluator(prepared.section)(state)
  const nominal = nominalEvaluation.source as NominalBlockEvaluation
  const strain = strainState(prepared.section, state, prepared.model.blockLaw.extremeCompressionStrain)
  // Visualization tessellation only. It never enters the block force/moment calculation.
  const displayMesh = buildConcreteMesh(prepared.geometry, { seedDivisions: 48, maxCells: 250_000, maxSubdivision: 4 })
  const at = (x: number, y: number) => {
    const localX = x - prepared.section.referencePoint.x
    const localY = y - prepared.section.referencePoint.y
    return strain.e0 + strain.kx * localY + strain.ky * localX
  }
  const concreteStressAt = (x: number, y: number) => {
    const nx = Math.cos(state.neutralAxisAngle)
    const ny = Math.sin(state.neutralAxisAngle)
    const edge = projectedOuterExtents(prepared.section, nx, ny).maximum
    const blockBoundary = edge - prepared.model.blockLaw.depthFactor * state.neutralAxisDepth
    return nx * x + ny * y >= blockBoundary ? prepared.model.blockLaw.compressionStress : 0
  }
  const triangles = displayMesh.triangles.map((triangle) => ({
    ax: triangle.ax,
    ay: triangle.ay,
    bx: triangle.bx,
    by: triangle.by,
    cx: triangle.cx,
    cy: triangle.cy,
    strainA: at(triangle.ax, triangle.ay),
    strainB: at(triangle.bx, triangle.by),
    strainC: at(triangle.cx, triangle.cy),
    stressA: concreteStressAt(triangle.ax, triangle.ay),
    stressB: concreteStressAt(triangle.bx, triangle.by),
    stressC: concreteStressAt(triangle.cx, triangle.cy)
  }))
  const samples = displayMesh.points.map((point) => ({
    x: point.x,
    y: point.y,
    area: point.area,
    strain: at(point.x, point.y),
    stress: concreteStressAt(point.x, point.y),
    kind: 'concrete' as const
  }))
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
    samples,
    triangles,
    rebars,
    bounds: {
      minX: prepared.section.bounds.minX,
      maxX: prepared.section.bounds.maxX,
      minY: prepared.section.bounds.minY,
      maxY: prepared.section.bounds.maxY
    },
    mesh: {
      ...displayMesh.report,
      warnings: [...displayMesh.report.warnings, 'Display tessellation only; capacity uses exact polygon clipping.']
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
