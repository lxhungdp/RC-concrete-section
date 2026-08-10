import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  activeDesignSurfaceDataset,
  buildDesignPreviewSurface,
  contourStrainAngleSamples,
  sliceFixedPContour,
  type ExactDirectionCurve,
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
import { buildChartTableRows } from '../../features/section-editor/results/chart-data-table'

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
    sliceAngleDeg: 0,
    fixedP: 0
  })
  const nominalTable = buildChartTableRows({
    surface,
    source: 'fixedP',
    resistanceStage: 'nominal',
    sliceAngleDeg: 0,
    fixedP: 0
  })

  assert.equal(designTable.length, 4)
  assert.equal(nominalTable.length, 4)
  assert.deepEqual(designTable.map((row) => row.kind === 'fixedP' ? row.angleDeg : -1), [0, 90, 180, 270])
  for (const row of designTable) {
    assert.equal(row.kind, 'fixedP')
    assert.ok(row.design && Math.abs(Math.hypot(row.design.Mx, row.design.My) - 10) < 1e-10)
    assert.equal(row.nominal, null)
  }
  for (const row of nominalTable) {
    assert.equal(row.kind, 'fixedP')
    assert.ok(row.nominal && Math.abs(Math.hypot(row.nominal.Mx, row.nominal.My) - 12) < 1e-10)
    assert.equal(row.design, null)
  }
})

test('fixed direction tables use the direct fixed meridian, not a nearby adaptive direction', () => {
  const table = buildChartTableRows({
    surface,
    source: 'vertical',
    resistanceStage: 'design',
    sliceAngleDeg: 0,
    fixedP: 0
  })

  assert.equal(table.length, 3)
  const middle = table.find((row) => row.kind === 'vertical' && row.criterion.includes('= 1'))
  assert.equal(middle?.kind, 'vertical')
  assert.equal(middle?.design?.total.M, 10)
  assert.equal(middle?.nominal, null)
})

test('an exact direction table selects Design or Nominal without merging their rows', () => {
  const beta = 17.35 * Math.PI / 180
  const designFixed = rows([beta], 10)
  const exact: ExactDirectionCurve = {
    beta,
    designAdaptive: designFixed,
    designFixed,
    nominalFixed: rows([beta], 12),
    stations,
    stationError: {
      stations: 3,
      fixedStations: 3,
      maxRelative: Number.NaN,
      refinementPasses: 0,
      withinTolerance: true,
      tolerance: Number.POSITIVE_INFINITY
    }
  }
  const designTable = buildChartTableRows({
    surface,
    exactDirectionCurve: exact,
    source: 'vertical',
    resistanceStage: 'design',
    sliceAngleDeg: 0,
    fixedP: 0
  })
  const nominalTable = buildChartTableRows({
    surface,
    exactDirectionCurve: exact,
    source: 'vertical',
    resistanceStage: 'nominal',
    sliceAngleDeg: 0,
    fixedP: 0
  })

  assert.equal(designTable.length, 3)
  assert.equal(nominalTable.length, 3)
  assert.ok(designTable.every((row) => row.kind === 'vertical' && row.design && !row.nominal))
  assert.ok(nominalTable.every((row) => row.kind === 'vertical' && !row.design && row.nominal))
})

test('independently adaptive Design and Nominal tables retain their own station counts', () => {
  const beta = 17.35 * Math.PI / 180
  const adaptiveStation = {
    id: 'adaptive-station-table-test' as const,
    label: 'Adaptive midpoint',
    definition: { kind: 'block-adaptive' as const, label: 'Adaptive midpoint' },
    fixed: false
  }
  const nominalPoints = [
    point(beta, 0, 1, 0, 'pure-compression'),
    point(beta, 1, 0, 12, 'station-1'),
    point(beta, 1.5, -0.5, 8, adaptiveStation.id),
    point(beta, 2, -1, 0, 'pure-tension')
  ]
  const exact: ExactDirectionCurve = {
    beta,
    designAdaptive: rows([beta], 10),
    designFixed: rows([beta], 10),
    nominalFixed: nominalPoints,
    stations,
    nominalStations: [...stations.slice(0, 2), adaptiveStation, stations[2]],
    stationError: {
      stations: 3,
      fixedStations: 3,
      maxRelative: 0,
      refinementPasses: 1,
      withinTolerance: true,
      tolerance: 0.01
    }
  }

  const designTable = buildChartTableRows({
    surface,
    exactDirectionCurve: exact,
    source: 'vertical',
    resistanceStage: 'design',
    sliceAngleDeg: 0,
    fixedP: 0
  })
  const nominalTable = buildChartTableRows({
    surface,
    exactDirectionCurve: exact,
    source: 'vertical',
    resistanceStage: 'nominal',
    sliceAngleDeg: 0,
    fixedP: 0
  })

  assert.equal(designTable.length, 3)
  assert.equal(nominalTable.length, 4)
  assert.ok(nominalTable.some((row) => row.kind === 'vertical' && row.criterion === 'Adaptive midpoint'))
})

