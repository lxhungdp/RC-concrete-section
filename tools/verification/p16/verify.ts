/**
 * P16 column: build the UMD case as a native project input, run this engine, and emit a
 * machine-readable comparison against the UMD report.
 *
 * Source report: `docs/examples/reference-case/source/P16_Column_ULS_R _260730_콘크리트 커브 추가수정.md`
 * (UMD, EN 1992-1-1:2004, biaxial, 6 ULS cases).
 *
 * Axis mapping — the two engines use the same resultant definitions under a pure relabelling:
 *
 *   UMD  eps(y,z) = eax + kzz*y + kyy*z      Myy = sum F*z   Mzz = sum F*y   N  (compression +)
 *   here eps(x,y) = e0  + ky *x + kx *y      My  = sum F*x   Mx  = sum F*y   P  (compression +)
 *
 *   UMD y -> x        UMD kzz -> ky      UMD Mzz -> My
 *   UMD z -> y        UMD kyy -> kx      UMD Myy -> Mx
 *
 * UMD reports curvature in 1/m and the moment-vector angle as atan2(-Mzz, Myy), i.e. the negative
 * of this engine's atan2(My, Mx). Both are handled explicitly below; nothing is assumed.
 *
 * Run: npx tsx tools/verification/p16/verify.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import {
  buildPreviewSurface,
  evaluatePreparedState,
  intersectFixedPContourWithMomentRay,
  prepareAnalysis,
  previewStationState,
  sliceFixedPContour,
  sliceMomentPlane,
  solveInversePreviewFromPrepared,
  UNIFIED_STATIONS,
  type PreviewSurface,
  type StrainState
} from '@pm/analysis'
import {
  geometryInputRebars,
  netConcreteCentroid,
  sectionGeometryFromGeometryInput,
  type GeometryInput,
  type GeometryInputRebar
} from '@pm/geometry'
import {
  compileConcreteMaterial,
  compileSteelMaterial,
  type MaterialStore,
  type StressStrainPoint
} from '@pm/materials'
import {
  createDefaultAnalysisOptions,
  createLoadCombination,
  createProjectDocument,
  type AnalysisOptions
} from '@pm/project'
import { createEn1992DesignBasis } from '@pm/design'

const ROOT = process.cwd()
const SOURCE = resolve(ROOT, 'docs/examples/reference-case/source/P16_Column_ULS_R _260730_콘크리트 커브 추가수정.md')
const PROJECT_OUT = resolve(ROOT, 'docs/examples/reference-case/projects/P16_Column_ULS.pm-project.json')
const RESULT_OUT = resolve(ROOT, 'docs/examples/reference-case/expected/P16_umd-vs-engine.json')

const KN = 1e3
const KNM = 1e6
const N_TO_KN = 1e-3
const NMM_TO_KNM = 1e-6
const DEG = 180 / Math.PI

// ---------------------------------------------------------------- report parsing
const NUM = String.raw`[-+]?(?:\d+\.?\d*|\.\d+)(?:[Ee][-+]?\d+)?`

const LINES = readFileSync(SOURCE, 'utf8')
  .split(/\r?\n/)
  .map((line) => line.replace(/&#x20;/g, ' ').replace(/\\\[/g, '[').replace(/\\\]/g, ']').replace(/\s+$/, ''))
  .filter((line) => line.trim().length > 0)

const headerIndex = (header: string, from = 0) => {
  for (let i = from; i < LINES.length; i++) if (LINES[i].trim() === header) return i
  throw new Error(`Report section not found: ${header}`)
}

const rowsBetween = (header: string, stop: string) => {
  const start = headerIndex(header)
  const end = headerIndex(stop, start)
  return LINES.slice(start + 1, end)
}

/** 8 section nodes, already in (x, y) after the y->x, z->y relabelling. */
const parseNodes = () => {
  const out: Array<{ node: number; x: number; y: number }> = []
  for (const line of rowsBetween('Section Nodes', 'Bars')) {
    const m = new RegExp(`^\\s*(\\d+)\\s+(${NUM})\\s+(${NUM})\\s*$`).exec(line)
    if (m) out.push({ node: Number(m[1]), x: Number(m[2]), y: Number(m[3]) })
  }
  if (out.length !== 8) throw new Error(`Expected 8 section nodes, parsed ${out.length}`)
  return out
}

