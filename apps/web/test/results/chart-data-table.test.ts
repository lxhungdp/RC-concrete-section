import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  activeDesignSurfaceDataset,
  buildDesignPreviewSurface,
  contourStrainAngleSamples,
  sliceFixedPContour,
  type LoadDirectionCurve,
  type LoadDirectionPoint,
  type PreviewSurface,
  type PreviewSurfacePoint,
  type SurfaceStation
} from '@pm/analysis'
import { geometryInputRebars, sectionGeometryFromGeometryInput } from '@pm/geometry'
import {
  analysisMeshKernelOptions,
  createDefaultAnalysisOptions,
  parseProjectDocument
} from '@pm/project'
/*
 * Keep the light synthetic fixtures above for table semantics, then use one real capped surface
 * below to guard the many-points-at-one-beta identity that originally regressed.
 */
import {
  betweenStationsShortLabel,
  buildChartTableRows,
  resolveChartTableRowSelection
} from '../../features/section-editor/results/chart-data-table'

const normalizeAngleDeg = (degrees: number) => ((degrees % 360) + 360) % 360

const ledger = (P: number, Mx: number, My: number) => ({
  concrete: { P, Mx, My },
  steelGross: { P: 0, Mx: 0, My: 0 },
  displacedConcrete: { P: 0, Mx: 0, My: 0 },
  steel: { P: 0, Mx: 0, My: 0 },
  total: { P, Mx, My }
})

const point = (
  beta: number,
  station: number,
  P: number,
  radius: number,
  stationId: PreviewSurfacePoint['stationId']
): PreviewSurfacePoint => {
  const Mx = radius * Math.cos(beta)
  const My = radius * Math.sin(beta)
  return {
    id: `${beta}:${stationId}`,
    beta,
    station,
    stationId,
    surfaceRole: station === 0
      ? 'pure-compression'
      : station === 2
        ? 'pure-tension'
        : 'physical-state',
    P,
    Mx,
    My,
    state: { e0: 0, kx: Math.cos(beta), ky: Math.sin(beta) },
    ledger: ledger(P, Mx, My)
  }
}

const stations: SurfaceStation[] = [
  { id: 'pure-compression', label: 'Pure compression', definition: { kind: 'pure-compression' }, fixed: true },
  { id: 'station-1', label: 'εₛ/εy = 1', definition: { kind: 'bar-tension-yield-ratio', ratio: 1 }, fixed: true },
  { id: 'pure-tension', label: 'Pure tension', definition: { kind: 'pure-tension' }, fixed: true }
]

const rows = (betas: number[], radius: number) => betas.flatMap((beta) => [
  point(beta, 0, 1, 0, 'pure-compression'),
  point(beta, 1, 0, radius, 'station-1'),
  point(beta, 2, -1, 0, 'pure-tension')
])

const fixedBetas = [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2]
const fixedDesign = rows(fixedBetas, 10)
const fixedNominal = rows(fixedBetas, 12)
const adaptive = rows(fixedBetas.map((beta) => beta + Math.PI / 4), 999)

const surface = {
  points: adaptive,
  nominalPoints: adaptive,
  stations,
  directions: fixedBetas.map((beta) => beta + Math.PI / 4),
  designFixed: { points: fixedDesign, directions: fixedBetas, stations },
  nominalFixed: { points: fixedNominal, directions: fixedBetas, stations }
} as unknown as PreviewSurface

test('fixed-P table selects exactly one resistance stage from the fixed surface datasets', () => {
  const designTable = buildChartTableRows({
    surface,
    source: 'fixedP',
    resistanceStage: 'design',
    fixedP: 0
  })
  const nominalTable = buildChartTableRows({
    surface,
    source: 'fixedP',
    resistanceStage: 'nominal',
    fixedP: 0
  })

  assert.equal(designTable.length, 4)
  assert.equal(nominalTable.length, 4)
  assert.deepEqual(designTable.map((row) => row.kind === 'fixedP' ? row.angleDeg : -1), [0, 90, 180, 270])
  for (const row of designTable) {
    assert.equal(row.kind, 'fixedP')
    assert.ok(row.design && Math.abs(Math.hypot(row.design.Mx, row.design.My) - 10) < 1e-10)
    assert.equal(row.nominal, null)
    assert.equal(row.evidence.stage, 'design')
    assert.equal(row.evidence.bracket?.exact, true)
  }
  for (const row of nominalTable) {
    assert.equal(row.kind, 'fixedP')
    assert.ok(row.nominal && Math.abs(Math.hypot(row.nominal.Mx, row.nominal.My) - 12) < 1e-10)
    assert.equal(row.design, null)
    assert.equal(row.evidence.stage, 'nominal')
  }
})

