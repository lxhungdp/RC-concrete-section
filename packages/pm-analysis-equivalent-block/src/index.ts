import {
  stationDefinitionLabel,
  type DesignResistanceTrace,
  type EquivalentBlockStateTrace,
  type InversePreviewResult,
  type PreviewSurface,
  type PreviewSurfacePoint,
  type ResultantLedger,
  type SectionFieldMap,
  type StrainState,
  type SurfaceStation
} from '@pm/analysis'
import { createAci318Model } from '@pm/code-aci318'
import { createKds142020Model } from '@pm/code-kds142020'
import type { DesignBasis, GlobalStrengthReductionBasis } from '@pm/design'
import {
  prepareEquivalentBlockSection,
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
  const projections = section.solids.flatMap((solid) => solid.outer.map((point) => nx * point.x + ny * point.y))
  return Math.max(...projections) - Math.min(...projections)
}

const strainState = (
  section: PreparedEquivalentBlockSection,
  state: BlockSectionState | undefined,
  extremeCompressionStrain: number
): StrainState => {
  if (!state) return { e0: 0, kx: 0, ky: 0 }
  const nx = Math.cos(state.neutralAxisAngle)
  const ny = Math.sin(state.neutralAxisAngle)
  const edge = Math.max(...section.solids.flatMap((solid) => solid.outer.map((point) => nx * point.x + ny * point.y)))
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
  state: BlockSectionState | undefined,
  epsCu: number
) => {
  if (!state) return 0
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
  return {
    id: `block-${point.kind}-${point.id}`,
    beta,
    station: point.kind === 'tension-pole'
      ? 0
      : point.kind === 'compression-pole'
        ? surface.stations.length + 1
        : nearestStation(surface, section, point.state, epsCu),
    stationId: point.kind === 'tension-pole'
      ? 'pure-tension'
      : point.kind === 'compression-pole'
        ? 'pure-compression'
        : `station-${nearestStation(surface, section, point.state, epsCu)}`,
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
      : { kind: 'extreme-tension-strain' as const, strain: station.strain }
    return { id: `station-${index + 1}` as const, label: stationDefinitionLabel(definition), definition }
  }),
  { id: 'pure-compression', label: 'Pure compression', definition: { kind: 'pure-compression' } }
]

const bounds = (points: PreviewSurfacePoint[]) => ({
  P: [Math.min(...points.map((point) => point.P)), Math.max(...points.map((point) => point.P))] as [number, number],
  Mx: [Math.min(...points.map((point) => point.Mx)), Math.max(...points.map((point) => point.Mx))] as [number, number],
  My: [Math.min(...points.map((point) => point.My)), Math.max(...points.map((point) => point.My))] as [number, number]
})

export const buildEquivalentBlockPreviewSurfaceFromPrepared = (
  prepared: PreparedBlockAnalysis,
  options: EquivalentBlockAnalysisOptions
): PreviewSurface => {
  const settings = surfaceOptions(options)
  const nominal = prepared.model.buildNominalSurface(prepared.section, settings)
  const design = prepared.model.buildDesignSurface(prepared.section, {
    ...settings,
    applyAxialCap: prepared.designBasis.axialCapEnabled
  })
  const epsCu = prepared.model.blockLaw.extremeCompressionStrain
  const beta1 = prepared.model.blockLaw.depthFactor
  const compressionStress = prepared.model.blockLaw.compressionStress
  const nominalPoints = convertSurfacePoints(nominal, prepared.section, epsCu, beta1, compressionStress)
  const points = convertSurfacePoints(design, prepared.section, epsCu, beta1, compressionStress, true)
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
    forceClosure: nominal.diagnostics.forceClosure,
    momentXClosure: nominal.diagnostics.momentXClosure,
    momentYClosure: nominal.diagnostics.momentYClosure
  } : base
}

export const solveEquivalentBlockDemandFromPrepared = (
  prepared: PreparedBlockAnalysis,
  options: EquivalentBlockAnalysisOptions,
  loadcase: LoadCombination
): InversePreviewResult => {
  const designSurface = prepared.model.buildDesignSurface(prepared.section, {
    ...surfaceOptions(options),
    applyAxialCap: prepared.designBasis.axialCapEnabled
  })
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
          extremeCompressionStrain: prepared.model.blockLaw.extremeCompressionStrain
        }
      )
    : null
  const state = solved.state
  const response = solved.capacity ?? { P: 0, Mx: 0, My: 0 }
  const lambda = solved.loadFactor ?? 0
  const target = { P: lambda * loadcase.P, Mx: lambda * loadcase.Mx, My: lambda * loadcase.My }
  const residual = { P: response.P - target.P, Mx: response.Mx - target.Mx, My: response.My - target.My }
  const strain = strainState(prepared.section, state, prepared.model.blockLaw.extremeCompressionStrain)
  const exact = state ? evaluator(state) : undefined
  const metadata = exact?.metadata
  const factor = typeof metadata?.phi === 'number' ? metadata.phi : null
  const equivalentBlock = state && exact ? evaluationTrace(prepared, state, exact) : null
  const utilization = solved.utilization ?? null
  const converged = solved.status === 'converged' || solved.status === 'cap-face-governed' || solved.status === 'surface-converged'
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
    ok: converged && utilization !== null,
    converged,
    admissibility: {
      ok: converged,
      maxConcreteCompression: prepared.model.blockLaw.extremeCompressionStrain,
      concreteLimit: prepared.model.blockLaw.extremeCompressionStrain,
      maxSteelTension: equivalentBlock?.controllingTensileStrain ?? 0,
      steelTensionLimit: null,
      violations: []
    },
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
    const edge = Math.max(...prepared.section.solids.flatMap((solid) => solid.outer.map((point) => nx * point.x + ny * point.y)))
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