const parseBars = (): GeometryInputRebar[] => {
  const out: GeometryInputRebar[] = []
  for (const line of rowsBetween('Bars', 'Elastic Properties')) {
    const m = new RegExp(`^\\s*(\\d+)\\s+(${NUM})\\s+(${NUM})\\s+(${NUM})\\s+(\\S+)\\s+(\\S+)`).exec(line)
    if (m) out.push({ id: Number(m[1]), steelMaterialId: 1, dia: Number(m[4]), x: Number(m[2]), y: Number(m[3]) })
  }
  if (out.length !== 408) throw new Error(`Expected 408 bars, parsed ${out.length}`)
  return out
}

/** `Strength Analysis - Loads`: N, Myy, Mzz, M, theta(UMD). */
const parseStrengthLoads = () => {
  const out: Array<{ id: number; N: number; Myy: number; Mzz: number; M: number; thetaUmd: number }> = []
  for (const line of rowsBetween('Strength Analysis - Loads', 'Strength Analysis - Summary')) {
    const m = new RegExp(`^\\s*(\\d+)\\s+(${NUM})\\s+(${NUM})\\s+(${NUM})\\s+(${NUM})\\s+(${NUM})\\s*$`).exec(line)
    if (m) {
      out.push({
        id: Number(m[1]),
        N: Number(m[2]),
        Myy: Number(m[3]),
        Mzz: Number(m[4]),
        M: Number(m[5]),
        thetaUmd: Number(m[6])
      })
    }
  }
  if (out.length !== 6) throw new Error(`Expected 6 strength load rows, parsed ${out.length}`)
  return out
}

/** `Strength Analysis - Summary`: N, M, Mu, M/Mu, governing, NA angle, NA depth. */
const parseSummary = () => {
  const out: Array<{
    id: number
    N: number
    M: number
    Mu: number
    ratio: number
    governing: string
    naAngle: number
    naDepth: number
  }> = []
  const re = new RegExp(
    `^\\s*(\\d+)\\s+${NUM}\\s+${NUM}\\s+(${NUM})\\s+(${NUM})\\s+(${NUM})\\s+(${NUM})\\s+([A-C]:\\s*\\S+\\s*\\d+)\\s+(${NUM})\\s+(${NUM})\\s*$`
  )
  for (const line of rowsBetween('Strength Analysis - Summary', 'Strength Analysis - Details')) {
    const m = re.exec(line)
    if (m) {
      out.push({
        id: Number(m[1]),
        N: Number(m[2]),
        M: Number(m[3]),
        Mu: Number(m[4]),
        ratio: Number(m[5]),
        governing: m[6].replace(/\s+/g, ' '),
        naAngle: Number(m[7]),
        naDepth: Number(m[8])
      })
    }
  }
  if (out.length !== 6) throw new Error(`Expected 6 summary rows, parsed ${out.length}`)
  return out
}

const DETAIL_LABELS = [
  'Max. compressive strain',
  'Max. tensile strain',
  'Axial strength at M',
  'Balanced yield',
  'Compressive strength at M=0',
  'Bending strength at N=0'
] as const

/** `Strength Analysis - Details`: the P-M diagram anchors, per case plus two section-level rows. */
const parseDetails = () => {
  const sectionLimits: Record<string, { N: number; M: number }> = {}
  const perCase = new Map<number, Record<string, { N: number; M: number }>>()
  let current = 0
  for (const line of rowsBetween('Strength Analysis - Details', 'Strain Planes at ULS Strength')) {
    const label = DETAIL_LABELS.find((item) => line.includes(item))
    if (!label) continue
    const [prefix, suffix] = line.split(label) as [string, string]
    const tokens = prefix.trim().split(/\s+/).filter(Boolean)
    if (label === 'Axial strength at M' && tokens.length === 2) current = Number(tokens[0])
    const values = suffix.match(new RegExp(NUM, 'g')) ?? []
    const entry = { N: Number(values[0] ?? NaN), M: Number(values[1] ?? NaN) }
    if (label === 'Max. compressive strain' || label === 'Max. tensile strain') {
      sectionLimits[label] = entry
      continue
    }
    const bucket = perCase.get(current) ?? {}
    bucket[label] = entry
    perCase.set(current, bucket)
  }
  return { sectionLimits, perCase }
}