test('calculation trace selection keeps the Fixed-P identity across stages and restarts on a source change', () => {
  const designFixedP = buildChartTableRows({ surface, source: 'fixedP', resistanceStage: 'design', fixedP: 0 })
  const nominalFixedP = buildChartTableRows({ surface, source: 'fixedP', resistanceStage: 'nominal', fixedP: 0 })
  const fixedCurrent = designFixedP[2] ?? null
  const fixedNext = resolveChartTableRowSelection(nominalFixedP, fixedCurrent)
  assert.equal(fixedNext?.kind, 'fixedP')
  assert.equal(fixedNext?.kind === 'fixedP' ? fixedNext.directionId : null, fixedCurrent?.kind === 'fixedP' ? fixedCurrent.directionId : null)
  assert.equal(fixedNext?.evidence.stage, 'nominal')
  const vertical = buildChartTableRows({ surface, capacityCurve: syntheticCurve, source: 'vertical', resistanceStage: 'design', fixedP: 0 })
  assert.equal(resolveChartTableRowSelection(designFixedP, vertical[1] ?? null)?.key, designFixedP[0]?.key)
  assert.equal(resolveChartTableRowSelection([], fixedCurrent), null)
})

test('fixed-P row evidence reconstructs the displayed sample from its authoritative bracket', () => {
  const table = buildChartTableRows({
    surface,
    source: 'fixedP',
    resistanceStage: 'design',
    fixedP: 0.5
  })

  assert.equal(table.length, 4)
  for (const row of table) {
    assert.equal(row.kind, 'fixedP')
    if (row.kind !== 'fixedP') continue
    const bracket = row.evidence.bracket
    assert.ok(bracket)
    assert.equal(bracket.exact, false)
    const reconstructedP = bracket.below.P + bracket.ratio * (bracket.above.P - bracket.below.P)
    const reconstructedMx = bracket.below.Mx + bracket.ratio * (bracket.above.Mx - bracket.below.Mx)
    const reconstructedMy = bracket.below.My + bracket.ratio * (bracket.above.My - bracket.below.My)
    assert.ok(Math.abs(reconstructedP - row.evidence.sample.P) < 1e-10)
    assert.ok(Math.abs(reconstructedMx - row.evidence.sample.Mx) < 1e-10)
    assert.ok(Math.abs(reconstructedMy - row.evidence.sample.My) < 1e-10)
    assert.equal(row.design?.Mx, row.evidence.sample.Mx)
    assert.equal(row.design?.My, row.evidence.sample.My)
  }
})

