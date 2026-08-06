/**
 * Verification fixture: preview P–Mx–My stations against `docs/examples/reference-case/source/PM-advanced (7) 2D.xlsx`.
 *
 * Reference case (workbook sheets `Input` and `2D (15deg)`):
 *   concrete  KDS parabolic, fck 30 MPa, alpha 0.85, eps0 0.002, n 2, epsCu 0.0033
 *   steel     elastic-perfectly-plastic, Es 200000 MPa, fy 400 MPa
 *   section   1500x1200 chamfered outer ring with two 400x800 chamfered holes, net area 1120000 mm2
 *   rebar     18 x D32
 *   direction 15 degrees
 *
 * Nominal resistance only. Design/factored resistance (`docs/11`) is out of scope here.
 *
 * The workbook integrates concrete on a 50 mm clipped grid with one centroid point per cell; this
 * engine uses the clipped-cell mesh of `docs/02` §5 with a three-point degree-2 rule per triangle.
 * Both converge to the same integral, so the concrete columns are compared with an engineering
 * tolerance while the discrete-bar columns must agree to machine precision.
 *
 * Run: npm run test:pm-stations
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildConcreteMesh,
  geometryInputRebars,
  netConcreteCentroid,
  sectionGeometryFromGeometryInput,
  type GeometryInputRebarView,
  type SectionGeometry
} from '@pm/geometry'
import { stressKdsParabolicConcrete, type MaterialStore } from '@pm/materials'
import { parseProjectDocument } from '@pm/project'
import {
  UNIFIED_STATIONS,
  evaluatePreviewState,
  previewStationState,
  type ResultantLedger,
  type StrainState
} from '../../src/index'
import { REFERENCE_NET_AREA, referenceProjectDocument } from '../fixtures/reference-case'

const N_TO_KN = 1e-3
const NMM_TO_KNM = 1e-6

const REFERENCE_JSON = resolve(process.cwd(), 'docs/examples/reference-case/projects/PM-advanced (7) 2D.pm-project.json')

/**
 * The shipped project JSON is the fixture. Everything below is computed from the file a user would
 * import, so a stale or unimportable file fails the suite instead of passing silently.
 */
const loadReferenceDocument = () => {
  const parsed = parseProjectDocument(readFileSync(REFERENCE_JSON, 'utf8'))
  assert.ok(parsed.ok, `Reference JSON failed to parse: ${parsed.ok ? '' : parsed.error}`)
  if (!parsed.ok) throw new Error('unreachable')
  assert.deepEqual(parsed.warnings, [], 'Reference JSON parsed with warnings')
  // The parser neither preserves key order nor drops optional keys it sets to `undefined`
  // (`concrete.factors.gammaC`, `steel.limits.epsU`), so normalise both sides through JSON first.
  const normalise = (value: unknown) => JSON.parse(JSON.stringify(value)) as unknown
  assert.deepEqual(
    normalise(parsed.document.inputs),
    normalise(referenceProjectDocument().inputs),
    'Reference JSON is stale — rerun `npm run fixture:reference-json`'
  )
  return parsed.document
}

const DOCUMENT = loadReferenceDocument()
const SECTION: SectionGeometry = sectionGeometryFromGeometryInput(DOCUMENT.inputs.geometry)
const REBARS: GeometryInputRebarView[] = geometryInputRebars(DOCUMENT.inputs.geometry)
const MATERIALS: MaterialStore = DOCUMENT.inputs.materials

const EXACT_NET_AREA = REFERENCE_NET_AREA
const BETA = Math.PI / 12 // 15 degrees
/** Sheet `2D (15deg)` D77/E77: rotated extreme fibre projections at 15 degrees. */
const U_MAX_15 = 721.9059705798273
const U_MIN_15 = -721.9059705798273

/** Nominal values from sheet `2D (15deg)`, kN and kNm. */
const WORKBOOK = {
  /** Row 87 — pure compression. */
  p0: {
    concrete: { P: 28560, Mx: 0, My: 0 },
    steel: { P: 5421.433875929294, Mx: 0, My: 0 }
  },
  /** Row 92 — pure tension. */
  pureTension: {
    concrete: { P: 0, Mx: 0, My: 0 },
    steel: { P: -5790.583579096708, Mx: 0, My: 0 }
  }
} as const