/** `Strain Planes at ULS Strength`, `Total (Concrete)` rows. eax [-], kyy/kzz [1/m]. */
const parseStrainPlanes = () => {
  const out = new Map<number, { eax: number; kyy: number; kzz: number }>()
  let current = 0
  const re = new RegExp(
    `^\\s*(\\d+)?\\s+(Reinforcement|User Creep/Shrinkage|Total \\(Concrete\\))\\s+(${NUM})\\s+(${NUM})\\s+(${NUM})\\s*$`
  )
  for (const line of rowsBetween('Strain Planes at ULS Strength', 'Section Material Stresses/Strains at ULS Strength')) {
    const m = re.exec(line)
    if (!m) continue
    if (m[1]) current = Number(m[1])
    if (m[2] === 'Total (Concrete)') {
      out.set(current, { eax: Number(m[3]), kyy: Number(m[4]), kzz: Number(m[5]) })
    }
  }
  if (out.size !== 6) throw new Error(`Expected 6 strain planes, parsed ${out.size}`)
  return out
}

/** Stress/strain tables. `index` is the node number (concrete) or bar number (rebar). */
const parseStressStrain = (header: string, stop: string | null, expected: number) => {
  const start = headerIndex(header)
  const end = stop == null ? LINES.length : headerIndex(stop, start)
  const out: Array<{ caseId: number; index: number; x: number; y: number; strain: number; stress: number }> = []
  const re = new RegExp(`^\\s*(\\d+)\\s+(\\d+)\\s+(${NUM})\\s+(${NUM})\\s+(${NUM})\\s+(${NUM})`)
  for (let i = start + 1; i < end; i++) {
    const trimmed = LINES[i].trim()
    if (trimmed === 'Maxima' || trimmed === 'Minima') break
    const m = re.exec(LINES[i])
    if (m) {
      out.push({
        caseId: Number(m[1]),
        index: Number(m[2]),
        x: Number(m[3]),
        y: Number(m[4]),
        strain: Number(m[5]),
        stress: Number(m[6])
      })
    }
  }
  if (out.length !== expected) throw new Error(`${header}: expected ${expected} rows, parsed ${out.length}`)
  return out
}

/** `ULS Compression Curve` explicit points. Report stress column is Pa. */
const parseConcreteCurve = (): StressStrainPoint[] => {
  const start = headerIndex('Section Material Properties')
  const end = headerIndex('Reinforcement Properties', start)
  const out: StressStrainPoint[] = []
  let inCurve = false
  for (let i = start + 1; i < end; i++) {
    const trimmed = LINES[i].trim()
    if (trimmed.startsWith('ULS Compression Curve')) {
      inCurve = true
      continue
    }
    if (!inCurve) continue
    if (trimmed.startsWith('Strain') && trimmed.includes('Stress')) continue
    const m = new RegExp(`^(${NUM})\\[-\\]\\s+(${NUM})\\s*$`).exec(trimmed)
    if (m) {
      out.push({ strain: Number(m[1]), stress: Number(m[2]) / 1e6 })
      continue
    }
    break
  }
  if (out.length !== 10) throw new Error(`Expected 10 concrete curve points, parsed ${out.length}`)
  return out
}

// ---------------------------------------------------------------- project input
const NODES = parseNodes()
const BARS = parseBars()
const CURVE = parseConcreteCurve()

/** Outer ring = report nodes 1-4, void = nodes 5-8, both already in the (x, y) frame. */
const geometryInput = (): GeometryInput => ({
  id: 1,
  name: 'P16 — UMD hollow rectangular column 4500 x 12000, 650 wall',
  outers: [
    {
      id: 1,
      points: NODES.slice(0, 4).map((node, index) => ({ id: index + 1, x: node.x, y: node.y })),
      holes: [{ id: 1, points: NODES.slice(4, 8).map((node, index) => ({ id: 101 + index, x: node.x, y: node.y })) }]
    }
  ],
  rebars: BARS.map((bar) => ({ ...bar }))
})

