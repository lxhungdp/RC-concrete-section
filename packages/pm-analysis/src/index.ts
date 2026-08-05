import {
  buildConcreteMesh,
  netConcreteCentroid,
  type ConcreteMesh,
  type ConcreteMeshOptions,
  type ConcreteMeshReport,
  type GeometryInputRebarView,
  type SectionGeometry
} from '@pm/geometry'
import {
  compileMaterialStore,
  concreteModelSupportIssue,
  IMPLEMENTED_STRAIN_DOMAIN,
  strainDomainMismatch,
  type CompiledMaterial,
  type MaterialStore,
  type SteelMaterial,
  type StrainDomainId
} from '@pm/materials'
import {
  buildResistanceMaterialSets,
  cloneDesignBasis,
  createDefaultDesignBasis,
  designBasisRequiresOverrideReason,
  evaluateGlobalStrengthReduction,
  minimumEccentricityCandidates,
  minimumEccentricityMessage,
  resolveTensionControlledStrainLimit,
  type MinimumEccentricityCandidate,
  type DesignBasis,
  type GlobalStrengthReductionBasis,
  type ResistanceClassification
} from '@pm/design'
import {
  cloneAnalysisOptions,
  createDefaultAnalysisOptions,
  type AnalysisOptions,
  type CalculationAnalysisOptions,
  type AnalysisStationCriterion,
  type LoadCombination
} from '@pm/project'

/**
 * Typed fatal input errors (`docs/08` §5 fail-closed). The kernel must never substitute a plausible
 * value for a missing definition: a silent fallback produces a number that looks like a capacity but
 * is not one.
 */
export type AnalysisErrorCode =
  | 'MISSING_STEEL_MATERIAL'
  | 'UNSUPPORTED_CONCRETE_MODEL'
  | 'EMPTY_CONCRETE_SECTION'
  | 'MESH_RESOURCE_LIMIT'
  | 'INVALID_ANALYSIS_OPTIONS'
  | 'MESH_NOT_VERIFIED'
  | 'INVALID_MATERIAL'

export class AnalysisInputError extends Error {
  readonly code: AnalysisErrorCode
  readonly detail: Readonly<Record<string, unknown>>

  constructor(code: AnalysisErrorCode, message: string, detail: Readonly<Record<string, unknown>> = {}) {
    super(message)
    this.name = 'AnalysisInputError'
    this.code = code
    this.detail = detail
  }
}

export type Resultant = {
  P: number
  Mx: number
  My: number
}

/**
 * Strain plane `eps(x,y) = e0 + kx*y + ky*x`.
 *
 * `x, y` are measured from the analysis reference origin, i.e. the exact centroid of the net
 * concrete region (`docs/02` §1 step 9). `e0` is therefore the strain at that centroidal axis and
 * `Mx, My` are moments about it, which is what the reference workbook's `xc`/`yc` cells establish.
 */
export type StrainState = {
  e0: number
  kx: number
  ky: number
}

/** Analysis reference origin (net-concrete centroid) that all preview results are reported about. */
export type AnalysisOrigin = { x: number; y: number }

/**
 * Contribution ledger for one strain state.
 *
 * `docs/11` §3.3 requires the embedded-bar contribution `steel - displaced concrete` to keep the
 * full-steel and displaced-concrete terms separately, so a contribution-factor transform can be
 * applied (or rejected) per independently factorable group.
 */
export type ResultantLedger = {
  /** Concrete integrated over the concrete fibers only. */
  concrete: Resultant
  /** fs·As at every bar, before the displaced-concrete deduction. */
  steelGross: Resultant
  /** −fc·As at every bar (concrete replaced by the bar). */
  displacedConcrete: Resultant
  /** steelGross + displacedConcrete — the reference-workbook "Steel" column. */
  steel: Resultant
  /** concrete + steel. */
  total: Resultant
}

export type PreviewSurfacePointRole =
  | 'physical-state'
  | 'pure-tension'
  | 'pure-compression'
  | 'axial-cap'

export type PreviewSurfacePoint = Resultant & {
  id: string
  beta: number
  /** Zero-based display order within one physical direction row; −1 for a synthetic face point. */
  station: number
  /** Stable physical station identity; null for a synthetic face that is not a strain station. */
  stationId: SurfaceStationId | null
  /** Structural/topological meaning; never infer this from numeric station order. */
  surfaceRole: PreviewSurfacePointRole
  state: StrainState
  ledger: ResultantLedger
  resistance?: DesignResistanceTrace
  /** Present only for a physical block state; an axial-cap face has no unique strain state. */
  equivalentBlock?: EquivalentBlockStateTrace
}

export type EquivalentBlockStateTrace = {
  neutralAxisAngle: number
  neutralAxisDepth: number
  blockDepth: number
  beta1: number
  projectedSectionDepth: number
  compressionStress: number
  concreteBlockArea?: number
  concreteForce?: number
  controllingTensileStrain?: number
  controllingBarId?: string
  /** Component reconstruction roundoff; not an inverse-equilibrium residual. */
  componentForceResidual?: number
  componentMomentXResidual?: number
  componentMomentYResidual?: number
}

export type SurfaceIndexTriangle = { a: number; b: number; c: number }

export type DesignResistanceTrace = {
  nominalReference: Resultant
  format: DesignBasis['format']
  factor: number | null
  classification: ResistanceClassification | 'design-material'
  controllingTensileStrain: number | null
  yieldStrain: number | null
  axialCapApplied: boolean
  stages: string[]
}

export type SurfaceStationId = 'pure-compression' | `station-${number}` | 'pure-tension'

export type SurfaceStation = {
  id: SurfaceStationId
  label: string
  definition: StationDefinition
}

/**
 * How much the surface still depends on how coarsely the strain-plane directions were sampled
 * (`docs/06` §5). Measured, not assumed: the engine evaluates the true state halfway between two
 * sampled directions and compares it with the chord the surface actually uses there.
 *
 * This is a sampled estimate over `probedStations`, not a bound over the whole surface
 * (`docs/06` §11 — no universal error claim from one benchmark).
 */
export type SurfaceDirectionError = {
  /** Strain-plane directions in the finished surface. */
  directions: number
  /** Station indices used as probes. */
  probedStations: number[]
  probedStationIds: SurfaceStationId[]
  /** Worst chord error in `P`, relative to the surface `P` span. */
  maxRelativeP: number
  /** Worst chord error in the moment vector, relative to the surface moment span. */
  maxRelativeMoment: number
  /** Direction (rad) of the worst moment error. */
  worstBeta: number
  /** Bisection passes actually performed; 0 when refinement is off. */
  refinementPasses: number
  /** True when the estimate is at or below the requested tolerance. */
  withinTolerance: boolean
  tolerance: number
}

