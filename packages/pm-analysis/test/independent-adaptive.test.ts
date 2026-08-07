import assert from 'node:assert/strict'
import test from 'node:test'
import { geometryInputRebars, sectionGeometryFromGeometryInput } from '@pm/geometry'
import { buildResistanceMaterialSets, createKdsAppendixDesignBasis } from '@pm/design'
import { createAdaptiveAnalysisOptions, ADAPTIVE_INITIAL_STATION_COUNT } from '@pm/project'
import {
  buildDesignPreviewSurfaceFromPrepared,
  buildExactDirectionCurveFromPrepared,
  buildPreviewSurfaceFromPrepared,
  prepareAnalysis,
  stationDefinitionLabel
} from '../src/index'
import { referenceProjectDocument } from './fixtures/reference-case'

const document = referenceProjectDocument()
const prepared = prepareAnalysis(
  sectionGeometryFromGeometryInput(document.inputs.geometry),
  geometryInputRebars(document.inputs.geometry),
  document.inputs.materials
)

const auditOptions = () => {
  const options = createAdaptiveAnalysisOptions()
  if (options.stations.refinement.type !== 'adaptive' || options.directions.refinement.type !== 'adaptive') {
    throw new Error('Adaptive preset is invalid.')
  }
  options.stations.refinement.maxPasses = 2
  options.stations.refinement.maxStations = 30
  options.directions.refinement.maxPasses = 1
  options.directions.refinement.maxDirections = 24
  return options
}

test('pure-tension transition labels stay compact in station tables', () => {
  assert.equal(stationDefinitionLabel({
    kind: 'tension-pole-transition-ratio',
    from: { kind: 'bar-tension-yield-ratio', ratio: 20 },
    ratio: 0.25
  }), 'Pure tens 25%')
})

test('independent meridians keep unequal station counts and explicit topology remains closed', () => {
  const surface = buildPreviewSurfaceFromPrepared(prepared, auditOptions())
  assert.ok(surface.triangles?.length)
  const counts = new Map<number, number>()
  for (const point of surface.points) counts.set(point.beta, (counts.get(point.beta) ?? 0) + 1)
  assert.ok([...counts.values()].every((count) => count >= ADAPTIVE_INITIAL_STATION_COUNT))
  assert.ok(new Set(counts.values()).size > 1, 'station schedules must be independent by meridian')

  const edges = new Map<string, number>()
  for (const triangle of surface.triangles ?? []) {
    for (const [left, right] of [[triangle.a, triangle.b], [triangle.b, triangle.c], [triangle.c, triangle.a]]) {
      assert.ok(left >= 0 && left < surface.points.length)
      assert.ok(right >= 0 && right < surface.points.length)
      const key = left < right ? `${left}:${right}` : `${right}:${left}`
      edges.set(key, (edges.get(key) ?? 0) + 1)
    }
  }
  assert.equal([...edges.values()].filter((count) => count === 1).length, 0, 'surface must have no boundary edges')
  assert.equal([...edges.values()].filter((count) => count > 2).length, 0, 'surface must be manifold')
})

test('local caching prevents the historical all-row station rebuild explosion', () => {
  const surface = buildPreviewSurfaceFromPrepared(prepared, auditOptions())
  const evaluations = surface.stationError.evaluations ?? Number.POSITIVE_INFINITY
  assert.ok(evaluations >= surface.points.length)
  assert.ok(
    evaluations < surface.points.length * 6,
    `${evaluations} evaluations for ${surface.points.length} retained points indicates a rebuild regression`
  )
})