/**
 * Materials exactly as declared in the report.
 *
 * The UMD curve is already a design curve — its plateau is 27.62 MPa with gmc,ULS = 1.000 — so it is
 * transcribed point for point as a user curve and analysed at nominal level here. Steel keeps the
 * declared fy = 500 with gms,ULS = 1.111, which this engine applies as fyd = fy/gammaS.
 */
const materialStore = (): MaterialStore => ({
  strainSign: 'compression-positive',
  concrete: {
    id: 1,
    name: 'C50 (UMD explicit ULS curve)',
    standard: 'EC2',
    fck: 50,
    mc: 2400,
    elasticModulus: 37280,
    stressStrain: { type: 'user-curve', points: CURVE.map((point) => ({ ...point })), interpolation: 'linear', zeroTension: true },
    limits: { eps0: 0.0021, epsCu: 0.0032, ignoreTension: true },
    factors: { gammaC: 1 }
  },
  steel: [
    {
      id: 1,
      name: 'FY500 (UMD)',
      standard: 'EC2',
      fy: 500,
      elasticModulus: 200000,
      stressStrain: { type: 'elastic-perfectly-plastic' },
      limits: { epsU: 0.05 },
      factors: { gammaS: 1.111 }
    }
  ],
  defaults: { steelMaterialId: 1 }
})

const STRENGTH_LOADS = parseStrengthLoads()
const SUMMARY = parseSummary()
const DETAILS = parseDetails()
const PLANES = parseStrainPlanes()
const CONC_SS = parseStressStrain('Section Material Stresses/Strains at ULS Strength', 'Reinforcement Stresses/Strains at ULS Strength', 48)
const REBAR_SS = parseStressStrain('Reinforcement Stresses/Strains at ULS Strength', null, 2448)

const loadings = () => ({
  combinations: STRENGTH_LOADS.map((load) =>
    createLoadCombination({
      id: load.id,
      name: `Load Case ${load.id} (UMD)`,
      P: load.N * KN,
      Mx: load.Myy * KNM,
      My: load.Mzz * KNM
    })
  )
})

const GEOMETRY = geometryInput()
const MATERIALS = materialStore()
const SECTION = sectionGeometryFromGeometryInput(GEOMETRY)
const REBARS = geometryInputRebars(GEOMETRY)

const document = createProjectDocument({
  geometry: GEOMETRY,
  materials: MATERIALS,
  loadings: loadings(),
  design: createEn1992DesignBasis(),
  meta: { id: 1, name: 'P16 Column ULS — UMD verification case', createdAt: '2026-07-30T00:00:00.000Z' }
})
mkdirSync(dirname(PROJECT_OUT), { recursive: true })
writeFileSync(PROJECT_OUT, `${JSON.stringify(document, null, 2)}\n`, 'utf8')

// ---------------------------------------------------------------- run the engine
const PREPARED = prepareAnalysis(SECTION, REBARS, MATERIALS)
const ORIGIN = PREPARED.origin
const CONCRETE = compileConcreteMaterial(MATERIALS.concrete)
const STEEL = compileSteelMaterial(MATERIALS.steel[0])
const FYD = MATERIALS.steel[0].fy / (MATERIALS.steel[0].factors?.gammaS ?? 1)

const withDirections = (count: number): AnalysisOptions => {
  const options = createDefaultAnalysisOptions()
  options.directions.seed = { type: 'uniform', count, startDeg: 0 }
  return options
}

const surface24 = buildPreviewSurface(SECTION, REBARS, MATERIALS, {}, withDirections(24))
const surface96 = buildPreviewSurface(SECTION, REBARS, MATERIALS, {}, withDirections(96))
const surface360 = buildPreviewSurface(SECTION, REBARS, MATERIALS, {}, withDirections(360))

/** UMD strain plane -> engine strain state. Curvature 1/m -> 1/mm; eax is already centroidal. */
const engineState = (plane: { eax: number; kyy: number; kzz: number }): StrainState => ({
  e0: plane.eax,
  kx: plane.kyy / 1000,
  ky: plane.kzz / 1000
})

const strainAt = (state: StrainState, x: number, y: number) =>
  state.e0 + state.kx * (y - ORIGIN.y) + state.ky * (x - ORIGIN.x)