test('the vertical table remains one direct meridian when the chart shows the opposite side', () => {
  const table = buildChartTableRows({
    surface,
    source: 'vertical',
    resistanceStage: 'design',
    sliceAngleDeg: 0,
    fixedP: 0
  })

  assert.equal(table.length, 3)
  assert.equal(table.filter((row) => row.kind === 'vertical' && row.criterion === 'Pure compression').length, 1)
  assert.equal(table.filter((row) => row.kind === 'vertical' && row.criterion === 'Pure tension').length, 1)
  const stationRows = table.filter((row) => row.kind === 'vertical' && row.criterion.includes('= 1'))
  assert.equal(stationRows.length, 1)
})

test('the vertical table attaches singleton equivalent-block poles to every direct meridian', () => {
  const beta = Math.PI / 2
  const compression = point(0, 0, 1, 0, 'pure-compression')
  const tension = point(0, 2, -1, 0, 'pure-tension')
  const middle = point(beta, 1, 0, 10, 'station-1')
  const singletonPoleSurface = {
    ...surface,
    points: [compression, middle, tension],
    designFixed: {
      points: [compression, middle, tension],
      directions: [beta],
      stations
    }
  } as PreviewSurface
  const table = buildChartTableRows({
    surface: singletonPoleSurface,
    source: 'vertical',
    resistanceStage: 'design',
    sliceAngleDeg: 90,
    fixedP: 0
  })

  assert.deepEqual(
    table.map((row) => row.kind === 'vertical' ? row.criterion : ''),
    ['Pure compression', 'εₛ/εy = 1', 'Pure tension']
  )
})

test('synthetic cap vertices are chart topology, not station-table rows', () => {
  const beta = 17.35 * Math.PI / 180
  const cap = {
    ...point(beta, -1, 8, 3, null),
    surfaceRole: 'axial-cap' as const,
    onSampledDirection: true
  }
  const middle = point(beta, 1, 0, 10, 'station-1')
  const tension = point(0, 2, -1, 0, 'pure-tension')
  const exact: ExactDirectionCurve = {
    beta,
    designAdaptive: [cap, middle, tension],
    designFixed: [cap, middle, tension],
    nominalFixed: [middle, tension],
    stations,
    stationError: {
      stations: 3,
      fixedStations: 3,
      maxRelative: 0,
      refinementPasses: 0,
      withinTolerance: true,
      tolerance: 0.01
    }
  }
  const table = buildChartTableRows({
    surface,
    exactDirectionCurve: exact,
    source: 'vertical',
    resistanceStage: 'design',
    sliceAngleDeg: beta * 180 / Math.PI,
    fixedP: 0
  })

  assert.equal(table.length, 2)
  assert.ok(table.every((row) => row.kind === 'vertical' && row.criterion !== '—'))
})

test('fixed-P table preserves every Pmax contour branch instead of overwriting equal-beta rows', () => {
  const parsed = parseProjectDocument(readFileSync(
    resolve(process.cwd(), 'docs/examples/reference-case/projects/PM-advanced (7) 2D.pm-project.json'),
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
    sliceAngleDeg: 0,
    fixedP: pmax
  })
  const fixedRows = table.filter((row) => row.kind === 'fixedP')
  assert.equal(fixedRows.length, expected.length)
  assert.equal(new Set(fixedRows.map((row) => row.key)).size, expected.length)
  const repeatedBeta = fixedRows.find((row, index) =>
    fixedRows.some((candidate, candidateIndex) =>
      candidateIndex !== index && Math.abs(candidate.angleDeg - row.angleDeg) < 1e-8
    )
  )
  assert.ok(repeatedBeta)
  const branchRows = fixedRows.filter((row) => Math.abs(row.angleDeg - repeatedBeta.angleDeg) < 1e-8)
  assert.deepEqual(branchRows.map((row) => row.branch), branchRows.map((_, index) => index + 1))
  assert.deepEqual(
    fixedRows.map((row) => [row.angleDeg, row.design?.Mx, row.design?.My]),
    expected.map((sample) => [normalizeAngleDeg((sample.beta * 180) / Math.PI), sample.Mx, sample.My])
  )
})
