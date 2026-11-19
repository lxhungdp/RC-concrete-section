/**
 * Fixed-mode geometry supplements of the equivalent-block surface (root 05 §3).
 *
 * F-02 (docs/task-packets/2026-11-11-f02-tension-control-event-directions.md). Oracles: seed rows
 * are bit-identical with and without supplements, and on a ray through the 135 degree crease a
 * 180-direction reference agrees with the supplemented Fixed surface while the seeds alone
 * over-predict capacity.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { intersectSurfaceWithDemandRay, type PreviewSurface } from '@pm/analysis'
import { createAci318DesignBasis } from '@pm/design'
import { geometryInputRebars, sectionGeometryFromGeometryInput, type GeometryInput } from '@pm/geometry'
import { createKdsConcrete, createKdsRebarSteel, type MaterialStore } from '@pm/materials'
import {
  applyCalculationProfileToMaterials,
  createAnalysisOptionsForProfile,
  type EquivalentBlockAnalysisOptions
} from '@pm/project'
import {
  buildEquivalentBlockExactDirectionCurveFromPrepared,
  buildEquivalentBlockPreviewSurfaceFromPrepared,
  prepareBlockAnalysis
} from '../src/index'

const profileId = 'aci-318-19-22-equivalent-block' as const
const lLayout: GeometryInput = {
  id: 1,
  name: 'F-02 L bar layout',
  outers: [{
    id: 1,
    points: [{ id: 1, x: -250, y: -250 }, { id: 2, x: 250, y: -250 }, { id: 3, x: 250, y: 250 }, { id: 4, x: -250, y: 250 }],
    holes: []
  }],
  rebars: [[-190, -190], [0, -190], [190, -190], [190, 0], [190, 190]].map(([x, y], index) =>
    ({ id: index + 1, steelMaterialId: 1, dia: 32, area: 800, x, y }))
}
const source: MaterialStore = {
  strainSign: 'compression-positive',
  concrete: createKdsConcrete({ name: 'C30', fck: 30 }),
  steel: [createKdsRebarSteel({ id: 1, name: 'SD400', fy: 400, elasticModulus: 200000 })],
  defaults: { steelMaterialId: 1 }
}
const prepared = prepareBlockAnalysis(
  profileId,
  sectionGeometryFromGeometryInput(lLayout),
  geometryInputRebars(lLayout),
  applyCalculationProfileToMaterials(source, profileId),
  createAci318DesignBasis()
)
const options = createAnalysisOptionsForProfile(profileId) as EquivalentBlockAnalysisOptions
const supplemented = buildEquivalentBlockPreviewSurfaceFromPrepared(prepared, options)
const seedsOnly = buildEquivalentBlockPreviewSurfaceFromPrepared(prepared, options, undefined, undefined, false)
const DEG = 180 / Math.PI

test('F-02: the Fixed block surface adds the 135 degree tension-control row and keeps all 36 seeds', () => {
  assert.equal(seedsOnly.directions.length, 36)
  assert.equal(supplemented.directions.length, 37)
  const events = supplemented.directions.filter((_, index) => supplemented.directionSources?.[index] === 'tension-control-event')
  assert.deepEqual(events.map((beta) => Math.round(beta * DEG * 1e6) / 1e6), [135])
  assert.equal(supplemented.directionSources?.filter((value) => value === 'seed').length, 36)
})

test('F-02: block seed rows are bit-identical with and without supplements', () => {
  const key = (point: PreviewSurface['points'][number]) => `${point.beta}|${point.equivalentBlock?.neutralAxisDepth}`
  const withRows = new Map(supplemented.nominalPoints.filter((point) => point.surfaceRole === 'physical-state').map((point) => [key(point), point]))
  let compared = 0
  for (const point of seedsOnly.nominalPoints) {
    if (point.surfaceRole !== 'physical-state') continue
    const twin = withRows.get(key(point))
    assert.ok(twin, `missing ${key(point)}`)
    assert.deepEqual([twin.P, twin.Mx, twin.My], [point.P, point.Mx, point.My])
    compared += 1
  }
  assert.ok(compared >= 36 * 25, `compared ${compared}`)
})

test('F-02: the block supplement removes the over-prediction across the crease', () => {
  const reference = buildEquivalentBlockPreviewSurfaceFromPrepared(prepared, {
    ...options,
    directions: { ...options.directions, seedCount: 180 }
  })
  const scale = (key: 'P' | 'Mx' | 'My') => Math.max(Math.abs(reference.bounds[key][0]), Math.abs(reference.bounds[key][1]))
  const [lat, lon] = [-40 / DEG, 135 / DEG]
  const demand = { P: scale('P') * Math.sin(lat), Mx: scale('Mx') * Math.cos(lat) * Math.cos(lon), My: scale('My') * Math.cos(lat) * Math.sin(lon) }
  const lambda = (surface: PreviewSurface) => {
    const hit = intersectSurfaceWithDemandRay(surface, demand)
    assert.ok(hit)
    return hit.lambda
  }
  const truth = lambda(reference)
  assert.ok(lambda(seedsOnly) / truth - 1 > 0.03, 'the unsupplemented grid must reproduce the finding')
  assert.ok(Math.abs(lambda(supplemented) / truth - 1) < 0.01)
})

test('F-02: a block exact meridian receives no supplementary row', () => {
  const curve = buildEquivalentBlockExactDirectionCurveFromPrepared(prepared, options, 0.3)
  assert.ok((curve.designCurve ?? []).length > 0)
  assert.ok((curve.designCurve ?? []).every((point) => point.surfaceRole !== 'physical-state' || Math.abs(point.beta - curve.beta) < 1e-10))
})