/** Neutral-axis geometry of a strain plane, in the report's own conventions. */
const neutralAxis = (state: StrainState) => {
  const curvature = Math.hypot(state.kx, state.ky)
  let peak = -Infinity
  for (const point of PREPARED.concreteBoundary) {
    peak = Math.max(peak, state.e0 + state.kx * point.y + state.ky * point.x)
  }
  let angle = (Math.atan2(state.kx, state.ky) * DEG) - 90
  while (angle <= -180) angle += 180
  while (angle > 180) angle -= 180
  return { angleDeg: angle, depth: curvature > 0 ? peak / curvature : Infinity, peakStrain: peak, curvature }
}

const scaleResultant = (value: { P: number; Mx: number; My: number }) => ({
  P: value.P * N_TO_KN,
  Mx: value.Mx * NMM_TO_KNM,
  My: value.My * NMM_TO_KNM
})

/** Poles of the nominal surface: pure compression and pure tension. */
const poles = (surface: PreviewSurface) => {
  const compression = surface.nominalPoints.find((point) => point.stationId === 'pure-compression')!
  const tension = surface.nominalPoints.find((point) => point.stationId === 'pure-tension')!
  return { pureCompression: scaleResultant(compression), pureTension: scaleResultant(tension) }
}

/** Capacity in the demand's moment direction at fixed P, i.e. the UMD `Mu` definition. */
const capacityAtFixedP = (surface: PreviewSurface, P: number, theta: number) => {
  const contour = sliceFixedPContour(surface.nominalPoints, P)
  const hit = intersectFixedPContourWithMomentRay(contour, theta)
  return hit == null ? null : { Mu: hit.M * NMM_TO_KNM, Mx: hit.Mx * NMM_TO_KNM, My: hit.My * NMM_TO_KNM, contourPoints: contour.length }
}

const EPS_CU = MATERIALS.concrete.limits.epsCu
const EPS_Y = FYD / MATERIALS.steel[0].elasticModulus

/** Wrap to (-pi, pi]. */
const wrap = (angle: number) => {
  let value = angle
  while (value <= -Math.PI) value += 2 * Math.PI
  while (value > Math.PI) value -= 2 * Math.PI
  return value
}

/**
 * Capacity in the demand's moment direction at fixed P, solved directly on the fibre model:
 * bisect the moment magnitude until the equilibrium strain plane's peak concrete compression sits
 * exactly on epsCu. This is the same limit state UMD reports (governing condition B) and it uses no
 * surface sampling at all, so it isolates the constitutive model from the P-M-M discretisation.
 */
const exactCapacityAtFixedP = (P: number, theta: number, seed: number) => {
  const peakAt = (M: number) => {
    const solved = solveInversePreviewFromPrepared(
      PREPARED,
      createLoadCombination({ id: 1, name: 'probe', P, Mx: M * Math.cos(theta), My: M * Math.sin(theta) }),
      []
    )
    return solved.converged ? { peak: solved.admissibility.maxConcreteCompression, state: solved.state } : null
  }
  let low = seed * 0.5
  let high = seed * 1.5
  const lowProbe = peakAt(low)
  if (!lowProbe || lowProbe.peak > EPS_CU) return null
  let guard = 0
  while (guard++ < 40) {
    const probe = peakAt(high)
    if (probe && probe.peak < EPS_CU) high *= 1.25
    else break
  }
  let state = lowProbe.state
  for (let i = 0; i < 80; i++) {
    const mid = 0.5 * (low + high)
    const probe = peakAt(mid)
    if (!probe) {
      high = mid
      continue
    }
    if (probe.peak <= EPS_CU) {
      low = mid
      state = probe.state
    } else {
      high = mid
    }
  }
  const ledger = evaluatePreparedState(PREPARED, state)
  return {
    Mu: low * NMM_TO_KNM,
    P: ledger.total.P * N_TO_KN,
    state,
    ...neutralAxis(state)
  }
}

/**
 * Axial strength at a fixed moment: bisect P upward from the demand until the equilibrium plane's
 * peak concrete compression reaches epsCu. This is the upper (compression) branch, which is the one
 * UMD reports for these cases.
 */
