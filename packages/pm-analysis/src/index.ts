import { activeDesignSurfaceDataset, activeNominalSurfaceDataset } from '@pm/results/audit'
import { PREVIEW_GEOMETRY_TOL } from './geometry-criteria'
import { directMomentCoordinate, forwardMomentPaths, intersectPmLoadPath, resultantMomentCoordinate, type DemandPmPoint } from './demand-pm'
import { axialCapExcludedPaths } from './axial-cap-display'
export { directMomentCoordinate, intersectPmLoadPath, resultantMomentCoordinate } from './demand-pm'
export type { DemandPmPoint, PmLoadPathIntersections, PmPathIntersection } from './demand-pm'
export { activeDesignSurfaceDataset, activeNominalSurfaceDataset } from '@pm/results/audit'
import type {
  Resultant,
  StrainState,
  AnalysisOrigin,
  ResultantLedger,
  CalculationAuditStage,
  CalculationAuditTerm,
  CalculationAuditConcreteGroup,
  CalculationAuditRebar,
  CalculationAuditDepthProfile,
  CalculationAuditOriginStrainTrace,
  CalculationAuditOriginStrainContext,
  CalculationAuditReconciliation,
  StressStrainPointCalculationAudit,
  EquivalentBlockPointCalculationAudit,
  AxialCapTracePoint,
  AxialCapProjectionTrace,
  AxialCapPointCalculationAudit,
  UnavailablePointCalculationAudit,
  PointCalculationAudit,
  PreviewSurfacePointRole,
  PreviewSurfacePoint,
  EquivalentBlockStateTrace,
  SurfaceIndexTriangle,
  DesignResistanceTrace,
  SurfaceStationId,
  SurfaceStation,
  SurfaceDirectionError,
  SurfaceStationError,
  PreviewSurfaceDataset,
  ExactDirectionCurve,
  PreviewSurface,
  PreviewContourPoint,
  DirectMeridianSectionPoint,
  DirectMeridianSection,
  PreviewMomentPlanePoint,
  PreviewMomentPlanePath,
  AdmissibilityViolation,
  StrainAdmissibility,
  CapacityFieldResult,
  InversePreviewResult,
  LoadcaseQuickCheckResult,
  StationDefinition,
  ResultantTangent,
  StationSteelLimits,
  FixedPInterpolationBracket,
  FixedPContourSampleTrace,
  SurfaceRayIntersection,
  ConstantAxialIntersection,
  SectionFieldSample,
  SectionFieldRebar,
  SectionFieldTriangle,
  SectionFieldMap
} from '@pm/results/contracts'
export type {
  Resultant,
  StrainState,
  AnalysisOrigin,
  ResultantLedger,
  CalculationAuditStage,
  CalculationAuditTerm,
  CalculationAuditConcreteGroup,
  CalculationAuditRebar,
  CalculationAuditDepthProfile,
  CalculationAuditOriginStrainTrace,
  CalculationAuditOriginStrainContext,
  CalculationAuditReconciliation,
  StressStrainPointCalculationAudit,
  EquivalentBlockPointCalculationAudit,
  AxialCapTracePoint,
  AxialCapProjectionTrace,
  AxialCapPointCalculationAudit,
  UnavailablePointCalculationAudit,
  PointCalculationAudit,
  PreviewSurfacePointRole,
  PreviewSurfacePoint,
  EquivalentBlockStateTrace,
  SurfaceIndexTriangle,
  DesignResistanceTrace,
  SurfaceStationId,
  SurfaceStation,
  SurfaceDirectionError,
  SurfaceStationError,
  PreviewSurfaceDataset,
  ExactDirectionCurve,
  PreviewSurface,
  PreviewContourPoint,
  DirectMeridianSectionPoint,
  DirectMeridianSection,
  PreviewMomentPlanePoint,
  PreviewMomentPlanePath,
  AdmissibilityViolation,
  StrainAdmissibility,
  CapacityFieldResult,
  InversePreviewResult,
  LoadcaseQuickCheckResult,
  StationDefinition,
  ResultantTangent,
  StationSteelLimits,
  FixedPInterpolationBracket,
  FixedPContourSampleTrace,
  SurfaceRayIntersection,
  ConstantAxialIntersection,
  SectionFieldSample,
  SectionFieldRebar,
  SectionFieldTriangle,
  SectionFieldMap
} from '@pm/results/contracts'
import {
  stationDefinitionLabel,
  buildCalculationAuditOriginStrainTrace,
  reconcileCalculationAuditResultant,
  projectedBoundaryDepth,
  sectionBoundaryPoints
} from '@pm/results/audit'
export {
  stationDefinitionLabel,
  buildCalculationAuditOriginStrainTrace,
  reconcileCalculationAuditResultant,
  projectedBoundaryDepth,
  sectionBoundaryPoints
} from '@pm/results/audit'
import { AnalysisInputError } from './analysis-error'
import { IndexedSurfaceTopologyCache, type PreparedSurfaceTriangle } from './surface-topology'
import { strainResistanceFactorAudit, type CalculationAuditResistanceFactor } from './resistance-factor-audit'
export {
  strainResistanceFactorAudit,
  type CalculationAuditResistanceFactor,
  type StrainResistanceFactorAudit,
  type AxialBendingResistanceFactorAudit
} from './resistance-factor-audit'
export { AnalysisInputError, type AnalysisErrorCode } from './analysis-error'
import { clipDesignSurfaceAtAxialCap } from './axial-cap'
export { resolveLoadcaseField, type LoadcaseFieldResult } from './loadcase-field'
export { axialCapExcludedPaths } from './axial-cap-display'
import { solve3 } from './linear-solve'
import { NEWTON_RESIDUAL_TOL, NEWTON_MAX_ITERATIONS } from './inverse-options'
import {
  prepareGroupedPointSupports,
  buildConcreteMesh,
  concreteMeshGeometryKey,
  netConcreteCentroid,
  validatePolygonSection,
  rebarArea,
  rebarAreaSourceLabel,
  type ConcreteMesh,
  type ConcreteMeshOptions,
  type ConcreteMeshReport,
  type GeometryInputRebarView,
  type SectionGeometry
} from '@pm/geometry'
import { createSteelStrainBoundary, type SteelStrainBoundary } from './steel-strain-boundary'
import { selectGoverningSteelStrainLimit, type SteelStrainLimitEvidence } from './steel-strain-limit'
export { selectGoverningSteelStrainLimit, type SteelStrainLimitEvidence } from './steel-strain-limit'
import {
  compileMaterialStore,
  describeConcreteMaterialLaw,
  describeSteelMaterialLaw,
  materialStoreIssues,
  concreteModelSupportIssue,
  IMPLEMENTED_STRAIN_DOMAIN,
  resolveEc2ParabolicRectangularParams,
  resolveKdsParabolicParams,
  strainDomainMismatch,
  type CompiledMaterial,
  type MaterialLawAudit,
  type MaterialStore,
  type SteelMaterial,
  type StrainDomainId
} from '@pm/materials'
import {
  buildResistanceMaterialSets,
  withSteelModelModification,
  designMaterialApplicabilityIssues,
  cloneDesignBasis,
  createDefaultDesignBasis,
  designBasisRequiresOverrideReason,
  evaluateGlobalStrengthReduction,
  globalStrengthReductionTransitionSpan,
  GLOBAL_STRENGTH_REDUCTION_MINIMUM_SPAN,
  minimumEccentricityCandidates,
  minimumEccentricityMessage,
  resolveTensionControlledStrainLimit,
  type MinimumEccentricityCandidate,
  type DesignBasis,
  type ResistanceClassification
} from '@pm/design'
import {
  cloneAnalysisOptions,
  createDefaultAnalysisOptions,
  UNIFIED_DEPTH_RATIOS,
  UNIFIED_STEEL_STRAIN_YIELD_RATIOS,
  type AnalysisOptions,
  type CalculationAnalysisOptions,
  type AnalysisStationCriterion,
  type DemandCheckBasis,
  type LoadCombination
} from '@pm/project'
import {
  FIXED_GRID_SCREENING_RELATIVE_UNCERTAINTY,
  axialOutsideDomainClassification,
  classifyUtilization,
  type AdequacyStatus,
  type UtilizationInterval
} from '@pm/results'

/**
 * Reduction helpers deliberately use a loop instead of spreading sampled surfaces into function
 * arguments. The public adaptive limits allow more than 140,000 vertices, above the argument
 * limit of common JavaScript engines.
 */
const mappedRange = <T>(items: readonly T[], valueOf: (item: T) => number): [number, number] => {
  if (items.length === 0) return [Number.NaN, Number.NaN]
  let minimum = Number.POSITIVE_INFINITY
  let maximum = Number.NEGATIVE_INFINITY
  for (const item of items) {
    const value = valueOf(item)
    minimum = Math.min(minimum, value)
    maximum = Math.max(maximum, value)
  }
  return [minimum, maximum]
}

const mappedMaximum = <T>(
  items: readonly T[],
  valueOf: (item: T) => number,
  minimum = Number.NEGATIVE_INFINITY
) => {
  let maximum = minimum
  for (const item of items) maximum = Math.max(maximum, valueOf(item))
  return maximum
}

export const activeDesignDirectionPoints = (curve: ExactDirectionCurve): PreviewSurfacePoint[] =>
  curve.designCurve ?? curve.designAdaptive ?? curve.designFixed

export const activeNominalDirectionPoints = (curve: ExactDirectionCurve): PreviewSurfacePoint[] =>
  curve.nominalCurve ?? curve.nominalFixed

/** The sampled-direction subset of a fixed-P contour, in ascending `beta`. */
export const contourStrainAngleSamples = (contour: PreviewContourPoint[]): PreviewContourPoint[] =>
  contour.filter((point) => point.onSampledDirection).sort((a, b) => a.beta - b.beta)

/** Physical criteria and qualified geometric cap crossings, never a synthetic axis closure. */
export const isMeridianAuditPoint = (point: DirectMeridianSectionPoint): boolean =>
  point.sectionPointRole === 'surface-vertex' && (point.stationId !== null ||
    point.surfaceRole === 'axial-cap' && point.axialCapTrace !== undefined)

const wrapSectionAngle = (angle: number) => {
  const wrapped = angle % (2 * Math.PI)
  return wrapped < 0 ? wrapped + 2 * Math.PI : wrapped
}

const sectionAngularDistance = (left: number, right: number) => {
  const delta = Math.abs(wrapSectionAngle(left) - wrapSectionAngle(right))
  return Math.min(delta, 2 * Math.PI - delta)
}

const sameDirectSectionPoint = (
  left: DirectMeridianSectionPoint,
  right: DirectMeridianSectionPoint
) => {
  if (left.id === right.id) return true
  const forceScale = Math.max(1, Math.abs(left.P), Math.abs(right.P))
  const momentScale = Math.max(
    1,
    Math.hypot(left.Mx, left.My),
    Math.hypot(right.Mx, right.My)
  )
  return Math.abs(left.P - right.P) <= forceScale * 1e-12 &&
    Math.hypot(left.Mx - right.Mx, left.My - right.My) <= momentScale * 1e-12
}

const axialCapSectionCenter = (
  cap: DirectMeridianSectionPoint,
  beta: number
): DirectMeridianSectionPoint => {
  const zeroMoment = <T extends { Mx: number; My: number }>(part: T): T => ({
    ...part,
    Mx: 0,
    My: 0
  })
  return {
    ...cap,
    id: `${cap.id}:axis:${wrapSectionAngle(beta).toPrecision(12)}`,
    beta: wrapSectionAngle(beta),
    station: -2,
    stationCoordinate: undefined,
    stationId: null,
    surfaceRole: 'axial-cap',
    onSampledDirection: true,
    sectionPointRole: 'axial-center',
    Mx: 0,
    My: 0,
    ledger: {
      concrete: zeroMoment(cap.ledger.concrete),
      steelGross: zeroMoment(cap.ledger.steelGross),
      displacedConcrete: zeroMoment(cap.ledger.displacedConcrete),
      steel: zeroMoment(cap.ledger.steel),
      total: zeroMoment(cap.ledger.total)
    }
  }
}

const directSurfaceMeridian = (
  points: readonly PreviewSurfacePoint[],
  target: number,
  sharedPoles: readonly PreviewSurfacePoint[]
): DirectMeridianSectionPoint[] => {
  const rows = new Map<number, PreviewSurfacePoint[]>()
  for (const point of points) {
    if (point.surfaceRole === 'pure-compression' || point.surfaceRole === 'pure-tension') continue
    if (point.onSampledDirection === false) continue
    rows.set(point.beta, [...(rows.get(point.beta) ?? []), point])
  }
  const nearest = [...rows.entries()].sort((left, right) =>
    sectionAngularDistance(left[0], target) - sectionAngularDistance(right[0], target)
  )[0]?.[1] ?? []
  const withPoles = nearest.map((point): DirectMeridianSectionPoint => ({
    ...point,
    sectionPointRole: 'surface-vertex'
  }))
  for (const pole of sharedPoles) {
    if (withPoles.some((point) => point.surfaceRole === pole.surfaceRole)) continue
    withPoles.push({ ...pole, sectionPointRole: 'surface-vertex' })
  }
  const cap = withPoles.find((point) => point.surfaceRole === 'axial-cap')
  if (cap) {
    const momentScale = Math.max(1, ...withPoles.map((point) => Math.hypot(point.Mx, point.My)))
    const hasAxis = withPoles.some((point) =>
      point.surfaceRole === 'axial-cap' && Math.hypot(point.Mx, point.My) <= momentScale * 1e-12
    )
    if (!hasAxis) withPoles.push(axialCapSectionCenter(cap, target))
  }
  return withPoles.sort((left, right) => left.station - right.station)
}

/**
 * Canonical presentation section for one sampled direction and, optionally, its opposite. Shared
 * axial poles are attached explicitly because equivalent-block surfaces store each pole only once.
 * The returned paths are consumed unchanged by the vertical chart, its table, and the 3D overlay.
 */
export const buildDirectMeridianSection = (
  points: readonly PreviewSurfacePoint[],
  angleDeg: number,
  includeOpposite: boolean
): DirectMeridianSection => {
  const target = wrapSectionAngle(angleDeg * Math.PI / 180)
  const sharedPoles = (['pure-compression', 'pure-tension'] as const).flatMap((role) => {
    const pole = points.find((point) => point.surfaceRole === role)
    return pole ? [pole] : []
  })
  const primary = directSurfaceMeridian(points, target, sharedPoles)
  const opposite = includeOpposite
    ? directSurfaceMeridian(points, target + Math.PI, sharedPoles)
    : []
  if (!includeOpposite || primary.length === 0 || opposite.length === 0) {
    return { primary, opposite, displayPaths: primary.length > 0 ? [primary] : [], closed: false }
  }

  const reversedOpposite = [...opposite].reverse()
  const loop = [
    ...primary,
    ...reversedOpposite.slice(
      sameDirectSectionPoint(primary[primary.length - 1], reversedOpposite[0]) ? 1 : 0
    )
  ]
  if (!sameDirectSectionPoint(loop[0], loop[loop.length - 1])) loop.push(loop[0])
  return { primary, opposite, displayPaths: [loop], closed: true }
}

/** Root 05 §8: positive magnitudes with explicit signed display sides and separate paths. */
export const buildDirectMomentSection = (
  points: readonly PreviewSurfacePoint[], angleDeg: number, includeOpposite: boolean
) => {
  const section = buildDirectMeridianSection(points, angleDeg, includeOpposite)
  const map = (path: DirectMeridianSectionPoint[], branch: 'primary' | 'opposite') => path.map(point => ({
    ...point, ...directMomentCoordinate(point, branch), branch,
    sectionBeta: wrapSectionAngle((angleDeg + (branch === 'opposite' ? 180 : 0)) * Math.PI / 180)
  }))
  const primary = map(section.primary, 'primary'), opposite = map(section.opposite, 'opposite')
  return { primary, opposite, displayPaths: [primary, opposite].filter(path => path.length > 0), closed: false }
}

/** Root 05 §§8–9: canonical Demand P-M geometry, shared by both independent mechanics. */
export const buildDemandPmGeometry = (input: {
  surface: PreviewSurface
  exact: ExactDirectionCurve | null
  inspectionBeta: number
  demand: Resultant | null
  governingPoint: Resultant | null
  basis: DemandCheckBasis
  showTheta: boolean
}) => {
  const { surface, exact, demand, governingPoint, basis, showTheta } = input
  const beta = exact?.beta ?? input.inspectionBeta
  const theta = demand && Math.hypot(demand.Mx, demand.My) > 0 ? Math.atan2(demand.My, demand.Mx) : beta
  const direction = (point: Resultant) => Math.hypot(point.Mx, point.My) > 0 ? Math.atan2(point.My, point.Mx) : null
  const direct = (points: PreviewSurfacePoint[]): DemandPmPoint[][] =>
    buildDirectMomentSection(points, beta * 180 / Math.PI, false).displayPaths.map(path => path.map(point => ({
      M: point.M, P: point.P, Mx: point.Mx, My: point.My, beta: point.beta,
      theta: direction(point), station: point.station, stationId: point.stationId, sourceId: point.id,
      role: point.sectionPointRole === 'axial-center' ? 'axial-center' : point.surfaceRole === 'axial-cap' ? 'cap-edge' : 'physical-station'
    })))
  const valid = (paths: DemandPmPoint[][]) => paths.every(path => path.every(point =>
    [point.M, point.P, point.Mx, point.My].every(Number.isFinite)))
  const nominalRaw = exact ? direct(activeNominalDirectionPoints(exact)) : []
  const designRaw = exact ? direct(activeDesignDirectionPoints(exact)) : []
  const directStatus = !valid(nominalRaw) || !valid(designRaw) ? 'invalid-arithmetic'
    : !exact ? 'missing-exact-direction' : 'available'
  const nominal = directStatus === 'available' ? nominalRaw : []
  const design = directStatus === 'available' ? designRaw : []
  const diagnostic = demand ? intersectPmLoadPath(design, demand, basis)
    : { status: 'unavailable' as const, reason: 'missing-demand' as const, points: [] as [] }
  const slice = (dataset: PreviewSurfaceDataset): DemandPmPoint[][] =>
    forwardMomentPaths(sliceMomentPlane(dataset.points, theta, dataset.triangles).map(path => path.points.map(point => ({
      M: point.M, P: point.P, Mx: point.Mx, My: point.My, beta: null, theta: direction(point),
      station: null, stationId: null, sourceId: null, role: 'surface-cut'
    }))))
  const nominalTheta = showTheta ? slice(activeNominalSurfaceDataset(surface)) : []
  const designTheta = showTheta ? slice(activeDesignSurfaceDataset(surface)) : []
  const cap = surface.beforeAxialCap ? surface.bounds.P[1] : null
  const before = (paths: readonly (readonly Resultant[])[], magnitude: boolean): DemandPmPoint[][] =>
    cap === null ? [] : axialCapExcludedPaths(paths, cap).map(path => path.map(point => ({
      M: magnitude ? resultantMomentCoordinate(point).M : point.Mx * Math.cos(theta) + point.My * Math.sin(theta),
      P: point.P, Mx: point.Mx, My: point.My, beta: magnitude ? beta : null,
      theta: direction(point), station: null, stationId: null, sourceId: null, role: 'before-cap'
    })))
  const beforeDirect = exact?.beforeAxialCap && directStatus === 'available' ? before(direct(exact.beforeAxialCap), true) : []
  const beforeTheta = showTheta && surface.beforeAxialCap
    ? forwardMomentPaths(before(sliceMomentPlane(surface.beforeAxialCap.points, theta, surface.beforeAxialCap.triangles).map(path => path.points), false)) : []
  const loadPath: Array<{ M: number; P: number }> = []
  if (demand && [demand.P, demand.Mx, demand.My].every(Number.isFinite)) {
    const md = Math.hypot(demand.Mx, demand.My)
    const governingLambda = governingPoint ? md > 0 ? Math.hypot(governingPoint.Mx, governingPoint.My) / md
      : basis === 'proportional3D' && demand.P !== 0 ? governingPoint.P / demand.P : 0 : 0
    let extent = Number.isFinite(governingLambda) ? Math.max(1, governingLambda) : 1
    for (const point of diagnostic.points) extent = Math.max(extent, point.lambda)
    const end = { M: extent * md, P: basis === 'constantAxial' ? demand.P : extent * demand.P }
    if ([end.M, end.P].every(Number.isFinite)) loadPath.push({ M: 0, P: basis === 'constantAxial' ? demand.P : 0 }, end)
  }
  return { beta, theta, directStatus, nominal, design, nominalTheta, designTheta, beforeDirect, beforeTheta,
    diagnostic, loadPath, demand: demand ? resultantMomentCoordinate(demand) : null,
    governing: governingPoint ? resultantMomentCoordinate(governingPoint) : null }
}

/**
 * A fiber carries its already-resolved constitutive law. Resolution happens once, up front, so the
 * integration loop cannot encounter a missing material and cannot silently substitute one.
 */
type ConcreteFiber = { x: number; y: number; area: number; kind: 'concrete' }
type RebarFiber = { x: number; y: number; area: number; kind: 'rebar'; rebarId: number; steel: CompiledMaterial }
type Fiber = ConcreteFiber | RebarFiber

type AnalysisMaterials = {
  concrete: CompiledMaterial
  steel: Map<number, CompiledMaterial>
}

/**
 * Immutable, realm-local analysis data prepared from one exact input revision.
 *
 * This object intentionally contains compiled functions and is therefore not transferable through
 * postMessage. A worker keeps its own prepared instance and invalidates it using analysisInputKey.
 */
export type PreparedAnalysis = {
  readonly section: SectionGeometry
  readonly rebars: GeometryInputRebarView[]
  readonly materialStore: MaterialStore
  readonly origin: AnalysisOrigin
  readonly mesh: ConcreteMesh
  readonly concreteFibers: ConcreteFiber[]
  readonly rebarFibers: RebarFiber[]
  readonly steelSupports: ReturnType<typeof prepareGroupedPointSupports<RebarFiber>>
  readonly hasSteelHardening: boolean
  readonly fibers: Fiber[]
  readonly materials: AnalysisMaterials
  /** Exact outer-boundary vertices in the centroidal analysis frame. */
  readonly concreteBoundary: Array<{ x: number; y: number }>
  readonly lengthScale: number
  readonly forceScale: number
  readonly strainScale: number
}

/** Collision-free cache identity: callers compare the full canonical payload, not only a hash. */
export const analysisInputKey = (
  section: SectionGeometry,
  rebars: GeometryInputRebarView[],
  materialStore: MaterialStore,
  meshOptions: ConcreteMeshOptions = {}
) => JSON.stringify([section, rebars, materialStore, meshOptions])

export const surfaceInputKey = (
  section: SectionGeometry,
  rebars: GeometryInputRebarView[],
  materialStore: MaterialStore,
  analysisOptions: AnalysisOptions,
  meshOptions: ConcreteMeshOptions = {}
) => JSON.stringify([section, rebars, materialStore, meshOptions, analysisOptions])

/**
 * Relative slack on strain limits. The capacity stations sit exactly on `epsCu`, so an exact
 * comparison would reject them on rounding alone.
 */
const STRAIN_LIMIT_TOL = 1e-9

/** Shared 27-station schedule used by compatibility helpers and the production surface. */
export const UNIFIED_STATIONS: StationDefinition[] = [
  { kind: 'pure-compression' },
  ...UNIFIED_DEPTH_RATIOS.map((ratio) => ({ kind: 'neutral-axis-depth-ratio' as const, ratio })),
  ...UNIFIED_STEEL_STRAIN_YIELD_RATIOS.map((ratio) => ({
    kind: 'bar-tension-yield-ratio' as const,
    ratio
  })),
  { kind: 'pure-tension' }
]

const criterionDefinition = (criterion: AnalysisStationCriterion): StationDefinition => {
  if (criterion.type === 'c-over-c1') return { kind: 'neutral-axis-ratio', cOverC1: criterion.ratio }
  if (criterion.type === 'depth-ratio') return { kind: 'neutral-axis-depth-ratio', ratio: criterion.ratio }
  if (criterion.type === 'steel-stress-ratio') return { kind: 'steel-stress-ratio', ratio: criterion.ratio }
  if (criterion.type === 'steel-strain') return { kind: 'steel-strain', strain: criterion.strain }
  if (criterion.type === 'bar-tension-yield-ratio') {
    return { kind: 'bar-tension-yield-ratio', ratio: criterion.ratio }
  }
  if (criterion.type === 'strength-reduction-transition-ratio') {
    return { kind: 'strength-reduction-transition-ratio', ratio: criterion.ratio }
  }
  return { kind: 'steel-strain', strain: criterion.strain }
}

/** Resolved schedule including the two mandatory poles. */
export const analysisStations = (options: AnalysisOptions): SurfaceStation[] => [
  { id: 'pure-compression', label: 'Pure compression', definition: { kind: 'pure-compression' }, fixed: true },
  ...options.stations.intermediate.map((item) => {
    const definition = criterionDefinition(item.criterion)
    return {
      id: `station-${item.id}` as const,
      label: stationDefinitionLabel(definition),
      definition,
      fixed: true
    }
  }),
  { id: 'pure-tension', label: 'Pure tension', definition: { kind: 'pure-tension' }, fixed: true }
]

