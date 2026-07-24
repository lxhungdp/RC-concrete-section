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
  station?: number
}

export type PreviewMomentPlanePoint = PreviewContourPoint & {
  /** Moment coordinate on the checked load direction. */
  M: number
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

export type LoadcaseQuickCheckResult = {
  loadcaseId: number
  demand: LoadCombination
  utilization: number | null
  contourPoint: PreviewMomentPlanePoint | null
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
const PREVIEW_GEOMETRY_TOL = 1e-9
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

/** Labels drawn on the vertical P–M slice (steel limit stations only). */
export const VERTICAL_SLICE_KEY_STATIONS: Array<{ station: number; label: string }> = [
  { station: 5, label: 'fs = 0' },
  { station: 9, label: 'fs = fy' }
]

export const stationDefinitionLabel = (station: StationDefinition): string => {
  if (station.kind === 'pure-compression') return 'Pure compression'
  if (station.kind === 'pure-tension') return 'Pure tension'
  if (station.kind === 'neutral-axis-ratio') return `c = ${station.cOverC1.toFixed(1)}·c₁`
  if (station.kind === 'steel-yield-ratio') {
    if (station.ratio === 0) return 'fs = 0'
    if (Math.abs(station.ratio - 1) < 1e-9) return 'fs = fy'
    return `fs = ${station.ratio}·fy`
  }
  if (station.kind === 'steel-strain') {
    if (Math.abs(station.strain) < 1e-12) return 'fs = 0'
    return `εs = ${station.strain}`
  }
  return 'Station'
}

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
    My: a.My + (b.My - a.My) * t,
    station: a.station + (b.station - a.station) * t
  }
}

const groupSurfaceRows = (points: PreviewSurfacePoint[]) => {
  const byBeta = new Map<number, PreviewSurfacePoint[]>()
  for (const point of points) byBeta.set(point.beta, [...(byBeta.get(point.beta) ?? []), point])
  return [...byBeta.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([beta, curve]) => ({
      beta,
      curve: curve.sort((a, b) => a.station - b.station)
    }))
}