const exactAxialStrengthAtM = (M: number, theta: number, fromP: number, toP: number) => {
  const peakAt = (P: number) => {
    const solved = solveInversePreviewFromPrepared(
      PREPARED,
      createLoadCombination({ id: 1, name: 'probe', P, Mx: M * Math.cos(theta), My: M * Math.sin(theta) }),
      []
    )
    return solved.converged ? solved.admissibility.maxConcreteCompression : null
  }
  const start = peakAt(fromP)
  if (start == null || start > EPS_CU) return null
  let low = fromP
  let high = toP
  for (let i = 0; i < 90; i++) {
    const mid = 0.5 * (low + high)
    const peak = peakAt(mid)
    if (peak != null && peak <= EPS_CU) low = mid
    else high = mid
  }
  return low * N_TO_KN
}

/**
 * Balanced yield exactly as UMD defines it: the extreme tension bar at fs = fyd while the extreme
 * compression fibre sits at epsCu. That is the `εₛ/εy = 1` station of the shared schedule, so the
 * only thing to solve is which strain-plane direction beta puts the resulting moment vector on the
 * checked moment plane theta.
 */
const exactBalancedYield = (theta: number) => {
  const yieldStation = UNIFIED_STATIONS.findIndex(
    (station) => station.kind === 'bar-tension-yield-ratio' && station.ratio === 1
  )
  if (yieldStation < 0) throw new Error('The unified schedule is missing εₛ/εy = 1.')
  const at = (beta: number) => {
    const state = previewStationState(
      SECTION,
      REBARS,
      beta,
      yieldStation,
      EPS_CU,
      { epsY: EPS_Y, epsU: 0.05 },
      ORIGIN
    )
    const total = evaluatePreparedState(PREPARED, state).total
    return { state, total, angle: Math.atan2(total.My, total.Mx) }
  }
  const residual = (beta: number) => wrap(at(beta).angle - theta)
  let low = theta - Math.PI / 2
  let high = theta + Math.PI / 2
  let fLow = residual(low)
  let fHigh = residual(high)
  if (!(fLow <= 0 && fHigh >= 0) && !(fLow >= 0 && fHigh <= 0)) return null
  for (let i = 0; i < 100; i++) {
    const mid = 0.5 * (low + high)
    const fMid = residual(mid)
    if ((fLow <= 0 && fMid <= 0) || (fLow >= 0 && fMid >= 0)) {
      low = mid
      fLow = fMid
    } else {
      high = mid
      fHigh = fMid
    }
  }
  const solution = at(0.5 * (low + high))
  return {
    betaDeg: 0.5 * (low + high) * DEG,
    P: solution.total.P * N_TO_KN,
    M: Math.hypot(solution.total.Mx, solution.total.My) * NMM_TO_KNM,
    angleDeg: solution.angle * DEG
  }
}

/** Bending strength at P = 0 and the peak-moment point, read off the moment-plane section. */
const momentPlaneAnchors = (surface: PreviewSurface, theta: number) => {
  const paths = sliceMomentPlane(surface.nominalPoints, theta)
  const points = paths.flatMap((path) => path.points).filter((point) => point.M >= 0)
  if (points.length === 0) return null
  let peak = points[0]
  for (const point of points) if (point.M > peak.M) peak = point
  let bendingAtZeroP: number | null = null
  for (const path of paths) {
    for (let i = 0; i + 1 < path.points.length; i++) {
      const a = path.points[i]
      const b = path.points[i + 1]
      if ((a.P > 0 && b.P > 0) || (a.P < 0 && b.P < 0)) continue
      if (a.P === b.P) continue
      const t = (0 - a.P) / (b.P - a.P)
      const M = a.M + (b.M - a.M) * t
      if (M > 0 && (bendingAtZeroP == null || M > bendingAtZeroP)) bendingAtZeroP = M
    }
  }
  return {
    bendingAtZeroP: bendingAtZeroP == null ? null : bendingAtZeroP * NMM_TO_KNM,
    peakMomentP: peak.P * N_TO_KN,
    peakMomentM: peak.M * NMM_TO_KNM,
    /** The P-M envelope on this moment plane, ordered head to tail per connected path. */
    paths: paths.map((path) => ({
      closed: path.closed,
      points: path.points.map((point) => ({ P: point.P * N_TO_KN, M: point.M * NMM_TO_KNM }))
    }))
  }
}

