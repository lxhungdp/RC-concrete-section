/**
 * F-03 Fixed sampling supplements of the stress-strain surface (root 05 §3.2–§3.3;
 * docs/task-packets/2026-11-12-f03-fixed-sampling-supplements.md).
 *
 * Oracles: (a) on a 250 x 2500 wall, a 180-direction reference surface on a ray between two seed rows
 * near the weak axis agrees with the supplemented Fixed surface, while seeds alone under-predict;
 * (b) on an L bar layout the cover-gap stations lie between c/D = 1 and εs = 0, every existing
 * station state is unchanged, and the meridian is monotone in P across the inserted states.
 * The independent strip-integration oracle is `npm run verify:biaxial-audit` (F-03 rows).
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
  prepareAnalysis,
  type PreviewSurface
} from '../src/index'
import { solveStressStrainCapacityFieldFromPrepared } from '../src/capacity-field'
import { buildStressStrainLoadDirectionCurveFromPrepared } from '../src/load-direction'

const materials: MaterialStore = {
  strainSign: 'compression-positive',
  concrete: createKdsConcrete({ name: 'C30', fck: 30 }),
  steel: [createKdsRebarSteel({ id: 1, name: 'SD400', fy: 400, elasticModulus: 200000 })],
  defaults: { steelMaterialId: 1 }
}
const basis = createKdsBasicDesignBasis()
const options = createDefaultAnalysisOptions()
const DEG = 180 / Math.PI
const square = (half: number) => [{ id: 1, x: -half, y: -half }, { id: 2, x: half, y: -half }, { id: 3, x: half, y: half }, { id: 4, x: -half, y: half }]
const prepare = (geometry: GeometryInput) =>
  prepareAnalysis(sectionGeometryFromGeometryInput(geometry), geometryInputRebars(geometry), materials, analysisMeshKernelOptions(options))

const wall: GeometryInput = {
  id: 1, name: 'F-03 wall 250 x 2500',
  outers: [{ id: 1, points: [{ id: 1, x: -125, y: -1250 }, { id: 2, x: 125, y: -1250 }, { id: 3, x: 125, y: 1250 }, { id: 4, x: -125, y: 1250 }], holes: [] }],
  rebars: Array.from({ length: 11 }, (_, row) => [-65, 65].map((x) => ({ x, y: -1190 + row * 238 }))).flat()
    .map(({ x, y }, index) => ({ id: index + 1, steelMaterialId: 1, dia: 16, area: 201, x, y }))
}

test('F-03(a): normalized-gap rows remove the weak-axis under-prediction of a wall', () => {
  const prepared = prepare(wall)
  const supplemented = buildDesignPreviewSurfaceFromPrepared(prepared, materials, basis, options)
  const seedsOnly = buildDesignPreviewSurfaceFromPrepared(prepared, materials, basis, options, { fixedSupplements: false })
  const gapRows = supplemented.directionSources?.filter((source) => source === 'normalized-gap').length ?? 0
  assert.ok(gapRows > 0 && supplemented.directions.length <= 2 * 36, `${gapRows} gap rows, ${supplemented.directions.length} rows`)
  const reference = buildDesignPreviewSurfaceFromPrepared(prepared, materials, basis, {
    ...options,
    directions: { ...options.directions, seed: { type: 'uniform', count: 180, startDeg: 0 } }
  })
  const scale = (key: 'P' | 'Mx' | 'My') => Math.max(Math.abs(reference.bounds[key][0]), Math.abs(reference.bounds[key][1]))
  const lambda = (surface: PreviewSurface, lat: number, lon: number) => {
    const demand = { P: scale('P') * Math.sin(lat / DEG), Mx: scale('Mx') * Math.cos(lat / DEG) * Math.cos(lon / DEG),
      My: scale('My') * Math.cos(lat / DEG) * Math.sin(lon / DEG) }
    const hit = intersectSurfaceWithDemandRay(surface, demand)
    assert.ok(hit)
    return hit.lambda
  }
  let worstSeeds = 0, worstSupplemented = 0
  for (const lon of [65, 70, 75, 80, 85, 95, 100, 105, 110]) for (const lat of [-10, 0, 10, 20]) {
    const truth = lambda(reference, lat, lon)
    worstSeeds = Math.max(worstSeeds, 1 - lambda(seedsOnly, lat, lon) / truth)
    worstSupplemented = Math.max(worstSupplemented, 1 - lambda(supplemented, lat, lon) / truth)
  }
  assert.ok(worstSeeds > 0.04, `seeds alone must reproduce the finding (${(worstSeeds * 100).toFixed(2)} %)`)
  // Measured 2026-11-12: 2.21 % (the 180-direction reference shares the Fixed stations).
  assert.ok(worstSupplemented < 0.03 && worstSupplemented < worstSeeds / 3,
    `supplemented ${(worstSupplemented * 100).toFixed(2)} % vs seeds ${(worstSeeds * 100).toFixed(2)} %`)
})

const lBars: GeometryInput = {
  id: 1, name: 'F-03 L bar layout', outers: [{ id: 1, points: square(250), holes: [] }],
  rebars: [[-190, -190], [0, -190], [190, -190], [190, 0], [190, 190]].map(([x, y], index) =>
    ({ id: index + 1, steelMaterialId: 1, dia: 32, area: 800, x, y }))
}

test('F-03(b): cover-gap stations fill c/D = 1 .. εs = 0 and leave every existing state unchanged', () => {
  const prepared = prepare(lBars)
  const curve = buildExactDirectionCurveFromPrepared(prepared, materials, basis, options, 135 / DEG - Math.PI / 2 + Math.PI)
  const ids = curve.stations.map(({ id }) => id)
  const covers = ids.filter((id) => id.startsWith('cover-gap-'))
  // The 135-degree diagonal: gap = (half diagonal − bar projection)/D = 0.5 · (1 − 190/250) ... at least 0.12 c/D.
  assert.ok(covers.length >= 1, ids.join(', '))
  const depthOne = ids.findIndex((id) => curve.stations.find((station) => station.id === id)?.definition.kind === 'neutral-axis-depth-ratio' &&
    (curve.stations.find((station) => station.id === id)?.definition as { ratio: number }).ratio === 1)
  assert.deepEqual(ids.slice(depthOne + 1, depthOne + 1 + covers.length), covers)
  const surface = buildDesignPreviewSurfaceFromPrepared(prepared, materials, basis, options)
  const meridian = surface.nominalPoints.filter((point) => point.surfaceRole === 'physical-state' && Math.abs(point.beta - surface.directions[0]) < 1e-12)
    .sort((left, right) => left.station - right.station)
  for (let index = 1; index < meridian.length; index += 1) {
    assert.ok(meridian[index].P <= meridian[index - 1].P + 1e-6 * Math.abs(meridian[0].P), `P rises at ${meridian[index].stationId}`)
  }
})

test('ENG-RES-001/R2: a retained boundary state qualifies after cover-gap insertion', () => {
  const prepared = prepare(lBars)
  const surface = buildDesignPreviewSurfaceFromPrepared(prepared, materials, basis, options)
  assert.equal(surface.stations.filter(station => station.id.startsWith('cover-gap-')).length, 4)
  const point = surface.points.find(point => point.stationId === 'station-24' && point.beta === 0)
  assert.ok(point)
  const demand = { id: 1, name: 'Half of a known physical boundary', actionBasis: 'factoredULS' as const,
    P: point.P / 2, Mx: point.Mx / 2, My: point.My / 2 }
  const before = intersectSurfaceWithDemandRay(surface, demand)
  assert.ok(before)
  assert.ok(Math.abs(before.lambda - 2) < 1e-12)
  const field = solveStressStrainCapacityFieldFromPrepared(prepared, materials, basis, surface, demand)
  assert.equal(field.status, 'available')
  if (field.status !== 'available') return
  assert.ok(field.admissibility.ok)
  assert.ok(field.residualNorm < 1e-8)
  assert.ok(Math.abs(field.loadFactor - 2) < 1e-8)
  // The load-direction curve of this boundary point's own θ contains that same physical state.
  const curve = buildStressStrainLoadDirectionCurveFromPrepared(prepared, materials, basis, surface, Math.atan2(point.My, point.Mx))
  const solved = curve.designPaths.flat().find(item => item.stationId === 'station-24')
  assert.ok(solved && solved.beta !== null)
  assert.ok(Math.abs(Math.atan2(Math.sin(solved.beta), Math.cos(solved.beta))) < 1e-8, `β ${solved.beta}`)
  assert.ok(Math.abs(solved.P - point.P) <= 1e-6 * Math.abs(point.P))
  assert.deepEqual(intersectSurfaceWithDemandRay(surface, demand), before)
  const missing = { ...surface, stations: surface.stations.filter(station => station.id !== 'station-24') }
  const unavailable = solveStressStrainCapacityFieldFromPrepared(prepared, materials, basis, missing, demand)
  assert.equal(unavailable.status, 'unavailable')
  if (unavailable.status === 'unavailable') assert.equal(unavailable.reason, 'invalid-input')
})
