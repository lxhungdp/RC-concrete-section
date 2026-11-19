/**
 * Fixed-mode geometry supplements of the stress-strain surface (root 05 §3).
 *
 * F-02 (docs/task-packets/2026-11-11-f02-tension-control-event-directions.md): a row is added at
 * every direction where the deepest bar changes. Oracles: (1) every seed row is bit-identical to
 * the surface built without supplements; (2) on a ray through the 135 degree crease of an L bar
 * layout, a 180-direction reference surface (which has 135 degrees as a seed) agrees with the
 * supplemented Fixed surface, while the unsupplemented one over-predicts capacity.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { createKdsBasicDesignBasis } from '@pm/design'
import { geometryInputRebars, sectionGeometryFromGeometryInput, type GeometryInput } from '@pm/geometry'
import { createKdsConcrete, createKdsRebarSteel, type MaterialStore } from '@pm/materials'
import { analysisMeshKernelOptions, createDefaultAnalysisOptions } from '@pm/project'
import {
  buildDesignPreviewSurfaceFromPrepared,
  buildExactDirectionCurveFromPrepared,
  intersectSurfaceWithDemandRay,
  evaluatePreparedState,
  prepareAnalysis,
  type PreviewSurface
} from '../src/index'

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

const materials: MaterialStore = {
  strainSign: 'compression-positive',
  concrete: createKdsConcrete({ name: 'C30', fck: 30 }),
  steel: [createKdsRebarSteel({ id: 1, name: 'SD400', fy: 400, elasticModulus: 200000 })],
  defaults: { steelMaterialId: 1 }
}

const options = createDefaultAnalysisOptions()
const prepared = prepareAnalysis(
  sectionGeometryFromGeometryInput(lLayout),
  geometryInputRebars(lLayout),
  materials,
  analysisMeshKernelOptions(options)
)
const basis = createKdsBasicDesignBasis()
const supplemented = buildDesignPreviewSurfaceFromPrepared(prepared, materials, basis, options)
const seedsOnly = buildDesignPreviewSurfaceFromPrepared(prepared, materials, basis, options, { fixedSupplements: false })
const DEG = 180 / Math.PI

test('F-02: the Fixed fibre surface adds the 135 degree tension-control row and keeps all 36 seeds', () => {
  assert.equal(seedsOnly.directions.length, 36)
  assert.deepEqual(seedsOnly.directionSources, Array(36).fill('seed'))
  assert.equal(supplemented.directions.length, 37)
  const events = supplemented.directions.filter((_, index) => supplemented.directionSources?.[index] === 'tension-control-event')
  assert.deepEqual(events.map((beta) => Math.round(beta * DEG * 1e6) / 1e6), [135])
  for (const beta of seedsOnly.directions) assert.ok(supplemented.directions.includes(beta), `seed ${beta * DEG} deg was moved`)
})

test('F-02: every seed row is bit-identical with and without supplements', () => {
  const key = (point: PreviewSurface['points'][number]) => `${point.beta}|${point.stationId}`
  // Nominal points are never capped, so every physical state of every seed row is compared; the
  // capped Design points are compared where they survive the axial cap.
  for (const [label, pick] of [
    ['nominal', (surface: PreviewSurface) => surface.nominalPoints],
    ['design', (surface: PreviewSurface) => surface.points]
  ] as const) {
    const withRows = new Map(pick(supplemented).filter((point) => point.surfaceRole === 'physical-state').map((point) => [key(point), point]))
    let compared = 0
    for (const point of pick(seedsOnly)) {
      if (point.surfaceRole !== 'physical-state') continue
      const twin = withRows.get(key(point))
      assert.ok(twin, `${label}: missing ${key(point)}`)
      assert.deepEqual([twin.P, twin.Mx, twin.My, twin.state], [point.P, point.Mx, point.My, point.state])
      compared += 1
    }
    assert.ok(compared >= (label === 'nominal' ? 36 * 26 : 36 * 20), `${label}: compared ${compared}`)
  }
})

test('F-02: the supplement removes the over-prediction across the crease', () => {
  const reference = buildDesignPreviewSurfaceFromPrepared(prepared, materials, basis, {
    ...options,
    directions: { ...options.directions, seed: { type: 'uniform', count: 180, startDeg: 0 } }
  })
  const scale = (key: 'P' | 'Mx' | 'My') => Math.max(Math.abs(reference.bounds[key][0]), Math.abs(reference.bounds[key][1]))
  const [lat, lon] = [-25 / DEG, 135 / DEG]
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

test('F-02: an exact meridian receives no supplementary row', () => {
  const curve = buildExactDirectionCurveFromPrepared(prepared, materials, basis, options, 0.3)
  assert.ok((curve.designCurve ?? []).length > 0)
  assert.ok((curve.designCurve ?? []).every((point) => point.surfaceRole !== 'physical-state' || point.beta === curve.beta))
})

test('ENG-RES-002/R1: near-seed events have unique IDs and retain their own nominal states', () => {
  const angle = -10.0001 * Math.PI / 180
  const geometry: GeometryInput = { ...lLayout, rebars: [-1, 1].map((sign, index) => ({
    id: index + 1, x: sign * 150 * Math.cos(angle), y: sign * 150 * Math.sin(angle),
    dia: 20, area: 314, steelMaterialId: 1
  })) }
  const local = prepareAnalysis(sectionGeometryFromGeometryInput(geometry), geometryInputRebars(geometry), materials,
    analysisMeshKernelOptions(options))
  const surface = buildDesignPreviewSurfaceFromPrepared(local, materials, basis, options)
  assert.equal(surface.directions.length, 38)
  assert.equal(new Set(surface.nominalPoints.map(point => point.id)).size, surface.nominalPoints.length)
  assert.equal(new Set(surface.nominalPoints.map(point => point.beta)).size, surface.directions.length)
  const retained = surface.beforeAxialCap?.points ?? surface.points
  const designById = new Map(retained.map(point => [point.id, point]))
  for (const point of surface.nominalPoints) {
    const design = designById.get(point.id)
    assert.ok(design)
    assert.equal(point.beta, design.beta)
    assert.deepEqual(point.state, design.state)
    // Independent forward evaluation, without the ID-based reference-pairing path.
    const reference = evaluatePreparedState(local, point.state).total
    assert.deepEqual([point.P, point.Mx, point.My], [reference.P, reference.Mx, reference.My])
  }
})