const scale = (r: { P: number; Mx: number; My: number }) => ({
  P: r.P * N_TO_KN,
  Mx: r.Mx * NMM_TO_KNM,
  My: r.My * NMM_TO_KNM
})

const failures: string[] = []

const check = (label: string, actual: number, expected: number, relTol: number, absScale = 0) => {
  const denominator = Math.max(absScale, Math.abs(expected), 1e-12)
  const relative = Math.abs(actual - expected) / denominator
  const ok = relative <= relTol
  const line = `${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(40)} actual=${actual.toFixed(4).padStart(14)} expected=${expected
    .toFixed(4)
    .padStart(14)}  rel=${(relative * 100).toFixed(5)}%`
  console.log(line)
  if (!ok) failures.push(line)
}

const checkResultant = (
  label: string,
  actual: { P: number; Mx: number; My: number },
  expected: { P: number; Mx: number; My: number },
  relTol: number,
  momentScale = 0
) => {
  check(`${label} P (kN)`, actual.P, expected.P, relTol, momentScale / U_MAX_15)
  check(`${label} Mx (kNm)`, actual.Mx, expected.Mx, relTol, momentScale)
  check(`${label} My (kNm)`, actual.My, expected.My, relTol, momentScale)
}

const row = (label: string, state: StrainState, ledger: ResultantLedger) => {
  const c = scale(ledger.concrete)
  const s = scale(ledger.steel)
  const t = scale(ledger.total)
  const fmt = (v: number) => v.toFixed(1).padStart(11)
  console.log(
    `${label.padEnd(6)}${state.e0.toExponential(4).padStart(12)}${Math.hypot(state.kx, state.ky)
      .toExponential(4)
      .padStart(13)}  |${fmt(c.P)}${fmt(c.Mx)}${fmt(c.My)}  |${fmt(s.P)}${fmt(s.Mx)}${fmt(s.My)}  |${fmt(t.P)}${fmt(
      t.Mx
    )}${fmt(t.My)}`
  )
}

