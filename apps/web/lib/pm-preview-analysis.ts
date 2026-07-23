import {
  buildConcreteMesh,
  netConcreteCentroid,
  type ConcreteMeshOptions,
  type ConcreteMeshReport,
  type GeometryInputRebarView,
  type SectionGeometry
} from '@pm/geometry'
import { compileMaterialStore, type MaterialStore } from '@pm/materials'
import type { LoadCombination } from '@pm/project'

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

export type PreviewSurfacePoint = Resultant & {
  id: string
  beta: number
  station: number
  state: StrainState
  ledger: ResultantLedger
}

export type PreviewSurface = {
  points: PreviewSurfacePoint[]
  contour: PreviewContourPoint[]
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
  warnings: string[]
}

export type PreviewContourPoint = {
  beta: number
  P: number
  Mx: number
  My: number
}

export type InversePreviewResult = {
  ok: boolean
  loadcaseId: number
  demand: LoadCombination
  state: StrainState
  response: Resultant
  residual: Resultant
  residualNorm: number
  iterations: number
  utilization: number | null
  contourPoint: PreviewContourPoint | null
  message: string
}

type Fiber = {
  x: number
  y: number
  area: number
  kind: 'concrete' | 'rebar'
  steelMaterialId?: number
}

const PREVIEW_BETAS = Array.from({ length: 24 }, (_, index) => (index * Math.PI) / 12)
export type StationDefinition =
  | { kind: 'pure-compression' }
  | { kind: 'neutral-axis-ratio'; cOverC1: number }
  | { kind: 'steel-strain'; strain: number }
  | { kind: 'steel-yield-ratio'; ratio: number }
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
  { kind: 'steel-strain', strain: 0 },
  { kind: 'steel-yield-ratio', ratio: 0.25 },
  { kind: 'steel-yield-ratio', ratio: 0.5 },
  { kind: 'steel-yield-ratio', ratio: 0.75 },
  { kind: 'steel-yield-ratio', ratio: 1 },
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

/**
 * Concrete fibers from the exact clipped-cell mesh (`docs/02` §5). Every weight is the area of a
 * real clipped triangle, so meshed area and first moments reproduce the exact polygon properties
 * instead of rasterising the boundary.
 */
const buildConcreteFibers = (
  section: SectionGeometry,
  origin: AnalysisOrigin,
  options: ConcreteMeshOptions = {}
): { fibers: Fiber[]; report: ConcreteMeshReport } => {
  const mesh = buildConcreteMesh(section, options)
  return {
    fibers: mesh.points.map((point) => ({
      x: point.x - origin.x,
      y: point.y - origin.y,
      area: point.area,
      kind: 'concrete'
    })),
    report: mesh.report
  }
}

const buildRebarFibers = (rebars: GeometryInputRebarView[], origin: AnalysisOrigin): Fiber[] =>
  rebars.map((bar) => ({
    x: bar.x - origin.x,
    y: bar.y - origin.y,
    area: (Math.PI * bar.dia * bar.dia) / 4,
    kind: 'rebar',
    steelMaterialId: bar.steelMaterialId
  }))

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

const evaluate = (
  fibers: Fiber[],
  materials: ReturnType<typeof compileMaterialStore>,
  defaultSteelMaterialId: number,
  state: StrainState
): ResultantLedger => {
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

    const steelStress =
      materials.steel.get(fiber.steelMaterialId ?? defaultSteelMaterialId)?.stress(strain) ?? concreteStress
    accumulate(steelGross, steelStress * fiber.area, fiber)
    accumulate(displacedConcrete, -concreteStress * fiber.area, fiber)
  }

  const steel = addResultant(steelGross, displacedConcrete)
  return { concrete, steelGross, displacedConcrete, steel, total: addResultant(concrete, steel) }
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
  const rebarValues = rebars.map(project)
  return {
    min: Math.min(...sectionValues),
    max: Math.max(...sectionValues),
    tensionControl: rebarValues.length > 0 ? Math.min(...rebarValues) : Math.min(...sectionValues)
  }
}

const farTensionSteelStrain = (station: StationDefinition, epsY: number) => {
  if (station.kind === 'steel-strain') return station.strain
  if (station.kind === 'steel-yield-ratio') return -Math.abs(station.ratio * epsY)
  return 0
}