const cases = STRENGTH_LOADS.map((load) => {
  const summary = SUMMARY.find((row) => row.id === load.id)!
  const detail = DETAILS.perCase.get(load.id) ?? {}
  const umdPlane = PLANES.get(load.id)!
  const demandMx = load.Myy * KNM
  const demandMy = load.Mzz * KNM
  const theta = Math.atan2(demandMy, demandMx)

  // 1. Engine resultant evaluated at UMD's own ULS strain plane. Mesh-level, no surface sampling.
  const state = engineState(umdPlane)
  const ledger = evaluatePreparedState(PREPARED, state)
  const total = scaleResultant(ledger.total)
  const atPlaneM = Math.hypot(total.Mx, total.My)

  // 2. Engine capacity from its own surface, at UMD's definition of Mu.
  const cap24 = capacityAtFixedP(surface24, load.N * KN, theta)
  const cap96 = capacityAtFixedP(surface96, load.N * KN, theta)
  const cap360 = capacityAtFixedP(surface360, load.N * KN, theta)
  const capExact = exactCapacityAtFixedP(load.N * KN, theta, summary.Mu * KNM)
  const balanced = exactBalancedYield(theta)
  const bendingAtZeroP = exactCapacityAtFixedP(0, theta, (detail['Bending strength at N=0']?.M ?? 250000) * KNM)
  const axialAtM = exactAxialStrengthAtM(load.M * KNM, theta, load.N * KN, 0.999 * 659611 * KN)

  // 3. Engine strain plane at its own capacity point, for the neutral-axis comparison.
  const target = cap360 ?? cap96 ?? cap24
  let enginePlane: ReturnType<typeof neutralAxis> & { e0: number; kx: number; ky: number; ok: boolean; converged: boolean } | null = null
  if (target) {
    const solved = solveInversePreviewFromPrepared(
      PREPARED,
      createLoadCombination({
        id: load.id,
        name: `capacity-${load.id}`,
        P: load.N * KN,
        Mx: (target.Mu * Math.cos(theta)) * KNM,
        My: (target.Mu * Math.sin(theta)) * KNM
      }),
      []
    )
    enginePlane = {
      ...neutralAxis(solved.state),
      e0: solved.state.e0,
      kx: solved.state.kx,
      ky: solved.state.ky,
      ok: solved.ok,
      converged: solved.converged
    }
  }

  return {
    id: load.id,
    demand: { N: load.N, Myy: load.Myy, Mzz: load.Mzz, M: load.M, thetaUmdDeg: load.thetaUmd, thetaEngineDeg: theta * DEG },
    umd: {
      Mu: summary.Mu,
      ratio: summary.ratio,
      governing: summary.governing,
      naAngleDeg: summary.naAngle,
      naDepth: summary.naDepth,
      plane: umdPlane,
      bendingAtZeroP: detail['Bending strength at N=0']?.M ?? null,
      balancedP: detail['Balanced yield']?.N ?? null,
      balancedM: detail['Balanced yield']?.M ?? null,
      axialStrengthAtM: detail['Axial strength at M']?.N ?? null
    },
    engineAtUmdPlane: {
      P: total.P,
      Mx: total.Mx,
      My: total.My,
      M: atPlaneM,
      thetaDeg: Math.atan2(total.My, total.Mx) * DEG,
      concreteP: ledger.concrete.P * N_TO_KN,
      steelP: ledger.steel.P * N_TO_KN,
      ...neutralAxis(state)
    },
    engineCapacity: { d24: cap24, d96: cap96, d360: cap360, exact: capExact },
    engineRatio: {
      d24: cap24 ? load.M / cap24.Mu : null,
      d96: cap96 ? load.M / cap96.Mu : null,
      d360: cap360 ? load.M / cap360.Mu : null,
      exact: capExact ? load.M / capExact.Mu : null
    },
    engineBalancedYield: balanced,
    engineExactAnchors: {
      bendingAtZeroP: bendingAtZeroP?.Mu ?? null,
      axialStrengthAtM: axialAtM
    },
    engineAnchors: {
      d96: momentPlaneAnchors(surface96, theta),
      d360: momentPlaneAnchors(surface360, theta)
    },
    enginePlane
  }
})