const previewSurfaceTriangles = (points: PreviewSurfacePoint[]) => {
  const rows = groupSurfaceRows(points)
  const triangles: Array<[PreviewSurfacePoint, PreviewSurfacePoint, PreviewSurfacePoint]> = []
  if (rows.length < 2) return triangles

  for (let i = 0; i < rows.length; i++) {
    const current = rows[i].curve
    const next = rows[(i + 1) % rows.length].curve
    const stationCount = Math.min(current.length, next.length)
    for (let station = 0; station < stationCount - 1; station++) {
      const a = current[station]
      const b = next[station]
      const c = next[station + 1]
      const d = current[station + 1]
      triangles.push([a, b, c], [a, c, d])
    }
  }

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

const appendUniquePoint = <T extends Pick<Resultant, 'P' | 'Mx' | 'My'>>(
  target: T[],
  point: T,
  momentTol: number,
  forceTol: number
) => {
  const duplicate = target.some(
    (item) =>
      Math.abs(item.P - point.P) <= forceTol &&
      Math.abs(item.Mx - point.Mx) <= momentTol &&
      Math.abs(item.My - point.My) <= momentTol
  )
  if (!duplicate) target.push(point)
}

const trianglePlaneIntersections = (
  triangle: [PreviewSurfacePoint, PreviewSurfacePoint, PreviewSurfacePoint],
  distance: (point: PreviewSurfacePoint) => number,
  tol: number
) => {
  const intersections: PreviewContourPoint[] = []
  const edges: Array<[PreviewSurfacePoint, PreviewSurfacePoint]> = [
    [triangle[0], triangle[1]],
    [triangle[1], triangle[2]],
    [triangle[2], triangle[0]]
  ]

  for (const [a, b] of edges) {
    const da = distance(a)
    const db = distance(b)
    const aOn = Math.abs(da) <= tol
    const bOn = Math.abs(db) <= tol

    if (aOn) appendUniquePoint(intersections, a, tol, tol)
    if (bOn) appendUniquePoint(intersections, b, tol, tol)
    if (aOn || bOn || da * db > 0) continue

    const t = da / (da - db)
    appendUniquePoint(intersections, lerpPoint(a, b, t), tol, tol)
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
  const contour: PreviewContourPoint[] = []

  for (const { beta, curve } of groupSurfaceRows(points)) {
    let best: PreviewContourPoint | null = null
    for (let i = 0; i < curve.length - 1; i++) {
      const a = curve[i]
      const b = curve[i + 1]
      if ((fixedP - a.P) * (fixedP - b.P) <= 0) {
        best = interpolate(a, b, fixedP)
        if (best) break
      }
    }
    if (best) contour.push({ ...best, beta })
  }

  return contour.sort((a, b) => a.beta - b.beta)
}

export const sliceFixedPContour = (points: PreviewSurfacePoint[], fixedP: number): PreviewContourPoint[] => {
  const momentScale = Math.max(...points.map((point) => Math.hypot(point.Mx, point.My)), 1)
  const forceScale = Math.max(...points.map((point) => Math.abs(point.P)), 1)
  const momentTol = momentScale * PREVIEW_GEOMETRY_TOL
  const forceTol = forceScale * PREVIEW_GEOMETRY_TOL
  const contour: PreviewContourPoint[] = []

  for (const triangle of previewSurfaceTriangles(points)) {
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
 * The preview surface is still the coarse beta/station grid, but this is a geometric section of
 * that surface. It does not assume the sampled strain-plane angle equals the moment direction.
 */
export const sliceMomentPlane = (points: PreviewSurfacePoint[], theta: number): PreviewMomentPlanePoint[] => {
  const c = Math.cos(theta)
  const s = Math.sin(theta)
  const momentScale = Math.max(...points.map((point) => Math.hypot(point.Mx, point.My)), 1)
  const forceScale = Math.max(...points.map((point) => Math.abs(point.P)), 1)
  const momentTol = momentScale * PREVIEW_GEOMETRY_TOL
  const forceTol = forceScale * PREVIEW_GEOMETRY_TOL
  const planeDistance = (point: PreviewSurfacePoint) => point.Mx * s - point.My * c
  const path: PreviewMomentPlanePoint[] = []

  for (const triangle of previewSurfaceTriangles(points)) {
    const intersections = trianglePlaneIntersections(triangle, planeDistance, momentTol)
    for (const point of intersections) {
      appendUniquePoint(
        path,
        {
          ...point,
          beta: theta,
          M: point.Mx * c + point.My * s
        },
        momentTol,
        forceTol
      )
    }
  }

  return path.sort((a, b) => b.P - a.P || a.M - b.M)
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
  const best = intersectFixedPContourWithMomentRay(contour, demandAngle)
  const capacityRadius = best?.M ?? 0
  return {
    utilization: capacityRadius > 1e-9 ? demandRadius / capacityRadius : null,
    point: best
  }
}

export const checkLoadcaseUtilizationFromSurface = (
  surface: PreviewSurface,
  loadcase: LoadCombination
): LoadcaseQuickCheckResult => {
  const contour = sliceFixedPContour(surface.points, loadcase.P)
  const utilization = estimateUtilization(loadcase, contour)
  return {
    loadcaseId: loadcase.id,
    demand: loadcase,
    utilization: utilization.utilization,
    contourPoint: utilization.point,
    message:
      utilization.utilization == null
        ? 'No demand-ray crossing was found on the fixed-P contour.'
        : 'Checked from fixed-P contour and demand moment ray.'
  }
}

export const checkLoadcasesUtilizationFromSurface = (
  surface: PreviewSurface,
  loadcases: LoadCombination[]
): LoadcaseQuickCheckResult[] => loadcases.map((loadcase) => checkLoadcaseUtilizationFromSurface(surface, loadcase))

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
  origin: AnalysisOrigin
  /** Legacy quadrature samples (debug / hover). */
  samples: SectionFieldSample[]
  /** Clipped-cell triangles in world coordinates — primary field visualization. */
  triangles: SectionFieldTriangle[]
  rebars: SectionFieldRebar[]
  bounds: { minX: number; maxX: number; minY: number; maxY: number }
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
  const mesh = buildConcreteMesh(section, meshOptions)
  const materials = compileMaterialStore(materialStore)

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
    const steel = materials.steel.get(bar.steelMaterialId ?? materialStore.defaults.steelMaterialId)
    const stress = steel ? steel.stress(strain) : materials.concrete.stress(strain)
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