/** Strain plane for reporting station `P{stationIndex}` in direction `beta`. */
export const previewStationState = (
  section: SectionGeometry,
  rebars: GeometryInputRebarView[],
  beta: number,
  stationIndex: number,
  epsCu: number,
  epsY: number,
  origin: AnalysisOrigin = netConcreteCentroid(section)
): StrainState => {
  const station = PREVIEW_STATIONS[stationIndex]
  if (!station || station.kind === 'pure-compression') return { e0: epsCu, kx: 0, ky: 0 }
  if (station.kind === 'pure-tension') return { e0: -0.05, kx: 0, ky: 0 }

  const { max, tensionControl } = projectedExtents(section, beta, origin, rebars)
  const compressionProjection = max
  const c1 = Math.max(1e-9, compressionProjection - tensionControl)
  const controlProjection =
    station.kind === 'neutral-axis-ratio'
      ? compressionProjection - station.cOverC1 * c1
      : tensionControl
  const controlStrain =
    station.kind === 'neutral-axis-ratio' ? 0 : farTensionSteelStrain(station, epsY)
  const curvature = (epsCu - controlStrain) / Math.max(1e-9, compressionProjection - controlProjection)
  const c = Math.cos(beta)
  const s = Math.sin(beta)
  return {
    e0: epsCu - curvature * compressionProjection,
    kx: curvature * c,
    ky: curvature * s
  }
}

const interpolate = (a: PreviewSurfacePoint, b: PreviewSurfacePoint, P: number): PreviewContourPoint | null => {
  const denom = b.P - a.P
  if (Math.abs(denom) < 1e-9) return null
  const t = (P - a.P) / denom
  if (t < -1e-9 || t > 1 + 1e-9) return null
  return {
    beta: a.beta,
    P,
    Mx: a.Mx + (b.Mx - a.Mx) * t,
    My: a.My + (b.My - a.My) * t
  }
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
): ResultantLedger =>
  evaluate(
    [...buildConcreteFibers(section, origin, meshOptions).fibers, ...buildRebarFibers(rebars, origin)],
    compileMaterialStore(materialStore),
    materialStore.defaults.steelMaterialId,
    state
  )

export const buildPreviewSurface = (
  section: SectionGeometry,
  rebars: GeometryInputRebarView[],
  materialStore: MaterialStore,
  fixedP = 0,
  meshOptions: ConcreteMeshOptions = {}
): PreviewSurface => {
  const origin = netConcreteCentroid(section)
  const { fibers: concreteFibers, report: meshReport } = buildConcreteFibers(section, origin, meshOptions)
  const fibers = [...concreteFibers, ...buildRebarFibers(rebars, origin)]
  const materials = compileMaterialStore(materialStore)
  const epsCu = materialStore.concrete.limits.epsCu
  const defaultSteel =
    materialStore.steel.find((material) => material.id === materialStore.defaults.steelMaterialId) ?? materialStore.steel[0]
  const epsY = defaultSteel ? defaultSteel.fy / defaultSteel.elasticModulus : 0.002
  const points: PreviewSurfacePoint[] = []
  const warnings: string[] = []

  if (section.solids.length !== 1) warnings.push('Preview engine supports one concrete region best; multi-region output is approximate.')
  if (concreteFibers.length === 0) warnings.push('No concrete fibers were generated. Apply a valid concrete section first.')
  for (const issue of meshReport.warnings) warnings.push(`Concrete mesh: ${issue}`)
  if (rebars.length === 0) warnings.push('No rebars are present; steel contribution is zero.')

  for (const beta of PREVIEW_BETAS) {
    for (let station = 0; station < PREVIEW_STATIONS.length; station++) {
      const state = previewStationState(section, rebars, beta, station, epsCu, epsY, origin)
      const ledger = evaluate(fibers, materials, materialStore.defaults.steelMaterialId, state)
      points.push({
        id: `${Math.round((beta * 180) / Math.PI)}-${station}`,
        beta,
        station,
        state,
        ledger,
        ...ledger.total
      })
    }
  }

  const contour = sliceFixedP(points, fixedP)
  const P = points.map((point) => point.P)
  const Mx = points.map((point) => point.Mx)
  const My = points.map((point) => point.My)

  return {
    points,
    contour,
    bounds: {
      P: [Math.min(...P), Math.max(...P)],
      Mx: [Math.min(...Mx), Math.max(...Mx)],
      My: [Math.min(...My), Math.max(...My)]
    },
    mesh: meshReport,
    comparison: {
      workbook: 'docs/example case/PM-advanced (7) 2D.xlsx',
      notes: [
        'Reference workbook uses fck=30 MPa, ecu=0.0033, KDS parabolic concrete, Es=200000 MPa, fy=400 MPa.',
        'Reference Summary P0 at 0 degrees: nominal P=33981.43 kN, factored P=23443.29 kN.',
        'Reference Summary P18 pure tension: nominal P=-5790.58 kN, factored P=-5211.53 kN.'
      ]
    },
    warnings
  }
}