test('a fixed criterion occurs once per meridian and pure poles remain geometrically identical', () => {
  const surface = buildPreviewSurfaceFromPrepared(prepared, auditOptions())
  assert.equal(
    surface.points.filter((point) => point.stationId?.startsWith('adaptive-station-') &&
      surface.stations.find((station) => station.id === point.stationId)?.definition.kind ===
        'tension-pole-transition-ratio').length,
    0,
    'the non-unique path to the pure-tension pole must not be adaptively sampled'
  )
  const cOverD2 = surface.stations.find((station) =>
    station.definition.kind === 'neutral-axis-depth-ratio' && station.definition.ratio === 2)
  const strain20 = surface.stations.find((station) =>
    station.definition.kind === 'bar-tension-yield-ratio' && station.definition.ratio === 20)
  assert.ok(cOverD2)
  assert.ok(strain20)

  for (const beta of surface.directions) {
    const row = surface.points.filter((point) => point.beta === beta)
    assert.equal(row.filter((point) => point.stationId === cOverD2.id).length, 1)
    assert.equal(row.filter((point) => point.stationId === strain20.id).length, 1)
    assert.equal(row.filter((point) => point.stationId === 'pure-tension').length, 1)
  }

  const tension = surface.points.filter((point) => point.stationId === 'pure-tension')
  const reference = tension[0]
  assert.ok(reference)
  for (const point of tension.slice(1)) {
    const scale = Math.max(1, Math.abs(reference.P), Math.abs(reference.Mx), Math.abs(reference.My))
    assert.ok(Math.abs(point.P - reference.P) <= scale * 1e-12)
    assert.ok(Math.abs(point.Mx - reference.Mx) <= scale * 1e-12)
    assert.ok(Math.abs(point.My - reference.My) <= scale * 1e-12)
  }

  assert.ok(
    new Set(surface.points
      .filter((point) => point.stationId === cOverD2.id)
      .map((point) => `${point.P.toPrecision(8)}:${point.Mx.toPrecision(8)}:${point.My.toPrecision(8)}`)).size > 1,
    'the same c/D on different beta meridians should generally produce different resultants'
  )
})

test('adaptive ULS surface and legacy display aliases reference one authoritative dataset', () => {
  const options = auditOptions()
  const surface = buildDesignPreviewSurfaceFromPrepared(
    prepared,
    document.inputs.materials,
    document.inputs.design,
    options
  )
  assert.ok(surface.points.some((point) => point.stationId?.startsWith('adaptive-station-')))
  assert.equal(surface.designFixed?.points, surface.points)
  assert.equal(surface.designFixed?.triangles, surface.triangles)
  assert.equal(surface.nominalFixed?.points, surface.nominalPoints)
})

test('material-factor adaptive refinement follows total Design resultants and avoids the pure-tension pole band', () => {
  const options = createAdaptiveAnalysisOptions()
  const basis = createKdsAppendixDesignBasis()
  const stateMaterials = buildResistanceMaterialSets(document.inputs.materials, basis).stateMaterials
  const designPrepared = prepareAnalysis(
    sectionGeometryFromGeometryInput(document.inputs.geometry),
    geometryInputRebars(document.inputs.geometry),
    stateMaterials
  )
  const surface = buildDesignPreviewSurfaceFromPrepared(
    designPrepared,
    document.inputs.materials,
    basis,
    options
  )
  assert.ok(surface.stationError.withinTolerance)
  assert.ok(surface.directionError.withinTolerance)
  assert.ok(surface.directions.length < 360)
  assert.ok((surface.stationError.maxStations ?? 48) < 48)
  assert.equal(
    surface.stations.filter((station) => station.definition.kind === 'tension-pole-transition-ratio').length,
    0
  )
})

test('an arbitrary adaptive direction is recalculated with its own adaptive stations', () => {
  const curve = buildExactDirectionCurveFromPrepared(
    prepared,
    document.inputs.materials,
    document.inputs.design,
    auditOptions(),
    17.35 * Math.PI / 180
  )
  assert.ok(curve.designAdaptive.length > ADAPTIVE_INITIAL_STATION_COUNT)
  assert.ok(curve.designAdaptive.some((point) => point.stationId?.startsWith('adaptive-station-')))
  assert.equal(curve.designAdaptive.length, curve.designFixed.length)
  assert.equal(curve.designAdaptive.length, curve.nominalFixed.length)
})