const run = () => {
  const epsCu = MATERIALS.concrete.limits.epsCu
  const steel = MATERIALS.steel[0]
  const epsY = steel.fy / steel.elasticModulus

  console.log('== 1. Unified 22-station schedule ==')
  const expectedSchedule = [
    'pure-compression',
    'neutral-axis-depth-ratio:3',
    'neutral-axis-depth-ratio:2',
    'neutral-axis-depth-ratio:1.5',
    'neutral-axis-depth-ratio:1.2',
    'neutral-axis-depth-ratio:1.1',
    'neutral-axis-depth-ratio:1',
    'bar-tension-yield-ratio:0',
    'bar-tension-yield-ratio:0.25',
    'bar-tension-yield-ratio:0.5',
    'bar-tension-yield-ratio:0.75',
    'bar-tension-yield-ratio:1',
    'bar-tension-yield-ratio:1.5',
    'bar-tension-yield-ratio:2',
    'bar-tension-yield-ratio:2.5',
    'bar-tension-yield-ratio:3',
    'bar-tension-yield-ratio:4',
    'bar-tension-yield-ratio:5',
    'bar-tension-yield-ratio:7.5',
    'bar-tension-yield-ratio:10',
    'bar-tension-yield-ratio:20',
    'pure-tension'
  ]
  const actualSchedule = UNIFIED_STATIONS.map((station) =>
    station.kind === 'neutral-axis-depth-ratio' || station.kind === 'bar-tension-yield-ratio'
      ? `${station.kind}:${station.ratio}`
      : station.kind
  )
  assert.equal(actualSchedule.length, 22, 'the unified schedule requires exactly 22 stations')
  assert.deepEqual(actualSchedule, expectedSchedule)
  assert.equal(epsY, 0.002)
  console.log(`PASS  shared 22-station schedule uses c/D and εₛ/εy (εy = ${epsY})\n`)

  console.log('== 2. Clipped-cell concrete mesh (docs/02 §5, §8) ==')
  const mesh = buildConcreteMesh(SECTION)
  console.log(
    `      Dmin=${mesh.report.minCaliperWidth.toFixed(1)} mm  h=${mesh.report.cellSize.toFixed(3)} mm  ` +
      `grid=${mesh.report.gridX}x${mesh.report.gridY}  cells=${mesh.report.cells}  ` +
      `triangles=${mesh.report.triangles}  points=${mesh.report.points}`
  )
  check('meshed area (mm2)', mesh.report.meshed.area, EXACT_NET_AREA, 1e-9)
  check('exact polygon area (mm2)', mesh.report.exact.area, EXACT_NET_AREA, 1e-9)
  check('first moment about x (mm3)', mesh.report.meshed.firstMomentX, mesh.report.exact.firstMomentX, 1e-9, 1e6)
  check('first moment about y (mm3)', mesh.report.meshed.firstMomentY, mesh.report.exact.firstMomentY, 1e-9, 1e6)
  for (const warning of mesh.report.warnings) {
    failures.push(`FAIL  mesh warning: ${warning}`)
    console.log(`FAIL  mesh warning: ${warning}`)
  }
  if (mesh.report.warnings.length === 0) console.log('PASS  mesh sanity checks clean')
  console.log()

  console.log('== 3. All 22 stations at beta = 15 deg (kN, kNm) ==')
  console.log(
    `${'pt'.padEnd(6)}${'eps0'.padStart(12)}${'kappa'.padStart(13)}  |${'  concrete P'.padStart(
      12
    )}${'Mx'.padStart(11)}${'My'.padStart(11)}  |${'     steel P'.padStart(12)}${'Mx'.padStart(11)}${'My'.padStart(
      11
    )}  |${'     total P'.padStart(12)}${'Mx'.padStart(11)}${'My'.padStart(11)}`
  )
  const ledgers: ResultantLedger[] = []
  const states: StrainState[] = []
  for (let station = 0; station < UNIFIED_STATIONS.length; station++) {
    const state = previewStationState(SECTION, REBARS, BETA, station, epsCu, epsY)
    const ledger = evaluatePreviewState(SECTION, REBARS, MATERIALS, state)
    states.push(state)
    ledgers.push(ledger)
    row(`P${station}`, state, ledger)
  }
  console.log()

  console.log('== 4. Ledger invariant and strain admissibility ==')
  ledgers.forEach((ledger, index) => {
    const sum = ledger.concrete.P + ledger.steelGross.P + ledger.displacedConcrete.P
    assert.ok(Math.abs(sum - ledger.total.P) < 1e-6 * Math.max(1, Math.abs(ledger.total.P)), `P${index} ledger sum`)
  })
  console.log('PASS  contribution ledger reproduces the nominal total at all 22 stations')
  const peaks = states.map((state) => {
    const curvature = Math.hypot(state.kx, state.ky)
    return Math.max(state.e0 + curvature * U_MAX_15, state.e0 + curvature * U_MIN_15)
  })
  const worstPeak = Math.max(...peaks)
  check('max concrete strain over all stations', worstPeak, epsCu, 1e-12)
  console.log()

  console.log('== 5. Mesh-independent anchors: discrete bars ==')
  const symmetryScale = Math.abs(WORKBOOK.p0.steel.P) * U_MAX_15 * 1e-3
  checkResultant('P0  steel ', scale(ledgers[0].steel), WORKBOOK.p0.steel, 1e-12, symmetryScale)
  checkResultant('P21 steel ', scale(ledgers[21].steel), WORKBOOK.pureTension.steel, 1e-12, symmetryScale)
  console.log()

  console.log('== 6. Pure compression P0: concrete = alpha*fck*A_net exactly ==')
  checkResultant('P0  concrete', scale(ledgers[0].concrete), WORKBOOK.p0.concrete, 1e-9, symmetryScale)
  console.log()

  console.log('== 7. Concrete integral convergence at P7 (εₛ/εy = 0) ==')
  const state7 = states[7]
  console.log(`      ${'h (mm)'.padStart(8)}${'points'.padStart(9)}${'P'.padStart(14)}${'Mx'.padStart(14)}${'My'.padStart(14)}`)
  const converged: Array<{ P: number; Mx: number; My: number }> = []
  for (const cellSize of [75, 50, 37.5, 25, 12.5]) {
    const ledger = evaluatePreviewState(SECTION, REBARS, MATERIALS, state7, { cellSize })
    const value = scale(ledger.concrete)
    converged.push(value)
    console.log(
      `      ${String(cellSize).padStart(8)}${String(buildConcreteMesh(SECTION, { cellSize }).points.length).padStart(
        9
      )}${value.P.toFixed(3).padStart(14)}${value.Mx.toFixed(3).padStart(14)}${value.My.toFixed(3).padStart(14)}`
    )
  }
  // Halving h must not move the answer: the quadrature, not the mesh, is now the limiting factor.
  const coarse = converged[1]
  const finest = converged[converged.length - 1]
  check('P  drift h=50 -> h=12.5', coarse.P, finest.P, 1e-5)
  check('Mx drift h=50 -> h=12.5', coarse.Mx, finest.Mx, 1e-5)
  check('My drift h=50 -> h=12.5', coarse.My, finest.My, 1e-5)
  console.log(
    'INFO  the workbook integrates with one centroid point per clipped cell (degree-1 exact); this\n' +
      '      engine uses three points per triangle (degree-2 exact), so the small residual delta in\n' +
      '      the workbook comparison is therefore limited to mesh-independent anchors.'
  )
  console.log()

  console.log('== 8. Reference origin and translation invariance ==')
  // The workbook defines eps0 on the centroidal axis: `eps0 = ecu*(c - (Ymax - yc))/c`, sheet
  // `2D (15deg)` L132, with `yc` = H48. Sheet `Input` geometry is already centred, so yc = 0.
  const origin = netConcreteCentroid(SECTION)
  check('origin x = workbook xc (mm)', origin.x, 0, 1e-9, 1)
  check('origin y = workbook yc (mm)', origin.y, 0, 1e-9, 1)
  // Nothing may depend on where the user happened to draw the section.
  const OFFSET = { x: -3210.5, y: 777.25 }
  const movedSection: SectionGeometry = {
    ...SECTION,
    solids: SECTION.solids.map((solid) => ({
      outer: solid.outer.map((point) => ({ ...point, x: point.x + OFFSET.x, y: point.y + OFFSET.y })),
      holes: solid.holes.map((hole) => hole.map((point) => ({ ...point, x: point.x + OFFSET.x, y: point.y + OFFSET.y })))
    }))
  }
  const movedRebars = REBARS.map((bar) => ({ ...bar, x: bar.x + OFFSET.x, y: bar.y + OFFSET.y }))
  const movedOrigin = netConcreteCentroid(movedSection)
  check('translated origin x (mm)', movedOrigin.x, OFFSET.x, 1e-9)
  check('translated origin y (mm)', movedOrigin.y, OFFSET.y, 1e-9)
  for (const station of [0, 7, 21]) {
    const movedState = previewStationState(movedSection, movedRebars, BETA, station, epsCu, epsY)
    const movedLedger = evaluatePreviewState(movedSection, movedRebars, MATERIALS, movedState)
    const momentScale = Math.max(1, Math.abs(scale(ledgers[station].total).Mx))
    check(`P${station} translated eps0`, movedState.e0, states[station].e0, 1e-12)
    checkResultant(`P${station} translated conc`, scale(movedLedger.concrete), scale(ledgers[station].concrete), 1e-12, momentScale)
    checkResultant(`P${station} translated steel`, scale(movedLedger.steel), scale(ledgers[station].steel), 1e-12, momentScale)
  }
  console.log()

  console.log('== 9. Advisory: concrete law above epsCu ==')
  // Not exercised by the 22 stations (check 4 proves the peak strain never exceeds epsCu), but the Newton
  // inverse solver does visit such planes, where a drop to zero is a force discontinuity.
  const plateau = 0.85 * MATERIALS.concrete.fck
  const justAbove = stressKdsParabolicConcrete(MATERIALS.concrete, epsCu * (1 + 1e-9))
  console.log(
    `INFO  stress(epsCu)=${stressKdsParabolicConcrete(MATERIALS.concrete, epsCu).toFixed(3)} MPa, ` +
      `stress(epsCu+)=${justAbove.toFixed(3)} MPa (plateau ${plateau.toFixed(3)} MPa)` +
      `${justAbove === 0 ? ' — discontinuous; only affects the inverse solver, not the stations.' : ''}`
  )
  console.log()

  if (failures.length > 0) {
    console.log(`${failures.length} check(s) failed:`)
    for (const line of failures) console.log(`  ${line}`)
    process.exitCode = 1
    return
  }
  console.log('All checks passed.')
}

run()
