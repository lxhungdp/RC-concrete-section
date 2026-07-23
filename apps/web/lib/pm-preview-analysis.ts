import type { GeometryInputRebarView, Point2, SectionGeometry } from '@pm/geometry'
import { compileMaterialStore, type MaterialStore } from '@pm/materials'
import type { LoadCombination } from '@pm/project'

export type Resultant = {
  P: number
  Mx: number
  My: number
}

export type StrainState = {
  e0: number
  kx: number
  ky: number
}

export type PreviewSurfacePoint = Resultant & {
  id: string
  beta: number
  station: number
  state: StrainState
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
type StationDefinition =
  | { kind: 'pure-compression' }
  | { kind: 'neutral-axis-ratio'; cOverC1: number }
  | { kind: 'steel-strain'; strain: number }
  | { kind: 'steel-yield-ratio'; ratio: number }
  | { kind: 'pure-tension' }

const PREVIEW_STATIONS: StationDefinition[] = [
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

const pointInRing = (point: { x: number; y: number }, ring: Point2[]) => {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]
    const b = ring[j]
    const crosses = a.y > point.y !== b.y > point.y
    if (crosses && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y || 1e-12) + a.x) {
      inside = !inside
    }
  }
  return inside
}

const pointInSolid = (point: { x: number; y: number }, solid: SectionGeometry['solids'][number]) =>
  pointInRing(point, solid.outer) && solid.holes.every((hole) => !pointInRing(point, hole))

const allSectionPoints = (section: SectionGeometry) =>
  section.solids.flatMap((solid) => [solid.outer, ...solid.holes].flat())

const buildConcreteFibers = (section: SectionGeometry, targetDivisions = 34): Fiber[] => {
  const points = allSectionPoints(section)
  if (points.length === 0) return []
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const width = Math.max(1, maxX - minX)
  const height = Math.max(1, maxY - minY)
  const nx = Math.max(10, Math.ceil(targetDivisions * Math.sqrt(width / height)))
  const ny = Math.max(10, Math.ceil(targetDivisions * Math.sqrt(height / width)))
  const dx = width / nx
  const dy = height / ny
  const fibers: Fiber[] = []

  for (let ix = 0; ix < nx; ix++) {
    for (let iy = 0; iy < ny; iy++) {
      const x = minX + (ix + 0.5) * dx
      const y = minY + (iy + 0.5) * dy
      const solid = section.solids.find((item) => pointInSolid({ x, y }, item))
      if (solid) fibers.push({ x, y, area: dx * dy, kind: 'concrete' })
    }
  }

  return fibers
}

const buildRebarFibers = (rebars: GeometryInputRebarView[]): Fiber[] =>
  rebars.map((bar) => ({
    x: bar.x,
    y: bar.y,
    area: (Math.PI * bar.dia * bar.dia) / 4,
    kind: 'rebar',
    steelMaterialId: bar.steelMaterialId
  }))

const strainAt = (state: StrainState, fiber: Pick<Fiber, 'x' | 'y'>) =>
  state.e0 + state.kx * fiber.y + state.ky * fiber.x

const evaluate = (
  fibers: Fiber[],
  materials: ReturnType<typeof compileMaterialStore>,
  defaultSteelMaterialId: number,
  state: StrainState
): Resultant => {
  let P = 0
  let Mx = 0
  let My = 0

  for (const fiber of fibers) {
    const strain = strainAt(state, fiber)
    const concreteStress = materials.concrete.stress(strain)
    const steelStress =
      fiber.kind === 'rebar'
        ? materials.steel.get(fiber.steelMaterialId ?? defaultSteelMaterialId)?.stress(strain) ?? concreteStress
        : concreteStress
    const stress = fiber.kind === 'rebar' ? steelStress - concreteStress : concreteStress
    const force = stress * fiber.area
    P += force
    Mx += force * fiber.y
    My += force * fiber.x
  }

  return { P, Mx, My }
}

const projectedExtents = (section: SectionGeometry, beta: number, rebars: GeometryInputRebarView[] = []) => {
  const points = allSectionPoints(section)
  const c = Math.cos(beta)
  const s = Math.sin(beta)
  const sectionValues = points.map((point) => point.y * c + point.x * s)
  const rebarValues = rebars.map((bar) => bar.y * c + bar.x * s)
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

const makeState = (
  section: SectionGeometry,
  rebars: GeometryInputRebarView[],
  beta: number,
  stationIndex: number,
  epsCu: number,
  epsY: number
): StrainState => {
  const station = PREVIEW_STATIONS[stationIndex]
  if (!station || station.kind === 'pure-compression') return { e0: epsCu, kx: 0, ky: 0 }
  if (station.kind === 'pure-tension') return { e0: -0.05, kx: 0, ky: 0 }

  const { max, tensionControl } = projectedExtents(section, beta, rebars)
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

export const buildPreviewSurface = (
  section: SectionGeometry,
  rebars: GeometryInputRebarView[],
  materialStore: MaterialStore,
  fixedP = 0
): PreviewSurface => {
  const concreteFibers = buildConcreteFibers(section)
  const fibers = [...concreteFibers, ...buildRebarFibers(rebars)]
  const materials = compileMaterialStore(materialStore)
  const epsCu = materialStore.concrete.limits.epsCu
  const defaultSteel =
    materialStore.steel.find((material) => material.id === materialStore.defaults.steelMaterialId) ?? materialStore.steel[0]
  const epsY = defaultSteel ? defaultSteel.fy / defaultSteel.elasticModulus : 0.002
  const points: PreviewSurfacePoint[] = []
  const warnings: string[] = []

  if (section.solids.length !== 1) warnings.push('Preview engine supports one concrete region best; multi-region output is approximate.')
  if (concreteFibers.length === 0) warnings.push('No concrete fibers were generated. Apply a valid concrete section first.')
  if (rebars.length === 0) warnings.push('No rebars are present; steel contribution is zero.')

  for (const beta of PREVIEW_BETAS) {
    for (let station = 0; station < PREVIEW_STATIONS.length; station++) {
      const state = makeState(section, rebars, beta, station, epsCu, epsY)
      const result = evaluate(fibers, materials, materialStore.defaults.steelMaterialId, state)
      points.push({
        id: `${Math.round((beta * 180) / Math.PI)}-${station}`,
        beta,
        station,
        state,
        ...result
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
  contour: PreviewContourPoint[]
): InversePreviewResult => {
  const fibers = [...buildConcreteFibers(section, 30), ...buildRebarFibers(rebars)]
  const materials = compileMaterialStore(materialStore)
  const demand = { P: loadcase.P, Mx: loadcase.Mx, My: loadcase.My }
  let state: StrainState = { e0: 0.0002, kx: 0, ky: 0 }
  let response = evaluate(fibers, materials, materialStore.defaults.steelMaterialId, state)
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
      const r = evaluate(fibers, materials, materialStore.defaults.steelMaterialId, trial)
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
      const trialResponse = evaluate(fibers, materials, materialStore.defaults.steelMaterialId, trial)
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