/** A hand-built P–M at θ curve: a pole, a station point, a between-stations point and a cap edge. */
const curvePoint = (patch: Partial<LoadDirectionPoint> & Pick<LoadDirectionPoint, 'P' | 'Mx' | 'My' | 'role'>): LoadDirectionPoint => ({
  Mtheta: Math.hypot(patch.Mx, patch.My), beta: null, stationId: null, ...patch
})
const syntheticCurve: LoadDirectionCurve = {
  theta: 0.3,
  designPaths: [[
    curvePoint({ P: 8, Mx: 0, My: 0, role: 'axial-center' }),
    curvePoint({ P: 8, Mx: 2.8, My: 0.9, role: 'cap-edge' }),
    curvePoint({ P: 0, Mx: 9.5, My: 2.9, role: 'physical-station', beta: 0.45, stationId: 'station-1',
      state: { e0: 1e-3, kx: 1e-6, ky: 2e-6 }, ledger: ledger(0, 9.5, 2.9) }),
    curvePoint({ P: -0.5, Mx: 4.8, My: 1.5, role: 'between-stations', beta: 0.52,
      between: { from: 'station-1', to: 'pure-tension', fraction: 0.4 }, state: { e0: -1e-3, kx: 1e-6, ky: 1e-6 } }),
    curvePoint({ P: -1, Mx: 0, My: 0, role: 'pure-tension', stationId: 'pure-tension', state: { e0: -0.01, kx: 0, ky: 0 } })
  ]],
  nominalPaths: [[
    curvePoint({ P: 1, Mx: 0, My: 0, role: 'pure-compression', stationId: 'pure-compression', state: { e0: 0.002, kx: 0, ky: 0 } }),
    curvePoint({ P: 0, Mx: 11, My: 3.4, role: 'physical-station', beta: 0.44, stationId: 'station-1', state: { e0: 1e-3, kx: 1e-6, ky: 2e-6 } }),
    curvePoint({ P: -1, Mx: 0, My: 0, role: 'pure-tension', stationId: 'pure-tension', state: { e0: -0.01, kx: 0, ky: 0 } })
  ]],
  beforeAxialCapPaths: [],
  unresolved: [],
  discontinuities: [],
  maxDirectionResidual: 0,
  evaluations: 0
}

test('ENG-AN-003: P–M at θ rows are the curve points in order, each with its own β and reproducing station', () => {
  const design = buildChartTableRows({ surface, capacityCurve: syntheticCurve, source: 'vertical', resistanceStage: 'design', fixedP: 0 })
  assert.deepEqual(design.map((row) => row.kind === 'vertical' ? row.criterion : ''),
    ['Axial center', 'Pmax intersection', 'εₛ/εy = 1', 'εₛ/εy = 1 → Pure tension · 40%', 'Pure tension'])
  // The tooltip and exports keep the full criterion.
  assert.equal(design[3].kind === 'vertical' ? design[3].criterionDetail : '', 'between εₛ/εy = 1 and Pure tension (40.0 %)')
  const betas = design.map((row) => row.kind === 'vertical' ? row.betaDeg : -1)
  assert.deepEqual(betas.map((value) => value === null ? null : Number(value!.toFixed(9))),
    [null, null, Number((0.45 * 180 / Math.PI).toFixed(9)), Number((0.52 * 180 / Math.PI).toFixed(9)), null])
  assert.equal(new Set(design.map((row) => row.key)).size, design.length)
  const station = design[2]
  assert.ok(station.kind === 'vertical' && station.design && !station.nominal)
  assert.equal(station.design.total.P, 0)
  assert.equal(station.design.total.M, Math.hypot(9.5, 2.9))
  assert.equal(station.evidence.point.surfaceRole, 'physical-state')
  assert.deepEqual(station.evidence.point.state, { e0: 1e-3, kx: 1e-6, ky: 2e-6 })
  assert.equal(station.evidence.station?.id, 'station-1')
  const between = design[3]
  assert.ok(between.kind === 'vertical')
  assert.deepEqual(between.evidence.station?.definition, {
    kind: 'adaptive-state-interpolation', left: stations[1].definition, right: stations[2].definition, ratio: 0.4 })
  // Geometric points carry no strain state: they are synthetic faces for every audit.
  for (const row of design.slice(0, 2)) {
    assert.ok(row.kind === 'vertical')
    assert.equal(row.evidence.point.surfaceRole, 'axial-cap')
    assert.equal(row.evidence.station, null)
  }
  const nominal = buildChartTableRows({ surface, capacityCurve: syntheticCurve, source: 'vertical', resistanceStage: 'nominal', fixedP: 0 })
  assert.equal(nominal.length, 3)
  assert.ok(nominal.every((row) => row.kind === 'vertical' && row.nominal && !row.design))
})

test('ENG-AN-003: no P–M at θ curve yet means no vertical rows, never a fallback meridian', () => {
  assert.deepEqual(buildChartTableRows({ surface, capacityCurve: null, source: 'vertical', resistanceStage: 'design', fixedP: 0 }), [])
})