export type PreviewSurface = {
  calculationProfileId?: import('@pm/project').CalculationProfileId
  mechanics?: 'stress-strain-integration' | 'equivalent-rectangular-block'
  /** Governing design-resistance vertices used by all ULS checks and default plots. */
  points: PreviewSurfacePoint[]
  /** Reference/nominal vertices at the exact same stored strain states. */
  nominalPoints: PreviewSurfacePoint[]
  /** Explicit connectivity is authoritative for independently triangulated/capped surfaces. */
  triangles?: SurfaceIndexTriangle[]
  nominalTriangles?: SurfaceIndexTriangle[]
  /** Discrete code values for reporting only; never triangulated as equilibrium states. */
  codeReferencePoints?: Array<Resultant & {
    id: string
    label: string
    kind: 'code-endpoint'
  }>
  /** Outer-boundary vertices used by code demand rules such as KDS Appendix e_min. */
  sectionBoundaryPoints?: Array<{ x: number; y: number }>
  bounds: {
    P: [number, number]
    Mx: [number, number]
    My: [number, number]
  }
  comparison: {
    workbook: string
    notes: string[]
  }
  mesh: ConcreteMeshReport
  /** Canonical schedule and direction grid actually used by this result. */
  stations: SurfaceStation[]
  directions: number[]
  analysisOptions: CalculationAnalysisOptions
  directionError: SurfaceDirectionError
  /** Which ultimate strain domain produced these states — never inferred from the material label. */
  strainDomain: StrainDomainId
  warnings: string[]
  designBasis: DesignBasis
}

export type PreviewContourPoint = {
  beta: number
  P: number
  Mx: number
  My: number
  station?: number
  /**
   * True when the point lies on one of the sampled strain-plane directions — either a surface
   * vertex, or a crossing of the station edge inside a single `beta` row. These are the diagnostic
   * "one point per sampled beta" markers; they are a labelled subset of this contour, never a
   * separately computed curve.
   */
  onSampledDirection?: boolean
}

/** The sampled-direction subset of a fixed-P contour, in ascending `beta`. */
export const contourStrainAngleSamples = (contour: PreviewContourPoint[]): PreviewContourPoint[] =>
  contour.filter((point) => point.onSampledDirection).sort((a, b) => a.beta - b.beta)

export type PreviewMomentPlanePoint = PreviewContourPoint & {
  /** Moment coordinate on the checked load direction. */
  M: number
}

/**
 * One connected component of a vertical moment-plane/surface intersection.
 *
 * A closed path repeats its first point as its last point. `closed` is derived from the triangle
 * adjacency graph; callers must never close an open path merely for presentation.
 */
export type PreviewMomentPlanePath = {
  points: PreviewMomentPlanePoint[]
  closed: boolean
}

export type AdmissibilityViolation =
  | { code: 'CONCRETE_STRAIN_EXCEEDS_ULTIMATE'; value: number; limit: number }
  | { code: 'STEEL_STRAIN_EXCEEDS_ULTIMATE'; rebarId: number; value: number; limit: number }

/**
 * Whether a strain plane lies inside the material domain — `docs/04` §6 requires "all material
 * strains admissible" for acceptance, and defines `MATERIAL_DOMAIN_EXCEEDED` as a failure. A plane
 * that balances the demand outside this domain is not an equilibrium state the section can reach.
 */
export type StrainAdmissibility = {
  /** False for a code-envelope face that has no unique material strain state. */
  evaluated: boolean
  ok: boolean
  /** Peak compressive strain anywhere in the concrete region (compression positive). */
  maxConcreteCompression: number
  concreteLimit: number
  /** Largest tensile strain magnitude at any bar; 0 when every bar is in compression. */
  maxSteelTension: number
  /** Rupture limit taken from the steel definitions, or null when none declares `limits.epsU`. */
  steelTensionLimit: number | null
  violations: AdmissibilityViolation[]
}

export type InversePreviewResult = {
  /** Converged **and** admissible. Only this may be presented as an equilibrium state. */
  ok: boolean
  /** Residual test alone; true even when the plane leaves the material domain. */
  converged: boolean
  admissibility: StrainAdmissibility
  loadcaseId: number
  demand: LoadCombination
  /** Demand after a code-prescribed minimum-eccentricity rule, when applicable. */
  codeAdjustedDemand?: LoadCombination
  minimumEccentricityMm?: number
  state: StrainState
  response: Resultant
  residual: Resultant
  residualNorm: number
  iterations: number
  utilization: number | null
  proportionalUtilization?: number | null
  fixedPUtilization?: number | null
  designCapacityPoint?: Resultant | null
  resistance?: DesignResistanceTrace | null
  equivalentBlock?: EquivalentBlockStateTrace | null
  contourPoint: PreviewContourPoint | null
  message: string
}

export type LoadcaseQuickCheckResult = {
  loadcaseId: number
  demand: LoadCombination
  /** Demand after a code-prescribed minimum-eccentricity rule, when applicable. */
  codeAdjustedDemand?: LoadCombination
  minimumEccentricityMm?: number
  utilization: number | null
  proportionalUtilization: number | null
  fixedPUtilization: number | null
  adequate: boolean | null
  capacityPoint: Resultant | null
  resistance: DesignResistanceTrace | null
  contourPoint: PreviewMomentPlanePoint | null
  message: string
}

/**
 * A fiber carries its already-resolved constitutive law. Resolution happens once, up front, so the
 * integration loop cannot encounter a missing material and cannot silently substitute one.
 */
type Fiber =
  | { x: number; y: number; area: number; kind: 'concrete' }
  | { x: number; y: number; area: number; kind: 'rebar'; rebarId: number; steel: CompiledMaterial }

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
  readonly concreteFibers: Fiber[]
  readonly rebarFibers: Fiber[]
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

const PREVIEW_GEOMETRY_TOL = 1e-9
const NEWTON_RESIDUAL_TOL = 1e-8
const NEWTON_MAX_ITERATIONS = 30
/**
 * Relative slack on strain limits. The capacity stations sit exactly on `epsCu`, so an exact
 * comparison would reject them on rounding alone.
 */
const STRAIN_LIMIT_TOL = 1e-9
export type StationDefinition =
  | { kind: 'pure-compression' }
  | { kind: 'neutral-axis-ratio'; cOverC1: number }
  | { kind: 'steel-strain'; strain: number }
  | { kind: 'steel-stress-ratio'; ratio: number }
  | { kind: 'strength-reduction-transition-ratio'; ratio: number }
  | { kind: 'strength-reduction-post-transition'; extraStrain: number }
  | { kind: 'extreme-tension-strain'; strain: number }
  | { kind: 'bar-tension-strain'; strain: number }
  | { kind: 'block-depth-ratio'; ratio: number }
  | { kind: 'pure-tension' }

/**
 * `P0…P18` reporting stations, taken from the `PM-advanced (7) 2D.xlsx` Summary sheet station
 * schedule (see `docs/05` §2 "Compatibility with P0–P18 reports"). Tension strains are negative
 * under the compression-positive convention.
 */