export const sliceFixedP = (points: PreviewSurfacePoint[], fixedP: number): PreviewContourPoint[] => {
  const byBeta = new Map<number, PreviewSurfacePoint[]>()
  for (const point of points) byBeta.set(point.beta, [...(byBeta.get(point.beta) ?? []), point])
  const contour: PreviewContourPoint[] = []

  for (const [beta, curve] of byBeta) {
    const ordered = curve.sort((a, b) => a.station - b.station)
    let best: PreviewContourPoint | null = null
    for (let i = 0; i < ordered.length - 1; i++) {
      const a = ordered[i]
      const b = ordered[i + 1]
      if ((fixedP - a.P) * (fixedP - b.P) <= 0) {
        best = interpolate(a, b, fixedP)
        if (best) break
      }
    }
    if (best) contour.push({ ...best, beta })
  }

  return contour.sort((a, b) => a.beta - b.beta)
}

const solve3 = (matrix: number[][], rhs: number[]) => {
  const a = matrix.map((row, index) => [...row, rhs[index]])
  for (let i = 0; i < 3; i++) {
    let pivot = i
    for (let r = i + 1; r < 3; r++) {
      if (Math.abs(a[r][i]) > Math.abs(a[pivot][i])) pivot = r
    }
    if (Math.abs(a[pivot][i]) < 1e-12) return null
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

const residualNorm = (residual: Resultant, scale: Resultant) =>
  Math.max(
    Math.abs(residual.P) / Math.max(1, Math.abs(scale.P)),
    Math.abs(residual.Mx) / Math.max(1, Math.abs(scale.Mx)),
    Math.abs(residual.My) / Math.max(1, Math.abs(scale.My))
  )

const demandMomentRadius = (demand: Resultant) => Math.hypot(demand.Mx, demand.My)

const estimateUtilization = (demand: LoadCombination, contour: PreviewContourPoint[]) => {
  const demandRadius = demandMomentRadius(demand)
  if (demandRadius < 1e-9 || contour.length === 0) return { utilization: null, point: null }
  const demandAngle = Math.atan2(demand.My, demand.Mx)
  const best = contour.reduce(
    (current, point) => {
      const angle = Math.atan2(point.My, point.Mx)
      const delta = Math.abs(Math.atan2(Math.sin(angle - demandAngle), Math.cos(angle - demandAngle)))
      return delta < current.delta ? { delta, point } : current
    },
    { delta: Number.POSITIVE_INFINITY, point: contour[0] }
  ).point
  const capacityRadius = Math.hypot(best.Mx, best.My)
  return {
    utilization: capacityRadius > 1e-9 ? demandRadius / capacityRadius : null,
    point: best
  }
}

export const solveInversePreview = (
  section: SectionGeometry,
  rebars: GeometryInputRebarView[],
  materialStore: MaterialStore,
  loadcase: LoadCombination,
  contour: PreviewContourPoint[],
  meshOptions: ConcreteMeshOptions = {}
): InversePreviewResult => {
  // Same mesh and same reference origin as the capacity surface.
  const origin = netConcreteCentroid(section)
  const fibers = [...buildConcreteFibers(section, origin, meshOptions).fibers, ...buildRebarFibers(rebars, origin)]
  const materials = compileMaterialStore(materialStore)
  const demand = { P: loadcase.P, Mx: loadcase.Mx, My: loadcase.My }
  let state: StrainState = { e0: 0.0002, kx: 0, ky: 0 }
  let response = evaluate(fibers, materials, materialStore.defaults.steelMaterialId, state).total
  let residual = { P: response.P - demand.P, Mx: response.Mx - demand.Mx, My: response.My - demand.My }
  let norm = residualNorm(residual, demand)
  let iterations = 0

  for (; iterations < 22 && norm > 1e-5; iterations++) {
    const steps = [1e-6, 1e-9, 1e-9] as const
    const cols = steps.map((step, index) => {
      const trial = { ...state }
      if (index === 0) trial.e0 += step
      if (index === 1) trial.kx += step
      if (index === 2) trial.ky += step
      const r = evaluate(fibers, materials, materialStore.defaults.steelMaterialId, trial).total
      return [(r.P - response.P) / step, (r.Mx - response.Mx) / step, (r.My - response.My) / step]
    })
    const matrix = [
      [cols[0][0], cols[1][0], cols[2][0]],
      [cols[0][1], cols[1][1], cols[2][1]],
      [cols[0][2], cols[1][2], cols[2][2]]
    ]
    const delta = solve3(matrix, [-residual.P, -residual.Mx, -residual.My])
    if (!delta) break

    let accepted = false
    for (const factor of [1, 0.5, 0.25, 0.125, 0.0625]) {
      const trial = {
        e0: state.e0 + delta[0] * factor,
        kx: state.kx + delta[1] * factor,
        ky: state.ky + delta[2] * factor
      }
      const trialResponse = evaluate(fibers, materials, materialStore.defaults.steelMaterialId, trial).total
      const trialResidual = {
        P: trialResponse.P - demand.P,
        Mx: trialResponse.Mx - demand.Mx,
        My: trialResponse.My - demand.My
      }
      const trialNorm = residualNorm(trialResidual, demand)
      if (Number.isFinite(trialNorm) && trialNorm < norm) {
        state = trial
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
  return {
    ok: norm <= 1e-5,
    loadcaseId: loadcase.id,
    demand: loadcase,
    state,
    response,
    residual,
    residualNorm: norm,
    iterations,
    utilization: utilization.utilization,
    contourPoint: utilization.point,
    message: norm <= 1e-5 ? 'Converged preview equilibrium.' : 'Preview solver stopped before strict convergence.'
  }
}

export type SectionFieldSample = {
  x: number
  y: number
  area: number
  strain: number
  stress: number
  kind: 'concrete' | 'rebar'
}

export type SectionFieldMap = {
  origin: AnalysisOrigin
  samples: SectionFieldSample[]
  mesh: ConcreteMeshReport
}

/** Mesh samples colored by strain/stress for a known strain plane (loadcase inverse state). */
export const buildSectionFieldMap = (
  section: SectionGeometry,
  rebars: GeometryInputRebarView[],
  materialStore: MaterialStore,
  state: StrainState,
  meshOptions: ConcreteMeshOptions = {}
): SectionFieldMap => {
  const origin = netConcreteCentroid(section)
  const { fibers, report } = buildConcreteFibers(section, origin, meshOptions)
  const materials = compileMaterialStore(materialStore)
  const samples: SectionFieldSample[] = fibers.map((fiber) => {
    const strain = strainAt(state, fiber)
    return {
      x: fiber.x + origin.x,
      y: fiber.y + origin.y,
      area: fiber.area,
      strain,
      stress: materials.concrete.stress(strain),
      kind: 'concrete' as const
    }
  })

  for (const fiber of buildRebarFibers(rebars, origin)) {
    const strain = strainAt(state, fiber)
    const steel = materials.steel.get(fiber.steelMaterialId ?? materialStore.defaults.steelMaterialId)
    samples.push({
      x: fiber.x + origin.x,
      y: fiber.y + origin.y,
      area: fiber.area,
      strain,
      stress: steel ? steel.stress(strain) : materials.concrete.stress(strain),
      kind: 'rebar'
    })
  }

  return { origin, samples, mesh: report }
}