test('ENG-AN-003: P–M at θ M_R uses the assembled vector, not a sum of contribution magnitudes', () => {
  const concrete = { P: 0, Mx: 6, My: -8 }, steel = { P: 0, Mx: -3, My: 4 }
  const curve: LoadDirectionCurve = { ...syntheticCurve, designPaths: [[
    curvePoint({ P: 0, Mx: 3, My: -4, role: 'physical-station', beta: 5.4, stationId: 'station-1', state: { e0: 0, kx: 1, ky: 0 },
      ledger: { concrete, steel, steelGross: steel, displacedConcrete: { P: 0, Mx: 0, My: 0 }, total: { P: 0, Mx: 3, My: -4 } } }),
    curvePoint({ P: -1, Mx: 0, My: 0, role: 'pure-tension', stationId: 'pure-tension', state: { e0: -0.01, kx: 0, ky: 0 } })
  ]] }
  const [row] = buildChartTableRows({ surface, capacityCurve: curve, source: 'vertical', resistanceStage: 'design', fixedP: 0 })
  assert.ok(row?.kind === 'vertical' && row.design)
  assert.equal(row.design.total.M, 5)
  assert.equal(row.design.concrete.M, 10)
  assert.equal(row.design.steel.M, 5)
})

test('fixed-P table reflects the exact Pmax boundary without synthetic radial branches', () => {
  const parsed = parseProjectDocument(readFileSync(
    resolve(process.cwd(), 'docs/examples/realistic-sections/KDS-REAL-05-complex-stress-strain.pm-project.json'),
    'utf8'
  ))
  assert.ok(parsed.ok)
  if (!parsed.ok) return
  const document = parsed.document
  const cappedSection = sectionGeometryFromGeometryInput(document.inputs.geometry)
  const cappedRebars = geometryInputRebars(document.inputs.geometry)
  const options = createDefaultAnalysisOptions()
  options.mesh.sizing = { type: 'automatic', seedDivisions: 8 }
  options.stations.refinement = { type: 'fixed' }
  options.directions.refinement = { type: 'fixed', probe: 'all' }
  const cappedSurface = buildDesignPreviewSurface(
    cappedSection,
    cappedRebars,
    document.inputs.materials,
    document.inputs.design,
    analysisMeshKernelOptions(options),
    options
  )
  const dataset = activeDesignSurfaceDataset(cappedSurface)
  const pmax = Math.max(...dataset.points.map((candidate) => candidate.P))
  const expected = contourStrainAngleSamples(sliceFixedPContour(dataset.points, pmax, dataset.triangles))
  const table = buildChartTableRows({
    surface: cappedSurface,
    source: 'fixedP',
    resistanceStage: 'design',
    fixedP: pmax
  })
  const fixedRows = table.filter((row) => row.kind === 'fixedP')
  assert.equal(fixedRows.length, expected.length)
  assert.equal(new Set(fixedRows.map((row) => row.key)).size, expected.length)
  assert.equal(new Set(fixedRows.map(row => row.angleDeg.toFixed(6))).size, fixedRows.length)
  assert.ok(fixedRows.every(row => row.branch === 1))
  assert.deepEqual(
    fixedRows.map((row) => [row.angleDeg, row.design?.Mx, row.design?.My]),
    expected.map((sample) => [normalizeAngleDeg((sample.beta * 180) / Math.PI), sample.Mx, sample.My])
  )
})

test('between-stations labels stay short and keep their meaning', () => {
  assert.equal(betweenStationsShortLabel('εₛ/εy = 0.25', 'εₛ/εy = 0.375', 0.328), 'εₛ/εy 0.25→0.375 · 32.8%')
  assert.equal(betweenStationsShortLabel('c/D = 1.1', 'c/D = 1', 0.575), 'c/D 1.1→1 · 57.5%')
  assert.equal(betweenStationsShortLabel('c/D = 1', 'εₛ/εy = 0', 0.444), 'c/D = 1 → εₛ/εy = 0 · 44.4%')
  assert.equal(betweenStationsShortLabel('Pure compression', 'c/D = 1.1', 0.5), 'Pure compression → c/D = 1.1 · 50%')
})