export const PREVIEW_STATIONS: StationDefinition[] = [
  { kind: 'pure-compression' },
  { kind: 'neutral-axis-ratio', cOverC1: 3 },
  { kind: 'neutral-axis-ratio', cOverC1: 2 },
  { kind: 'neutral-axis-ratio', cOverC1: 1.5 },
  { kind: 'neutral-axis-ratio', cOverC1: 1.2 },
  { kind: 'steel-stress-ratio', ratio: 0 },
  { kind: 'steel-stress-ratio', ratio: 0.25 },
  { kind: 'steel-stress-ratio', ratio: 0.5 },
  { kind: 'steel-stress-ratio', ratio: 0.75 },
  { kind: 'steel-stress-ratio', ratio: 1 },
  { kind: 'steel-strain', strain: -0.003 },
  { kind: 'steel-strain', strain: -0.005 },
  { kind: 'steel-strain', strain: -0.0075 },
  { kind: 'steel-strain', strain: -0.01 },
  { kind: 'steel-strain', strain: -0.015 },
  { kind: 'steel-strain', strain: -0.025 },
  { kind: 'steel-strain', strain: -0.03 },
  { kind: 'steel-strain', strain: -0.05 },
  { kind: 'pure-tension' }
]

export const stationDefinitionLabel = (station: StationDefinition): string => {
  if (station.kind === 'pure-compression') return 'Pure compression'
  if (station.kind === 'pure-tension') return 'Pure tension'
  if (station.kind === 'block-depth-ratio') return `c/D = ${station.ratio}`
  if (station.kind === 'extreme-tension-strain') return `εt = ${station.strain}`
  if (station.kind === 'bar-tension-strain') return `controlling bar εt = ${station.strain}`
  if (station.kind === 'neutral-axis-ratio') return `c = ${station.cOverC1.toFixed(1)}·c₁`
  if (station.kind === 'steel-stress-ratio') {
    if (station.ratio === 0) return 'fs = 0'
    if (Math.abs(station.ratio - 1) < 1e-9) return 'fs = fyd'
    return `fs = ${station.ratio}·fyd`
  }
  if (station.kind === 'steel-strain') {
    if (Math.abs(station.strain) < 1e-12) return 'fs = 0'
    return `εs = ${station.strain}`
  }
  if (station.kind === 'strength-reduction-transition-ratio') {
    return `phi transition ${(station.ratio * 100).toFixed(1)}%`
  }
  if (station.kind === 'strength-reduction-post-transition') {
    return `post-transition +${station.extraStrain}`
  }
  return 'Station'
}

const criterionDefinition = (criterion: AnalysisStationCriterion): StationDefinition => {
  if (criterion.type === 'c-over-c1') return { kind: 'neutral-axis-ratio', cOverC1: criterion.ratio }
  if (criterion.type === 'steel-stress-ratio') return { kind: 'steel-stress-ratio', ratio: criterion.ratio }
  if (criterion.type === 'steel-strain') return { kind: 'steel-strain', strain: criterion.strain }
  if (criterion.type === 'strength-reduction-transition-ratio') {
    return { kind: 'strength-reduction-transition-ratio', ratio: criterion.ratio }
  }
  return { kind: 'strength-reduction-post-transition', extraStrain: criterion.extraStrain }
}

/** Resolved schedule including the two mandatory poles. */
export const analysisStations = (options: AnalysisOptions): SurfaceStation[] => [
  { id: 'pure-compression', label: 'Pure compression', definition: { kind: 'pure-compression' } },
  ...options.stations.intermediate.map((item) => ({
    id: `station-${item.id}` as const,
    label: item.label,
    definition: criterionDefinition(item.criterion)
  })),
  { id: 'pure-tension', label: 'Pure tension', definition: { kind: 'pure-tension' } }
]

/** Canonical radians in strictly ascending order. */
export const analysisDirections = (options: AnalysisOptions): number[] => {
  const seed = options.directions.seed
  if (seed.type === 'uniform') {
    const start = (seed.startDeg * Math.PI) / 180
    // This evaluation order intentionally preserves the legacy default exactly:
    // index * π / 12 for 24 directions. Equivalent degree arithmetic changes a few last bits.
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
const concreteFibersFromMesh = (mesh: ConcreteMesh, origin: AnalysisOrigin): Fiber[] =>
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
): Fiber[] =>
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
      area: (Math.PI * bar.dia * bar.dia) / 4,
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

export const prepareAnalysisFromMesh = (
  section: SectionGeometry,
  rebars: GeometryInputRebarView[],
  materialStore: MaterialStore,
  mesh: ConcreteMesh,
  origin: AnalysisOrigin = originFromMesh(mesh)
): PreparedAnalysis => {
  assertUsableMesh(mesh)
  const materials = resolveAnalysisMaterials(materialStore, rebars)
  const concreteFibers = concreteFibersFromMesh(mesh, origin)
  const rebarFibers = buildRebarFibers(rebars, origin, materials, materialStore.defaults.steelMaterialId)
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
    return sum + fyd * (Math.PI * bar.dia * bar.dia) / 4
  }, 0)

  return {
    section,
    rebars,
    materialStore,
    origin,
    mesh,
    concreteFibers,
    rebarFibers,
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
): PreparedAnalysis =>
  prepareAnalysisFromMesh(section, rebars, materialStore, buildConcreteMesh(section, meshOptions), origin)

const strainAt = (state: StrainState, fiber: Pick<Fiber, 'x' | 'y'>) =>
  state.e0 + state.kx * fiber.y + state.ky * fiber.x

const zeroResultant = (): Resultant => ({ P: 0, Mx: 0, My: 0 })

const accumulate = (target: Resultant, force: number, fiber: Pick<Fiber, 'x' | 'y'>) => {
  target.P += force
  target.Mx += force * fiber.y
  target.My += force * fiber.x
}

const addResultant = (a: Resultant, b: Resultant): Resultant => ({
  P: a.P + b.P,
  Mx: a.Mx + b.Mx,
  My: a.My + b.My
})

const evaluate = (fibers: Fiber[], materials: AnalysisMaterials, state: StrainState): ResultantLedger => {
  const concrete = zeroResultant()
  const steelGross = zeroResultant()
  const displacedConcrete = zeroResultant()

  for (const fiber of fibers) {
    const strain = strainAt(state, fiber)
    const concreteStress = materials.concrete.stress(strain)

    if (fiber.kind !== 'rebar') {
      accumulate(concrete, concreteStress * fiber.area, fiber)
      continue
    }

    accumulate(steelGross, fiber.steel.stress(strain) * fiber.area, fiber)
    accumulate(displacedConcrete, -concreteStress * fiber.area, fiber)
  }

  const steel = addResultant(steelGross, displacedConcrete)
  return { concrete, steelGross, displacedConcrete, steel, total: addResultant(concrete, steel) }
}

export type ResultantTangent = [
  [number, number, number],
  [number, number, number],
  [number, number, number]
]