// ---------------------------------------------------------------- point-level fields
const concretePoints = CONC_SS.map((row) => {
  const state = engineState(PLANES.get(row.caseId)!)
  const strain = strainAt(state, row.x, row.y)
  return {
    caseId: row.caseId,
    node: row.index,
    x: row.x,
    y: row.y,
    umdStrain: row.strain,
    umdStress: row.stress,
    engineStrain: strain,
    engineStress: CONCRETE.stress(strain)
  }
})

const rebarPoints = REBAR_SS.map((row) => {
  const state = engineState(PLANES.get(row.caseId)!)
  const strain = strainAt(state, row.x, row.y)
  return {
    caseId: row.caseId,
    bar: row.index,
    x: row.x,
    y: row.y,
    umdStrain: row.strain,
    umdStress: row.stress,
    engineStrain: strain,
    engineStress: STEEL.stress(strain)
  }
})

// ---------------------------------------------------------------- emit
const surfaceSummary = (surface: PreviewSurface, label: string) => ({
  label,
  directions: surface.directions.length,
  stations: surface.stations.length,
  poles: poles(surface),
  directionError: surface.directionError,
  warnings: surface.warnings
})

const result = {
  meta: {
    source: 'docs/examples/reference-case/source/P16_Column_ULS_R _260730_콘크리트 커브 추가수정.md',
    projectInput: 'docs/examples/reference-case/projects/P16_Column_ULS.pm-project.json',
    generatedAt: new Date().toISOString(),
    strainDomain: surface24.strainDomain,
    designBasisNote:
      'UMD material curves are already design-level (gmc,ULS = 1.000 with a 27.62 MPa plateau, fyd = fy/1.111). ' +
      'This engine is therefore run at NOMINAL level on those same curves, so both sides are the same resistance level.',
    fyd: FYD,
    origin: ORIGIN,
    netCentroid: netConcreteCentroid(SECTION)
  },
  mesh: {
    cells: PREPARED.mesh.report.cells,
    triangles: PREPARED.mesh.report.triangles,
    points: PREPARED.mesh.report.points,
    cellSize: PREPARED.mesh.report.cellSize,
    meshedArea: PREPARED.mesh.report.meshed.area,
    exactArea: PREPARED.mesh.report.exact.area,
    warnings: PREPARED.mesh.report.warnings
  },
  umdSectionLimits: DETAILS.sectionLimits,
  surfaces: [surfaceSummary(surface24, '24 directions (default)'), surfaceSummary(surface96, '96 directions'), surfaceSummary(surface360, '360 directions')],
  cases,
  concretePoints,
  rebarPoints
}

writeFileSync(RESULT_OUT, `${JSON.stringify(result, null, 1)}\n`, 'utf8')

console.log(`project input  -> ${PROJECT_OUT}`)
console.log(`comparison     -> ${RESULT_OUT}`)
console.log(`mesh           : ${PREPARED.mesh.report.cells} cells, ${PREPARED.mesh.report.points} integration points, h = ${PREPARED.mesh.report.cellSize.toFixed(2)} mm`)
console.log(`origin         : (${ORIGIN.x}, ${ORIGIN.y})  fyd = ${FYD.toFixed(3)} MPa`)
for (const surface of result.surfaces) {
  console.log(
    `${surface.label.padEnd(24)} P0 = ${surface.poles.pureCompression.P.toFixed(0).padStart(8)} kN   ` +
      `P${UNIFIED_STATIONS.length - 1} = ${surface.poles.pureTension.P.toFixed(0).padStart(8)} kN`
  )
}
console.log()
console.log('case   N(kN)   UMD Mu    eng@plane M   eng Mu(24)  eng Mu(96)  eng Mu(360)   eng Mu(exact)')
for (const item of cases) {
  console.log(
    `${String(item.id).padStart(3)} ${item.demand.N.toFixed(0).padStart(9)} ${item.umd.Mu.toFixed(0).padStart(9)} ` +
      `${item.engineAtUmdPlane.M.toFixed(0).padStart(13)} ${(item.engineCapacity.d24?.Mu ?? NaN).toFixed(0).padStart(11)} ` +
      `${(item.engineCapacity.d96?.Mu ?? NaN).toFixed(0).padStart(11)} ${(item.engineCapacity.d360?.Mu ?? NaN).toFixed(0).padStart(11)} ` +
      `${(item.engineCapacity.exact?.Mu ?? NaN).toFixed(0).padStart(11)}`
  )
}
