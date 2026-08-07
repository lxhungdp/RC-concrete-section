import assert from 'node:assert/strict'
import test from 'node:test'
import type {
  ExactDirectionCurve,
  PreviewSurface,
  PreviewSurfacePoint,
  SurfaceStation
} from '@pm/analysis'
import { buildChartTableRows } from '../../features/section-editor/results/chart-data-table'

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

test('fixed-P table interpolates only the fixed surface datasets', () => {
  const table = buildChartTableRows({
    surface,
    source: 'fixedP',
    includeDesign: true,
    includeNominal: true,
    sliceAngleDeg: 0,
    includeOpposite: false,
    fixedP: 0
  })

  assert.equal(table.length, 4)
  assert.deepEqual(table.map((row) => row.kind === 'fixedP' ? row.angleDeg : -1), [0, 90, 180, 270])
  for (const row of table) {
    assert.equal(row.kind, 'fixedP')
    assert.ok(row.design && Math.abs(Math.hypot(row.design.Mx, row.design.My) - 10) < 1e-10)
    assert.ok(row.nominal && Math.abs(Math.hypot(row.nominal.Mx, row.nominal.My) - 12) < 1e-10)
  }
})

test('fixed direction tables use the direct fixed meridian, not a nearby adaptive direction', () => {
  const table = buildChartTableRows({
    surface,
    source: 'vertical',
    includeDesign: true,
    includeNominal: true,
    sliceAngleDeg: 0,
    includeOpposite: false,
    fixedP: 0
  })

  assert.equal(table.length, 3)
  const middle = table.find((row) => row.kind === 'vertical' && row.criterion.includes('= 1'))
  assert.equal(middle?.kind, 'vertical')
  assert.equal(middle?.design?.total.M, 10)
  assert.equal(middle?.nominal?.total.M, 12)
})

test('an exact direction table keeps Design and Nominal on the same fixed stations', () => {
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
  const table = buildChartTableRows({
    surface,
    exactDirectionCurve: exact,
    source: 'vertical',
    includeDesign: true,
    includeNominal: true,
    sliceAngleDeg: 0,
    includeOpposite: false,
    fixedP: 0
  })

  assert.equal(table.length, 3)
  assert.ok(table.every((row) => row.kind === 'vertical' && row.design && row.nominal))
})