const evaluateWithTangent = (
  fibers: Fiber[],
  materials: AnalysisMaterials,
  state: StrainState
): { ledger: ResultantLedger; tangent: ResultantTangent } => {
  const concrete = zeroResultant()
  const steelGross = zeroResultant()
  const displacedConcrete = zeroResultant()
  let j00 = 0
  let j01 = 0
  let j02 = 0
  let j11 = 0
  let j12 = 0
  let j22 = 0

  for (const fiber of fibers) {
    const strain = strainAt(state, fiber)
    const concreteStress = materials.concrete.stress(strain)
    let tangent = materials.concrete.tangent(strain)

    if (fiber.kind !== 'rebar') {
      accumulate(concrete, concreteStress * fiber.area, fiber)
    } else {
      accumulate(steelGross, fiber.steel.stress(strain) * fiber.area, fiber)
      accumulate(displacedConcrete, -concreteStress * fiber.area, fiber)
      // Embedded-bar contribution is fs*As - fc*As, so its consistent tangent is Es_t - Ec_t.
      tangent = fiber.steel.tangent(strain) - tangent
    }

    const ta = tangent * fiber.area
    j00 += ta
    j01 += ta * fiber.y
    j02 += ta * fiber.x
    j11 += ta * fiber.y * fiber.y
    j12 += ta * fiber.x * fiber.y
    j22 += ta * fiber.x * fiber.x
  }

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
  evaluate(prepared.fibers, prepared.materials, state)

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
  fibers: Fiber[],
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

  for (const fiber of fibers) {
    if (fiber.kind !== 'rebar') continue
    const strain = strainAt(state, fiber)
    if (strain < 0) maxSteelTension = Math.max(maxSteelTension, -strain)
    const tensionLimit = fiber.steel.limits.epsTensionUltimate
    if (tensionLimit !== undefined) {
      steelTensionLimit = steelTensionLimit === null ? tensionLimit : Math.min(steelTensionLimit, tensionLimit)
    }
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

  return { min, max, tensionControl, controllingRebarIndex }
}

type ProjectedExtents = ReturnType<typeof projectedExtents>

/**
 * Fallback pure-tension strain when no steel definition declares a rupture limit.
 *
 * `docs/05` §2 forbids seeding a schedule from bare constants that can contradict `fy/Es`. The
 * schedule still needs a finite tension pole, so this is expressed as a multiple of the controlling
 * bar's own yield strain: far enough onto the plateau that an elastic-perfectly-plastic law is fully
 * yielded, and reported as an assumption rather than presented as a code value.
 */
const PURE_TENSION_YIELD_MULTIPLE = 25

/**
 * Strain limits of the bar that controls one direction, taken from its compiled law.
 *
 * `epsYield` already carries the material partial factor: an EC2 bar with `gammaS = 1.15` yields at
 * `fy / 1.15 / Es`, so a station labelled `fs = fyd` must sit there and not at `fy / Es`.
 */
export type StationSteelLimits = {
  epsY: number
  /** Declared rupture strain of the controlling bar, or null when the definition omits it. */
  epsU: number | null
}

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
  if (station.kind === 'strength-reduction-transition-ratio') {
    const upper = transitionLimitForStation(basis, control)
    return -(control.epsY + station.ratio * (upper - control.epsY))
  }
  if (station.kind === 'strength-reduction-post-transition') {
    return -(transitionLimitForStation(basis, control) + station.extraStrain)
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
  if (station.kind === 'pure-compression') return { e0: pureCompressionStrain, kx: 0, ky: 0 }
  if (station.kind === 'pure-tension') return { e0: globalPureTensionStrain, kx: 0, ky: 0 }

  const compressionProjection = extents.max
  const c1 = Math.max(1e-9, compressionProjection - extents.tensionControl)
  const controlProjection =
    station.kind === 'neutral-axis-ratio'
      ? compressionProjection - station.cOverC1 * c1
      : extents.tensionControl
  // A schedule strain past the controlling bar's declared rupture strain is not a reachable state.
  const requestedStrain =
    station.kind === 'neutral-axis-ratio' ? 0 : farTensionSteelStrain(station, control, designBasis)
  const controlStrain = control.epsU === null ? requestedStrain : Math.max(requestedStrain, -control.epsU)
  let compressionBoundaryStrain = epsCu
  if (
    station.kind === 'neutral-axis-ratio' &&
    designBasis.format === 'designMaterialReevaluation' &&
    designBasis.compressionEndpoint === 'peak-stress-strain'
  ) {
    const neutralAxisDepth = compressionProjection - controlProjection
    const sectionDepth = extents.max - extents.min
    if (neutralAxisDepth > sectionDepth) {
      // KDS Appendix 3.1 distinguishes pure compression (eps_c0), flexure with the neutral
      // axis inside the section (eps_cu), and the all-compression domain between them. The
      // latter rotates about the standard compression pivot, producing a continuous strain
      // boundary from uniform eps_c0 to eps_cu when the neutral axis reaches the far edge.
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
  return {
    e0: compressionBoundaryStrain - curvature * compressionProjection,
    kx: curvature * c,
    ky: curvature * s
  }
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
  const definition = PREVIEW_STATIONS[stationIndex] ?? PREVIEW_STATIONS[0]
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

type SurfaceTriangle = {
  vertices: [PreviewSurfacePoint, PreviewSurfacePoint, PreviewSurfacePoint]
  /** Per edge `(0,1) (1,2) (2,0)`: true when both ends belong to the same sampled `beta` row. */
  sameDirectionEdge: [boolean, boolean, boolean]
}

const surfaceTrianglesCache = new WeakMap<PreviewSurfacePoint[], SurfaceTriangle[]>()

const previewSurfaceTriangles = (
  points: PreviewSurfacePoint[],
  topology?: readonly SurfaceIndexTriangle[]
): SurfaceTriangle[] => {
  if (topology) {
    const samePhysicalDirection = (left: PreviewSurfacePoint, right: PreviewSurfacePoint) =>
      left.surfaceRole !== 'axial-cap' &&
      right.surfaceRole !== 'axial-cap' &&
      left.beta === right.beta
    return topology.flatMap(({ a, b, c }) => {
      const vertices = [points[a], points[b], points[c]] as const
      if (vertices.some((point) => point === undefined)) return []
      return [{
        vertices: [vertices[0], vertices[1], vertices[2]],
        sameDirectionEdge: [
          samePhysicalDirection(vertices[0], vertices[1]),
          samePhysicalDirection(vertices[1], vertices[2]),
          samePhysicalDirection(vertices[2], vertices[0])
        ]
      }]
    })
  }
  const cached = surfaceTrianglesCache.get(points)
  if (cached) return cached
  const rows = groupSurfaceRows(points)
  const triangles: SurfaceTriangle[] = []
  if (rows.length < 2) {
    surfaceTrianglesCache.set(points, triangles)
    return triangles
  }

  for (let i = 0; i < rows.length; i++) {
    const current = rows[i].curve
    const next = rows[(i + 1) % rows.length].curve
    const stationCount = Math.min(current.length, next.length)
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

    // A vertex of the surface always sits on a sampled direction, whichever edge reaches it.
    if (aOn) appendUniquePoint(intersections, { ...a, onSampledDirection: true }, tol, tol)
    if (bOn) appendUniquePoint(intersections, { ...b, onSampledDirection: true }, tol, tol)
    if (aOn || bOn || da * db > 0) continue

    const t = da / (da - db)
    appendUniquePoint(intersections, { ...lerpPoint(a, b, t), onSampledDirection: sameDirection }, tol, tol)
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
 * KDS 14 20 20:2022 Appendix 3.1(2) reaches the ultimate state at `eps_c0`, not at `eps_cu`. A
 * missing `eps_c0` is a fatal input, never a silent fall back to `eps_cu`: for reinforcement whose
 * design yield strain exceeds `eps_c0` the two limits select different branches of Appendix
 * equations (3-2) and (3-3) and overstate the steel term of the design axial strength.
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
export const buildPreviewSurfaceFromPrepared = (
  prepared: PreparedAnalysis,
  analysisOptions: AnalysisOptions = createDefaultAnalysisOptions(),
  designBasis: DesignBasis = createDefaultDesignBasis(prepared.materialStore)
): PreviewSurface => {
  const { section, rebars, materialStore, origin, fibers, materials } = prepared
  const meshReport = prepared.mesh.report
  const epsCu = materialStore.concrete.limits.epsCu
  const pureCompressionStrain = resolvePureCompressionStrain(materialStore, designBasis)
  const stations = analysisStations(analysisOptions)
  const seedBetas = analysisDirections(analysisOptions)
  const warnings: string[] = []

  // An unusable mesh is rejected in prepareAnalysisFromMesh, so anything left here is advisory.
  if (section.solids.length !== 1) warnings.push('Preview engine supports one concrete region best; multi-region output is approximate.')
  for (const issue of meshReport.warnings) warnings.push(`Concrete mesh: ${issue}`)
  if (rebars.length === 0) warnings.push('No rebars are present; steel contribution is zero.')
  const domainMismatch = strainDomainMismatch(materialStore.concrete)
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
      ? Math.min(...effectiveTensionLimits)
      : Math.max(
          ...effectiveTensionLimits,
          deepestConfiguredTensionStrain,
          PURE_TENSION_YIELD_MULTIPLE * DEFAULT_STATION_STEEL_LIMITS.epsY
        )
  )
  const ALL_STATIONS = stations.map((_, station) => station)
  let duplicateStationWarning = false

  /**
   * Stations of one direction. `stations` narrows the work for the midpoint probe, which only needs
   * a handful of stations and would otherwise double the cost of every surface build.
   */
  const buildRow = (beta: number, stationOrders: number[] = ALL_STATIONS): PreviewSurfacePoint[] => {
    const extents = projectedExtents(section, beta, origin, rebars)
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
      const descriptor = stations[station]
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

    if (stationOrders.length === ALL_STATIONS.length && rebars.length > 0) {
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
    return resolved.map(({ station, descriptor, state }) => {
      const ledger = evaluate(fibers, materials, state)
      return {
        id: `${degrees}-${station}`,
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
    })
  }

  const rows = new Map<number, PreviewSurfacePoint[]>()
  for (const beta of seedBetas) rows.set(beta, buildRow(beta))

  const sortedBetas = () => [...rows.keys()].sort((a, b) => a - b)
  const allPoints = () => sortedBetas().flatMap((beta) => rows.get(beta)!)

  const spans = () => {
    let pSpan = 1
    let mSpan = 1
    for (const point of allPoints()) {
      pSpan = Math.max(pSpan, Math.abs(point.P))
      mSpan = Math.max(mSpan, Math.hypot(point.Mx, point.My))
    }
    return { pSpan, mSpan }
  }

  const refinement = analysisOptions.directions.refinement
  const probeStations =
    refinement.probe === 'all'
      ? ALL_STATIONS.slice(1, -1)
      : refinement.probe.stationIds.flatMap((id) => {
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
    pSpan: number,
    mSpan: number
  ) => {
    const rowA = rows.get(betaA)!
    // The closing interval uses an unwrapped betaB for its midpoint but an exact existing map key.
    // `% 2π` is not bit-stable when the first configured angle is nonzero.
    const rowB = rows.get(betaBKey)!
    const midBeta = (betaA + betaB) / 2
    const probe = buildRow(midBeta, probeStations)
    let relativeP = 0
    let relativeMoment = 0
    probe.forEach((midPoint, probeIndex) => {
      const station = probeStations[probeIndex]
      const chordP = (rowA[station].P + rowB[station].P) / 2
      const chordMx = (rowA[station].Mx + rowB[station].Mx) / 2
      const chordMy = (rowA[station].My + rowB[station].My) / 2
      relativeP = Math.max(relativeP, Math.abs(midPoint.P - chordP) / pSpan)
      relativeMoment = Math.max(
        relativeMoment,
        Math.hypot(midPoint.Mx - chordMx, midPoint.My - chordMy) / mSpan
      )
    })
    return { midBeta, relativeP, relativeMoment }
  }

  const tolerance = refinement.type === 'adaptive' ? refinement.tolerance : Number.POSITIVE_INFINITY
  const maxPasses = refinement.type === 'adaptive' ? refinement.maxPasses : 0
  const maxDirections = refinement.type === 'adaptive' ? refinement.maxDirections : rows.size

  // NaN, not 0: an estimate that was never taken must not read as "no error found".
  let maxRelativeP = Number.NaN
  let maxRelativeMoment = Number.NaN
  let worstBeta = Number.NaN
  let passes = 0

  // Pass 0 measures the fixed grid. Further passes bisect only the intervals that failed, so the
  // reported error always describes the grid that was actually returned (`docs/05` §5).
  for (let pass = 0; probeStations.length > 0; pass++) {
    const betas = sortedBetas()
    const { pSpan, mSpan } = spans()
    const insertions: number[] = []
    maxRelativeP = 0
    maxRelativeMoment = 0
    worstBeta = betas[0] ?? 0

    for (let index = 0; index < betas.length; index++) {
      const betaA = betas[index]
      // The closing interval wraps to the first direction at 2π.
      const betaB = index === betas.length - 1 ? betas[0] + 2 * Math.PI : betas[index + 1]
      const betaBKey = index === betas.length - 1 ? betas[0] : betaB
      const { midBeta, relativeP, relativeMoment } = intervalError(betaA, betaB, betaBKey, pSpan, mSpan)
      if (relativeP > maxRelativeP) maxRelativeP = relativeP
      if (relativeMoment > maxRelativeMoment) {
        maxRelativeMoment = relativeMoment
        worstBeta = midBeta % (2 * Math.PI)
      }
      if (pass < maxPasses && Math.max(relativeP, relativeMoment) > tolerance) insertions.push(midBeta)
    }

    if (insertions.length === 0 || pass >= maxPasses || rows.size + insertions.length > maxDirections) break
    for (const midBeta of insertions) {
      const beta = midBeta % (2 * Math.PI)
      rows.set(beta, buildRow(beta))
    }
    passes = pass + 1
  }

  const points = allPoints()
  const P = points.map((point) => point.P)
  const Mx = points.map((point) => point.Mx)
  const My = points.map((point) => point.My)
  const withinTolerance = Math.max(maxRelativeP, maxRelativeMoment) <= tolerance

  if (refinement.type === 'adaptive' && !withinTolerance) {
    warnings.push(
      `Direction sampling did not reach the requested tolerance ${tolerance.toExponential(2)}; ` +
        `the estimate is ${Math.max(maxRelativeP, maxRelativeMoment).toExponential(2)} over ${rows.size} directions.`
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
      P: [Math.min(...P), Math.max(...P)],
      Mx: [Math.min(...Mx), Math.max(...Mx)],
      My: [Math.min(...My), Math.max(...My)]
    },
    mesh: meshReport,
    sectionBoundaryPoints: sectionBoundaryPoints(section),
    stations,
    directions: sortedBetas(),
    analysisOptions: cloneAnalysisOptions(analysisOptions),
    strainDomain: IMPLEMENTED_STRAIN_DOMAIN,
    directionError: {
      directions: rows.size,
      probedStations: probeStations,
      probedStationIds: probeStations.map((station) => stations[station].id),
      maxRelativeP,
      maxRelativeMoment,
      worstBeta,
      refinementPasses: passes,
      withinTolerance,
      tolerance
    },
    comparison: {
      workbook: 'docs/examples/reference-case/source/PM-advanced (7) 2D.xlsx',
      notes: [
        'Reference workbook uses fck=30 MPa, ecu=0.0033, KDS parabolic concrete, Es=200000 MPa, fy=400 MPa.',
        'Reference Summary P0 at 0 degrees: nominal P=33981.43 kN, factored P=23443.29 kN.',
        'Reference Summary P18 pure tension: nominal P=-5790.58 kN, factored P=-5211.53 kN.'
      ]
    },
    warnings,
    designBasis: createDefaultDesignBasis(materialStore)
  }
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

const surfaceBounds = (points: PreviewSurfacePoint[]) => ({
  P: [Math.min(...points.map((point) => point.P)), Math.max(...points.map((point) => point.P))] as [number, number],
  Mx: [Math.min(...points.map((point) => point.Mx)), Math.max(...points.map((point) => point.Mx))] as [number, number],
  My: [Math.min(...points.map((point) => point.My)), Math.max(...points.map((point) => point.My))] as [number, number]
})

const controllingSteelEvidence = (
  prepared: PreparedAnalysis,
  state: StrainState
): { tensileStrain: number; yieldStrain: number; yieldStress: number } => {
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
    tensileStrain = tension
    yieldStrain = steel.fy / steel.elasticModulus
    yieldStress = steel.fy
  }
  if (!Number.isFinite(yieldStrain)) {
    const steel = prepared.materialStore.steel[0]
    yieldStrain = steel ? steel.fy / steel.elasticModulus : 0.002
    yieldStress = steel?.fy ?? 400
  }
  return { tensileStrain, yieldStrain, yieldStress }
}

const designPointFromState = (
  point: PreviewSurfacePoint,
  referencePrepared: PreparedAnalysis,
  designPrepared: PreparedAnalysis,
  basis: DesignBasis
): { nominal: PreviewSurfacePoint; design: PreviewSurfacePoint } => {
  const nominalLedger = evaluatePreparedState(referencePrepared, point.state)
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

  const designLedger = evaluatePreparedState(designPrepared, point.state)
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
  P: lerpNumber(a.P, b.P, t),
  Mx: lerpNumber(a.Mx, b.Mx, t),
  My: lerpNumber(a.My, b.My, t)
})
const lerpLedgerValue = (a: ResultantLedger, b: ResultantLedger, t: number): ResultantLedger => ({
  concrete: lerpResultantValue(a.concrete, b.concrete, t),
  steelGross: lerpResultantValue(a.steelGross, b.steelGross, t),
  displacedConcrete: lerpResultantValue(a.displacedConcrete, b.displacedConcrete, t),
  steel: lerpResultantValue(a.steel, b.steel, t),
  total: lerpResultantValue(a.total, b.total, t)
})
const projectLedgerToAxialCap = (ledger: ResultantLedger, radialRatio: number): ResultantLedger => {
  const project = (value: Resultant): Resultant => ({
    P: value.P,
    Mx: value.Mx * radialRatio,
    My: value.My * radialRatio
  })
  return {
    concrete: project(ledger.concrete),
    steelGross: project(ledger.steelGross),
    displacedConcrete: project(ledger.displacedConcrete),
    steel: project(ledger.steel),
    total: project(ledger.total)
  }
}

/**
 * Apply a maximum-compression plane without changing the structured beta/station topology.
 * Every point above the plane collapses onto the exact linearly-interpolated row crossing. This
 * preserves a closed cap face and prevents a nominal high-compression vertex leaking into checks.
 */
const applyAxialCap = (
  points: PreviewSurfacePoint[],
  basis: GlobalStrengthReductionBasis
): PreviewSurfacePoint[] => {
  if (!basis.axialCapEnabled || points.length === 0) return points
  const pole = Math.max(...points.map((point) => point.P))
  const ratio =
    basis.transverseReinforcement === 'qualifying-spiral'
      ? basis.factors.axialCapSpiral
      : basis.factors.axialCapOther
  const cap = pole * ratio
  const rows = groupSurfaceRows(points)
  const replacement = new Map<string, PreviewSurfacePoint>()

  for (const row of rows) {
    const curve = row.curve
    let crossing: PreviewSurfacePoint | null = null
    let crossingStation = 0
    for (let index = 1; index < curve.length; index++) {
      const a = curve[index - 1]
      const b = curve[index]
      if (a.P < cap || b.P > cap || Math.abs(a.P - b.P) < 1e-12) continue
      const t = (cap - a.P) / (b.P - a.P)
      crossingStation = lerpNumber(a.station, b.station, t)
      const ledger = lerpLedgerValue(a.ledger, b.ledger, t)
      crossing = {
        ...a,
        P: cap,
        Mx: lerpNumber(a.Mx, b.Mx, t),
        My: lerpNumber(a.My, b.My, t),
        state: {
          e0: lerpNumber(a.state.e0, b.state.e0, t),
          kx: lerpNumber(a.state.kx, b.state.kx, t),
          ky: lerpNumber(a.state.ky, b.state.ky, t)
        },
        ledger,
        resistance: a.resistance
          ? {
              ...a.resistance,
              axialCapApplied: true,
              stages: [...a.resistance.stages, 'maximum-axial-resistance-cap']
            }
          : undefined
      }
      break
    }
    if (!crossing) continue
    for (const point of curve) {
      if (point.P <= cap) continue
      // Fill, rather than merely trace, the horizontal cap face. Station zero becomes the axial
      // centre and the remaining clipped stations form radial rings ending at the exact crossing.
      // This keeps the structured mesh closed so a pure-compression demand ray has a valid hit.
      const radialRatio = crossingStation > 1e-12
        ? Math.min(1, Math.max(0, point.station / crossingStation))
        : 0
      const ledger = projectLedgerToAxialCap(crossing.ledger, radialRatio)
      replacement.set(point.id, {
        ...crossing,
        id: point.id,
        station: point.station,
        stationId: point.stationId,
        P: cap,
        Mx: crossing.Mx * radialRatio,
        My: crossing.My * radialRatio,
        ledger
      })
    }
  }

  return points.map((point) => replacement.get(point.id) ?? point)
}

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
  const materialSets = buildResistanceMaterialSets(sourceMaterials, designBasis)
  const base = buildPreviewSurfaceFromPrepared(statePrepared, analysisOptions, designBasis)
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

  /**
   * A design-material profile has two real material-event schedules (for example fyk/Es and
   * fyd/Es). Build the displayed Reference surface from its own schedule while retaining the
   * point-wise reference evaluation at every Design state for the resistance audit trace.
   */
  const referenceBase = designBasis.format === 'designMaterialReevaluation'
    ? buildPreviewSurfaceFromPrepared(referencePrepared, analysisOptions, designBasis)
    : base

  const evaluated = base.points.map((point) =>
    designPointFromState(point, referencePrepared, designPrepared, designBasis)
  )
  const nominalPoints = designBasis.format === 'designMaterialReevaluation'
    ? referenceBase.points
    : evaluated.map((item) => item.nominal)
  const uncappedDesign = evaluated.map((item) => item.design)
  const points =
    designBasis.format === 'globalResultantFactor'
      ? applyAxialCap(uncappedDesign, designBasis)
      : uncappedDesign
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

  return {
    ...base,
    points,
    nominalPoints,
    nominalTriangles: designBasis.format === 'designMaterialReevaluation'
      ? referenceBase.triangles
      : base.triangles,
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

export const sliceFixedPContour = (
  points: PreviewSurfacePoint[],
  fixedP: number,
  triangles?: readonly SurfaceIndexTriangle[]
): PreviewContourPoint[] => {
  const momentScale = Math.max(...points.map((point) => Math.hypot(point.Mx, point.My)), 1)
  const forceScale = Math.max(...points.map((point) => Math.abs(point.P)), 1)
  const momentTol = momentScale * PREVIEW_GEOMETRY_TOL
  const forceTol = forceScale * PREVIEW_GEOMETRY_TOL
  const contour: PreviewContourPoint[] = []

  for (const triangle of previewSurfaceTriangles(points, triangles)) {
    const intersections = trianglePlaneIntersections(triangle, (point) => point.P - fixedP, forceTol)
    for (const point of intersections) {
      appendUniquePoint(contour, { ...point, P: fixedP }, momentTol, forceTol)
    }
  }

  return contour.sort((a, b) => Math.atan2(a.My, a.Mx) - Math.atan2(b.My, b.Mx))
}

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
  const momentScale = Math.max(...points.map((point) => Math.hypot(point.Mx, point.My)), 1)
  const forceScale = Math.max(...points.map((point) => Math.abs(point.P)), 1)
  const momentTol = momentScale * PREVIEW_GEOMETRY_TOL
  const forceTol = forceScale * PREVIEW_GEOMETRY_TOL
  const planeDistance = (point: PreviewSurfacePoint) => point.Mx * s - point.My * c
  // Classification must be tighter than display/point matching. With the 1e-9 matching tolerance,
  // a nearly collapsed station next to a pole can make all three vertices of a small cap triangle
  // appear coplanar and create a false branch in the intersection graph.
  const planeTol = momentScale * 1e-12
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
        if (candidate.point.onSampledDirection) node.point.onSampledDirection = true
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
      intersections.set(vertexKey(point), projected({ ...point, onSampledDirection: true }))
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
    const irregular = [...seedComponent].filter((key) => graph.get(key)!.neighbours.size !== 2)
    const start =
      irregular.sort()[0] ??
      [...seedComponent].sort((a, b) => {
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
  if (contour.length < 2) return null
  const c = Math.cos(theta)
  const s = Math.sin(theta)
  const direction = { Mx: c, My: s }
  const momentScale = Math.max(...contour.map((point) => Math.hypot(point.Mx, point.My)), 1)
  const tol = momentScale * PREVIEW_GEOMETRY_TOL
  let best: PreviewMomentPlanePoint | null = null

  for (let i = 0; i < contour.length; i++) {
    const a = contour[i]
    const b = contour[(i + 1) % contour.length]
    const edge = { Mx: b.Mx - a.Mx, My: b.My - a.My }
    const denom = cross2(edge, direction)

    if (Math.abs(denom) <= tol) {
      for (const candidate of [a, b]) {
        const offRay = Math.abs(cross2(candidate, direction))
        const m = candidate.Mx * c + candidate.My * s
        if (offRay <= tol && m >= -tol && (!best || m < best.M)) {
          best = { ...candidate, beta: theta, M: Math.max(0, m) }
        }
      }
      continue
    }

    const q = -cross2(a, direction) / denom
    if (q < -1e-9 || q > 1 + 1e-9) continue
    const point = {
      beta: theta,
      P: a.P + (b.P - a.P) * q,
      Mx: a.Mx + edge.Mx * q,
      My: a.My + edge.My * q
    }
    const m = point.Mx * c + point.My * s
    if (m < -tol) continue
    const candidate = { ...point, M: Math.max(0, m) }
    if (!best || candidate.M < best.M) best = candidate
  }

  return best
}

const solve3 = (matrix: number[][], rhs: number[]) => {
  const a = matrix.map((row, index) => [...row, rhs[index]])
  const matrixScale = Math.max(...matrix.flat().map(Math.abs))
  if (!(matrixScale > 0) || !Number.isFinite(matrixScale) || rhs.some((value) => !Number.isFinite(value))) return null
  const pivotTolerance = 1e-12 * matrixScale
  for (let i = 0; i < 3; i++) {
    let pivot = i
    for (let r = i + 1; r < 3; r++) {
      if (Math.abs(a[r][i]) > Math.abs(a[pivot][i])) pivot = r
    }
    if (Math.abs(a[pivot][i]) < pivotTolerance) return null
    if (pivot !== i) [a[i], a[pivot]] = [a[pivot], a[i]]
    const div = a[i][i]
    for (let c = i; c < 4; c++) a[i][c] /= div
    for (let r = 0; r < 3; r++) {
      if (r === i) continue
      const factor = a[r][i]
      for (let c = i; c < 4; c++) a[r][c] -= factor * a[i][c]
    }
  }
  return [a[0][3], a[1][3], a[2][3]] as const
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

export type SurfaceRayIntersection = {
  lambda: number
  point: Resultant
  state: StrainState
  resistance: DesignResistanceTrace | null
}

/**
 * Intersect `lambda * demand` with the completed 3D resistance surface. Coordinates are normalized
 * before Möller–Trumbore intersection so force and moment units cannot condition the geometry test.
 */
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
      resistance: null
    }
  }
  const forceScale = Math.max(Math.abs(surface.bounds.P[0]), Math.abs(surface.bounds.P[1]), 1)
  const momentScale = Math.max(
    Math.abs(surface.bounds.Mx[0]),
    Math.abs(surface.bounds.Mx[1]),
    Math.abs(surface.bounds.My[0]),
    Math.abs(surface.bounds.My[1]),
    1
  )
  const toVec = (value: Resultant): Vec3 => [
    value.P / forceScale,
    value.Mx / momentScale,
    value.My / momentScale
  ]
  const direction = toVec(demand)
  let best: SurfaceRayIntersection | null = null

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
    const s: Vec3 = [-a[0], -a[1], -a[2]]
    const u = inverse * vecDot(s, h)
    if (u < -1e-9 || u > 1 + 1e-9) continue
    const q = vecCross(s, edge1)
    const v = inverse * vecDot(direction, q)
    if (v < -1e-9 || u + v > 1 + 1e-9) continue
    const lambda = inverse * vecDot(edge2, q)
    if (lambda <= 1e-10 || (best && lambda >= best.lambda)) continue
    const w = 1 - u - v
    const dominant =
      w >= u && w >= v ? pa : u >= v ? pb : pc
    best = {
      lambda,
      point: {
        P: lambda * demand.P,
        Mx: lambda * demand.Mx,
        My: lambda * demand.My
      },
      state: {
        e0: w * pa.state.e0 + u * pb.state.e0 + v * pc.state.e0,
        kx: w * pa.state.kx + u * pb.state.kx + v * pc.state.kx,
        ky: w * pa.state.ky + u * pb.state.ky + v * pc.state.ky
      },
      resistance: dominant.resistance ?? null
    }
  }
  return best
}

const checkRawLoadcaseUtilizationFromSurface = (
  surface: PreviewSurface,
  loadcase: LoadCombination
): LoadcaseQuickCheckResult => {
  const contour = sliceFixedPContour(surface.points, loadcase.P, surface.triangles)
  const fixedP = estimateUtilization(loadcase, contour)
  const proportional = intersectSurfaceWithDemandRay(surface, loadcase)
  const proportionalUtilization =
    proportional == null
      ? null
      : proportional.lambda === Number.POSITIVE_INFINITY
        ? 0
        : 1 / proportional.lambda
  return {
    loadcaseId: loadcase.id,
    demand: loadcase,
    utilization: proportionalUtilization,
    proportionalUtilization,
    fixedPUtilization: fixedP.utilization,
    adequate: proportionalUtilization == null ? null : proportionalUtilization <= 1 + 1e-9,
    capacityPoint: proportional?.point ?? null,
    resistance: proportional?.resistance ?? null,
    contourPoint: fixedP.point,
    message:
      proportionalUtilization == null
        ? 'No proportional demand-ray crossing was found on the design-resistance surface.'
        : 'Factored ULS demand checked against the 3D design-resistance surface; fixed-P UR is secondary.'
  }
}

export const projectedBoundaryDepth = (
  points: ReadonlyArray<{ x: number; y: number }>,
  nx: number,
  ny: number
) => {
  let minimum = Number.POSITIVE_INFINITY
  let maximum = Number.NEGATIVE_INFINITY
  for (const point of points) {
    const projection = nx * point.x + ny * point.y
    minimum = Math.min(minimum, projection)
    maximum = Math.max(maximum, projection)
  }
  return maximum - minimum
}

/**
 * Outer-boundary vertices of every solid, structurally typed so the stress-strain `SectionGeometry`
 * and the prepared equivalent-block section both feed one implementation.
 */
export const sectionBoundaryPoints = (
  section: { solids: ReadonlyArray<{ outer: ReadonlyArray<{ x: number; y: number }> }> }
): Array<{ x: number; y: number }> =>
  section.solids.flatMap((solid) => solid.outer.map(({ x, y }) => ({ x, y })))

/**
 * KDS Appendix 3.2 makes minimum eccentricity a factored-demand rule. It is deliberately applied
 * here, not as a horizontal capacity cap. The candidate demands come from `@pm/design` so the
 * stress-strain and equivalent-block mechanics apply one identical rule.
 */
export const checkLoadcaseUtilizationFromSurface = (
  surface: PreviewSurface,
  loadcase: LoadCombination
): LoadcaseQuickCheckResult => {
  const boundary = surface.sectionBoundaryPoints ?? []
  const candidates = boundary.length === 0
    ? []
    : minimumEccentricityCandidates(surface.designBasis, loadcase, (nx, ny) =>
      projectedBoundaryDepth(boundary, nx, ny))
  if (candidates.length === 0) return checkRawLoadcaseUtilizationFromSurface(surface, loadcase)

  const checked = candidates.map((candidate) => {
    const adjusted = { ...loadcase, Mx: candidate.Mx, My: candidate.My }
    const result = checkRawLoadcaseUtilizationFromSurface(surface, adjusted)
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
  loadcases: LoadCombination[]
): LoadcaseQuickCheckResult[] => loadcases.map((loadcase) => checkLoadcaseUtilizationFromSurface(surface, loadcase))

/**
 * Attach the governing design check to a converged inverse state.
 *
 * The inverse solve answers "what strain plane balances this demand"; it does not answer "is the
 * section adequate". Adequacy is the proportional 3D ray against the **design** surface, and the
 * inverse's own `utilization` is a fixed-P estimate on the contour it was handed. Composing them in
 * one place stops a second consumer — a report, a batch check — from publishing the diagnostic
 * where the governing number belongs.
 */
export const applyDesignCheckToInverse = (
  inverse: InversePreviewResult,
  check: LoadcaseQuickCheckResult
): InversePreviewResult => ({
  ...inverse,
  utilization: check.proportionalUtilization,
  proportionalUtilization: check.proportionalUtilization,
  fixedPUtilization: check.fixedPUtilization,
  designCapacityPoint: check.capacityPoint,
  resistance: check.resistance
})

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
    prepared.fibers,
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

export type SectionFieldSample = {
  x: number
  y: number
  area: number
  strain: number
  stress: number
  kind: 'concrete' | 'rebar'
}

export type SectionFieldRebar = {
  id: number
  x: number
  y: number
  dia: number
  area: number
  strain: number
  stress: number
  /** Axial force in the bar, N (compression positive with the strain convention). */
  force: number
}

/** One mesh triangle with vertex field values for continuous canvas shading. */
export type SectionFieldTriangle = {
  ax: number
  ay: number
  bx: number
  by: number
  cx: number
  cy: number
  strainA: number
  strainB: number
  strainC: number
  stressA: number
  stressB: number
  stressC: number
}

export type SectionFieldMap = {
  mechanics?: 'stress-strain-integration' | 'equivalent-rectangular-block'
  origin: AnalysisOrigin
  /** Legacy quadrature samples (debug / hover). */
  samples: SectionFieldSample[]
  /** Clipped-cell triangles in world coordinates — primary field visualization. */
  triangles: SectionFieldTriangle[]
  rebars: SectionFieldRebar[]
  bounds: { minX: number; maxX: number; minY: number; maxY: number }
  mesh: ConcreteMeshReport
  equivalentBlock?: {
    neutralAxisAngle: number
    neutralAxisDepth: number
    blockDepth: number
    compressionStress: number
    geometry: Array<{ outer: Array<{ x: number; y: number }>; holes: Array<Array<{ x: number; y: number }>> }>
  }
}

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
    const area = (Math.PI * bar.dia * bar.dia) / 4
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