const stationDefinitionHash = (definition: StationDefinition) => {
  const source = JSON.stringify(definition)
  let hash = 0x811c9dc5
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

const depthRatioOf = (definition: StationDefinition) =>
  definition.kind === 'neutral-axis-depth-ratio' || definition.kind === 'block-depth-ratio'
    ? definition.ratio
    : null

const zeroTensionStation = (definition: StationDefinition) =>
  (definition.kind === 'bar-tension-yield-ratio' && definition.ratio === 0) ||
  (definition.kind === 'steel-strain' && definition.strain === 0) ||
  (definition.kind === 'steel-stress-ratio' && definition.ratio === 0) ||
  (definition.kind === 'bar-tension-strain' && definition.strain === 0) ||
  (definition.kind === 'extreme-tension-strain' && definition.strain === 0)

const coverGapCoordinate = (definition: StationDefinition): number | null => {
  const depth = depthRatioOf(definition)
  if (depth !== null && Math.abs(depth - 1) <= 1e-12) return 0
  if (definition.kind === 'neutral-axis-control-gap-ratio') return definition.ratio
  return zeroTensionStation(definition) ? 1 : null
}

/**
 * Exact physical midpoint for each canonical domain. D/c is linear outside the section, the cover
 * bridge is linear in neutral-axis position, and the steel branch is linear in εs/εy. Only custom
 * incompatible criteria use a deterministic strain-state interpolation fallback.
 */
const midpointStationDefinition = (
  left: StationDefinition,
  right: StationDefinition
): StationDefinition => {
  const leftDepth = depthRatioOf(left)
  const rightDepth = depthRatioOf(right)
  if (left.kind === 'pure-compression' && rightDepth !== null) {
    return { kind: 'neutral-axis-depth-ratio', ratio: rightDepth * 2 }
  }
  if (leftDepth !== null && rightDepth !== null) {
    return {
      kind: 'neutral-axis-depth-ratio',
      ratio: 2 / (1 / leftDepth + 1 / rightDepth)
    }
  }

  const leftGap = coverGapCoordinate(left)
  const rightGap = coverGapCoordinate(right)
  if (leftGap !== null && rightGap !== null && rightGap > leftGap) {
    return { kind: 'neutral-axis-control-gap-ratio', ratio: (leftGap + rightGap) / 2 }
  }

  if (left.kind === 'bar-tension-yield-ratio' && right.kind === 'bar-tension-yield-ratio') {
    return { kind: 'bar-tension-yield-ratio', ratio: (left.ratio + right.ratio) / 2 }
  }
  if (left.kind === 'steel-strain' && right.kind === 'steel-strain') {
    return { kind: 'steel-strain', strain: (left.strain + right.strain) / 2 }
  }
  if (left.kind === 'steel-stress-ratio' && right.kind === 'steel-stress-ratio') {
    return { kind: 'steel-stress-ratio', ratio: (left.ratio + right.ratio) / 2 }
  }

  if (right.kind === 'pure-tension') {
    if (left.kind === 'tension-pole-transition-ratio') {
      return { ...left, ratio: (left.ratio + 1) / 2 }
    }
    return { kind: 'tension-pole-transition-ratio', from: left, ratio: 0.5 }
  }
  if (
    right.kind === 'tension-pole-transition-ratio' &&
    JSON.stringify(right.from) === JSON.stringify(left)
  ) {
    return { ...right, ratio: right.ratio / 2 }
  }
  if (
    left.kind === 'tension-pole-transition-ratio' &&
    right.kind === 'tension-pole-transition-ratio' &&
    JSON.stringify(left.from) === JSON.stringify(right.from)
  ) {
    return { ...left, ratio: (left.ratio + right.ratio) / 2 }
  }

  const compatibleInterpolation = (definition: StationDefinition) =>
    definition.kind === 'adaptive-state-interpolation' ? definition : null
  const leftInterpolation = compatibleInterpolation(left)
  const rightInterpolation = compatibleInterpolation(right)
  if (
    leftInterpolation &&
    JSON.stringify(leftInterpolation.right) === JSON.stringify(right)
  ) {
    return {
      ...leftInterpolation,
      ratio: (leftInterpolation.ratio + 1) / 2
    }
  }
  if (
    rightInterpolation &&
    JSON.stringify(rightInterpolation.left) === JSON.stringify(left)
  ) {
    return {
      ...rightInterpolation,
      ratio: rightInterpolation.ratio / 2
    }
  }
  if (
    leftInterpolation &&
    rightInterpolation &&
    JSON.stringify(leftInterpolation.left) === JSON.stringify(rightInterpolation.left) &&
    JSON.stringify(leftInterpolation.right) === JSON.stringify(rightInterpolation.right)
  ) {
    return {
      ...leftInterpolation,
      ratio: (leftInterpolation.ratio + rightInterpolation.ratio) / 2
    }
  }
  return { kind: 'adaptive-state-interpolation', left, right, ratio: 0.5 }
}

const adaptiveStation = (definition: StationDefinition): SurfaceStation => ({
  id: `adaptive-station-${stationDefinitionHash(definition)}`,
  label: stationDefinitionLabel(definition),
  definition,
  fixed: false
})

/** Canonical radians in strictly ascending order. */
export const analysisDirections = (options: AnalysisOptions): number[] => {
  const seed = options.directions.seed
  if (seed.type === 'uniform') {
    const start = (seed.startDeg * Math.PI) / 180
    // Evaluate directly in radians so every uniform seed count, including the 36-direction
    // production grid, closes without accumulated degree-rounding drift.
    return Array.from(
      { length: seed.count },
      (_, index) => (start + (index * Math.PI) / (seed.count / 2)) % (2 * Math.PI)
    ).sort((a, b) => a - b)
  }
  return seed.anglesDeg.map((degree) => (degree * Math.PI) / 180).sort((a, b) => a - b)
}

/**
 * Concrete fibers from the exact clipped-cell mesh (`docs/02` §5). Every weight is the area of a
 * real clipped triangle, so meshed area and first moments reproduce the exact polygon properties
 * instead of rasterising the boundary.
 */
const concreteFibersFromMesh = (mesh: ConcreteMesh, origin: AnalysisOrigin): ConcreteFiber[] =>
  mesh.points.map((point) => ({
    x: point.x - origin.x,
    y: point.y - origin.y,
    area: point.area,
    kind: 'concrete'
  }))

/**
 * Compile the material store and bind every bar to its steel law.
 *
 * A bar whose `steelMaterialId` no longer exists is a fatal input error. The previous behaviour —
 * falling back to the concrete stress — cancelled exactly against the displaced-concrete term, so
 * the bar contributed zero and the reinforcement disappeared from the capacity without a trace.
 */
const resolveAnalysisMaterials = (
  materialStore: MaterialStore,
  rebars: GeometryInputRebarView[]
): AnalysisMaterials => {
  const materialIssues = materialStoreIssues(materialStore)
  if (materialIssues.length > 0) {
    throw new AnalysisInputError(
      'INVALID_MATERIAL',
      `Material definitions are not physically admissible: ${materialIssues.map((issue) => `${issue.path} ${issue.message}`).join('; ')}`,
      { issues: materialIssues }
    )
  }
  // Blocking here, not only in the material selector: an imported project can carry a model the
  // selector no longer offers, and it would otherwise reach the evaluator unchallenged.
  const unsupported = concreteModelSupportIssue(materialStore.concrete)
  if (unsupported) {
    throw new AnalysisInputError(
      'UNSUPPORTED_CONCRETE_MODEL',
      `Concrete model "${unsupported.modelType}" cannot be analysed. ${unsupported.reason}`,
      { modelType: unsupported.modelType, reference: unsupported.reference }
    )
  }

  const compiled = compileMaterialStore(materialStore)
  const defaultId = materialStore.defaults.steelMaterialId
  const missing = new Map<number, number[]>()

  for (const bar of rebars) {
    const steelMaterialId = bar.steelMaterialId ?? defaultId
    if (compiled.steel.has(steelMaterialId)) continue
    missing.set(steelMaterialId, [...(missing.get(steelMaterialId) ?? []), bar.id])
  }

  if (missing.size > 0) {
    const known = [...compiled.steel.keys()].join(', ') || 'none'
    const summary = [...missing.entries()]
      .map(([steelMaterialId, rebarIds]) => `steel material ${steelMaterialId} (rebar ${rebarIds.join(', ')})`)
      .join('; ')
    throw new AnalysisInputError(
      'MISSING_STEEL_MATERIAL',
      `Reinforcement references a steel material that does not exist: ${summary}. Defined steel materials: ${known}.`,
      {
        defaultSteelMaterialId: defaultId,
        definedSteelMaterialIds: [...compiled.steel.keys()],
        missing: [...missing.entries()].map(([steelMaterialId, rebarIds]) => ({ steelMaterialId, rebarIds }))
      }
    )
  }

  return compiled
}

const buildRebarFibers = (
  rebars: GeometryInputRebarView[],
  origin: AnalysisOrigin,
  materials: AnalysisMaterials,
  defaultSteelMaterialId: number
): RebarFiber[] =>
  rebars.map((bar) => {
    const steelMaterialId = bar.steelMaterialId ?? defaultSteelMaterialId
    const steel = materials.steel.get(steelMaterialId)
    // resolveAnalysisMaterials has already rejected this case; the guard keeps the type honest.
    if (!steel) {
      throw new AnalysisInputError(
        'MISSING_STEEL_MATERIAL',
        `Rebar ${bar.id} references steel material ${steelMaterialId}, which does not exist.`,
        { rebarId: bar.id, steelMaterialId }
      )
    }
    return {
      x: bar.x - origin.x,
      y: bar.y - origin.y,
      area: rebarArea(bar),
      kind: 'rebar' as const,
      rebarId: bar.id,
      steel
    }
  })

const originFromMesh = (mesh: ConcreteMesh): AnalysisOrigin => {
  const { area, firstMomentX, firstMomentY } = mesh.report.exact
  if (Math.abs(area) < 1e-9) return { x: 0, y: 0 }
  return { x: firstMomentY / area, y: firstMomentX / area }
}

/**
 * Prepare from an existing mesh. Report generation uses this entry point so its audited export mesh
 * is also the engine mesh; no hidden second discretization is built.
 */
/**
 * A mesh that failed its own sanity checks cannot enter analysis.
 *
 * `buildConcreteMesh` reports a resource limit or a failed clip by returning an empty mesh with a
 * warning. Integrating that mesh does not fail — it silently yields a capacity surface built from
 * the reinforcement alone, which for the reference section understates `P0` by a factor of 6.3 while
 * still plotting as a complete, plausible interaction diagram.
 */
const assertUsableMesh = (mesh: ConcreteMesh) => {
  const limit = mesh.report.warnings.find((warning) => warning.startsWith('RESOURCE_LIMIT:'))
  if (limit) {
    throw new AnalysisInputError(
      'MESH_RESOURCE_LIMIT',
      `The integration mesh exceeds its cell budget: ${limit.replace('RESOURCE_LIMIT: ', '')} Increase the cell size, or raise the limit deliberately.`,
      { warnings: mesh.report.warnings, cellSize: mesh.report.cellSize }
    )
  }
  if (mesh.points.length === 0 || Math.abs(mesh.report.exact.area) < 1e-9) {
    throw new AnalysisInputError(
      'EMPTY_CONCRETE_SECTION',
      'The net concrete region is empty, so there is nothing to integrate. Apply a valid concrete section first.',
      { warnings: mesh.report.warnings }
    )
  }
  if (!mesh.report.ok) {
    throw new AnalysisInputError(
      'MESH_NOT_VERIFIED',
      `The integration mesh did not pass its own area and first-moment checks: ${mesh.report.warnings.join('; ')}`,
      { warnings: mesh.report.warnings }
    )
  }
}

const assertValidSectionGeometry = (
  section: SectionGeometry,
  rebars: GeometryInputRebarView[]
) => {
  const geometryIssues = validatePolygonSection({ solids: section.solids, rebars })
  if (geometryIssues.length === 0) return
  if (geometryIssues.some((issue) => issue.code === 'GEOMETRY_RESOURCE_LIMIT')) {
    throw new AnalysisInputError('GEOMETRY_RESOURCE_LIMIT', geometryIssues[0].message, { issues: geometryIssues })
  }
  const rebarOnly = geometryIssues.every((issue) =>
    issue.code === 'INVALID_REBAR' || issue.code.startsWith('REBAR_'))
  const rebarIds = rebarOnly
    ? [...new Set(geometryIssues.flatMap((issue) => {
        const match = /^rebars\[(\d+)\]/u.exec(issue.path)
        return match ? [rebars[Number(match[1])]?.id].filter((id): id is number => id !== undefined) : []
      }))]
    : undefined
  throw new AnalysisInputError(
    rebarOnly ? 'INVALID_REBAR' : 'INVALID_GEOMETRY',
    geometryIssues.map((issue) => `${issue.path}: ${issue.message}`).join('; '),
    { issues: geometryIssues, rebarIds }
  )
}

export const prepareAnalysisFromMesh = (
  section: SectionGeometry,
  rebars: GeometryInputRebarView[],
  materialStore: MaterialStore,
  mesh: ConcreteMesh,
  origin: AnalysisOrigin = originFromMesh(mesh)
): PreparedAnalysis => {
  if (![origin.x, origin.y].every(Number.isFinite)) {
    throw new AnalysisInputError('NON_FINITE_ANALYSIS', 'Analysis origin must contain finite coordinates.')
  }
  assertValidSectionGeometry(section, rebars)
  assertUsableMesh(mesh)
  if (mesh.geometryKey !== concreteMeshGeometryKey(section)) {
    throw new AnalysisInputError('MESH_GEOMETRY_MISMATCH', 'The integration mesh does not belong to the requested section geometry.')
  }
  const materials = resolveAnalysisMaterials(materialStore, rebars)
  const concreteFibers = concreteFibersFromMesh(mesh, origin)
  const rebarFibers = buildRebarFibers(rebars, origin, materials, materialStore.defaults.steelMaterialId)
  const usedSteelIds = new Set(rebarFibers.map((bar) => bar.steel.id))
  const concreteBoundary = section.solids.flatMap((solid) =>
    solid.outer.map((point) => ({ x: point.x - origin.x, y: point.y - origin.y }))
  )
  const xs = concreteBoundary.map((point) => point.x)
  const ys = concreteBoundary.map((point) => point.y)
  const lengthScale = Math.max(
    xs.length > 0 ? Math.max(...xs) - Math.min(...xs) : 0,
    ys.length > 0 ? Math.max(...ys) - Math.min(...ys) : 0,
    1
  )
  const concreteForce = Math.abs(materialStore.concrete.fck * mesh.report.exact.area)
  const steelForce = rebars.reduce((sum, bar) => {
    const materialId = bar.steelMaterialId ?? materialStore.defaults.steelMaterialId
    const steel = materialStore.steel.find((item) => item.id === materialId)
    const fyd = steel ? Math.abs(steel.fy / (steel.factors?.gammaS ?? 1)) : 0
    return sum + fyd * rebarArea(bar)
  }, 0)

  return {
    section,
    rebars,
    materialStore,
    origin,
    mesh,
    concreteFibers,
    rebarFibers,
    steelSupports: prepareGroupedPointSupports(rebarFibers, (bar) => String(bar.steel.id)),
    hasSteelHardening: materialStore.steel.some((steel) => usedSteelIds.has(steel.id) && steel.stressStrain.type === 'linear-hardening'),
    fibers: [...concreteFibers, ...rebarFibers],
    materials,
    concreteBoundary,
    lengthScale,
    forceScale: Math.max(1, concreteForce + steelForce),
    strainScale: Math.max(1e-6, materialStore.concrete.limits.epsCu)
  }
}

export const prepareAnalysis = (
  section: SectionGeometry,
  rebars: GeometryInputRebarView[],
  materialStore: MaterialStore,
  meshOptions: ConcreteMeshOptions = {},
  origin?: AnalysisOrigin
): PreparedAnalysis => {
  assertValidSectionGeometry(section, rebars)
  return prepareAnalysisFromMesh(section, rebars, materialStore, buildConcreteMesh(section, meshOptions), origin)
}

const finiteAnalysisNumber = (value: number, quantity: string): number => {
  if (!Number.isFinite(value)) {
    throw new AnalysisInputError('NON_FINITE_ANALYSIS', `Non-finite analysis ${quantity}.`, { quantity })
  }
  return value
}

const assertFiniteStrainState = (state: StrainState) => {
  finiteAnalysisNumber(state.e0, 'origin strain')
  finiteAnalysisNumber(state.kx, 'X curvature')
  finiteAnalysisNumber(state.ky, 'Y curvature')
}

const strainAt = (state: StrainState, fiber: Pick<Fiber, 'x' | 'y'>) =>
  finiteAnalysisNumber(state.e0 + state.kx * fiber.y + state.ky * fiber.x, 'point strain')

const zeroResultant = (): Resultant => ({ P: 0, Mx: 0, My: 0 })

/** Neumaier accumulation retains low-order terms when large positive and negative contributions cancel. */
class CompensatedScalar {
  private sum = 0
  private correction = 0

  add(value: number) {
    finiteAnalysisNumber(value, 'reduction term')
    const next = this.sum + value
    this.correction += Math.abs(this.sum) >= Math.abs(value)
      ? (this.sum - next) + value
      : (value - next) + this.sum
    this.sum = next
  }

  value() {
    return finiteAnalysisNumber(this.sum + this.correction, 'reduction total')
  }
}

class CompensatedResultant {
  private readonly p = new CompensatedScalar()
  private readonly mx = new CompensatedScalar()
  private readonly my = new CompensatedScalar()

  add(force: number, fiber: Pick<Fiber, 'x' | 'y'>) {
    this.p.add(force)
    this.mx.add(force * fiber.y)
    this.my.add(force * fiber.x)
  }

  finish(): Resultant {
    return { P: this.p.value(), Mx: this.mx.value(), My: this.my.value() }
  }
}

const assertFiniteMaterialEvaluation = (
  value: number,
  quantity: 'stress' | 'tangent',
  fiber: Fiber
) => {
  if (Number.isFinite(value)) return
  throw new AnalysisInputError(
    'INVALID_MATERIAL',
    `Material ${quantity} is non-finite at a ${fiber.kind} integration point.`,
    { quantity, fiberKind: fiber.kind, rebarId: fiber.kind === 'rebar' ? fiber.rebarId : undefined }
  )
}

const compensatedPair = (left: number, right: number) => {
  const sum = new CompensatedScalar()
  sum.add(left)
  sum.add(right)
  return sum.value()
}

const addResultant = (a: Resultant, b: Resultant): Resultant => ({
  P: compensatedPair(a.P, b.P),
  Mx: compensatedPair(a.Mx, b.Mx),
  My: compensatedPair(a.My, b.My)
})

const evaluate = (
  concreteFibers: ConcreteFiber[],
  rebarFibers: RebarFiber[],
  materials: AnalysisMaterials,
  state: StrainState
): ResultantLedger => {
  assertFiniteStrainState(state)
  const concreteSum = new CompensatedResultant()
  const steelGrossSum = new CompensatedResultant()
  const displacedConcreteSum = new CompensatedResultant()

  // PreparedAnalysis stores concrete points before rebars in `fibers`. Keeping the two loops in
  // that same order removes the per-Gauss-point kind branch without changing the order of any
  // compensated resultant accumulation or material evaluation.
  for (const fiber of concreteFibers) {
    const strain = strainAt(state, fiber)
    const concreteStress = materials.concrete.stress(strain)
    assertFiniteMaterialEvaluation(concreteStress, 'stress', fiber)
    concreteSum.add(concreteStress * fiber.area, fiber)
  }

  for (const fiber of rebarFibers) {
    const strain = strainAt(state, fiber)
    const concreteStress = materials.concrete.stress(strain)
    assertFiniteMaterialEvaluation(concreteStress, 'stress', fiber)
    const steelStress = fiber.steel.stress(strain)
    assertFiniteMaterialEvaluation(steelStress, 'stress', fiber)
    steelGrossSum.add(steelStress * fiber.area, fiber)
    displacedConcreteSum.add(-concreteStress * fiber.area, fiber)
  }

  const concrete = concreteSum.finish()
  const steelGross = steelGrossSum.finish()
  const displacedConcrete = displacedConcreteSum.finish()
  const steel = addResultant(steelGross, displacedConcrete)
  return { concrete, steelGross, displacedConcrete, steel, total: addResultant(concrete, steel) }
}

const evaluateWithTangent = (
  fibers: Fiber[],
  materials: AnalysisMaterials,
  state: StrainState
): { ledger: ResultantLedger; tangent: ResultantTangent } => {
  assertFiniteStrainState(state)
  const concreteSum = new CompensatedResultant()
  const steelGrossSum = new CompensatedResultant()
  const displacedConcreteSum = new CompensatedResultant()
  const tangentSums = Array.from({ length: 6 }, () => new CompensatedScalar())

  for (const fiber of fibers) {
    const strain = strainAt(state, fiber)
    const concreteStress = materials.concrete.stress(strain)
    let tangent = materials.concrete.tangent(strain)
    assertFiniteMaterialEvaluation(concreteStress, 'stress', fiber)
    assertFiniteMaterialEvaluation(tangent, 'tangent', fiber)

    if (fiber.kind !== 'rebar') {
      concreteSum.add(concreteStress * fiber.area, fiber)
    } else {
      const steelStress = fiber.steel.stress(strain)
      const steelTangent = fiber.steel.tangent(strain)
      assertFiniteMaterialEvaluation(steelStress, 'stress', fiber)
      assertFiniteMaterialEvaluation(steelTangent, 'tangent', fiber)
      steelGrossSum.add(steelStress * fiber.area, fiber)
      displacedConcreteSum.add(-concreteStress * fiber.area, fiber)
      // Embedded-bar contribution is fs*As - fc*As, so its consistent tangent is Es_t - Ec_t.
      tangent = steelTangent - tangent
    }

    const ta = tangent * fiber.area
    tangentSums[0].add(ta)
    tangentSums[1].add(ta * fiber.y)
    tangentSums[2].add(ta * fiber.x)
    tangentSums[3].add(ta * fiber.y * fiber.y)
    tangentSums[4].add(ta * fiber.x * fiber.y)
    tangentSums[5].add(ta * fiber.x * fiber.x)
  }

  const concrete = concreteSum.finish()
  const steelGross = steelGrossSum.finish()
  const displacedConcrete = displacedConcreteSum.finish()
  const [j00, j01, j02, j11, j12, j22] = tangentSums.map((sum) => sum.value())
  const steel = addResultant(steelGross, displacedConcrete)
  return {
    ledger: { concrete, steelGross, displacedConcrete, steel, total: addResultant(concrete, steel) },
    tangent: [
      [j00, j01, j02],
      [j01, j11, j12],
      [j02, j12, j22]
    ]
  }
}

/** Integrate a state against an already prepared mesh and compiled material set. */
export const evaluatePreparedState = (prepared: PreparedAnalysis, state: StrainState): ResultantLedger =>
  evaluate(prepared.concreteFibers, prepared.rebarFibers, prepared.materials, state)

/** Resultants and their exact consistent material tangent for one prepared strain state. */
export const evaluatePreparedStateWithTangent = (
  prepared: PreparedAnalysis,
  state: StrainState
): { ledger: ResultantLedger; tangent: ResultantTangent } =>
  evaluateWithTangent(prepared.fibers, prepared.materials, state)

/**
 * Peak strains of one plane against the declared material limits. `epsCu` always applies; the steel
 * rupture limit only exists when a definition declares `limits.epsU`, and its absence is reported as
 * `steelTensionLimit: null` rather than treated as "admissible".
 */
const evaluateAdmissibility = (
  prepared: PreparedAnalysis,
  concreteBoundary: Array<{ x: number; y: number }>,
  concreteLimit: number,
  state: StrainState
): StrainAdmissibility => {
  const violations: AdmissibilityViolation[] = []
  const maxConcreteCompression = concreteBoundary.reduce(
    (maximum, point) => Math.max(maximum, strainAt(state, point)),
    0
  )
  let maxSteelTension = 0
  let steelTensionLimit: number | null = null
  let governingSteelLimit: SteelStrainLimitEvidence | null = null

  const exceeded = new Set<number>()
  for (const group of prepared.steelSupports(state.ky, state.kx)) {
    const strainMin = strainAt(state, group.minimum)
    const compressionLimit = group.maximum.steel.limits.epsCompressionUltimate
    const strainMax = compressionLimit === undefined ? 0 : strainAt(state, group.maximum)
    maxSteelTension = Math.max(maxSteelTension, -strainMin)
    const tensionLimit = group.minimum.steel.limits.epsTensionUltimate
    if (tensionLimit !== undefined) {
      steelTensionLimit = steelTensionLimit === null ? tensionLimit : Math.min(steelTensionLimit, tensionLimit)
      governingSteelLimit = selectGoverningSteelStrainLimit(governingSteelLimit, {
        steelMaterialId: group.minimum.steel.id, rebarId: group.minimum.rebarId,
        side: 'tension', strain: strainMin, limit: tensionLimit
      })
    }
    if (compressionLimit !== undefined) governingSteelLimit = selectGoverningSteelStrainLimit(governingSteelLimit, {
      steelMaterialId: group.maximum.steel.id, rebarId: group.maximum.rebarId,
      side: 'compression', strain: strainMax, limit: compressionLimit
    })
    if ((tensionLimit !== undefined && -strainMin > tensionLimit * (1 + STRAIN_LIMIT_TOL)) ||
      (compressionLimit !== undefined && strainMax > compressionLimit * (1 + STRAIN_LIMIT_TOL))) {
      exceeded.add(group.minimum.steel.id)
    }
  }
  // Reconstruct full diagnostics only for groups that fail their extreme checks.
  for (const fiber of exceeded.size > 0 ? prepared.rebarFibers : []) {
    if (!exceeded.has(fiber.steel.id)) continue
    const strain = strainAt(state, fiber)
    const limit =
      strain < 0 ? fiber.steel.limits.epsTensionUltimate : fiber.steel.limits.epsCompressionUltimate
    if (limit === undefined) continue
    if (Math.abs(strain) > limit * (1 + STRAIN_LIMIT_TOL)) {
      violations.push({ code: 'STEEL_STRAIN_EXCEEDS_ULTIMATE', rebarId: fiber.rebarId, value: strain, limit })
    }
  }

  if (maxConcreteCompression > concreteLimit * (1 + STRAIN_LIMIT_TOL)) {
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
    governingSteelLimit,
    violations
  }
}

export const describeAdmissibility = (admissibility: StrainAdmissibility): string => {
  if (!admissibility.evaluated) return 'Material-strain admissibility is not applicable to this code-envelope face.'
  if (admissibility.ok) return 'Strain plane is inside the declared material domain.'
  return admissibility.violations
    .map((violation) =>
      violation.code === 'CONCRETE_STRAIN_EXCEEDS_ULTIMATE'
        ? `concrete strain ${violation.value.toExponential(3)} exceeds εcu = ${violation.limit.toExponential(3)}`
        : `rebar ${violation.rebarId} strain ${violation.value.toExponential(3)} exceeds εsu = ${violation.limit.toExponential(3)}`
    )
    .join('; ')
}

/**
 * Support coordinates for one direction, measured from the analysis origin (`docs/02` §3).
 * Only outer rings define the exterior compression support; holes never do.
 */
const projectedExtents = (
  section: SectionGeometry,
  beta: number,
  origin: AnalysisOrigin,
  rebars: GeometryInputRebarView[] = []
) => {
  const c = Math.cos(beta)
  const s = Math.sin(beta)
  const project = (point: { x: number; y: number }) => (point.y - origin.y) * c + (point.x - origin.x) * s
  const sectionValues = section.solids.flatMap((solid) => solid.outer).map(project)
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (const value of sectionValues) {
    if (value < min) min = value
    if (value > max) max = value
  }

  // Which bar controls this direction, not merely how far it sits: the station schedule is written
  // in terms of that bar's own yield and rupture strains (`docs/05` §2 seed-schedule policy).
  let tensionControl = min
  let controllingRebarIndex = -1
  for (let index = 0; index < rebars.length; index++) {
    const value = project(rebars[index])
    if (controllingRebarIndex < 0 || value < tensionControl) {
      tensionControl = value
      controllingRebarIndex = index
    }
  }

  return { min, max, tensionControl, controllingRebarIndex, steelBoundary: null as SteelStrainBoundary | null }
}

type ProjectedExtents = ReturnType<typeof projectedExtents>

const projectedSteelExtents = (prepared: PreparedAnalysis, beta: number) => {
  const extents = projectedExtents(prepared.section, beta, prepared.origin, prepared.rebars)
  if (prepared.hasSteelHardening) {
    const nx = Math.sin(beta)
    const ny = Math.cos(beta)
    extents.steelBoundary = createSteelStrainBoundary(prepared.steelSupports(nx, ny), extents.max,
      prepared.materialStore.concrete.limits.epsCu, nx, ny, STRAIN_LIMIT_TOL)
  }
  return extents
}

const withSteelBoundaryStations = (stations: SurfaceStation[], prepared: PreparedAnalysis): SurfaceStation[] => {
  if (!prepared.hasSteelHardening) return stations
  const last = stations[stations.length - 2]
  if (!last) return stations
  const transitions: SurfaceStation[] = [0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875].map((ratio, index) => ({
    id: `adaptive-station-steel-boundary-${index}`,
    label: `Steel-controlled boundary ${ratio}`,
    definition: { kind: 'tension-pole-transition-ratio', from: last.definition, ratio },
    fixed: true
  }))
  return [...stations.slice(0, -1), ...transitions, stations[stations.length - 1]]
}

/**
 * Fallback pure-tension strain when no steel definition declares a rupture limit.
 *
 * `docs/05` §2 forbids seeding a schedule from bare constants that can contradict `fy/Es`. The
 * schedule still needs a finite tension pole, so this is expressed as a multiple of the controlling
 * bar's own yield strain: far enough onto the plateau that an elastic-perfectly-plastic law is fully
 * yielded, and reported as an assumption rather than presented as a code value.
 */
const PURE_TENSION_YIELD_MULTIPLE = 25

const DEFAULT_STATION_STEEL_LIMITS: StationSteelLimits = { epsY: 0.002, epsU: null }

type StationSteelControl = StationSteelLimits & {
  steel: CompiledMaterial
  definition: SteelMaterial
  /** Design yield stress fyd = fy / γs, MPa. */
  fyd: number
  /** Specified yield stress used by code transition rules, MPa. */
  yieldStress: number
}

const stationSteelControl = (
  materials: AnalysisMaterials,
  materialStore: MaterialStore,
  rebars: GeometryInputRebarView[],
  defaultSteelMaterialId: number,
  controllingRebarIndex: number
): StationSteelControl => {
  const bar = controllingRebarIndex >= 0 ? rebars[controllingRebarIndex] : undefined
  const steel =
    materials.steel.get(bar?.steelMaterialId ?? defaultSteelMaterialId) ??
    materials.steel.get(defaultSteelMaterialId) ??
    [...materials.steel.values()][0]
  if (!steel) {
    throw new AnalysisInputError('INVALID_ANALYSIS_OPTIONS', 'A steel-based station schedule requires a steel material.')
  }
  const definition =
    materialStore.steel.find((item) => item.id === steel.id) ??
    materialStore.steel.find((item) => item.id === defaultSteelMaterialId)
  if (!definition) {
    throw new AnalysisInputError('INVALID_ANALYSIS_OPTIONS', `Steel material ${steel.id} has no source definition.`)
  }
  return {
    steel,
    definition,
    fyd:
      definition.fy /
      (definition.factors?.gammaS ?? 1) *
      (definition.factors?.resistanceScale ?? 1),
    yieldStress: definition.fy,
    epsY: steel.limits.epsYield ?? DEFAULT_STATION_STEEL_LIMITS.epsY,
    epsU: steel.limits.epsTensionUltimate ?? null
  }
}

const strainAtSteelStressRatio = (ratio: number, control: StationSteelControl) => {
  if (ratio === 0) return 0
  const candidate = -ratio * control.epsY
  const target = -ratio * control.fyd
  const candidateStress = control.steel.stress(candidate)
  const stressScale = Math.max(1, control.fyd)
  // Preserve the exact legacy arithmetic on linear elastic branches.
  if (Math.abs(candidateStress - target) <= 1e-12 * stressScale) return candidate

  const curveKnots =
    control.definition.stressStrain.type === 'user-curve'
      ? control.definition.stressStrain.points
          .map((point) => point.strain)
          .filter((strain) => strain > -control.epsY && strain < 0)
      : []
  const knots = [...new Set([-control.epsY, ...curveKnots, 0])].sort((a, b) => a - b)
  const stresses = knots.map((strain) => control.steel.stress(strain))
  for (let index = 1; index < stresses.length; index++) {
    if (stresses[index] < stresses[index - 1] - 1e-12 * stressScale) {
      throw new AnalysisInputError(
        'INVALID_ANALYSIS_OPTIONS',
        'The controlling steel law is not monotone on its tensile pre-yield branch; fₛ/fyd is ambiguous.'
      )
    }
  }
  let bracket = -1
  for (let index = knots.length - 2; index >= 0; index--) {
    if (stresses[index] <= target && target <= stresses[index + 1]) {
      bracket = index
      break
    }
  }
  if (bracket < 0) {
    throw new AnalysisInputError(
      'INVALID_ANALYSIS_OPTIONS',
      `The controlling steel law cannot resolve fₛ/fyd = ${ratio} on its tensile pre-yield branch.`
    )
  }
  let low = knots[bracket]
  let high = knots[bracket + 1]
  for (let iteration = 0; iteration < 64; iteration++) {
    const mid = (low + high) / 2
    if (control.steel.stress(mid) < target) low = mid
    else high = mid
  }
  return (low + high) / 2
}

const transitionLimitForStation = (basis: DesignBasis, control: StationSteelControl) =>
  basis.format === 'globalResultantFactor'
    ? resolveTensionControlledStrainLimit(basis, control.epsY, control.yieldStress)
    : Math.max(control.epsY, 0.005)

const farTensionSteelStrain = (
  station: StationDefinition,
  control: StationSteelControl,
  basis: DesignBasis
) => {
  if (station.kind === 'steel-strain') return station.strain
  if (station.kind === 'steel-stress-ratio') return strainAtSteelStressRatio(station.ratio, control)
  if (station.kind === 'bar-tension-yield-ratio') return -station.ratio * control.epsY
  if (station.kind === 'strength-reduction-transition-ratio') {
    const upper = transitionLimitForStation(basis, control)
    return -(control.epsY + station.ratio * (upper - control.epsY))
  }
  if (station.kind === 'strength-reduction-post-transition') {
    return station.strain
  }
  return 0
}

const pureTensionStrain = (limits: StationSteelLimits) =>
  -(limits.epsU ?? PURE_TENSION_YIELD_MULTIPLE * limits.epsY)

const previewStationStateFromExtents = (
  beta: number,
  station: StationDefinition,
  epsCu: number,
  pureCompressionStrain: number,
  control: StationSteelControl,
  designBasis: DesignBasis,
  globalPureTensionStrain: number,
  extents: ProjectedExtents
): StrainState => {
  if (station.kind === 'pure-compression') {
    const state = { e0: pureCompressionStrain, kx: 0, ky: 0 }
    return extents.steelBoundary?.constrain(state) ?? state
  }
  if (station.kind === 'pure-tension') {
    const state = { e0: globalPureTensionStrain, kx: 0, ky: 0 }
    return extents.steelBoundary?.constrain(state) ?? state
  }
  if (station.kind === 'adaptive-state-interpolation') {
    const left = previewStationStateFromExtents(
      beta,
      station.left,
      epsCu,
      pureCompressionStrain,
      control,
      designBasis,
      globalPureTensionStrain,
      extents
    )
    const right = previewStationStateFromExtents(
      beta,
      station.right,
      epsCu,
      pureCompressionStrain,
      control,
      designBasis,
      globalPureTensionStrain,
      extents
    )
    if (extents.steelBoundary) return extents.steelBoundary.interpolate(left, right, station.ratio)
    return {
      e0: left.e0 + (right.e0 - left.e0) * station.ratio,
      kx: left.kx + (right.kx - left.kx) * station.ratio,
      ky: left.ky + (right.ky - left.ky) * station.ratio
    }
  }
  if (station.kind === 'tension-pole-transition-ratio') {
    const source = previewStationStateFromExtents(
      beta,
      station.from,
      epsCu,
      pureCompressionStrain,
      control,
      designBasis,
      globalPureTensionStrain,
      extents
    )
    if (extents.steelBoundary) return extents.steelBoundary.transition(source, station.ratio)
    const c = Math.cos(beta)
    const s = Math.sin(beta)
    const controlDistance = Math.max(1e-12, extents.max - extents.tensionControl)
    const target = globalPureTensionStrain
    const targetCurvature = (epsCu - target) / controlDistance
    const targetPivot = {
      e0: epsCu - targetCurvature * extents.max,
      kx: targetCurvature * c,
      ky: targetCurvature * s
    }
    const zeroCompressionCurvature = -target / controlDistance
    const zeroCompression = {
      e0: -zeroCompressionCurvature * extents.max,
      kx: zeroCompressionCurvature * c,
      ky: zeroCompressionCurvature * s
    }
    const uniform = { e0: target, kx: 0, ky: 0 }
    const blend = (left: StrainState, right: StrainState, ratio: number): StrainState => ({
      e0: left.e0 + (right.e0 - left.e0) * ratio,
      kx: left.kx + (right.kx - left.kx) * ratio,
      ky: left.ky + (right.ky - left.ky) * ratio
    })
    const progress = Math.max(0, Math.min(1, station.ratio)) * 3
    if (progress <= 1) return blend(source, targetPivot, progress)
    if (progress <= 2) return blend(targetPivot, zeroCompression, progress - 1)
    return blend(zeroCompression, uniform, progress - 2)
  }

  const compressionProjection = extents.max
  const c1 = Math.max(1e-9, compressionProjection - extents.tensionControl)
  const sectionDepth = Math.max(1e-9, extents.max - extents.min)
  const controlProjection =
    station.kind === 'neutral-axis-ratio'
      ? compressionProjection - station.cOverC1 * c1
      : station.kind === 'neutral-axis-depth-ratio'
        ? compressionProjection - station.ratio * sectionDepth
      : station.kind === 'neutral-axis-control-gap-ratio'
        ? extents.min + station.ratio * (extents.tensionControl - extents.min)
      : extents.tensionControl
  // A schedule strain past the controlling bar's declared rupture strain is not a reachable state.
  const requestedStrain =
    station.kind === 'neutral-axis-ratio' ||
      station.kind === 'neutral-axis-depth-ratio' ||
      station.kind === 'neutral-axis-control-gap-ratio'
      ? 0
      : farTensionSteelStrain(station, control, designBasis)
  const controlStrain = control.epsU === null ? requestedStrain : Math.max(requestedStrain, -control.epsU)
  let compressionBoundaryStrain = epsCu
  if (
    (station.kind === 'neutral-axis-ratio' ||
      station.kind === 'neutral-axis-depth-ratio' ||
      station.kind === 'neutral-axis-control-gap-ratio') &&
    designBasis.format === 'designMaterialReevaluation' &&
    designBasis.compressionEndpoint === 'peak-stress-strain'
  ) {
    const neutralAxisDepth = compressionProjection - controlProjection
    if (neutralAxisDepth > sectionDepth) {
      // KDS Appendix 3.1 and EN 1992 domain 5 distinguish the uniform peak-stress strain
      // (eps_c0/eps_c2), flexure with the neutral axis inside the section (eps_cu/eps_cu2), and
      // the all-compression domain between them. The latter rotates about the code's compression
      // pivot, producing a continuous boundary between those two limits.
      const pivotDepth = (1 - pureCompressionStrain / epsCu) * sectionDepth
      compressionBoundaryStrain =
        pureCompressionStrain * neutralAxisDepth /
        Math.max(1e-9, neutralAxisDepth - pivotDepth)
    }
  }
  const curvature = (compressionBoundaryStrain - controlStrain) /
    Math.max(1e-9, compressionProjection - controlProjection)
  const c = Math.cos(beta)
  const s = Math.sin(beta)
  const state = {
    e0: compressionBoundaryStrain - curvature * compressionProjection,
    kx: curvature * c,
    ky: curvature * s
  }
  return extents.steelBoundary?.constrain(state) ?? state
}

/**
 * Strain plane for reporting station `P{stationIndex}` in direction `beta`.
 *
 * `steel` may be a bare yield strain for callers that only have one grade, or the controlling bar's
 * full limits so the rupture strain can cap the schedule.
 */
export const previewStationState = (
  section: SectionGeometry,
  rebars: GeometryInputRebarView[],
  beta: number,
  stationIndex: number,
  epsCu: number,
  steel: number | StationSteelLimits,
  origin: AnalysisOrigin = netConcreteCentroid(section)
): StrainState => {
  const limits = typeof steel === 'number' ? { epsY: steel, epsU: null } : steel
  const definition = UNIFIED_STATIONS[stationIndex] ?? UNIFIED_STATIONS[0]
  // Compatibility helper has no compiled law. The default schedules only use the linear pre-yield
  // branch, represented exactly by this minimal evaluator.
  const control: StationSteelControl = {
    ...limits,
    fyd: 1,
    yieldStress: 1,
    definition: {
      id: 0,
      name: 'Compatibility linear steel',
      standard: 'CUSTOM',
      fy: 1,
      elasticModulus: 1 / limits.epsY,
      stressStrain: { type: 'elastic-perfectly-plastic' }
    },
    steel: {
      id: 0,
      family: 'steel',
      stress: (strain) => strain / limits.epsY,
      tangent: () => 1 / limits.epsY,
      limits: {}
    }
  }
  return previewStationStateFromExtents(
    beta,
    definition,
    epsCu,
    epsCu,
    control,
    createDefaultDesignBasis(),
    pureTensionStrain(limits),
    projectedExtents(section, beta, origin, rebars)
  )
}

const groupSurfaceRows = (points: PreviewSurfacePoint[]) => {
  const byBeta = new Map<number, PreviewSurfacePoint[]>()
  for (const point of points) {
    const row = byBeta.get(point.beta)
    if (row) row.push(point)
    else byBeta.set(point.beta, [point])
  }
  return [...byBeta.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([beta, curve]) => ({
      beta,
      curve: curve.sort((a, b) => a.station - b.station)
    }))
}

type SurfaceTriangle = PreparedSurfaceTriangle<PreviewSurfacePoint>

const surfaceTrianglesCache = new WeakMap<PreviewSurfacePoint[], SurfaceTriangle[]>()
const indexedSurfaceTriangles = new IndexedSurfaceTopologyCache<PreviewSurfacePoint>(
  (left, right) => physicalEdgeDirection(left, right) !== null
)

const directionNeutralSurfaceVertex = (point: PreviewSurfacePoint) =>
  point.surfaceRole === 'pure-compression' ||
  point.surfaceRole === 'pure-tension' ||
  (
    point.surfaceRole === 'axial-cap' &&
    point.onSampledDirection !== false &&
    Math.hypot(point.Mx, point.My) <= 1e-9
  )

const physicalEdgeDirection = (left: PreviewSurfacePoint, right: PreviewSurfacePoint) => {
  if (left.onSampledDirection === false || right.onSampledDirection === false) return null
  if (left.beta === right.beta) return left.beta
  if (directionNeutralSurfaceVertex(left) && !directionNeutralSurfaceVertex(right)) return right.beta
  if (directionNeutralSurfaceVertex(right) && !directionNeutralSurfaceVertex(left)) return left.beta
  return null
}

const previewSurfaceTriangles = (
  points: PreviewSurfacePoint[],
  topology?: readonly SurfaceIndexTriangle[]
): SurfaceTriangle[] => {
  if (topology) {
    return indexedSurfaceTriangles.get(points, topology)
  }
  const cached = surfaceTrianglesCache.get(points)
  if (cached) return cached
  const rows = groupSurfaceRows(points)
  const triangles: SurfaceTriangle[] = []
  if (rows.length < 2) {
    surfaceTrianglesCache.set(points, triangles)
    return triangles
  }

  const referenceStations = rows[0].curve.map((point) => point.station)
  const structured = rows.every(({ curve }) =>
    curve.length === referenceStations.length &&
    curve.every((point, index) => {
      const reference = referenceStations[index]
      return Math.abs(point.station - reference) <= 1e-12 * Math.max(1, Math.abs(reference))
    })
  )
  if (!structured) {
    throw new Error(
      'Explicit surface topology is required when direction rows have unequal or independently adaptive station schedules.'
    )
  }

  for (let i = 0; i < rows.length; i++) {
    const current = rows[i].curve
    const next = rows[(i + 1) % rows.length].curve
    const stationCount = current.length
    for (let station = 0; station < stationCount - 1; station++) {
      const a = current[station]
      const b = next[station]
      const c = next[station + 1]
      const d = current[station + 1]
      // (b,c) walks the station axis inside `next`; (d,a) does the same inside `current`.
      triangles.push(
        { vertices: [a, b, c], sameDirectionEdge: [false, true, false] },
        { vertices: [a, c, d], sameDirectionEdge: [false, false, true] }
      )
    }
  }

  surfaceTrianglesCache.set(points, triangles)
  return triangles
}

const lerpPoint = (
  a: Pick<PreviewSurfacePoint, 'P' | 'Mx' | 'My' | 'beta' | 'station'>,
  b: Pick<PreviewSurfacePoint, 'P' | 'Mx' | 'My' | 'beta' | 'station'>,
  t: number
): PreviewContourPoint => ({
  beta: a.beta + (b.beta - a.beta) * t,
  P: a.P + (b.P - a.P) * t,
  Mx: a.Mx + (b.Mx - a.Mx) * t,
  My: a.My + (b.My - a.My) * t,
  station: a.station + (b.station - a.station) * t
})

type UniquePointIndex = {
  momentTol: number
  forceTol: number
  buckets: Map<string, number[]>
}

const uniquePointIndexes = new WeakMap<object[], UniquePointIndex>()

const uniqueBucket = (p: Pick<Resultant, 'P' | 'Mx' | 'My'>, momentTol: number, forceTol: number) => [
  Math.floor(p.P / forceTol),
  Math.floor(p.Mx / momentTol),
  Math.floor(p.My / momentTol)
]

const appendUniquePoint = <T extends Pick<Resultant, 'P' | 'Mx' | 'My'> & { onSampledDirection?: boolean }>(
  target: T[],
  point: T,
  momentTol: number,
  forceTol: number
) => {
  let index = uniquePointIndexes.get(target)
  // The contour normally has only a few dozen points; a linear scan wins there by avoiding 27
  // string-key probes. Switch to the spatial index only when the asymptotic O(n²) cost can matter.
  if (!index && target.length < 64) {
    const duplicate = target.find(
      (item) =>
        Math.abs(item.P - point.P) <= forceTol &&
        Math.abs(item.Mx - point.Mx) <= momentTol &&
        Math.abs(item.My - point.My) <= momentTol
    )
    if (!duplicate) target.push(point)
    else if (point.onSampledDirection) duplicate.onSampledDirection = true
    return
  }
  if (!index || index.momentTol !== momentTol || index.forceTol !== forceTol) {
    index = { momentTol, forceTol, buckets: new Map() }
    target.forEach((item, itemIndex) => {
      const [p, mx, my] = uniqueBucket(item, momentTol, forceTol)
      const key = `${p}:${mx}:${my}`
      const bucket = index!.buckets.get(key)
      if (bucket) bucket.push(itemIndex)
      else index!.buckets.set(key, [itemIndex])
    })
    uniquePointIndexes.set(target, index)
  }

  const [p, mx, my] = uniqueBucket(point, momentTol, forceTol)
  let duplicate: T | undefined
  // Points within one tolerance can straddle a bin boundary, so inspect the 3³ neighbouring bins.
  for (let dp = -1; dp <= 1 && !duplicate; dp++) {
    for (let dmx = -1; dmx <= 1 && !duplicate; dmx++) {
      for (let dmy = -1; dmy <= 1 && !duplicate; dmy++) {
        const candidates = index.buckets.get(`${p + dp}:${mx + dmx}:${my + dmy}`) ?? []
        duplicate = candidates
          .map((candidate) => target[candidate])
          .find(
            (item) =>
              Math.abs(item.P - point.P) <= forceTol &&
              Math.abs(item.Mx - point.Mx) <= momentTol &&
              Math.abs(item.My - point.My) <= momentTol
          )
      }
    }
  }
  if (!duplicate) {
    const bucketKey = `${p}:${mx}:${my}`
    const bucket = index.buckets.get(bucketKey)
    if (bucket) bucket.push(target.length)
    else index.buckets.set(bucketKey, [target.length])
    target.push(point)
    return
  }
  // Keep the label: at a surface pole many edges collapse onto one point, and dropping the
  // duplicate must not drop the fact that a sampled direction passes through it.
  if (point.onSampledDirection) duplicate.onSampledDirection = true
}

const trianglePlaneIntersections = (
  triangle: SurfaceTriangle,
  distance: (point: PreviewSurfacePoint) => number,
  tol: number
) => {
  const [v0, v1, v2] = triangle.vertices
  const intersections: PreviewContourPoint[] = []
  const edges: Array<[PreviewSurfacePoint, PreviewSurfacePoint, boolean]> = [
    [v0, v1, triangle.sameDirectionEdge[0]],
    [v1, v2, triangle.sameDirectionEdge[1]],
    [v2, v0, triangle.sameDirectionEdge[2]]
  ]

  for (const [a, b, sameDirection] of edges) {
    const da = distance(a)
    const db = distance(b)
    const aOn = Math.abs(da) <= tol
    const bOn = Math.abs(db) <= tol

    // A physical grid vertex or cap-boundary vertex belongs to a sampled meridian. Synthetic
    // vertices created on cross-beta cap edges deliberately do not; preserve that provenance when
    // the cutting plane is coincident with the cap face.
    if (aOn) appendUniquePoint(
      intersections,
      { ...a, onSampledDirection: a.onSampledDirection !== false },
      tol,
      tol
    )
    if (bOn) appendUniquePoint(
      intersections,
      { ...b, onSampledDirection: b.onSampledDirection !== false },
      tol,
      tol
    )
    if (aOn || bOn || da * db > 0) continue

    const t = da / (da - db)
    const point = lerpPoint(a, b, t)
    const edgeDirection = sameDirection ? physicalEdgeDirection(a, b) : null
    appendUniquePoint(
      intersections,
      {
        ...point,
        ...(edgeDirection === null ? {} : { beta: edgeDirection }),
        onSampledDirection: edgeDirection !== null
      },
      tol,
      tol
    )
  }

  return intersections
}

/**
 * Integrate one explicit strain plane and return the full contribution ledger. Exported so
 * verification fixtures can replay a reference strain state instead of only the station schedule.
 */
export const evaluatePreviewState = (
  section: SectionGeometry,
  rebars: GeometryInputRebarView[],
  materialStore: MaterialStore,
  state: StrainState,
  meshOptions: ConcreteMeshOptions = {},
  origin: AnalysisOrigin = netConcreteCentroid(section)
): ResultantLedger => evaluatePreparedState(prepareAnalysis(section, rebars, materialStore, meshOptions, origin), state)

/**
 * Resolve the uniform strain that defines pure compression for the selected basis.
 *
 * KDS 14 20 20:2022 Appendix 3.1(2) and EN 1992 Figure 6.1 domain 5 reach uniform pure
 * compression at the peak-stress strain (`eps_c0`/`eps_c2`), not at `eps_cu`. A missing peak
 * strain is a fatal input, never a silent fallback: the endpoint selects both the compatible
 * all-compression strain plane and the steel stress present at the pure-compression pole.
 */
export const resolvePureCompressionStrain = (
  materialStore: MaterialStore,
  designBasis: DesignBasis
): number => {
  const epsCu = materialStore.concrete.limits.epsCu
  if (
    designBasis.format !== 'designMaterialReevaluation' ||
    designBasis.compressionEndpoint !== 'peak-stress-strain'
  ) {
    return epsCu
  }
  const eps0 = materialStore.concrete.limits.eps0
  if (!(typeof eps0 === 'number' && Number.isFinite(eps0) && eps0 > 0 && eps0 <= epsCu)) {
    throw new AnalysisInputError(
      'INVALID_MATERIAL',
      `${designBasis.identity.document} evaluates pure compression at the peak-stress strain, so concrete material ${materialStore.concrete.id} requires a positive eps_c0 not greater than eps_cu.`
    )
  }
  return eps0
}

/**
 * Build the configured strain-domain surface.
 *
 * Probe stations are persisted by stable ID. Production uses `probe: "all"`; the historical
 * four-probe schedule remains only in explicit legacy options. An empty ID list deliberately skips
 * the estimate and reports NaN rather than a false zero.
 */
type PreviewSamplingHooks = {
  mapPoint?: (point: PreviewSurfacePoint) => PreviewSurfacePoint
  mapRow?: (points: PreviewSurfacePoint[]) => PreviewSurfacePoint[]
  /** Prevent cancellation between concrete and reinforcement in material-factor calculations. */
  componentAware?: boolean
  /** Internal performance counter; one call per constitutive integration. */
  onEvaluate?: () => void
}

const buildPreviewSurfaceFromPreparedLegacy = (
  prepared: PreparedAnalysis,
  analysisOptions: AnalysisOptions = createDefaultAnalysisOptions(),
  designBasis: DesignBasis = createDefaultDesignBasis(prepared.materialStore),
  sampling: PreviewSamplingHooks = {}
): PreviewSurface => {
  const { section, rebars, materialStore, origin, concreteFibers, rebarFibers, materials } = prepared
  const meshReport = prepared.mesh.report
  const epsCu = materialStore.concrete.limits.epsCu
  const pureCompressionStrain = resolvePureCompressionStrain(materialStore, designBasis)
  let stations = withSteelBoundaryStations(analysisStations(analysisOptions), prepared)
  const fixedStationCount = stations.length
  const seedBetas = analysisDirections(analysisOptions)
  const warnings: string[] = []

  // An unusable mesh is rejected in prepareAnalysisFromMesh, so anything left here is advisory.
  if (section.solids.length !== 1) warnings.push('Preview engine supports one concrete region best; multi-region output is approximate.')
  for (const issue of meshReport.warnings) warnings.push(`Concrete mesh: ${issue}`)
  if (rebars.length === 0) warnings.push('No rebars are present; steel contribution is zero.')
  const domainMismatch = strainDomainMismatch(materialStore.concrete, prepared.hasSteelHardening ? materialStore.steel : undefined)
  if (domainMismatch) warnings.push(`Strain domain: ${domainMismatch.message} See ${domainMismatch.reference}.`)

  const usedSteel = new Map<number, CompiledMaterial>()
  for (const bar of rebars) {
    const materialId = bar.steelMaterialId ?? materialStore.defaults.steelMaterialId
    const steel = materials.steel.get(materialId)
    if (steel) usedSteel.set(materialId, steel)
  }
  if (usedSteel.size === 0) {
    const fallback =
      materials.steel.get(materialStore.defaults.steelMaterialId) ?? [...materials.steel.values()][0]
    if (fallback) usedSteel.set(fallback.id, fallback)
  }
  const declaredTensionLimits = [...usedSteel.values()]
    .map((steel) => steel.limits.epsTensionUltimate)
    .filter((value): value is number => value !== undefined)
  const undeclaredYieldStrains = [...usedSteel.values()]
    .filter((steel) => steel.limits.epsTensionUltimate === undefined)
    .map((steel) => steel.limits.epsYield ?? DEFAULT_STATION_STEEL_LIMITS.epsY)
  const effectiveTensionLimits = [
    ...declaredTensionLimits,
    ...(undeclaredYieldStrains.length > 0
      ? [PURE_TENSION_YIELD_MULTIPLE * Math.max(...undeclaredYieldStrains)]
      : [])
  ]
  const deepestConfiguredTensionStrain = Math.max(
    0,
    ...stations.map((station) =>
      station.definition.kind === 'steel-strain' ? Math.abs(station.definition.strain) : 0
    )
  )
  const globalPureTensionStrain = -(
    declaredTensionLimits.length > 0
      ? prepared.hasSteelHardening
        ? Math.min(...declaredTensionLimits)
        : Math.min(...effectiveTensionLimits)
      : Math.max(
          ...effectiveTensionLimits,
          deepestConfiguredTensionStrain,
          PURE_TENSION_YIELD_MULTIPLE * DEFAULT_STATION_STEEL_LIMITS.epsY
        )
  )
  const allStationOrders = (schedule: SurfaceStation[]) => schedule.map((_, station) => station)
  let duplicateStationWarning = false

  /**
   * Stations of one direction. `stations` narrows the work for the midpoint probe, which only needs
   * a handful of stations and would otherwise double the cost of every surface build.
   */
  const buildRow = (
    beta: number,
    schedule: SurfaceStation[] = stations,
    stationOrders: number[] = allStationOrders(schedule)
  ): PreviewSurfacePoint[] => {
    const extents = projectedSteelExtents(prepared, beta)
    // The controlling bar changes with direction, so its yield and rupture strains do too.
    const control = stationSteelControl(
      materials,
      materialStore,
      rebars,
      materialStore.defaults.steelMaterialId,
      extents.controllingRebarIndex
    )
    const degrees = Number(((beta * 180) / Math.PI).toFixed(3))
    const resolved = stationOrders.map((station) => {
      const descriptor = schedule[station]
      const state = previewStationStateFromExtents(
        beta,
        descriptor.definition,
        epsCu,
        pureCompressionStrain,
        control,
        designBasis,
        globalPureTensionStrain,
        extents
      )
      return { station, descriptor, state }
    })

    if (stationOrders.length === schedule.length && rebars.length > 0 && !extents.steelBoundary) {
      const bar = rebars[extents.controllingRebarIndex]
      let previous = Number.POSITIVE_INFINITY
      for (const point of resolved) {
        const strain =
          point.state.e0 + point.state.kx * (bar.y - origin.y) + point.state.ky * (bar.x - origin.x)
        const tolerance = 1e-11 * Math.max(1, Math.abs(previous), Math.abs(strain))
        if (strain > previous + tolerance) {
          throw new AnalysisInputError(
            'INVALID_ANALYSIS_OPTIONS',
            `Station "${point.descriptor.label}" breaks the compression-to-tension order at β=${degrees}°.`,
            { betaDeg: degrees, stationId: point.descriptor.id, previousStrain: previous, strain }
          )
        }
        if (Math.abs(strain - previous) <= tolerance && Number.isFinite(previous)) duplicateStationWarning = true
        previous = strain
      }
    }
    const row = resolved.map(({ station, descriptor, state }) => {
      sampling.onEvaluate?.()
      const ledger = evaluate(concreteFibers, rebarFibers, materials, state)
      const point: PreviewSurfacePoint = {
        id: `${degrees}-${descriptor.id}`,
        beta,
        station,
        stationId: descriptor.id,
        surfaceRole: descriptor.id === 'pure-compression'
          ? 'pure-compression'
          : descriptor.id === 'pure-tension'
            ? 'pure-tension'
            : 'physical-state',
        state,
        ledger,
        ...ledger.total
      }
      return sampling.mapPoint?.(point) ?? point
    })
    return sampling.mapRow?.(row) ?? row
  }

  const rows = new Map<number, PreviewSurfacePoint[]>()
  for (const beta of seedBetas) rows.set(beta, buildRow(beta))

  const sortedBetas = () => [...rows.keys()].sort((a, b) => a - b)
  const allPoints = () => sortedBetas().flatMap((beta) => rows.get(beta)!)

  const ledgerParts = ['total', 'concrete', 'steelGross', 'displacedConcrete', 'steel'] as const
  type LedgerPart = (typeof ledgerParts)[number]
  type SamplingScales = Record<LedgerPart, { P: number; M: number }>
  const scales = (): SamplingScales => {
    const result = Object.fromEntries(
      ledgerParts.map((part) => [part, { P: 1, M: 1 }])
    ) as SamplingScales
    for (const point of allPoints()) {
      for (const part of ledgerParts) {
        const value = point.ledger[part]
        result[part].P = Math.max(result[part].P, Math.abs(value.P))
        result[part].M = Math.max(result[part].M, Math.hypot(value.Mx, value.My))
      }
    }
    return result
  }

  const chordError = (
    middle: PreviewSurfacePoint,
    left: PreviewSurfacePoint,
    right: PreviewSurfacePoint,
    scale: SamplingScales
  ) => {
    let relativeP = 0
    let relativeMoment = 0
    let relativeComponent = 0
    for (const part of ledgerParts) {
      if (!sampling.componentAware && part !== 'total') continue
      const actual = middle.ledger[part]
      const a = left.ledger[part]
      const b = right.ledger[part]
      const p = Math.abs(actual.P - (a.P + b.P) / 2) / scale[part].P
      const moment = Math.hypot(
        actual.Mx - (a.Mx + b.Mx) / 2,
        actual.My - (a.My + b.My) / 2
      ) / scale[part].M
      if (part === 'total') {
        relativeP = Math.max(relativeP, p)
        relativeMoment = Math.max(relativeMoment, moment)
      }
      relativeComponent = Math.max(relativeComponent, p, moment)
    }
    return { relativeP, relativeMoment, relativeComponent }
  }

  const directionRefinement = analysisOptions.directions.refinement
  const probeStationOrders = () =>
    directionRefinement.probe === 'all'
      ? allStationOrders(stations).slice(1, -1)
      : directionRefinement.probe.stationIds.flatMap((id) => {
          const index = stations.findIndex((station) => station.id === `station-${id}`)
          return index >= 0 ? [index] : []
        })

  /**
   * Chord error of one direction interval: evaluate the true state halfway between two sampled
   * directions and compare it with the straight line the triangulated surface uses there.
   */
  const intervalError = (
    betaA: number,
    betaB: number,
    betaBKey: number,
    scale: SamplingScales
  ) => {
    const rowA = rows.get(betaA)!
    // The closing interval uses an unwrapped betaB for its midpoint but an exact existing map key.
    // `% 2π` is not bit-stable when the first configured angle is nonzero.
    const rowB = rows.get(betaBKey)!
    const midBeta = (betaA + betaB) / 2
    const probe = buildRow(midBeta)
    let relativeP = 0
    let relativeMoment = 0
    let relativeComponent = 0
    for (const station of probeStationOrders()) {
      const error = chordError(probe[station], rowA[station], rowB[station], scale)
      relativeP = Math.max(relativeP, error.relativeP)
      relativeMoment = Math.max(relativeMoment, error.relativeMoment)
      relativeComponent = Math.max(relativeComponent, error.relativeComponent)
    }
    return { midBeta, relativeP, relativeMoment, relativeComponent }
  }

  const directionTolerance = directionRefinement.type === 'adaptive'
    ? directionRefinement.tolerance
    : Number.POSITIVE_INFINITY
  const maxDirectionPasses = directionRefinement.type === 'adaptive' ? directionRefinement.maxPasses : 0
  const maxDirections = directionRefinement.type === 'adaptive' ? directionRefinement.maxDirections : rows.size
  const stationRefinement = analysisOptions.stations.refinement
  const directionAdaptive = directionRefinement.type === 'adaptive'
  const stationAdaptive = stationRefinement.type === 'adaptive'
  const stationTolerance = stationRefinement.type === 'adaptive'
    ? stationRefinement.tolerance
    : Number.POSITIVE_INFINITY
  const maxStationPasses = stationRefinement.type === 'adaptive' ? stationRefinement.maxPasses : 0
  const maxStations = stationRefinement.type === 'adaptive' ? stationRefinement.maxStations : stations.length

  // NaN, not 0: an estimate that was never taken must not read as "no error found".
  let maxRelativeP = Number.NaN
  let maxRelativeMoment = Number.NaN
  let maxRelativeComponent = Number.NaN
  let worstBeta = Number.NaN
  let directionPasses = 0
  let stationPasses = 0
  let maxStationError = Number.NaN

  const measureStationIntervals = (scale: SamplingScales) => {
    const entries: Array<{ interval: number; station: SurfaceStation; error: number }> = []
    maxStationError = 0
    for (let interval = 0; interval < stations.length - 1; interval += 1) {
      const descriptor = adaptiveStation(
        midpointStationDefinition(stations[interval].definition, stations[interval + 1].definition)
      )
      const candidateSchedule = [
        ...stations.slice(0, interval + 1),
        descriptor,
        ...stations.slice(interval + 1)
      ]
      let error = 0
      for (const beta of sortedBetas()) {
        // Only the true midpoint is new. Re-evaluating the entire candidate schedule here makes
        // adaptive sampling O(stations² × fibres) without adding any evidence.
        const candidate = buildRow(beta, candidateSchedule, [interval + 1])[0]
        const row = rows.get(beta)!
        error = Math.max(error, chordError(candidate, row[interval], row[interval + 1], scale).relativeComponent)
      }
      maxStationError = Math.max(maxStationError, error)
      entries.push({ interval, station: descriptor, error })
    }
    return entries
  }

  const measureDirectionIntervals = (scale: SamplingScales) => {
    const betas = sortedBetas()
    const entries: Array<{ beta: number; error: number }> = []
    if (probeStationOrders().length === 0) {
      maxRelativeP = Number.NaN
      maxRelativeMoment = Number.NaN
      maxRelativeComponent = Number.NaN
      worstBeta = Number.NaN
      return entries
    }
    maxRelativeP = 0
    maxRelativeMoment = 0
    maxRelativeComponent = 0
    worstBeta = betas[0] ?? 0
    for (let index = 0; index < betas.length; index++) {
      const betaA = betas[index]
      // The closing interval wraps to the first direction at 2π.
      const betaB = index === betas.length - 1 ? betas[0] + 2 * Math.PI : betas[index + 1]
      const betaBKey = index === betas.length - 1 ? betas[0] : betaB
      const { midBeta, relativeP, relativeMoment, relativeComponent } = intervalError(
        betaA,
        betaB,
        betaBKey,
        scale
      )
      if (relativeP > maxRelativeP) maxRelativeP = relativeP
      if (relativeMoment > maxRelativeMoment) {
        maxRelativeMoment = relativeMoment
        worstBeta = midBeta % (2 * Math.PI)
      }
      maxRelativeComponent = Math.max(maxRelativeComponent, relativeComponent)
      entries.push({ beta: midBeta, error: relativeComponent })
    }
    return entries
  }

  // Alternate both coordinates. A new direction can expose station curvature and vice versa.
  while (stationAdaptive || directionAdaptive) {
    let changed = false
    let currentScales = scales()
    const stationEntries = stationAdaptive ? measureStationIntervals(currentScales) : []
    if (stationPasses < maxStationPasses && stations.length < maxStations) {
      const available = maxStations - stations.length
      const selected = stationEntries
        .filter((entry) => entry.error > stationTolerance)
        .sort((left, right) => right.error - left.error)
        .slice(0, available)
        .sort((left, right) => left.interval - right.interval)
      if (selected.length > 0) {
        const byInterval = new Map(selected.map((entry) => [entry.interval, entry.station]))
        stations = stations.flatMap((station, index) => {
          const inserted = byInterval.get(index)
          return inserted ? [station, inserted] : [station]
        })
        for (const beta of sortedBetas()) rows.set(beta, buildRow(beta))
        stationPasses += 1
        changed = true
        currentScales = scales()
      }
    }

    const directionEntries = directionAdaptive ? measureDirectionIntervals(currentScales) : []
    if (directionPasses < maxDirectionPasses && rows.size < maxDirections) {
      const selected = directionEntries
        .filter((entry) => entry.error > directionTolerance)
        .sort((left, right) => right.error - left.error)
        .slice(0, maxDirections - rows.size)
      if (selected.length > 0) {
        for (const entry of selected) {
          const beta = entry.beta % (2 * Math.PI)
          rows.set(beta, buildRow(beta))
        }
        directionPasses += 1
        changed = true
      }
    }
    if (!changed) break
  }

  // Measurements in a changing pass describe the pre-insertion grid; always audit the returned one.
  if (stationAdaptive || directionAdaptive) {
    const finalScales = scales()
    if (stationAdaptive) measureStationIntervals(finalScales)
    if (directionAdaptive) measureDirectionIntervals(finalScales)
  }

  const points = allPoints()
  const withinTolerance = !directionAdaptive || maxRelativeComponent <= directionTolerance
  const stationWithinTolerance = !stationAdaptive || maxStationError <= stationTolerance
  const reportedProbeStationOrders = directionAdaptive ? probeStationOrders() : []

  if (directionRefinement.type === 'adaptive' && !withinTolerance) {
    warnings.push(
      `Direction sampling did not reach the requested tolerance ${directionTolerance.toExponential(2)}; ` +
        `the estimate is ${maxRelativeComponent.toExponential(2)} over ${rows.size} directions.`
    )
  }
  if (stationRefinement.type === 'adaptive' && !stationWithinTolerance) {
    warnings.push(
      `Station sampling did not reach the requested tolerance ${stationTolerance.toExponential(2)}; ` +
        `the estimate is ${maxStationError.toExponential(2)} over ${stations.length} stations.`
    )
  }
  if (duplicateStationWarning && analysisOptions.stations.basedOn === 'custom') {
    warnings.push('Two or more reporting stations collapse to the same effective material-limit state.')
  }

  return {
    // The block bridge labels its own surface; labelling this one too means a consumer never has
    // to re-derive the mechanics from the method id.
    mechanics: 'stress-strain-integration',
    points,
    nominalPoints: points,
    bounds: {
      P: mappedRange(points, (point) => point.P),
      Mx: mappedRange(points, (point) => point.Mx),
      My: mappedRange(points, (point) => point.My)
    },
    mesh: meshReport,
    sectionBoundaryPoints: sectionBoundaryPoints(section),
    stations,
    directions: sortedBetas(),
    analysisOptions: cloneAnalysisOptions(analysisOptions),
    strainDomain: prepared.hasSteelHardening ? 'steel-limited-ultimate' : IMPLEMENTED_STRAIN_DOMAIN,
    directionError: {
      directions: rows.size,
      probedStations: reportedProbeStationOrders,
      probedStationIds: reportedProbeStationOrders.map((station) => stations[station].id),
      maxRelativeP,
      maxRelativeMoment,
      maxRelativeComponent,
      worstBeta,
      refinementPasses: directionPasses,
      withinTolerance,
      tolerance: directionTolerance
    },
    stationError: {
      stations: stations.length,
      fixedStations: fixedStationCount,
      maxRelative: maxStationError,
      refinementPasses: stationPasses,
      withinTolerance: stationWithinTolerance,
      tolerance: stationTolerance
    },
    warnings,
    designBasis: createDefaultDesignBasis(materialStore)
  }
}

type IndependentlySampledRow = {
  beta: number
  points: PreviewSurfacePoint[]
  stations: SurfaceStation[]
  coordinates: number[]
  stationError: SurfaceStationError
  warnings: string[]
}

const wrapSurfaceBeta = (beta: number) => ((beta % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)

const independentlySampledTopology = (
  rows: readonly IndependentlySampledRow[],
  points: readonly PreviewSurfacePoint[]
): SurfaceIndexTriangle[] => {
  if (rows.length < 2) return []
  const indexByPoint = new Map(points.map((point, index) => [point, index]))
  const compressionPole = indexByPoint.get(rows[0].points[0])
  const tensionPole = indexByPoint.get(rows[0].points[rows[0].points.length - 1])
  if (compressionPole === undefined || tensionPole === undefined) return []
  const triangles: SurfaceIndexTriangle[] = []
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const leftRow = rows[rowIndex]
    const rightRow = rows[(rowIndex + 1) % rows.length]
    const left = leftRow.points.slice(1, -1)
    const right = rightRow.points.slice(1, -1)
    const leftCoordinates = leftRow.coordinates.slice(1, -1)
    const rightCoordinates = rightRow.coordinates.slice(1, -1)
    if (left.length === 0 || right.length === 0) continue
    const leftIds = left.map((point) => indexByPoint.get(point)!)
    const rightIds = right.map((point) => indexByPoint.get(point)!)
    triangles.push({ a: compressionPole, b: leftIds[0], c: rightIds[0] })
    let leftIndex = 0
    let rightIndex = 0
    while (leftIndex < left.length - 1 || rightIndex < right.length - 1) {
      const advanceLeft = rightIndex === right.length - 1 || (
        leftIndex < left.length - 1 &&
        leftCoordinates[leftIndex + 1] <= rightCoordinates[rightIndex + 1]
      )
      if (advanceLeft) {
        triangles.push({ a: leftIds[leftIndex], b: leftIds[leftIndex + 1], c: rightIds[rightIndex] })
        leftIndex += 1
      } else {
        triangles.push({ a: leftIds[leftIndex], b: rightIds[rightIndex + 1], c: rightIds[rightIndex] })
        rightIndex += 1
      }
    }
    triangles.push({ a: leftIds[leftIds.length - 1], b: tensionPole, c: rightIds[rightIds.length - 1] })
  }
  return triangles
}

const interpolateRowLedger = (row: IndependentlySampledRow, coordinate: number): ResultantLedger => {
  if (coordinate <= row.coordinates[0]) return row.points[0].ledger
  const last = row.coordinates.length - 1
  if (coordinate >= row.coordinates[last]) return row.points[last].ledger
  let high = 1
  while (high < row.coordinates.length && row.coordinates[high] < coordinate) high += 1
  const leftCoordinate = row.coordinates[high - 1]
  const rightCoordinate = row.coordinates[high]
  const ratio = (coordinate - leftCoordinate) / Math.max(1e-15, rightCoordinate - leftCoordinate)
  return lerpLedgerValue(row.points[high - 1].ledger, row.points[high].ledger, ratio)
}

const buildIndependentAdaptivePreviewSurface = (
  prepared: PreparedAnalysis,
  analysisOptions: AnalysisOptions,
  designBasis: DesignBasis,
  sampling: PreviewSamplingHooks
): PreviewSurface => {
  const seedStations = withSteelBoundaryStations(analysisStations(analysisOptions), prepared)
  const { section, rebars, materialStore, origin, concreteFibers, rebarFibers, materials } = prepared
  const meshReport = prepared.mesh.report
  const epsCu = materialStore.concrete.limits.epsCu
  const pureCompressionStrain = resolvePureCompressionStrain(materialStore, designBasis)
  let evaluationCount = 0
  let duplicateStationWarning = false
  const warnings: string[] = []
  if (section.solids.length !== 1) warnings.push('Preview engine supports one concrete region best; multi-region output is approximate.')
  for (const issue of meshReport.warnings) warnings.push(`Concrete mesh: ${issue}`)
  if (rebars.length === 0) warnings.push('No rebars are present; steel contribution is zero.')
  const domainMismatch = strainDomainMismatch(materialStore.concrete, prepared.hasSteelHardening ? materialStore.steel : undefined)
  if (domainMismatch) warnings.push(`Strain domain: ${domainMismatch.message} See ${domainMismatch.reference}.`)

  const usedSteel = new Map<number, CompiledMaterial>()
  for (const bar of rebars) {
    const materialId = bar.steelMaterialId ?? materialStore.defaults.steelMaterialId
    const steel = materials.steel.get(materialId)
    if (steel) usedSteel.set(materialId, steel)
  }
  if (usedSteel.size === 0) {
    const fallback = materials.steel.get(materialStore.defaults.steelMaterialId) ?? [...materials.steel.values()][0]
    if (fallback) usedSteel.set(fallback.id, fallback)
  }
  const declaredTensionLimits = [...usedSteel.values()]
    .map((steel) => steel.limits.epsTensionUltimate)
    .filter((value): value is number => value !== undefined)
  const undeclaredYieldStrains = [...usedSteel.values()]
    .filter((steel) => steel.limits.epsTensionUltimate === undefined)
    .map((steel) => steel.limits.epsYield ?? DEFAULT_STATION_STEEL_LIMITS.epsY)
  const effectiveTensionLimits = [
    ...declaredTensionLimits,
    ...(undeclaredYieldStrains.length > 0
      ? [PURE_TENSION_YIELD_MULTIPLE * Math.max(...undeclaredYieldStrains)]
      : [])
  ]
  const deepestConfiguredTensionStrain = Math.max(
    0,
    ...seedStations.map((station) => station.definition.kind === 'steel-strain'
      ? Math.abs(station.definition.strain)
      : 0)
  )
  const globalPureTensionStrain = -(
    declaredTensionLimits.length > 0
      ? prepared.hasSteelHardening
        ? Math.min(...declaredTensionLimits)
        : Math.min(...effectiveTensionLimits)
      : Math.max(
          ...effectiveTensionLimits,
          deepestConfiguredTensionStrain,
          PURE_TENSION_YIELD_MULTIPLE * DEFAULT_STATION_STEEL_LIMITS.epsY
        )
  )
  const parts = ['total', 'concrete', 'steelGross', 'displacedConcrete', 'steel'] as const
  type Part = (typeof parts)[number]
  const evaluatorCache = new Map<string, {
    beta: number
    point: (station: SurfaceStation, coordinate: number) => PreviewSurfacePoint
    validate: (stations: SurfaceStation[], points: PreviewSurfacePoint[]) => void
  }>()
  const evaluatorAt = (betaInput: number) => {
    const beta = wrapSurfaceBeta(betaInput)
    const key = beta.toPrecision(15)
    const cached = evaluatorCache.get(key)
    if (cached) return cached
    const extents = projectedSteelExtents(prepared, beta)
    const control = stationSteelControl(
      materials,
      materialStore,
      rebars,
      materialStore.defaults.steelMaterialId,
      extents.controllingRebarIndex
    )
    const pointCache = new Map<SurfaceStationId, PreviewSurfacePoint>()
    const point = (station: SurfaceStation, coordinate: number) => {
      const existing = pointCache.get(station.id)
      if (existing) return existing
      const state = previewStationStateFromExtents(
        beta,
        station.definition,
        epsCu,
        pureCompressionStrain,
        control,
        designBasis,
        globalPureTensionStrain,
        extents
      )
      sampling.onEvaluate?.()
      evaluationCount += 1
      const ledger = evaluate(concreteFibers, rebarFibers, materials, state)
      const raw: PreviewSurfacePoint = {
        id: `${key}-${station.id}`,
        beta,
        station: coordinate,
        stationCoordinate: coordinate,
        stationId: station.id,
        surfaceRole: station.id === 'pure-compression'
          ? 'pure-compression'
          : station.id === 'pure-tension'
            ? 'pure-tension'
            : 'physical-state',
        state,
        ledger,
        ...ledger.total
      }
      const mapped = sampling.mapPoint?.(raw) ?? raw
      pointCache.set(station.id, mapped)
      return mapped
    }
    const validate = (stations: SurfaceStation[], points: PreviewSurfacePoint[]) => {
      if (rebars.length === 0 || extents.steelBoundary) return
      const bar = rebars[extents.controllingRebarIndex]
      let previous = Number.POSITIVE_INFINITY
      for (let index = 0; index < points.length; index += 1) {
        const state = points[index].state
        const strain = state.e0 + state.kx * (bar.y - origin.y) + state.ky * (bar.x - origin.x)
        const tolerance = 1e-11 * Math.max(1, Math.abs(previous), Math.abs(strain))
        if (strain > previous + tolerance) {
          throw new AnalysisInputError(
            'INVALID_ANALYSIS_OPTIONS',
            `Station "${stations[index].label}" breaks the compression-to-tension order at beta=${beta * 180 / Math.PI} degrees.`
          )
        }
        if (Math.abs(strain - previous) <= tolerance && Number.isFinite(previous)) duplicateStationWarning = true
        previous = strain
      }
    }
    const created = { beta, point, validate }
    evaluatorCache.set(key, created)
    return created
  }
  const initialRowAt = (beta: number): IndependentlySampledRow => {
    const evaluator = evaluatorAt(beta)
    const coordinates = seedStations.map((_, index) => index)
    const points = seedStations.map((station, index) => evaluator.point(station, coordinates[index]))
    evaluator.validate(seedStations, points)
    return {
      beta: evaluator.beta,
      points,
      stations: [...seedStations],
      coordinates,
      stationError: {
        stations: seedStations.length,
        fixedStations: seedStations.length,
        maxRelative: Number.NaN,
        refinementPasses: 0,
        withinTolerance: false,
        tolerance: Number.POSITIVE_INFINITY
      },
      warnings: []
    }
  }
  const seedBetas = analysisDirections(analysisOptions)
  const initialRows = seedBetas.map(initialRowAt)
  const scales = Object.fromEntries(parts.map((part) => [part, { P: 1, M: 1 }])) as Record<Part, { P: number; M: number }>
  const scalePoints = initialRows.flatMap((row) => row.points)
  for (const point of scalePoints) {
    for (const part of parts) {
      scales[part].P = Math.max(scales[part].P, Math.abs(point.ledger[part].P))
      scales[part].M = Math.max(scales[part].M, Math.hypot(point.ledger[part].Mx, point.ledger[part].My))
    }
  }
  const stationRefinement = analysisOptions.stations.refinement
  if (stationRefinement.type !== 'adaptive') throw new Error('Independent adaptive surface requires adaptive stations.')
  const rowError = (middle: ResultantLedger, left: ResultantLedger, right: ResultantLedger) => {
    let error = 0
    for (const part of parts) {
      if (!sampling.componentAware && part !== 'total') continue
      error = Math.max(
        error,
        Math.abs(middle[part].P - (left[part].P + right[part].P) / 2) / scales[part].P,
        Math.hypot(
          middle[part].Mx - (left[part].Mx + right[part].Mx) / 2,
          middle[part].My - (left[part].My + right[part].My) / 2
        ) / scales[part].M
      )
    }
    return error
  }
  const completeRow = (source: IndependentlySampledRow): IndependentlySampledRow => {
    let stations = [...source.stations]
    let coordinates = [...source.coordinates]
    let points = [...source.points]
    let passes = 0
    const candidates = () => stations.slice(0, -1).flatMap((left, interval) => {
      const right = stations[interval + 1]
      // Legacy unbounded laws retain their explicit pole edge. Finite endpoint hardening instead
      // defines a unique compatible steel boundary, so its transition intervals must be refined.
      if (
        !prepared.hasSteelHardening && (right.definition.kind === 'pure-tension' ||
        left.definition.kind === 'tension-pole-transition-ratio' ||
        right.definition.kind === 'tension-pole-transition-ratio')
      ) return []
      const coordinate = (coordinates[interval] + coordinates[interval + 1]) / 2
      const station = adaptiveStation(midpointStationDefinition(left.definition, right.definition))
      const point = evaluatorAt(source.beta).point(station, coordinate)
      return [{
        interval,
        coordinate,
        station,
        point,
        error: rowError(point.ledger, points[interval].ledger, points[interval + 1].ledger)
      }]
    })
    while (passes < stationRefinement.maxPasses && stations.length < stationRefinement.maxStations) {
      const selected = candidates()
        .filter((candidate) => candidate.error > stationRefinement.tolerance)
        .sort((left, right) => right.error - left.error || left.coordinate - right.coordinate)
        .slice(0, stationRefinement.maxStations - stations.length)
      if (selected.length === 0) break
      const selectedByInterval = new Map(selected.map((candidate) => [candidate.interval, candidate]))
      stations = stations.flatMap((station, interval) => {
        const candidate = selectedByInterval.get(interval)
        return candidate ? [station, candidate.station] : [station]
      })
      coordinates = coordinates.flatMap((coordinate, interval) => {
        const candidate = selectedByInterval.get(interval)
        return candidate ? [coordinate, candidate.coordinate] : [coordinate]
      })
      points = points.flatMap((point, interval) => {
        const candidate = selectedByInterval.get(interval)
        return candidate ? [point, candidate.point] : [point]
      })
      passes += 1
    }
    const maxRelative = candidates().reduce((maximum, candidate) => Math.max(maximum, candidate.error), 0)
    evaluatorAt(source.beta).validate(stations, points)
    return {
      beta: source.beta,
      stations,
      coordinates,
      points: sampling.mapRow?.(points) ?? points,
      stationError: {
        stations: stations.length,
        fixedStations: seedStations.length,
        maxRelative,
        refinementPasses: passes,
        withinTolerance: maxRelative <= stationRefinement.tolerance,
        tolerance: stationRefinement.tolerance
      },
      warnings: []
    }
  }
  const rowCache = new Map<string, IndependentlySampledRow>()
  const initialByKey = new Map(initialRows.map((row) => [row.beta.toPrecision(15), row]))
  const rowAt = (betaInput: number) => {
    const beta = wrapSurfaceBeta(betaInput)
    const key = beta.toPrecision(15)
    const cached = rowCache.get(key)
    if (cached) return cached
    const completed = completeRow(initialByKey.get(key) ?? initialRowAt(beta))
    rowCache.set(key, completed)
    return completed
  }
  const rows = new Map<number, IndependentlySampledRow>()
  for (const row of initialRows) {
    const completed = rowAt(row.beta)
    rows.set(completed.beta, completed)
  }
  const errorAt = (
    actual: ResultantLedger,
    left: ResultantLedger,
    right: ResultantLedger
  ) => {
    let relativeP = 0
    let relativeMoment = 0
    let relativeComponent = 0
    for (const part of parts) {
      if (!sampling.componentAware && part !== 'total') continue
      const p = Math.abs(actual[part].P - (left[part].P + right[part].P) / 2) / scales[part].P
      const moment = Math.hypot(
        actual[part].Mx - (left[part].Mx + right[part].Mx) / 2,
        actual[part].My - (left[part].My + right[part].My) / 2
      ) / scales[part].M
      if (part === 'total') {
        relativeP = Math.max(relativeP, p)
        relativeMoment = Math.max(relativeMoment, moment)
      }
      relativeComponent = Math.max(relativeComponent, p, moment)
    }
    return { relativeP, relativeMoment, relativeComponent }
  }
  const sortedBetas = () => [...rows.keys()].sort((left, right) => left - right)
  const measureIntervals = () => {
    const betas = sortedBetas()
    return betas.map((leftBeta, index) => {
      const rightBeta = index === betas.length - 1 ? betas[0] + 2 * Math.PI : betas[index + 1]
      const rightKey = index === betas.length - 1 ? betas[0] : rightBeta
      const middle = rowAt((leftBeta + rightBeta) / 2)
      const left = rows.get(leftBeta)!
      const right = rows.get(rightKey)!
      let relativeP = 0
      let relativeMoment = 0
      let relativeComponent = 0
      for (let pointIndex = 1; pointIndex < middle.points.length - 1; pointIndex += 1) {
        const coordinate = middle.coordinates[pointIndex]
        const error = errorAt(
          middle.points[pointIndex].ledger,
          interpolateRowLedger(left, coordinate),
          interpolateRowLedger(right, coordinate)
        )
        relativeP = Math.max(relativeP, error.relativeP)
        relativeMoment = Math.max(relativeMoment, error.relativeMoment)
        relativeComponent = Math.max(relativeComponent, error.relativeComponent)
      }
      return { beta: middle.beta, row: middle, relativeP, relativeMoment, relativeComponent }
    })
  }

  const direction = analysisOptions.directions.refinement
  if (direction.type !== 'adaptive') throw new Error('Independent adaptive surface requires adaptive directions.')
  let directionPasses = 0
  while (directionPasses < direction.maxPasses && rows.size < direction.maxDirections) {
    const selected = measureIntervals()
      .filter((entry) => entry.relativeComponent > direction.tolerance)
      .sort((left, right) => right.relativeComponent - left.relativeComponent || left.beta - right.beta)
      .slice(0, direction.maxDirections - rows.size)
    if (selected.length === 0) break
    for (const entry of selected) rows.set(entry.beta, entry.row)
    directionPasses += 1
  }

  const finalIntervals = measureIntervals()
  const finalRows = sortedBetas().map((beta) => rows.get(beta)!)
  const points = finalRows.flatMap((row) => row.points)
  const triangles = independentlySampledTopology(finalRows, points)
  const stationCounts = finalRows.map((row) => row.points.length)
  const stationErrors = finalRows.map((row) => row.stationError.maxRelative)
  const finiteStationErrors = stationErrors.filter(Number.isFinite)
  const maxStationError = finiteStationErrors.length ? Math.max(...finiteStationErrors) : Number.NaN
  const maxRelativeP = finalIntervals.length ? Math.max(...finalIntervals.map((entry) => entry.relativeP)) : Number.NaN
  const maxRelativeMoment = finalIntervals.length
    ? Math.max(...finalIntervals.map((entry) => entry.relativeMoment))
    : Number.NaN
  const worst = finalIntervals.reduce<typeof finalIntervals[number] | null>(
    (current, entry) => !current || entry.relativeComponent > current.relativeComponent ? entry : current,
    null
  )
  const uniqueStations = new Map<SurfaceStationId, SurfaceStation>()
  for (const station of seedStations) uniqueStations.set(station.id, station)
  for (const row of finalRows) for (const station of row.stations) uniqueStations.set(station.id, station)
  const finalWarnings = [...new Set([...warnings, ...finalRows.flatMap((row) => row.warnings).filter((warning) =>
    !warning.startsWith('Direction sampling did not reach') &&
    !warning.startsWith('Station sampling did not reach')
  )])]
  const directionWithinTolerance = (worst?.relativeComponent ?? Number.POSITIVE_INFINITY) <= direction.tolerance
  const stationWithinTolerance = Number.isFinite(maxStationError) && maxStationError <= stationRefinement.tolerance
  if (!directionWithinTolerance) finalWarnings.push(
    `Direction sampling did not reach the requested tolerance ${direction.tolerance.toExponential(2)}; ` +
      `the estimate is ${(worst?.relativeComponent ?? Number.NaN).toExponential(2)} over ${rows.size} directions.`
  )
  if (!stationWithinTolerance) finalWarnings.push(
    `Station sampling did not reach the requested tolerance ${stationRefinement.tolerance.toExponential(2)}; ` +
      `the worst independent meridian estimate is ${maxStationError.toExponential(2)}.`
  )
  if (duplicateStationWarning && analysisOptions.stations.basedOn === 'custom') {
    finalWarnings.push('Two or more reporting stations collapse to the same effective material-limit state.')
  }
  return {
    mechanics: 'stress-strain-integration',
    points,
    nominalPoints: points,
    triangles,
    nominalTriangles: triangles,
    bounds: {
      P: mappedRange(points, (point) => point.P),
      Mx: mappedRange(points, (point) => point.Mx),
      My: mappedRange(points, (point) => point.My)
    },
    mesh: meshReport,
    sectionBoundaryPoints: sectionBoundaryPoints(section),
    stations: [...uniqueStations.values()],
    directions: sortedBetas(),
    analysisOptions: cloneAnalysisOptions(analysisOptions),
    strainDomain: prepared.hasSteelHardening ? 'steel-limited-ultimate' : IMPLEMENTED_STRAIN_DOMAIN,
    directionError: {
      directions: rows.size,
      probedStations: [],
      probedStationIds: [...uniqueStations.keys()],
      maxRelativeP,
      maxRelativeMoment,
      maxRelativeComponent: worst?.relativeComponent ?? Number.NaN,
      worstBeta: worst?.beta ?? Number.NaN,
      refinementPasses: directionPasses,
      withinTolerance: directionWithinTolerance,
      tolerance: direction.tolerance
    },
    stationError: {
      stations: Math.max(...stationCounts),
      fixedStations: seedStations.length,
      minStations: Math.min(...stationCounts),
      maxStations: Math.max(...stationCounts),
      averageStations: stationCounts.reduce((sum, count) => sum + count, 0) / stationCounts.length,
      totalStates: points.length,
      evaluations: evaluationCount,
      maxRelative: maxStationError,
      refinementPasses: Math.max(...finalRows.map((row) => row.stationError.refinementPasses)),
      withinTolerance: stationWithinTolerance,
      tolerance: stationRefinement.tolerance
    },
    warnings: finalWarnings,
    designBasis: cloneDesignBasis(designBasis)
  }
}

export const buildPreviewSurfaceFromPrepared = (
  prepared: PreparedAnalysis,
  analysisOptions: AnalysisOptions = createDefaultAnalysisOptions(),
  designBasis: DesignBasis = createDefaultDesignBasis(prepared.materialStore),
  sampling: PreviewSamplingHooks = {}
): PreviewSurface => {
  const mode = analysisOptions.samplingMode ?? (
    analysisOptions.stations.refinement.type === 'adaptive' &&
    analysisOptions.directions.refinement.type === 'adaptive'
      ? 'adaptive'
      : 'fixed'
  )
  const stationType = analysisOptions.stations.refinement.type
  const directionType = analysisOptions.directions.refinement.type
  if (
    (mode === 'fixed' && (stationType !== 'fixed' || directionType !== 'fixed')) ||
    (mode === 'adaptive' && (stationType !== 'adaptive' || directionType !== 'adaptive'))
  ) {
    throw new AnalysisInputError(
      'INVALID_ANALYSIS_OPTIONS',
      'Fixed and adaptive sampling are complete modes; station and direction refinement cannot be mixed.'
    )
  }
  if (mode === 'adaptive') {
    return buildIndependentAdaptivePreviewSurface(prepared, analysisOptions, designBasis, sampling)
  }
  const surface = buildPreviewSurfaceFromPreparedLegacy(prepared, analysisOptions, designBasis, sampling)
  surface.points.forEach((point) => { point.stationCoordinate = point.station })
  surface.nominalPoints.forEach((point) => { point.stationCoordinate = point.station })
  const rows = groupSurfaceRows(surface.points).map(({ beta, curve }) => ({
    beta,
    points: curve,
    stations: surface.stations,
    coordinates: curve.map((point) => point.station),
    stationError: surface.stationError,
    warnings: surface.warnings
  }))
  surface.triangles = independentlySampledTopology(rows, surface.points)
  surface.nominalTriangles = surface.triangles
  surface.stationError = {
    ...surface.stationError,
    minStations: surface.stations.length,
    maxStations: surface.stations.length,
    averageStations: surface.stations.length,
    totalStates: surface.points.length,
    evaluations: surface.points.length
  }
  return surface
}

export const buildPreviewSurface = (
  section: SectionGeometry,
  rebars: GeometryInputRebarView[],
  materialStore: MaterialStore,
  meshOptions: ConcreteMeshOptions = {},
  analysisOptions: AnalysisOptions = createDefaultAnalysisOptions()
): PreviewSurface =>
  buildPreviewSurfaceFromPrepared(prepareAnalysis(section, rebars, materialStore, meshOptions), analysisOptions)

const scaleResultant = (value: Resultant, factor: number): Resultant => ({
  P: value.P * factor,
  Mx: value.Mx * factor,
  My: value.My * factor
})

const scaleLedger = (ledger: ResultantLedger, factor: number): ResultantLedger => ({
  concrete: scaleResultant(ledger.concrete, factor),
  steelGross: scaleResultant(ledger.steelGross, factor),
  displacedConcrete: scaleResultant(ledger.displacedConcrete, factor),
  steel: scaleResultant(ledger.steel, factor),
  total: scaleResultant(ledger.total, factor)
})

const concreteAuditBranch = (material: MaterialStore['concrete'], strain: number) => {
  const model = material.stressStrain
  if (model.type === 'kds-parabolic') {
    const resolved = resolveKdsParabolicParams(material)
    if (strain <= 0) return { id: '01-zero-tension', label: 'Zero/tension branch (ε ≤ 0)' }
    if (strain <= resolved.eps0) return { id: '02-parabolic', label: 'Parabolic branch (0 < ε ≤ εc0)' }
    if (strain <= resolved.epsCu) return { id: '03-plateau', label: 'Compression plateau (εc0 < ε ≤ εcu)' }
    return { id: '04-outside-ultimate', label: 'Outside ultimate strain (ε > εcu; zero stress)' }
  }
  if (model.type === 'ec2-parabolic-rectangular') {
    const resolved = resolveEc2ParabolicRectangularParams(material)
    if (strain <= 0) return { id: '01-zero-tension', label: 'Zero/tension branch (ε ≤ 0)' }
    if (strain <= resolved.epsC2) return { id: '02-parabolic', label: 'Parabolic branch (0 < ε ≤ εc2)' }
    if (strain <= resolved.epsCu2) return { id: '03-plateau', label: 'Compression plateau (εc2 < ε ≤ εcu2)' }
    return { id: '04-outside-ultimate', label: 'Outside ultimate strain (ε > εcu2; zero stress)' }
  }
  if (model.type === 'user-curve') {
    if ((model.zeroTension ?? material.limits.ignoreTension) && strain <= 0) {
      return { id: '00-zero-tension', label: 'User-law zero-tension branch' }
    }
    const points = [...model.points].sort((left, right) => left.strain - right.strain)
    if (strain <= points[0].strain) return { id: '01-lower-clamp', label: 'User law: lower end clamp' }
    for (let index = 1; index < points.length; index += 1) {
      if (strain <= points[index].strain) {
        return { id: `segment-${String(index).padStart(3, '0')}`, label: `User law: linear segment ${index}` }
      }
    }
    return { id: '99-upper-clamp', label: 'User law: upper end clamp' }
  }
  return { id: 'unsupported-local-law', label: 'Unsupported local concrete law' }
}

const auditDepthProfile = (
  prepared: PreparedAnalysis,
  state: StrainState,
  beta: number,
  stationDefinition: StationDefinition | null,
  stationPrepared: PreparedAnalysis
): CalculationAuditDepthProfile => {
  const curvature = Math.hypot(state.kx, state.ky)
  const normalX = curvature > 1e-15 ? state.ky / curvature : 0
  const normalY = curvature > 1e-15 ? state.kx / curvature : 1
  const projections = prepared.concreteBoundary.map((point) => normalX * point.x + normalY * point.y)
  const tensionEdgeProjection = projections.length > 0 ? Math.min(...projections) : 0
  const compressionEdgeProjection = projections.length > 0 ? Math.max(...projections) : 0
  const projectedSectionDepth = compressionEdgeProjection - tensionEdgeProjection
  const neutralAxisProjection = curvature > 1e-15 ? -state.e0 / curvature : null
  const neutralAxisDepth = neutralAxisProjection === null ? null : compressionEdgeProjection - neutralAxisProjection
  const neutralAxisInsideSection = neutralAxisProjection === null
    ? null
    : neutralAxisProjection >= tensionEdgeProjection && neutralAxisProjection <= compressionEdgeProjection
  const sampleCount = 41
  const samples = Array.from({ length: sampleCount }, (_, index) => {
    const depth = projectedSectionDepth * index / (sampleCount - 1)
    const projection = compressionEdgeProjection - depth
    const strain = state.e0 + curvature * projection
    return { depth, strain, stress: prepared.materials.concrete.stress(strain) }
  })
  const profile = {
    normalX,
    normalY,
    tensionEdgeProjection,
    compressionEdgeProjection,
    projectedSectionDepth,
    neutralAxisProjection,
    neutralAxisDepth,
    neutralAxisInsideSection,
    samples
  }
  const originStrainContext: CalculationAuditOriginStrainContext = (() => {
    if (
      stationDefinition?.kind === 'neutral-axis-depth-ratio' ||
      stationDefinition?.kind === 'block-depth-ratio'
    ) {
      return {
        kind: 'depth-ratio',
        criterionLabel: stationDefinitionLabel(stationDefinition),
        ratio: stationDefinition.ratio
      }
    }
    if (stationDefinition?.kind !== 'bar-tension-yield-ratio') {
      return {
        kind: 'resolved-compatible-state',
        criterionLabel: stationDefinition ? stationDefinitionLabel(stationDefinition) : null
      }
    }

    const extents = projectedExtents(
      stationPrepared.section,
      beta,
      stationPrepared.origin,
      stationPrepared.rebars
    )
    const controllingRebar = stationPrepared.rebars[extents.controllingRebarIndex]
    if (!controllingRebar) {
      return {
        kind: 'resolved-compatible-state',
        criterionLabel: stationDefinitionLabel(stationDefinition)
      }
    }
    const control = stationSteelControl(
      stationPrepared.materials,
      stationPrepared.materialStore,
      stationPrepared.rebars,
      stationPrepared.materialStore.defaults.steelMaterialId,
      extents.controllingRebarIndex
    )
    const elasticModulus = control.definition.elasticModulus
    const yieldFromStress = control.fyd / elasticModulus
    const yieldStrainBasis = Math.abs(control.epsY - yieldFromStress) <=
      1e-12 * Math.max(1, Math.abs(control.epsY))
      ? 'effective-yield-stress-over-elastic-modulus' as const
      : 'declared-material-limit' as const
    const controllingBarProjection =
      (controllingRebar.y - stationPrepared.origin.y) * Math.cos(beta) +
      (controllingRebar.x - stationPrepared.origin.x) * Math.sin(beta)
    const controllingSteelStrain =
      state.e0 +
      state.kx * (controllingRebar.y - stationPrepared.origin.y) +
      state.ky * (controllingRebar.x - stationPrepared.origin.x)
    return {
      kind: 'controlling-bar-strain',
      criterionLabel: stationDefinitionLabel(stationDefinition),
      ratio: stationDefinition.ratio,
      controllingRebarId: controllingRebar.id,
      steelMaterialId: control.definition.id,
      effectiveYieldStress: control.fyd,
      elasticModulus,
      yieldStrain: control.epsY,
      yieldStrainBasis,
      requestedSteelStrain: -stationDefinition.ratio * control.epsY,
      controllingSteelStrain,
      controllingBarProjection,
      compressionEdgeToBarDepth: extents.max - controllingBarProjection
    }
  })()
  return {
    ...profile,
    originStrainTrace: buildCalculationAuditOriginStrainTrace(
      profile,
      samples[0].strain,
      originStrainContext
    )
  }
}

/**
 * Build a lazy, serializable calculation trace for one stored stress-strain surface vertex.
 *
 * The function reuses the exact mesh and compiled material owners. It is intentionally absent from
 * surface construction because retaining every fibre term at every vertex would multiply the
 * result payload by the surface-state count.
 */
export const buildStressStrainPointCalculationAudit = (
  statePrepared: PreparedAnalysis,
  sourceMaterials: MaterialStore,
  designBasis: DesignBasis,
  stage: CalculationAuditStage,
  point: PreviewSurfacePoint,
  stationDefinition: StationDefinition | null = null
): PointCalculationAudit => {
  if (point.surfaceRole === 'axial-cap') {
    const trace = point.axialCapTrace
    if (trace) {
      const preCap = trace.preCapPoint
        ? (() => {
            const audit = buildStressStrainPointCalculationAudit(
              statePrepared,
              sourceMaterials,
              designBasis,
              stage,
              trace.preCapPoint,
              stationDefinition
            )
            if (audit.kind !== 'stress-strain') {
              throw new AnalysisInputError(
                'AUDIT_RECONCILIATION_FAILED',
                'The retained pre-cap criterion point did not produce a physical stress-strain audit.',
                { pointId: point.id }
              )
            }
            const calculatedAxialResistance = trace.preCapPoint.ledger.total.P
            return {
              point: trace.preCapPoint,
              audit,
              comparison: {
                calculatedAxialResistance,
                maximumAxialResistance: trace.cap,
                selectedAxialResistance: Math.min(calculatedAxialResistance, trace.cap),
                capGoverns: calculatedAxialResistance > trace.cap
              }
            }
          })()
        : undefined
      const crossing = trace.source.crossing
      const expected = trace.projection.kind === 'radial'
        ? {
            P: trace.cap,
            Mx: crossing.Mx * trace.projection.factor,
            My: crossing.My * trace.projection.factor
          }
        : crossing
      return {
        kind: 'axial-cap',
        pointId: point.id,
        stage,
        trace,
        ...(preCap ? { preCap } : {}),
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
      message: 'The maximum-axial-resistance cap is a geometric projection face and has no unique strain plane. Its source crossing and cap operation must be audited instead.'
    }
  }
  const sets = buildResistanceMaterialSets(sourceMaterials, designBasis)
  const referencePrepared = JSON.stringify(sets.referenceMaterials) === JSON.stringify(statePrepared.materialStore)
    ? statePrepared
    : prepareAnalysisFromMesh(
        statePrepared.section,
        statePrepared.rebars,
        sets.referenceMaterials,
        statePrepared.mesh,
        statePrepared.origin
      )
  const calculationMaterials = stage === 'nominal'
    ? sets.referenceMaterials
    : designBasis.format === 'designMaterialReevaluation'
      ? sets.designMaterials
      : sets.referenceMaterials
  const prepared = JSON.stringify(calculationMaterials) === JSON.stringify(statePrepared.materialStore)
    ? statePrepared
    : prepareAnalysisFromMesh(
        statePrepared.section,
        statePrepared.rebars,
        calculationMaterials,
        statePrepared.mesh,
        statePrepared.origin
      )
  const concreteGroups = new Map<string, CalculationAuditConcreteGroup>()
  const concreteGroupSums = new Map<string, CompensatedResultant>()
  const concreteSum = new CompensatedResultant()
  for (const fiber of prepared.concreteFibers) {
    const fiberStrain = strainAt(point.state, fiber)
    const stress = prepared.materials.concrete.stress(fiberStrain)
    const force = stress * fiber.area
    const term: CalculationAuditTerm = {
      x: fiber.x,
      y: fiber.y,
      area: fiber.area,
      strain: fiberStrain,
      stress,
      force,
      Mx: force * fiber.y,
      My: force * fiber.x
    }
    if (Object.values(term).some((value) => !Number.isFinite(value))) {
      throw new AnalysisInputError('AUDIT_RECONCILIATION_FAILED', 'A concrete audit term is non-finite.', { pointId: point.id })
    }
    concreteSum.add(force, fiber)
    const branch = concreteAuditBranch(calculationMaterials.concrete, fiberStrain)
    let branchSum = concreteGroupSums.get(branch.id)
    if (!branchSum) {
      branchSum = new CompensatedResultant()
      concreteGroupSums.set(branch.id, branchSum)
    }
    branchSum.add(force, fiber)
    const current = concreteGroups.get(branch.id)
    if (!current) {
      concreteGroups.set(branch.id, {
        ...branch,
        count: 1,
        area: fiber.area,
        strainMinimum: fiberStrain,
        strainMaximum: fiberStrain,
        stressMinimum: stress,
        stressMaximum: stress,
        resultant: zeroResultant(),
        representative: term
      })
      continue
    }
    current.count += 1
    current.area += fiber.area
    current.strainMinimum = Math.min(current.strainMinimum, fiberStrain)
    current.strainMaximum = Math.max(current.strainMaximum, fiberStrain)
    current.stressMinimum = Math.min(current.stressMinimum, stress)
    current.stressMaximum = Math.max(current.stressMaximum, stress)
    if (Math.abs(force) > Math.abs(current.representative.force)) current.representative = term
  }
  for (const [branchId, branchSum] of concreteGroupSums) {
    const group = concreteGroups.get(branchId)
    if (group) group.resultant = branchSum.finish()
  }
  const concrete = concreteSum.finish()

  const steelGrossSum = new CompensatedResultant()
  const displacedConcreteSum = new CompensatedResultant()
  const rebars: CalculationAuditRebar[] = prepared.rebarFibers.map((fiber) => {
    const source = prepared.rebars.find((bar) => bar.id === fiber.rebarId)
    if (!source) {
      throw new AnalysisInputError('AUDIT_RECONCILIATION_FAILED', `Audit rebar ${fiber.rebarId} is not present in the prepared input.`, { pointId: point.id })
    }
    const fiberStrain = strainAt(point.state, fiber)
    const steelStress = fiber.steel.stress(fiberStrain)
    const concreteStress = prepared.materials.concrete.stress(fiberStrain)
    const grossForce = steelStress * fiber.area
    const displacedForce = -concreteStress * fiber.area
    const netForce = grossForce + displacedForce
    const gross = { P: grossForce, Mx: grossForce * fiber.y, My: grossForce * fiber.x }
    const displaced = { P: displacedForce, Mx: displacedForce * fiber.y, My: displacedForce * fiber.x }
    const net = addResultant(gross, displaced)
    steelGrossSum.add(grossForce, fiber)
    displacedConcreteSum.add(displacedForce, fiber)
    return {
      id: source.id,
      diameter: source.dia,
      areaSource: rebarAreaSourceLabel(source),
      storedArea: source.area !== undefined,
      steelMaterialId: source.steelMaterialId ?? calculationMaterials.defaults.steelMaterialId,
      x: fiber.x,
      y: fiber.y,
      area: fiber.area,
      strain: fiberStrain,
      stress: netForce / fiber.area,
      force: netForce,
      Mx: net.Mx,
      My: net.My,
      steelStress,
      displacedConcreteStress: -concreteStress,
      netStress: steelStress - concreteStress,
      steelGross: gross,
      displacedConcrete: displaced,
      net
    }
  })
  const steelGross = steelGrossSum.finish()
  const displacedConcrete = displacedConcreteSum.finish()
  const steel = addResultant(steelGross, displacedConcrete)
  const mechanicalLedger = {
    concrete,
    steelGross,
    displacedConcrete,
    steel,
    total: addResultant(concrete, steel)
  }
  const resistanceFactor = stage === 'design' && designBasis.format === 'globalResultantFactor'
    ? point.resistance?.factor ?? null
    : null
  if (stage === 'design' && designBasis.format === 'globalResultantFactor' && resistanceFactor === null) {
    throw new AnalysisInputError(
      'AUDIT_RECONCILIATION_FAILED',
      'A Design point on a global-factor surface has no stored resistance factor.',
      { pointId: point.id }
    )
  }
  let resistanceFactorCalculation: CalculationAuditResistanceFactor | null = null
  if (resistanceFactor !== null && designBasis.format === 'globalResultantFactor') {
    const evidence = controllingSteelEvidence(referencePrepared, point.state)
    const evaluated = evaluateGlobalStrengthReduction(designBasis, evidence.tensileStrain, evidence.yieldStrain, evidence.yieldStress)
    if (!evidence.steel || evidence.rebarId === null || evaluated.phi !== resistanceFactor) {
      throw new AnalysisInputError('AUDIT_RECONCILIATION_FAILED', 'Resistance-factor evidence does not reproduce the stored stress-strain factor.', { pointId: point.id })
    }
    resistanceFactorCalculation = strainResistanceFactorAudit({
      factor: evaluated.phi, classification: evaluated.classification,
      tensileStrain: evaluated.controllingTensileStrain, yieldStrain: evaluated.yieldStrain,
      tensionLimit: evaluated.tensionControlledLimit, yieldStress: evidence.yieldStress,
      elasticModulus: evidence.steel.elasticModulus, steelMaterialId: evidence.steel.id,
      controllingRebarId: evidence.rebarId,
      compressionFactor: designBasis.transverseReinforcement === 'qualifying-spiral'
        ? designBasis.factors.phiCompressionSpiral : designBasis.factors.phiCompressionOther,
      tensionFactor: designBasis.factors.phiTension,
      transverseReinforcement: designBasis.transverseReinforcement, limitRule: designBasis.transition,
      transitionDenominator: globalStrengthReductionTransitionSpan(evaluated.tensionControlledLimit, evaluated.yieldStrain),
      minimumTransitionSpan: GLOBAL_STRENGTH_REDUCTION_MINIMUM_SPAN,
      classificationTolerance: 0
    })
  }
  const displayedLedger = resistanceFactor === null
    ? mechanicalLedger
    : scaleLedger(mechanicalLedger, resistanceFactor)
  const nominalReferenceLedger = prepared === referencePrepared
    ? mechanicalLedger
    : evaluatePreparedState(referencePrepared, point.state)
  const storedNominalReference = stage === 'nominal'
    ? point.ledger.total
    : point.resistance?.nominalReference
  if (!storedNominalReference) {
    throw new AnalysisInputError(
      'AUDIT_RECONCILIATION_FAILED',
      'A Design point has no stored nominal/reference resultant for the same compatible state.',
      { pointId: point.id }
    )
  }
  const nominalReferenceReconciliation = reconcileCalculationAuditResultant(
    nominalReferenceLedger.total,
    storedNominalReference,
    referencePrepared.forceScale,
    referencePrepared.lengthScale
  )
  const reconciliation = reconcileCalculationAuditResultant(
    displayedLedger.total,
    point.ledger.total,
    prepared.forceScale,
    prepared.lengthScale
  )
  if (!nominalReferenceReconciliation.ok || !reconciliation.ok) {
    throw new AnalysisInputError(
      'AUDIT_RECONCILIATION_FAILED',
      `The selected state audit does not reproduce its stored reference/selected result (relative deltas ${nominalReferenceReconciliation.relativeMaximum}/${reconciliation.relativeMaximum}).`,
      { pointId: point.id, nominalReferenceReconciliation, reconciliation }
    )
  }
  const concreteGroupValues = [...concreteGroups.values()]
  return {
    kind: 'stress-strain',
    pointId: point.id,
    stage,
    origin: { ...prepared.origin },
    state: { ...point.state },
    depthProfile: auditDepthProfile(prepared, point.state, point.beta, stationDefinition, statePrepared),
    concreteLaw: describeConcreteMaterialLaw(calculationMaterials.concrete),
    steelLaws: calculationMaterials.steel.map((material) => ({
      materialId: material.id,
      name: material.name,
      law: describeSteelMaterialLaw(material)
    })),
    mesh: { ...prepared.mesh.report },
    concreteSummary: {
      pointCount: prepared.concreteFibers.length,
      area: prepared.mesh.report.meshed.area,
      strainMinimum: Math.min(...concreteGroupValues.map((group) => group.strainMinimum)),
      strainMaximum: Math.max(...concreteGroupValues.map((group) => group.strainMaximum)),
      stressMinimum: Math.min(...concreteGroupValues.map((group) => group.stressMinimum)),
      stressMaximum: Math.max(...concreteGroupValues.map((group) => group.stressMaximum)),
      resultant: { ...concrete }
    },
    concreteGroups: concreteGroupValues.sort((left, right) => left.id.localeCompare(right.id)),
    rebars,
    mechanicalLedger,
    nominalReferenceLedger,
    displayedLedger,
    resistanceFactor,
    resistanceFactorCalculation,
    nominalReferenceReconciliation,
    reconciliation
  }
}

const surfaceBounds = (points: PreviewSurfacePoint[]) => ({
  P: mappedRange(points, (point) => point.P),
  Mx: mappedRange(points, (point) => point.Mx),
  My: mappedRange(points, (point) => point.My)
})

const controllingSteelEvidence = (
  prepared: PreparedAnalysis,
  state: StrainState
): { tensileStrain: number; yieldStrain: number; yieldStress: number; steel: SteelMaterial | null; rebarId: number | null } => {
  let selectedSteel: SteelMaterial | null = null
  let rebarId: number | null = null
  let tensileStrain = 0
  let yieldStrain = Number.POSITIVE_INFINITY
  let yieldStress = 400
  for (const bar of prepared.rebars) {
    const strain =
      state.e0 +
      state.kx * (bar.y - prepared.origin.y) +
      state.ky * (bar.x - prepared.origin.x)
    const tension = Math.max(0, -strain)
    if (tension + 1e-15 < tensileStrain) continue
    const materialId = bar.steelMaterialId ?? prepared.materialStore.defaults.steelMaterialId
    const steel =
      prepared.materialStore.steel.find((item) => item.id === materialId) ??
      prepared.materialStore.steel.find((item) => item.id === prepared.materialStore.defaults.steelMaterialId)
    if (!steel) continue
    selectedSteel = steel
    rebarId = bar.id
    tensileStrain = tension
    yieldStrain = steel.fy / steel.elasticModulus
    yieldStress = steel.fy
  }
  if (!Number.isFinite(yieldStrain)) {
    const steel = prepared.materialStore.steel[0]
    selectedSteel = steel ?? null
    yieldStrain = steel ? steel.fy / steel.elasticModulus : 0.002
    yieldStress = steel?.fy ?? 400
  }
  return { tensileStrain, yieldStrain, yieldStress, steel: selectedSteel, rebarId }
}

const designPointFromState = (
  point: PreviewSurfacePoint,
  statePrepared: PreparedAnalysis,
  referencePrepared: PreparedAnalysis,
  designPrepared: PreparedAnalysis,
  basis: DesignBasis
): { nominal: PreviewSurfacePoint; design: PreviewSurfacePoint } => {
  const nominalLedger = referencePrepared === statePrepared
    ? point.ledger
    : evaluatePreparedState(referencePrepared, point.state)
  const nominal: PreviewSurfacePoint = {
    ...point,
    ...nominalLedger.total,
    ledger: nominalLedger,
    resistance: undefined
  }

  if (basis.format === 'globalResultantFactor') {
    const evidence = controllingSteelEvidence(referencePrepared, point.state)
    const evaluation = evaluateGlobalStrengthReduction(
      basis,
      evidence.tensileStrain,
      evidence.yieldStrain,
      evidence.yieldStress
    )
    const ledger = scaleLedger(nominalLedger, evaluation.phi)
    return {
      nominal,
      design: {
        ...point,
        ...ledger.total,
        ledger,
        resistance: {
          nominalReference: nominalLedger.total,
          format: basis.format,
          factor: evaluation.phi,
          classification: evaluation.classification,
          controllingTensileStrain: evaluation.controllingTensileStrain,
          yieldStrain: evaluation.yieldStrain,
          axialCapApplied: false,
          stages: ['nominal-reference', 'global-strength-reduction']
        }
      }
    }
  }

  const designLedger = designPrepared === statePrepared
    ? point.ledger
    : evaluatePreparedState(designPrepared, point.state)
  return {
    nominal,
    design: {
      ...point,
      ...designLedger.total,
      ledger: designLedger,
      resistance: {
        nominalReference: nominalLedger.total,
        format: basis.format,
        factor: null,
        classification: 'design-material',
        controllingTensileStrain: null,
        yieldStrain: null,
        axialCapApplied: false,
        stages: ['nominal-reference', 'design-material-reevaluation']
      }
    }
  }
}

const lerpNumber = (a: number, b: number, t: number) => a + (b - a) * t
const lerpResultantValue = (a: Resultant, b: Resultant, t: number): Resultant => ({
  P: lerpNumber(a.P, b.P, t), Mx: lerpNumber(a.Mx, b.Mx, t), My: lerpNumber(a.My, b.My, t)
})
const lerpLedgerValue = (a: ResultantLedger, b: ResultantLedger, t: number): ResultantLedger => ({
  concrete: lerpResultantValue(a.concrete,b.concrete,t), steelGross: lerpResultantValue(a.steelGross,b.steelGross,t),
  displacedConcrete: lerpResultantValue(a.displacedConcrete,b.displacedConcrete,t),
  steel: lerpResultantValue(a.steel,b.steel,t), total: lerpResultantValue(a.total,b.total,t)
})

/**
 * Complete ULS resistance pipeline. `statePrepared` is compiled from the profile-selected state
 * materials; reference and design laws are independently evaluated on its immutable strain states.
 */
export const buildDesignPreviewSurfaceFromPrepared = (
  statePrepared: PreparedAnalysis,
  sourceMaterials: MaterialStore,
  designBasis: DesignBasis,
  analysisOptions: AnalysisOptions = createDefaultAnalysisOptions()
): PreviewSurface => {
  designBasis = withSteelModelModification(designBasis, sourceMaterials)
  const applicabilityIssues = designMaterialApplicabilityIssues(sourceMaterials, designBasis)
  if (applicabilityIssues.length > 0) {
    throw new AnalysisInputError(
      'INVALID_MATERIAL',
      applicabilityIssues.map((issue) => `${issue.message} ${issue.reference}.`).join(' '),
      { issues: applicabilityIssues }
    )
  }
  const materialSets = buildResistanceMaterialSets(sourceMaterials, designBasis)
  const referencePrepared =
    JSON.stringify(materialSets.referenceMaterials) === JSON.stringify(statePrepared.materialStore)
      ? statePrepared
      : prepareAnalysisFromMesh(
          statePrepared.section,
          statePrepared.rebars,
          materialSets.referenceMaterials,
          statePrepared.mesh,
          statePrepared.origin
        )
  const designPrepared =
    JSON.stringify(materialSets.designMaterials) === JSON.stringify(statePrepared.materialStore)
      ? statePrepared
      : prepareAnalysisFromMesh(
          statePrepared.section,
          statePrepared.rebars,
          materialSets.designMaterials,
          statePrepared.mesh,
          statePrepared.origin
        )
  // Refinement must see the resistance actually checked: φ-scaled resultants for the global route
  // and independently re-evaluated concrete/steel ledgers for the material-factor route.
  const buildResistanceSurface = (options: AnalysisOptions) => {
    if (
      designBasis.format === 'designMaterialReevaluation' &&
      designPrepared === statePrepared
    ) {
      // `statePrepared` is already compiled from `stateMaterials`, which equals the Design
      // materials for this route. Refine directly on those resultants. Nominal/reference values
      // do not govern the sampled geometry, so evaluating them for every rejected midpoint is
      // pure overhead; pair them only with the vertices retained by adaptive refinement.
      const surface = buildPreviewSurfaceFromPrepared(
        statePrepared,
        options,
        designBasis,
        { componentAware: false }
      )
      const paired = surface.points.map((point) => designPointFromState(
        point,
        statePrepared,
        referencePrepared,
        designPrepared,
        designBasis
      ))
      surface.points = paired.map((resistance) => resistance.design)
      return {
        surface,
        nominalPoints: paired.map((resistance, index) => ({
          ...resistance.nominal,
          station: surface.points[index].station,
          stationCoordinate: surface.points[index].stationCoordinate
        }))
      }
    }

    const nominalByPointId = new Map<string, PreviewSurfacePoint>()
    const surface = buildPreviewSurfaceFromPrepared(
      statePrepared,
      options,
      designBasis,
      {
        mapPoint: (point) => {
          const resistance = designPointFromState(
            point,
            statePrepared,
            referencePrepared,
            designPrepared,
            designBasis
          )
          nominalByPointId.set(point.id, resistance.nominal)
          return resistance.design
        },
        // Surface interpolation and ULS checks consume the total Design resultants. Refining
        // hidden concrete/steel ledger components can chase cancellation that is absent from the
        // resistance surface, especially along the nearly straight transition to pure tension.
        componentAware: false
      }
    )
    return {
      surface,
      nominalPoints: surface.points.map((point) => {
        const nominal = nominalByPointId.get(point.id)
        if (!nominal) throw new Error(`Missing nominal resistance for surface point "${point.id}".`)
        return {
          ...nominal,
          station: point.station,
          stationCoordinate: point.stationCoordinate
        }
      })
    }
  }
  const built = buildResistanceSurface(analysisOptions)
  const base = built.surface
  // A run owns exactly one sampling mode.  Legacy display fields below alias that authoritative
  // dataset; they no longer trigger or retain a second fixed calculation beside an adaptive one.
  const nominalPoints = built.nominalPoints
  const uncappedDesign = base.points
  const indexes = new Map(uncappedDesign.map((point, index) => [point, index]))
  const sourceIndex = (point: PreviewSurfacePoint) => {
    const index = indexes.get(point)
    if (index === undefined) throw new AnalysisInputError('INVALID_RESISTANCE_SURFACE', 'Unknown surface vertex.')
    return index
  }
  const originalDesign: PreviewSurfaceDataset = {
    points: uncappedDesign,
    triangles: base.triangles ?? previewSurfaceTriangles(uncappedDesign).map(({ vertices: [a,b,c] }) => ({
      a: sourceIndex(a), b: sourceIndex(b), c: sourceIndex(c)
    })),
    directions: base.directions,
    stations: base.stations
  }
  let designSurface = originalDesign
  if (designBasis.format === 'globalResultantFactor' && designBasis.axialCapEnabled) {
    const maximum = mappedMaximum(uncappedDesign, point => point.P)
    const ratio = designBasis.transverseReinforcement === 'qualifying-spiral'
      ? designBasis.factors.axialCapSpiral : designBasis.factors.axialCapOther
    designSurface = clipDesignSurfaceAtAxialCap(originalDesign, maximum * ratio, maximum, ratio)
  }
  const points = designSurface.points
  const warnings = [...base.warnings]
  if (designBasis.verificationStatus !== 'verified') {
    warnings.push(`Design profile status is ${designBasis.verificationStatus}; results are for review, not release.`)
  }
  if (designBasisRequiresOverrideReason(designBasis)) {
    warnings.push(`Design profile coefficients are modified: ${designBasis.overrideReason}.`)
  } else if (
    designBasis.format === 'globalResultantFactor' &&
    !designBasis.axialCapEnabled
  ) {
    warnings.push('Maximum axial-compression limit is disabled by analysis option.')
  }

  const nominalSurface: PreviewSurfaceDataset = {
    points: nominalPoints,
    triangles: base.triangles,
    directions: base.directions,
    stations: base.stations
  }

  return {
    ...base,
    points,
    nominalPoints,
    triangles: designSurface.triangles,
    nominalTriangles: base.triangles,
    designSurface,
    nominalSurface,
    designFixed: designSurface,
    nominalFixed: nominalSurface,
    ...(designSurface !== originalDesign ? { beforeAxialCap: originalDesign } : {}),
    bounds: surfaceBounds(points),
    warnings,
    designBasis: cloneDesignBasis(designBasis)
  }
}

export const buildDesignPreviewSurface = (
  section: SectionGeometry,
  rebars: GeometryInputRebarView[],
  materialStore: MaterialStore,
  designBasis: DesignBasis,
  meshOptions: ConcreteMeshOptions = {},
  analysisOptions: AnalysisOptions = createDefaultAnalysisOptions()
): PreviewSurface => {
  const sets = buildResistanceMaterialSets(materialStore, designBasis)
  return buildDesignPreviewSurfaceFromPrepared(
    prepareAnalysis(section, rebars, sets.stateMaterials, meshOptions),
    materialStore,
    designBasis,
    analysisOptions
  )
}

/** Exact one-direction calculation using the active mode's fixed or independently adaptive stations. */
export const buildExactDirectionCurveFromPrepared = (
  statePrepared: PreparedAnalysis,
  sourceMaterials: MaterialStore,
  designBasis: DesignBasis,
  analysisOptions: AnalysisOptions,
  beta: number
): ExactDirectionCurve => {
  const exactOptions = cloneAnalysisOptions(analysisOptions)
  const normalized = ((beta % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
  exactOptions.directions.seed = {
    type: 'explicit',
    anglesDeg: [normalized * 180 / Math.PI]
  }
  if (exactOptions.samplingMode === 'adaptive') {
    const refinement = exactOptions.directions.refinement
    if (refinement.type !== 'adaptive') throw new Error('Adaptive mode requires adaptive directions.')
    exactOptions.directions.refinement = { ...refinement, maxPasses: 0, maxDirections: 1 }
  } else {
    exactOptions.stations.refinement = { type: 'fixed' }
    exactOptions.directions.refinement = { type: 'fixed', probe: 'all' }
  }
  const surface = buildDesignPreviewSurfaceFromPrepared(
    statePrepared,
    sourceMaterials,
    designBasis,
    exactOptions
  )
  const designSurface = activeDesignSurfaceDataset(surface)
  const nominalSurface = activeNominalSurfaceDataset(surface)
  return {
    beta: normalized,
    designCurve: designSurface.points,
    nominalCurve: nominalSurface.points,
    ...(surface.beforeAxialCap ? { beforeAxialCap: surface.beforeAxialCap.points } : {}),
    designAdaptive: surface.points,
    designFixed: designSurface.points,
    nominalFixed: nominalSurface.points,
    stations: surface.stations,
    nominalStations: nominalSurface.stations,
    stationError: surface.stationError
  }
}

/** β from the exact strain gradient; null for uniform-strain states such as pure axial/cap cases. */
export const strainGradientDirection = (state: StrainState): number | null => {
  if (Math.hypot(state.kx, state.ky) <= 1e-18) return null
  return ((Math.atan2(state.ky, state.kx) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
}

/**
 * Intersect the authoritative triangulated 3D surface with `P = fixedP`. Every triangle contributes
 * its edge intersections; shared points are deduplicated, classified as sampled-meridian or
 * intermediate triangle-edge vertices, then ordered in the Mx-My plane for polygon/ray queries.
 */
export const sliceFixedPContour = (
  points: PreviewSurfacePoint[],
  fixedP: number,
  triangles?: readonly SurfaceIndexTriangle[]
): PreviewContourPoint[] => {
  const momentScale = mappedMaximum(points, (point) => Math.hypot(point.Mx, point.My), 1)
  const forceScale = mappedMaximum(points, (point) => Math.abs(point.P), 1)
  const momentTol = momentScale * PREVIEW_GEOMETRY_TOL
  const forceTol = forceScale * PREVIEW_GEOMETRY_TOL
  if (!Number.isFinite(fixedP)) return []
  const vertexIndices = new Map(points.map((point, index) => [point, index]))
  const vertexKey = (point: PreviewSurfacePoint) =>
    point.stationId === 'pure-tension' || point.stationId === 'pure-compression'
      ? `pole:${point.stationId}` : `v:${vertexIndices.get(point)}`
  const nodes = new Map<string, { point: PreviewContourPoint; neighbours: Set<string> }>()
  const edges = new Map<string, [string, string]>()
  const coplanar = new Map<string, { edge: [string, string]; count: number }>()
  const edgeKey = (a: string, b: string) => a < b ? `${a}|${b}` : `${b}|${a}`
  const addNode = (key: string, point: PreviewContourPoint) => {
    const previous = nodes.get(key)
    if (!previous) nodes.set(key, { point: { ...point, P: fixedP }, neighbours: new Set() })
    else if (point.onSampledDirection) previous.point.onSampledDirection = true
    return key
  }
  const addEdge = (a: string, b: string) => {
    const pa = nodes.get(a)!.point, pb = nodes.get(b)!.point
    if (a === b || Math.hypot(pa.Mx - pb.Mx, pa.My - pb.My) <= momentTol) return
    edges.set(edgeKey(a, b), [a, b])
  }
  for (const triangle of previewSurfaceTriangles(points, triangles)) {
    const vertices = triangle.vertices
    const distances = vertices.map(point => point.P - fixedP)
    const onPlane = distances.map(distance => Math.abs(distance) <= forceTol)
    const cut = new Set<string>()
    for (let index = 0; index < 3; index += 1) {
      const next = (index + 1) % 3
      const a = vertices[index], b = vertices[next]
      if (onPlane[index]) cut.add(addNode(vertexKey(a), { ...a, onSampledDirection: a.onSampledDirection !== false }))
      if (!onPlane[index] && !onPlane[next] && distances[index] * distances[next] < 0) {
        const key = `e:${edgeKey(vertexKey(a), vertexKey(b))}`
        const point = lerpPoint(a, b, distances[index] / (distances[index] - distances[next]))
        cut.add(addNode(key, { ...point, beta: physicalEdgeDirection(a, b) ?? point.beta,
          onSampledDirection: triangle.sameDirectionEdge[index] }))
      }
    }
    if (onPlane.every(Boolean)) {
      for (let index = 0; index < 3; index += 1) {
        const a = vertexKey(vertices[index]), b = vertexKey(vertices[(index + 1) % 3])
        const key = edgeKey(a, b)
        const previous = coplanar.get(key)
        coplanar.set(key, { edge: [a, b], count: (previous?.count ?? 0) + 1 })
      }
    } else if (cut.size === 2) addEdge(...[...cut] as [string, string])
  }
  for (const { edge, count } of coplanar.values()) if (count === 1) addEdge(...edge)
  for (const [a, b] of edges.values()) {
    nodes.get(a)!.neighbours.add(b)
    nodes.get(b)!.neighbours.add(a)
  }
  const unused = new Set(edges.keys())
  const contour: PreviewContourPoint[] = []
  let pathId = 0
  while (unused.size) {
    const [seedA] = edges.get(unused.values().next().value!)!
    const component = new Set<string>()
    const queue = [seedA]
    while (queue.length) {
      const key = queue.pop()!
      if (component.has(key)) continue
      component.add(key)
      queue.push(...nodes.get(key)!.neighbours)
    }
    const regular = [...component].every(key => nodes.get(key)!.neighbours.size === 2)
    const start = [...component].find(key => nodes.get(key)!.neighbours.size === 1 &&
      [...nodes.get(key)!.neighbours].some(other => unused.has(edgeKey(key, other)))) ?? seedA
    const path = [start]
    let current = start
    while (true) {
      const next = [...nodes.get(current)!.neighbours].find(key => unused.has(edgeKey(current, key)))
      if (!next) break
      unused.delete(edgeKey(current, next))
      current = next
      if (current === start) break
      path.push(current)
    }
    for (const key of path) contour.push({ ...nodes.get(key)!.point, pathId, pathClosed: regular && current === start })
    pathId += 1
  }
  for (const node of nodes.values()) if (!node.neighbours.size) {
    // Coplanar patch interiors are not isolated surface contacts.
    if ([...coplanar.values()].some(({ edge }) => edge.some(key => nodes.get(key) === node))) continue
    contour.push({ ...node.point, pathId: pathId++, pathClosed: false })
  }
  return contour
}

/** Complete geometric paths, including their qualified closure, for downstream adapters. */
export const fixedPContourPaths = (contour: readonly PreviewContourPoint[]) => {
  const paths = new Map<number, PreviewContourPoint[]>()
  for (const point of contour) {
    const key = point.pathId ?? 0
    const path = paths.get(key) ?? []
    path.push(point)
    paths.set(key, path)
  }
  return [...paths.values()]
}

/** Plot coordinates with explicit path breaks. No line joins different components. */
export const fixedPContourLinePoints = (contour: readonly PreviewContourPoint[]): Array<PreviewContourPoint | null> =>
  fixedPContourPaths(contour).flatMap(path => [
    ...path, ...(path.length > 2 && path[0].pathClosed !== false ? [path[0]] : []), null
  ])

const normalizeAngleDegrees = (degrees: number) => ((degrees % 360) + 360) % 360
const angleDistanceDegrees = (left: number, right: number) => {
  const distance = Math.abs(normalizeAngleDegrees(left) - normalizeAngleDegrees(right))
  return Math.min(distance, 360 - distance)
}

const fixedPDirectionPoints = (
  points: PreviewSurfacePoint[],
  angleDeg: number
): PreviewSurfacePoint[] => buildDirectMeridianSection(points, angleDeg, false).primary
  .filter((point) => point.sectionPointRole === 'surface-vertex')
  .filter((point) =>
    angleDistanceDegrees(point.beta * 180 / Math.PI, angleDeg) < 1e-5 ||
    Math.hypot(point.Mx, point.My) < 1e-8
  )
  .sort((left, right) => left.station - right.station)

const fixedPBracket = (
  points: PreviewSurfacePoint[],
  fixedP: number,
  sample: PreviewContourPoint
): FixedPInterpolationBracket | null => {
  const angleDeg = normalizeAngleDegrees(sample.beta * 180 / Math.PI)
  const direction = fixedPDirectionPoints(points, angleDeg)
  const exactTolerance = Math.max(1e-7, Math.abs(fixedP) * 1e-12)
  const exact = direction
    .filter((point) => Math.abs(point.P - fixedP) <= exactTolerance)
    .sort((left, right) =>
      (left.Mx - sample.Mx) ** 2 + (left.My - sample.My) ** 2 -
      ((right.Mx - sample.Mx) ** 2 + (right.My - sample.My) ** 2)
    )[0]
  if (exact) return { below: exact, above: exact, ratio: 0, exact: true }

  const candidates: Array<FixedPInterpolationBracket & { error: number }> = []
  for (let index = 1; index < direction.length; index += 1) {
    const first = direction[index - 1]
    const second = direction[index]
    if ((fixedP - first.P) * (fixedP - second.P) > 0 || Math.abs(second.P - first.P) < 1e-12) continue
    const ratioFromFirst = (fixedP - first.P) / (second.P - first.P)
    const mx = first.Mx + ratioFromFirst * (second.Mx - first.Mx)
    const my = first.My + ratioFromFirst * (second.My - first.My)
    const below = first.P <= second.P ? first : second
    const above = first.P <= second.P ? second : first
    candidates.push({
      below,
      above,
      ratio: (fixedP - below.P) / (above.P - below.P),
      exact: false,
      error: (mx - sample.Mx) ** 2 + (my - sample.My) ** 2
    })
  }
  const selected = candidates.sort((left, right) => left.error - right.error)[0]
  if (!selected) return null
  return {
    below: selected.below,
    above: selected.above,
    ratio: selected.ratio,
    exact: selected.exact
  }
}

/**
 * Trace every labelled Fixed-P contour row to the two authoritative surface states used by its
 * same-direction interpolation. Consumers may display this evidence but must not search for a
 * different bracket or recompute a parallel contour.
 */
export const traceFixedPContourSamples = (
  points: PreviewSurfacePoint[],
  fixedP: number,
  triangles?: readonly SurfaceIndexTriangle[]
): FixedPContourSampleTrace[] => contourStrainAngleSamples(
  sliceFixedPContour(points, fixedP, triangles)
).map((point) => ({ point, bracket: fixedPBracket(points, fixedP, point) }))

/** Fixed-P query on the active mode's authoritative Design dataset. */
export const sliceActiveDesignPContour = (
  surface: PreviewSurface,
  fixedP: number
): PreviewContourPoint[] => {
  const active = activeDesignSurfaceDataset(surface)
  return sliceFixedPContour(
    active.points,
    fixedP,
    active.triangles
  )
}

/** @deprecated Use `sliceActiveDesignPContour`. */
export const sliceFixedDesignPContour = sliceActiveDesignPContour

/**
 * Intersect the preview surface with the vertical demand plane
 * `Mx*sin(theta) - My*cos(theta) = 0`, then project each intersection point to `P-Mtheta`.
 *
 * Each triangle contributes a segment. The segments are stitched by their shared surface-edge or
 * surface-vertex identity, not by sorting the resulting point cloud by `P`. This preserves loops,
 * non-monotone branches and multiple connected components. Pure-compression/pure-tension vertices
 * are welded by their reserved station identity because every beta row contains a duplicate copy
 * of the same pole. Numeric station order is not an identity: synthetic faces may deliberately sit
 * outside the physical station schedule.
 *
 * The preview surface is still the coarse beta/station grid. This is a geometric section of that
 * surface; it does not assume the sampled strain-plane angle equals the moment direction.
 */
export const sliceMomentPlane = (
  points: PreviewSurfacePoint[],
  theta: number,
  triangles?: readonly SurfaceIndexTriangle[]
): PreviewMomentPlanePath[] => {
  if (points.length === 0) return []
  const c = Math.cos(theta)
  const s = Math.sin(theta)
  const momentScale = mappedMaximum(points, (point) => Math.hypot(point.Mx, point.My), 1)
  const forceScale = mappedMaximum(points, (point) => Math.abs(point.P), 1)
  const momentTol = momentScale * PREVIEW_GEOMETRY_TOL
  const forceTol = forceScale * PREVIEW_GEOMETRY_TOL
  const planeDistance = (point: PreviewSurfacePoint) => point.Mx * s - point.My * c
  // Classification must be tighter than display/point matching. With the 1e-9 matching tolerance,
  // a nearly collapsed station next to a pole can make all three vertices of a small cap triangle
  // appear coplanar and create a false branch in the intersection graph.
  const planeTol = momentScale * 1e-12
  const capPlanes = new Set<number>()
  for (const point of points) if (point.surfaceRole === 'axial-cap' && point.axialCapTrace) {
    capPlanes.add(point.axialCapTrace.cap)
  }
  const vertexIndex = new WeakMap<PreviewSurfacePoint, number>()
  points.forEach((point, index) => vertexIndex.set(point, index))

  type GraphNode = { point: PreviewMomentPlanePoint; neighbours: Set<string> }
  const graph = new Map<string, GraphNode>()
  const graphEdges = new Set<string>()

  const vertexKey = (point: PreviewSurfacePoint) =>
    point.stationId === 'pure-tension' || point.stationId === 'pure-compression'
      ? `pole:${point.stationId}`
      : `vertex:${vertexIndex.get(point)!}`

  const projected = (point: PreviewContourPoint): PreviewMomentPlanePoint => ({
    ...point,
    beta: theta,
    M: point.Mx * c + point.My * s
  })

  const mergeNode = (key: string, point: PreviewMomentPlanePoint) => {
    const existing = graph.get(key)
    if (existing) {
      if (point.onSampledDirection) existing.point.onSampledDirection = true
      return
    }
    graph.set(key, { point, neighbours: new Set() })
  }

  const canonicalNode = (candidate: { key: string; point: PreviewMomentPlanePoint }) => {
    for (const [key, node] of graph) {
      if (
        Math.abs(node.point.P - candidate.point.P) <= forceTol &&
        Math.abs(node.point.Mx - candidate.point.Mx) <= momentTol &&
        Math.abs(node.point.My - candidate.point.My) <= momentTol
      ) {
        // Welding may encounter a nearby side-edge point first. Retain the actual geometric
        // boundary coordinate when its exact cap-plane intersection is subsequently available.
        if (capPlanes.has(candidate.point.P) && !capPlanes.has(node.point.P)) {
          node.point = { ...candidate.point,
            onSampledDirection: candidate.point.onSampledDirection || node.point.onSampledDirection }
        } else if (candidate.point.onSampledDirection) node.point.onSampledDirection = true
        return { key, point: node.point }
      }
    }
    mergeNode(candidate.key, candidate.point)
    return candidate
  }

  const addGraphEdge = (
    a: { key: string; point: PreviewMomentPlanePoint },
    b: { key: string; point: PreviewMomentPlanePoint }
  ) => {
    const canonicalA = canonicalNode(a)
    const canonicalB = canonicalNode(b)
    if (
      canonicalA.key === canonicalB.key ||
      (Math.abs(canonicalA.point.P - canonicalB.point.P) <= forceTol &&
        Math.abs(canonicalA.point.Mx - canonicalB.point.Mx) <= momentTol &&
        Math.abs(canonicalA.point.My - canonicalB.point.My) <= momentTol)
    ) {
      return
    }
    const edgeKey =
      canonicalA.key < canonicalB.key
        ? `${canonicalA.key}|${canonicalB.key}`
        : `${canonicalB.key}|${canonicalA.key}`
    if (graphEdges.has(edgeKey)) return
    graphEdges.add(edgeKey)
    graph.get(canonicalA.key)!.neighbours.add(canonicalB.key)
    graph.get(canonicalB.key)!.neighbours.add(canonicalA.key)
  }

  for (const triangle of previewSurfaceTriangles(points, triangles)) {
    const intersections = new Map<string, PreviewMomentPlanePoint>()
    const addVertex = (point: PreviewSurfacePoint) =>
      intersections.set(vertexKey(point), projected({
        ...point,
        onSampledDirection: point.onSampledDirection !== false
      }))
    const edges: Array<[PreviewSurfacePoint, PreviewSurfacePoint, boolean]> = [
      [triangle.vertices[0], triangle.vertices[1], triangle.sameDirectionEdge[0]],
      [triangle.vertices[1], triangle.vertices[2], triangle.sameDirectionEdge[1]],
      [triangle.vertices[2], triangle.vertices[0], triangle.sameDirectionEdge[2]]
    ]

    for (const [a, b, sameDirection] of edges) {
      const da = planeDistance(a)
      const db = planeDistance(b)
      const aOn = Math.abs(da) <= planeTol
      const bOn = Math.abs(db) <= planeTol
      if (aOn) addVertex(a)
      if (bOn) addVertex(b)
      if (aOn || bOn || da * db > 0) continue

      const aIndex = vertexIndex.get(a)!
      const bIndex = vertexIndex.get(b)!
      const edgeKey =
        aIndex < bIndex ? `edge:${aIndex}:${bIndex}` : `edge:${bIndex}:${aIndex}`
      const t = da / (da - db)
      intersections.set(
        edgeKey,
        projected({ ...lerpPoint(a, b, t), onSampledDirection: sameDirection })
      )
    }

    const nodes = [...intersections.entries()].map(([key, point]) => ({ key, point }))
    if (nodes.length === 2) {
      addGraphEdge(nodes[0], nodes[1])
      continue
    }
    if (nodes.length < 2) continue

    // A facet that is numerically coplanar has no unique one-dimensional intersection. Preserve a
    // deterministic boundary segment without inventing a P-sorted chord; this branch is only a
    // degeneracy fallback because `planeTol` is deliberately tight.
    let farthest: [typeof nodes[number], typeof nodes[number]] = [nodes[0], nodes[1]]
    let farthestDistance = -1
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dP = (nodes[i].point.P - nodes[j].point.P) / forceScale
        const dM = (nodes[i].point.M - nodes[j].point.M) / momentScale
        const distance = dP * dP + dM * dM
        if (distance > farthestDistance) {
          farthestDistance = distance
          farthest = [nodes[i], nodes[j]]
        }
      }
    }
    addGraphEdge(...farthest)
  }

  const unusedEdges = new Set(graphEdges)
  const edgeKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)
  const paths: PreviewMomentPlanePath[] = []

  while (unusedEdges.size > 0) {
    const seed = unusedEdges.values().next().value as string
    const [seedA, seedB] = seed.split('|')
    const seedComponent = new Set<string>([seedA, seedB])
    const queue = [seedA, seedB]
    while (queue.length > 0) {
      const node = queue.pop()!
      for (const neighbour of graph.get(node)?.neighbours ?? []) {
        if (seedComponent.has(neighbour)) continue
        seedComponent.add(neighbour)
        queue.push(neighbour)
      }
    }

    // An open component starts at an odd/non-manifold vertex so the diagnostic stays visible.
    // A regular loop starts deterministically at its highest-P, then lowest-M point.
    // Only a node that still owns an unused edge can start a walk: an earlier walk of this same
    // component may have exhausted the irregular node, and restarting there would consume no edge.
    const walkable = [...seedComponent].filter((key) =>
      [...graph.get(key)!.neighbours].some((next) => unusedEdges.has(edgeKey(key, next))))
    const irregular = walkable.filter((key) => graph.get(key)!.neighbours.size !== 2)
    const start =
      irregular.sort()[0] ??
      walkable.sort((a, b) => {
        const pa = graph.get(a)!.point
        const pb = graph.get(b)!.point
        return pb.P - pa.P || pa.M - pb.M || a.localeCompare(b)
      })[0]

    const orderedKeys = [start]
    let previous: string | null = null
    let current = start
    while (true) {
      const candidates = [...graph.get(current)!.neighbours]
        .filter((next) => unusedEdges.has(edgeKey(current, next)))
        .sort()
      const next = candidates.find((candidate) => candidate !== previous) ?? candidates[0]
      if (!next) break
      unusedEdges.delete(edgeKey(current, next))
      orderedKeys.push(next)
      previous = current
      current = next
      if (current === start) break
    }

    const closed = orderedKeys.length > 2 && orderedKeys[orderedKeys.length - 1] === start
    paths.push({
      points: orderedKeys.map((key) => graph.get(key)!.point),
      closed
    })
  }

  // Largest section loop first; multiple loops remain separate and are never connected by Plotly.
  const area = (path: PreviewMomentPlanePath) => {
    let twice = 0
    for (let i = 0; i < path.points.length - 1; i++) {
      twice += path.points[i].M * path.points[i + 1].P - path.points[i + 1].M * path.points[i].P
    }
    return Math.abs(twice) / 2
  }
  return paths.sort((a, b) => area(b) - area(a))
}

const cross2 = (a: Pick<Resultant, 'Mx' | 'My'>, b: Pick<Resultant, 'Mx' | 'My'>) => a.Mx * b.My - a.My * b.Mx

export const intersectFixedPContourWithMomentRay = (
  contour: PreviewContourPoint[],
  theta: number
): PreviewMomentPlanePoint | null => {
  if (contour.length < 2 || contour.some(point => point.pathClosed === false)) return null
  const c = Math.cos(theta), s = Math.sin(theta)
  const direction = { Mx: c, My: s }
  const tolerance = mappedMaximum(contour, point => Math.hypot(point.Mx, point.My), 1) * PREVIEW_GEOMETRY_TOL
  const hits: Array<{ point: PreviewMomentPlanePoint; signs: Set<number> }> = []
  for (const path of fixedPContourPaths(contour)) {
    for (let index = 0; index < path.length; index += 1) {
      let a = path[index], b = path[(index + 1) % path.length]
      // Canonical endpoint orientation makes arithmetic independent of the graph walk direction.
      const delta = Math.atan2(b.My, b.Mx) - Math.atan2(a.My, a.Mx)
      if (delta < 0 && delta > -Math.PI || delta > Math.PI) [a, b] = [b, a]
      const da = cross2(a, direction), db = cross2(b, direction)
      const alongA = a.Mx * c + a.My * s, alongB = b.Mx * c + b.My * s
      if (Math.abs(da) <= tolerance && Math.abs(db) <= tolerance) {
        if (Math.max(alongA, alongB) >= -tolerance) return null
        continue
      }
      if (da * db > 0 && Math.abs(da) > tolerance && Math.abs(db) > tolerance) continue
      const edge = { Mx: b.Mx - a.Mx, My: b.My - a.My }
      const fraction = -da / cross2(edge, direction)
      if (fraction < -PREVIEW_GEOMETRY_TOL || fraction > 1 + PREVIEW_GEOMETRY_TOL) continue
      const Mx = a.Mx + fraction * edge.Mx, My = a.My + fraction * edge.My
      const point = { beta: theta, P: a.P, Mx, My, M: Mx * c + My * s }
      if (point.M < -tolerance) continue
      if (point.M <= tolerance) return null
      const existing = hits.find(hit => Math.abs(hit.point.M - point.M) <= tolerance)
      const hit = existing ?? { point, signs: new Set<number>() }
      if (!existing) hits.push(hit)
      if (Math.abs(da) > tolerance) hit.signs.add(Math.sign(da))
      if (Math.abs(db) > tolerance) hit.signs.add(Math.sign(db))
    }
  }
  // A single transverse exit qualifies the radial ratio. Outside axes, re-entry and tangency
  // remain unavailable, matching the independently evaluated Constant-P surface-ray contract.
  return hits.length === 1 && hits[0].signs.size === 2 ? hits[0].point : null
}

const residualNorm = (residual: Resultant, forceScale: number, momentScale: number) =>
  Math.max(
    Math.abs(residual.P) / forceScale,
    Math.abs(residual.Mx) / momentScale,
    Math.abs(residual.My) / momentScale
  )

const demandMomentRadius = (demand: Resultant) => Math.hypot(demand.Mx, demand.My)

const estimateUtilization = (demand: LoadCombination, contour: PreviewContourPoint[]) => {
  const demandRadius = demandMomentRadius(demand)
  if (demandRadius < 1e-9 || contour.length === 0) return { utilization: null, point: null }
  const demandAngle = Math.atan2(demand.My, demand.Mx)
  const best = intersectFixedPContourWithMomentRay(contour, demandAngle)
  const capacityRadius = best?.M ?? 0
  return {
    utilization: capacityRadius > 1e-9 ? demandRadius / capacityRadius : null,
    point: best
  }
}

type Vec3 = [number, number, number]
const vecSubtract = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const vecCross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
]
const vecDot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

type SurfaceRayCrossing = {
  /** Ray parameter, in the units of the supplied direction. */
  t: number
  u: number
  v: number
  vertices: readonly [PreviewSurfacePoint, PreviewSurfacePoint, PreviewSurfacePoint]
}

const surfaceActionScales = (surface: PreviewSurface) => ({
  forceScale: Math.max(Math.abs(surface.bounds.P[0]), Math.abs(surface.bounds.P[1]), 1),
  momentScale: Math.max(
    Math.abs(surface.bounds.Mx[0]),
    Math.abs(surface.bounds.Mx[1]),
    Math.abs(surface.bounds.My[0]),
    Math.abs(surface.bounds.My[1]),
    1
  )
})

/**
 * One Möller–Trumbore pass over the resistance triangles. Coordinates are normalized so force and
 * moment units cannot condition the geometry test. Coplanar triangles report no crossing.
 */
const visitSurfaceRayCrossings = (
  surface: PreviewSurface,
  origin: Resultant,
  rayDirection: Resultant,
  visit: (crossing: SurfaceRayCrossing) => void
) => {
  const { forceScale, momentScale } = surfaceActionScales(surface)
  const toVec = (value: Resultant): Vec3 => [
    value.P / forceScale,
    value.Mx / momentScale,
    value.My / momentScale
  ]
  const start = toVec(origin)
  const direction = toVec(rayDirection)
  for (const triangle of previewSurfaceTriangles(surface.points, surface.triangles)) {
    const [pa, pb, pc] = triangle.vertices
    const a = toVec(pa)
    const b = toVec(pb)
    const c = toVec(pc)
    const edge1 = vecSubtract(b, a)
    const edge2 = vecSubtract(c, a)
    const h = vecCross(direction, edge2)
    const determinant = vecDot(edge1, h)
    if (Math.abs(determinant) < 1e-12) continue
    const inverse = 1 / determinant
    const s = vecSubtract(start, a)
    const u = inverse * vecDot(s, h)
    if (u < -1e-9 || u > 1 + 1e-9) continue
    const q = vecCross(s, edge1)
    const v = inverse * vecDot(direction, q)
    if (v < -1e-9 || u + v > 1 + 1e-9) continue
    visit({ t: inverse * vecDot(edge2, q), u, v, vertices: [pa, pb, pc] })
  }
}

const surfaceIntersectionAt = (crossing: SurfaceRayCrossing, lambda: number, point: Resultant): SurfaceRayIntersection => {
  const { u, v, vertices: [pa, pb, pc] } = crossing
  const w = 1 - u - v
  const dominant =
    w >= u && w >= v ? pa : u >= v ? pb : pc
  return {
    lambda,
    point,
    state: {
      e0: w * pa.state.e0 + u * pb.state.e0 + v * pc.state.e0,
      kx: w * pa.state.kx + u * pb.state.kx + v * pc.state.kx,
      ky: w * pa.state.ky + u * pb.state.ky + v * pc.state.ky
    },
    resistance: dominant.resistance ?? null,
    source: { vertices: [pa, pb, pc], weights: [w, u, v] }
  }
}

/** Intersect `lambda * demand` with the completed 3D resistance surface. */
export const intersectSurfaceWithDemandRay = (
  surface: PreviewSurface,
  demand: Resultant
): SurfaceRayIntersection | null => {
  const magnitude = Math.hypot(demand.P, demand.Mx, demand.My)
  if (magnitude < 1e-12) {
    return {
      lambda: Number.POSITIVE_INFINITY,
      point: { P: 0, Mx: 0, My: 0 },
      state: { e0: 0, kx: 0, ky: 0 },
      resistance: null,
      source: null
    }
  }
  let best = null as SurfaceRayIntersection | null
  visitSurfaceRayCrossings(surface, { P: 0, Mx: 0, My: 0 }, demand, (crossing) => {
    const [pa, pb, pc] = crossing.vertices
    const horizontal = pa.P === pb.P && pa.P === pc.P && demand.P !== 0
    const lambda = horizontal ? pa.P / demand.P : crossing.t
    if (lambda <= 1e-10 || (best && lambda >= best.lambda)) return
    best = surfaceIntersectionAt(crossing, lambda, {
      P: horizontal ? pa.P : lambda * demand.P,
      Mx: lambda * demand.Mx,
      My: lambda * demand.My
    })
  })
  return best
}

/** docs/07 §4: independent signed-solid-angle containment, in normalized action space. */
const constantAxialStart = (surface: PreviewSurface, P: number, direction: Vec3) => {
  const { forceScale, momentScale } = surfaceActionScales(surface)
  const angles = new CompensatedScalar()
  let boundary = false, sideBoundary = false, coplanar = false
  for (const { vertices } of previewSurfaceTriangles(surface.points, surface.triangles)) {
    const [a, b, c] = vertices.map(point => [(point.P - P) / forceScale, point.Mx / momentScale, point.My / momentScale] as Vec3)
    const ab = vecSubtract(b, a), ac = vecSubtract(c, a), normal = vecCross(ab, ac)
    const norm = Math.hypot(...normal)
    if (norm === 0) continue
    const plane = vecDot(a, normal)
    const horizontalBound = vertices.every(point => point.P === P) && (P === surface.bounds.P[0] || P === surface.bounds.P[1])
    if (Math.abs(plane) <= PREVIEW_GEOMETRY_TOL * norm) {
      const aa = vecDot(ab, ab), cc = vecDot(ac, ac), cross = vecDot(ab, ac)
      const denominator = vecDot(normal, normal)
      const barycentric = (v: Vec3) => [
        (cc * vecDot(v, ab) - cross * vecDot(v, ac)) / denominator,
        (aa * vecDot(v, ac) - cross * vecDot(v, ab)) / denominator
      ]
      const [u, v] = barycentric(a.map(value => -value) as Vec3)
      if (u >= -PREVIEW_GEOMETRY_TOL && v >= -PREVIEW_GEOMETRY_TOL && u + v <= 1 + PREVIEW_GEOMETRY_TOL) {
        boundary = true
        sideBoundary ||= !horizontalBound
      }
      // Clip a coplanar ray against the triangle's three barycentric half-spaces. A cap
      // interior is permitted; following any other boundary segment is unresolved geometry.
      if (!horizontalBound && Math.abs(vecDot(normal, direction)) < 1e-12) {
        const [du, dv] = barycentric(direction)
        let lower = 0, upper = Number.POSITIVE_INFINITY
        for (const [offset, slope] of [[u, du], [v, dv], [1 - u - v, -du - dv]]) {
          if (slope === 0) { if (offset < -PREVIEW_GEOMETRY_TOL) upper = -1 }
          else if (slope > 0) lower = Math.max(lower, (-PREVIEW_GEOMETRY_TOL - offset) / slope)
          else upper = Math.min(upper, (-PREVIEW_GEOMETRY_TOL - offset) / slope)
        }
        coplanar ||= upper >= lower && upper > 1e-10
      }
    }
    const lengths = [Math.hypot(...a), Math.hypot(...b), Math.hypot(...c)]
    angles.add(2 * Math.atan2(vecDot(a, vecCross(b, c)), lengths[0] * lengths[1] * lengths[2] +
      vecDot(a, b) * lengths[2] + vecDot(b, c) * lengths[0] + vecDot(c, a) * lengths[1]))
  }
  if (sideBoundary) return 'geometric-ambiguity' as const
  // On a closed, oriented surface the solid angle is 0 outside and +/-4pi inside.
  // Boundary cases were handled above; 2pi separates those topological values.
  if (!boundary && Math.abs(angles.value()) < 2 * Math.PI) return 'axis-outside-domain' as const
  if (!Number.isFinite(angles.value()) || coplanar) return 'geometric-ambiguity' as const
  return 'inside' as const
}

/**
 * Intersect the horizontal ray `(Pu, t cos(thetaLoad), t sin(thetaLoad))` with the same surface.
 * `lambda` scales only the moments. docs/07 section 4 requires `(Pu, 0, 0)` inside the domain and a
 * unique transverse exit. Containment is independent of ray parity; tangencies and coplanar
 * ambiguities publish no ratio. The contour route is the independent crossing oracle.
 */
export const intersectSurfaceAtConstantAxial = (
  surface: PreviewSurface,
  demand: Resultant
): ConstantAxialIntersection => {
  if (demand.P > surface.bounds.P[1] || demand.P < surface.bounds.P[0]) return { status: 'axial-outside-domain' }
  const demandMoment = Math.hypot(demand.Mx, demand.My)
  if (demandMoment < 1e-9) return { status: 'zero-moment' }
  // A unit ray in normalized action space keeps the determinant test independent of demand size.
  const { forceScale, momentScale } = surfaceActionScales(surface)
  const toUnitRay = momentScale / demandMoment
  const direction: Vec3 = [0, demand.Mx / demandMoment, demand.My / demandMoment]
  const start = constantAxialStart(surface, demand.P, direction)
  if (start !== 'inside') return { status: start }
  const crossings: SurfaceRayCrossing[] = []
  visitSurfaceRayCrossings(
    surface,
    { P: demand.P, Mx: 0, My: 0 },
    { P: 0, Mx: demand.Mx * toUnitRay, My: demand.My * toUnitRay },
    (crossing) => { if (crossing.t > 1e-10) crossings.push(crossing) }
  )
  crossings.sort((left, right) => left.t - right.t)
  // Triangles sharing the crossed edge or vertex report one exit.
  const exits = crossings.filter((crossing, index) => index === 0 || crossing.t - crossings[index - 1].t > 1e-9)
  // A tangent at a welded edge/vertex has incident hits in opposing directions.
  for (const exit of exits) {
    const signs = crossings.filter(hit => Math.abs(hit.t - exit.t) <= PREVIEW_GEOMETRY_TOL).map(hit => {
      const [a, b, c] = hit.vertices.map(point => [point.P / forceScale,
        point.Mx / momentScale, point.My / momentScale] as Vec3)
      return Math.sign(vecDot(vecCross(vecSubtract(b, a), vecSubtract(c, a)), direction))
    })
    if (signs.some(sign => sign !== signs[0])) return { status: 'geometric-ambiguity' }
  }
  if (exits.length % 2 === 0) return { status: 'geometric-ambiguity' }
  if (exits.length > 1) return { status: 'non-unique-exit' }
  const lambda = exits[0].t * toUnitRay
  return {
    status: 'crossing',
    intersection: surfaceIntersectionAt(exits[0], lambda, { P: demand.P, Mx: lambda * demand.Mx, My: lambda * demand.My })
  }
}

const CONSTANT_AXIAL_MESSAGES: Record<Exclude<ConstantAxialIntersection['status'], 'crossing'>, string> = {
  'axial-outside-domain': 'Pu lies outside the Design axial range, so no moment capacity exists at this axial force.',
  'zero-moment': 'A zero-moment demand has no moment direction, so the constant-P ratio is not defined.',
  'axis-outside-domain': 'The point (Pu, 0, 0) lies outside the Design domain, so the constant-P ratio is not defined.',
  'non-unique-exit': 'The constant-P ray leaves the Design domain more than once, so the ratio is not unique.',
  'geometric-ambiguity': 'The constant-P ray touches or follows an unresolved Design boundary; no unique transverse exit is qualified.'
}

const checkRawLoadcaseUtilizationFromSurface = (
  surface: PreviewSurface,
  loadcase: LoadCombination,
  checkBasis: DemandCheckBasis
): LoadcaseQuickCheckResult => {
  const contour = sliceActiveDesignPContour(surface, loadcase.P)
  const fixedP = estimateUtilization(loadcase, contour)
  const proportional = intersectSurfaceWithDemandRay(surface, loadcase)
  const constantAxial = checkBasis === 'constantAxial' ? intersectSurfaceAtConstantAxial(surface, loadcase) : null
  const demandMoment = demandMomentRadius(loadcase)
  const proportionalUtilization =
    proportional == null
      ? null
      : proportional.lambda === Number.POSITIVE_INFINITY
        ? 0
        : 1 / proportional.lambda
  const adaptive = surface.analysisOptions.samplingMode === 'adaptive'
  const adaptiveConverged = surface.directionError.withinTolerance && surface.stationError.withinTolerance
  const adaptiveUncertainty = adaptiveConverged
    ? Math.max(surface.directionError.maxRelativeComponent, surface.stationError.maxRelative)
    : null
  const equivalentBlock =
    surface.mechanics === 'equivalent-rectangular-block' ||
    surface.analysisOptions.methodId === 'equivalent-block-surface-v1'
  // One Fixed rule by project decision: only the stress-strain proportional matrix measured this
  // margin, so every other check says that it is not a validated bound for that domain.
  const unvalidatedMargin = !adaptive &&
    (equivalentBlock || surface.strainDomain === 'steel-limited-ultimate' || constantAxial !== null)
  const relativeUncertainty = adaptive ? adaptiveUncertainty : FIXED_GRID_SCREENING_RELATIVE_UNCERTAINTY
  const evidence = adaptive ? 'adaptive-sampling-estimate' : 'fixed-grid-screening-margin'
  const selected = constantAxial
    ? constantAxial.status === 'crossing' ? constantAxial.intersection : null
    : proportional
  const utilization = constantAxial
    ? selected && 1 / selected.lambda
    : proportionalUtilization
  const classification = constantAxial?.status === 'axial-outside-domain'
    ? axialOutsideDomainClassification()
    : classifyUtilization(utilization, relativeUncertainty, evidence)
  let message = constantAxial && constantAxial.status !== 'crossing'
    ? CONSTANT_AXIAL_MESSAGES[constantAxial.status]
    : !constantAxial && proportionalUtilization == null
      ? 'No proportional demand-ray crossing was found on the design-resistance surface.'
      : unvalidatedMargin
        ? `Factored ULS demand checked${constantAxial ? ' at constant P' : ''} against the Fixed design-resistance surface. The 2% screening margin is applied by project decision and is not a validated bound for this check; use Adaptive sampling for a measured estimate.`
        : constantAxial
          ? 'Factored ULS demand checked at constant P against the Adaptive 3D design-resistance surface.'
          : 'Factored ULS demand checked against the 3D design-resistance surface; fixed-P UR is secondary.'
  // ENG-RES-001: distinguish unavailable evidence from a valid interval crossing UR = 1.
  // Consumers display this diagnostic; they must not infer its cause from UR or the code profile.
  if (classification.status === 'indeterminate' && selected) {
    if (classification.interval.lower !== null && classification.interval.upper !== null) {
      message += ' The utilization uncertainty interval crosses UR = 1; the verdict is indeterminate.'
    } else if (adaptive && !adaptiveConverged) {
      const dimensions = [
        ...(!surface.directionError.withinTolerance ? ['direction'] : []),
        ...(!surface.stationError.withinTolerance ? ['station'] : [])
      ].join(' and ')
      message += ` Adaptive ${dimensions} sampling has not converged. UR alone cannot determine adequacy; review the sampling error and refinement limits.`
      if (surface.stationError.reason === 'state-stalled') {
        message += ' A steel-limit/pole interval has no distinct admissible depth midpoint; further depth subdivision cannot resolve it.'
      }
    } else {
      message += ' Utilization or its uncertainty estimate is missing or invalid; adequacy cannot be determined.'
    }
  }
  return {
    loadcaseId: loadcase.id,
    demand: loadcase,
    utilizationDefinition: checkBasis,
    ...(constantAxial ? {
      constantAxialStatus: constantAxial.status,
      constantAxialCapacityMoment: selected ? demandMoment * selected.lambda : null
    } : {}),
    capacityMultiplier:
      selected && Number.isFinite(selected.lambda) ? selected.lambda : null,
    demandMomentDirection: demandMoment > 1e-9 ? Math.atan2(loadcase.My, loadcase.Mx) : null,
    utilization,
    proportionalUtilization,
    fixedPUtilization: fixedP.utilization,
    fixedPDemandMoment: demandMoment,
    fixedPCapacityMoment: fixedP.point?.M ?? null,
    adequate: classification.status === 'indeterminate' ? null : classification.status === 'adequate',
    adequacy: classification.status,
    utilizationInterval: classification.interval,
    capacityPoint: selected?.point ?? null,
    resistance: selected?.resistance ?? null,
    contourPoint: fixedP.point,
    message
  }
}

/**
 * KDS Appendix 3.2 makes minimum eccentricity a factored-demand rule. It is deliberately applied
 * here, not as a horizontal capacity cap. The candidate demands come from `@pm/design` so the
 * stress-strain and equivalent-block mechanics apply one identical rule.
 */
export const checkLoadcaseUtilizationFromSurface = (
  surface: PreviewSurface,
  loadcase: LoadCombination,
  checkBasis: DemandCheckBasis = 'proportional3D'
): LoadcaseQuickCheckResult => {
  const boundary = surface.sectionBoundaryPoints ?? []
  const candidates = boundary.length === 0
    ? []
    : minimumEccentricityCandidates(surface.designBasis, loadcase, (nx, ny) =>
      projectedBoundaryDepth(boundary, nx, ny))
  if (candidates.length === 0) return checkRawLoadcaseUtilizationFromSurface(surface, loadcase, checkBasis)

  const checked = candidates.map((candidate) => {
    const adjusted = { ...loadcase, Mx: candidate.Mx, My: candidate.My }
    const result = checkRawLoadcaseUtilizationFromSurface(surface, adjusted, checkBasis)
    return {
      ...result,
      demand: loadcase,
      codeAdjustedDemand: adjusted,
      minimumEccentricityMm: candidate.eccentricityMm,
      message: `${result.message} ${minimumEccentricityMessage(candidate.eccentricityMm)}`
    }
  })
  return checked.reduce((governing, candidate) =>
    (candidate.utilization ?? Number.POSITIVE_INFINITY) > (governing.utilization ?? Number.POSITIVE_INFINITY)
      ? candidate
      : governing
  )
}

export const checkLoadcasesUtilizationFromSurface = (
  surface: PreviewSurface,
  loadcases: LoadCombination[],
  checkBasis: DemandCheckBasis = 'proportional3D'
): LoadcaseQuickCheckResult[] => loadcases.map((loadcase) => checkLoadcaseUtilizationFromSurface(surface, loadcase, checkBasis))

/**
 * Attach the governing design check to a converged inverse state.
 *
 * The inverse solve answers "what strain plane balances this demand"; it does not answer "is the
 * section adequate". Adequacy is the declared basis against the **design** surface, and the
 * inverse's own `utilization` is a fixed-P estimate on the contour it was handed. Composing them in
 * one place stops a second consumer — a report, a batch check — from publishing the diagnostic
 * where the governing number belongs.
 */
export const applyDesignCheckToInverse = (
  inverse: InversePreviewResult,
  check: LoadcaseQuickCheckResult
): InversePreviewResult => ({
  ...inverse,
  utilization: check.utilization,
  proportionalUtilization: check.proportionalUtilization,
  fixedPUtilization: check.fixedPUtilization,
  designCheck: {
    evaluated: true,
    definition: check.utilizationDefinition,
    adequacy: check.adequacy,
    utilizationInterval: check.utilizationInterval
  },
  designCapacityPoint: check.capacityPoint,
  resistance: inverse.resistance ?? check.resistance
})

/** @internal Constitutive bridge for the lazy capacity-field resolver; no governing query changes. */
export const createCapacityFieldEvaluator = (
  prepared: PreparedAnalysis, sourceMaterials: MaterialStore, basis: DesignBasis, tensionPoleStrain: number
) => {
  const sets = buildResistanceMaterialSets(sourceMaterials, basis)
  const prepareSet = (materials: MaterialStore) => JSON.stringify(materials) === JSON.stringify(prepared.materialStore)
    ? prepared : prepareAnalysisFromMesh(prepared.section, prepared.rebars, materials, prepared.mesh, prepared.origin)
  const referencePrepared = prepareSet(sets.referenceMaterials)
  const designPrepared = prepareSet(sets.designMaterials)
  const pureCompression = resolvePureCompressionStrain(prepared.materialStore, basis)
  return (beta: number, definition: StationDefinition, coordinate: number) => {
    const extents = projectedSteelExtents(prepared, beta)
    const control = stationSteelControl(prepared.materials, prepared.materialStore, prepared.rebars,
      prepared.materialStore.defaults.steelMaterialId, extents.controllingRebarIndex)
    const state = previewStationStateFromExtents(beta, definition, prepared.materialStore.concrete.limits.epsCu,
      pureCompression, control, basis, tensionPoleStrain, extents)
    const ledger = evaluatePreparedState(prepared, state)
    const raw: PreviewSurfacePoint = { id: 'capacity-field', beta, station: coordinate,
      stationId: null,
      surfaceRole: definition.kind === 'pure-compression' ? 'pure-compression'
        : definition.kind === 'pure-tension' ? 'pure-tension' : 'physical-state',
      state, ledger, ...ledger.total }
    const point = designPointFromState(raw, prepared, referencePrepared, designPrepared, basis).design

    return { point, projectedDepth: extents.max - extents.min,
      admissibility: evaluateAdmissibility(prepared, prepared.concreteBoundary,
      prepared.materialStore.concrete.limits.epsCu, state) }
  }
}

const solveRawInversePreviewFromPrepared = (
  prepared: PreparedAnalysis,
  loadcase: LoadCombination,
  contour: PreviewContourPoint[]
): InversePreviewResult => {
  const demand = { P: loadcase.P, Mx: loadcase.Mx, My: loadcase.My }
  const forceScale = prepared.forceScale
  const momentScale = forceScale * prepared.lengthScale
  const unknownScale = [
    prepared.strainScale,
    prepared.strainScale / prepared.lengthScale,
    prepared.strainScale / prepared.lengthScale
  ] as const
  let state: StrainState = { e0: 0.0002, kx: 0, ky: 0 }
  let evaluated = evaluateWithTangent(prepared.fibers, prepared.materials, state)
  let response = evaluated.ledger.total
  let residual = { P: response.P - demand.P, Mx: response.Mx - demand.Mx, My: response.My - demand.My }
  let norm = residualNorm(residual, forceScale, momentScale)
  let iterations = 0

  for (; iterations < NEWTON_MAX_ITERATIONS && norm > NEWTON_RESIDUAL_TOL; iterations++) {
    // docs/03 §5: solve the dimensionless system. Raw entries mix N, N·mm and N·mm²,
    // so a fixed pivot threshold on the unscaled matrix is physically meaningless.
    const resultScale = [forceScale, momentScale, momentScale] as const
    const matrix = [
      evaluated.tangent[0].map((value, column) => (value * unknownScale[column]) / resultScale[0]),
      evaluated.tangent[1].map((value, column) => (value * unknownScale[column]) / resultScale[1]),
      evaluated.tangent[2].map((value, column) => (value * unknownScale[column]) / resultScale[2])
    ]
    const scaledDelta = solve3(matrix, [
      -residual.P / forceScale,
      -residual.Mx / momentScale,
      -residual.My / momentScale
    ])
    if (!scaledDelta) break
    const delta = scaledDelta.map((value, index) => value * unknownScale[index]) as [
      number,
      number,
      number
    ]

    let accepted = false
    for (let backtrack = 0; backtrack <= 12; backtrack++) {
      const factor = 2 ** -backtrack
      const trial = {
        e0: state.e0 + delta[0] * factor,
        kx: state.kx + delta[1] * factor,
        ky: state.ky + delta[2] * factor
      }
      const trialEvaluated = evaluateWithTangent(prepared.fibers, prepared.materials, trial)
      const trialResponse = trialEvaluated.ledger.total
      const trialResidual = {
        P: trialResponse.P - demand.P,
        Mx: trialResponse.Mx - demand.Mx,
        My: trialResponse.My - demand.My
      }
      const trialNorm = residualNorm(trialResidual, forceScale, momentScale)
      if (Number.isFinite(trialNorm) && trialNorm < norm) {
        state = trial
        evaluated = trialEvaluated
        response = trialResponse
        residual = trialResidual
        norm = trialNorm
        accepted = true
        break
      }
    }
    if (!accepted) break
  }

  const utilization = estimateUtilization(loadcase, contour)
  const converged = norm <= NEWTON_RESIDUAL_TOL
  // docs/04 §6: acceptance requires the residual test *and* admissible material strains. A plane
  // that balances the demand outside the material domain is not a state the section can reach.
  const admissibility = evaluateAdmissibility(
    prepared,
    prepared.concreteBoundary,
    prepared.materialStore.concrete.limits.epsCu,
    state
  )
  const message = !converged
    ? 'Preview solver stopped before strict convergence.'
    : admissibility.ok
      ? 'Converged preview equilibrium inside the material domain.'
      : `Residual converged but the strain plane leaves the material domain — ${describeAdmissibility(admissibility)}. The demand is outside the section capacity.`

  return {
    ok: converged && admissibility.ok,
    converged,
    admissibility,
    loadcaseId: loadcase.id,
    demand: loadcase,
    state,
    response,
    residual,
    residualNorm: norm,
    iterations,
    utilization: utilization.utilization,
    designCheck: { evaluated: false },
    contourPoint: utilization.point,
    message
  }
}

/**
 * The minimum-eccentricity demand a design check resolved, or `null` when the clause did not bite.
 *
 * With no applied moment the clause offers one candidate per principal axis and the governing one
 * has to be chosen by utilization. That choice belongs to the design-surface check, whose
 * proportional ray is the governing number; the inverse's own fixed-P ratio is diagnostic only
 * (`docs/11` §13) and selecting with it made the two mechanics report different principal axes.
 */
export const codeAdjustedDemandOfCheck = (
  check: LoadcaseQuickCheckResult
): MinimumEccentricityCandidate | null =>
  check.codeAdjustedDemand !== undefined && check.minimumEccentricityMm !== undefined
    ? {
      Mx: check.codeAdjustedDemand.Mx,
      My: check.codeAdjustedDemand.My,
      eccentricityMm: check.minimumEccentricityMm
    }
    : null

/**
 * Solve section equilibrium for one demand.
 *
 * Pass `codeDemand` from `codeAdjustedDemandOfCheck` so the reported equilibrium state belongs to
 * the demand that was actually checked. Omitting it solves the raw demand.
 */
export const solveInversePreviewFromPrepared = (
  prepared: PreparedAnalysis,
  loadcase: LoadCombination,
  contour: PreviewContourPoint[],
  codeDemand?: MinimumEccentricityCandidate | null
): InversePreviewResult => {
  if (!codeDemand) return solveRawInversePreviewFromPrepared(prepared, loadcase, contour)
  const adjusted = { ...loadcase, Mx: codeDemand.Mx, My: codeDemand.My }
  const result = solveRawInversePreviewFromPrepared(prepared, adjusted, contour)
  return {
    ...result,
    demand: loadcase,
    codeAdjustedDemand: adjusted,
    minimumEccentricityMm: codeDemand.eccentricityMm,
    message: `${result.message} ${minimumEccentricityMessage(codeDemand.eccentricityMm)}`
  }
}

export const solveInversePreview = (
  section: SectionGeometry,
  rebars: GeometryInputRebarView[],
  materialStore: MaterialStore,
  loadcase: LoadCombination,
  contour: PreviewContourPoint[],
  meshOptions: ConcreteMeshOptions = {},
  codeDemand?: MinimumEccentricityCandidate | null
): InversePreviewResult =>
  solveInversePreviewFromPrepared(
    prepareAnalysis(section, rebars, materialStore, meshOptions),
    loadcase,
    contour,
    codeDemand
  )

/** Mesh samples colored by strain/stress for a known strain plane (loadcase inverse state). */
export const buildSectionFieldMapFromPrepared = (
  prepared: PreparedAnalysis,
  state: StrainState
): SectionFieldMap => {
  const { section, rebars, materialStore, origin, mesh, materials } = prepared

  const valueAt = (xWorld: number, yWorld: number) => {
    const local = { x: xWorld - origin.x, y: yWorld - origin.y }
    const strain = strainAt(state, local)
    return { strain, stress: materials.concrete.stress(strain) }
  }

  const triangles: SectionFieldTriangle[] = mesh.triangles.map((tri) => {
    const a = valueAt(tri.ax, tri.ay)
    const b = valueAt(tri.bx, tri.by)
    const c = valueAt(tri.cx, tri.cy)
    return {
      ax: tri.ax,
      ay: tri.ay,
      bx: tri.bx,
      by: tri.by,
      cx: tri.cx,
      cy: tri.cy,
      strainA: a.strain,
      strainB: b.strain,
      strainC: c.strain,
      stressA: a.stress,
      stressB: b.stress,
      stressC: c.stress
    }
  })

  const samples: SectionFieldSample[] = mesh.points.map((point) => {
    const { strain, stress } = valueAt(point.x, point.y)
    return {
      x: point.x,
      y: point.y,
      area: point.area,
      strain,
      stress,
      kind: 'concrete' as const
    }
  })

  const rebarSamples: SectionFieldRebar[] = rebars.map((bar) => {
    const local = { x: bar.x - origin.x, y: bar.y - origin.y }
    const strain = strainAt(state, local)
    const steelMaterialId = bar.steelMaterialId ?? materialStore.defaults.steelMaterialId
    const steel = materials.steel.get(steelMaterialId)
    if (!steel) {
      throw new AnalysisInputError(
        'MISSING_STEEL_MATERIAL',
        `Rebar ${bar.id} references steel material ${steelMaterialId}, which does not exist.`,
        { rebarId: bar.id, steelMaterialId }
      )
    }
    const stress = steel.stress(strain)
    const area = rebarArea(bar)
    return {
      id: bar.id,
      x: bar.x,
      y: bar.y,
      dia: bar.dia,
      area,
      strain,
      stress,
      force: stress * area
    }
  })

  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const solid of section.solids) {
    for (const point of solid.outer) {
      minX = Math.min(minX, point.x)
      maxX = Math.max(maxX, point.x)
      minY = Math.min(minY, point.y)
      maxY = Math.max(maxY, point.y)
    }
  }
  if (!Number.isFinite(minX)) {
    minX = 0
    maxX = 1
    minY = 0
    maxY = 1
  }

  return {
    origin,
    samples,
    triangles,
    rebars: rebarSamples,
    bounds: { minX, maxX, minY, maxY },
    mesh: mesh.report
  }
}

export const buildSectionFieldMap = (
  section: SectionGeometry,
  rebars: GeometryInputRebarView[],
  materialStore: MaterialStore,
  state: StrainState,
  meshOptions: ConcreteMeshOptions = {}
): SectionFieldMap =>
  buildSectionFieldMapFromPrepared(prepareAnalysis(section, rebars, materialStore, meshOptions), state)
