import assert from 'node:assert/strict'
import test from 'node:test'
import { createKdsBasicDesignBasis } from '@pm/design'
import { geometryInputRebars, sectionGeometryFromGeometryInput } from '@pm/geometry'
import { buildDesignPreviewSurface, checkLoadcasesUtilizationFromSurface } from '../src/index'
import { IndexedSurfaceTopologyCache } from '../src/surface-topology'
import { referenceGeometryInput, referenceMaterialStore } from './fixtures/reference-case'

test('AUD-009 ENG-AN-003: 100 checks retain identical numbers while reusing explicit topology', () => {
  const input = referenceGeometryInput()
  const surface = buildDesignPreviewSurface(sectionGeometryFromGeometryInput(input), geometryInputRebars(input),
    referenceMaterialStore(), createKdsBasicDesignBasis())
  const seed = surface.points.find((point) => point.Mx > 1e6 && point.My > 1e6 && point.P > 0)
  assert.ok(seed)
  const demands = Array.from({ length: 100 }, (_, index) => {
    const factor = 0.2 + 0.7 * index / 99
    return { id: index + 1, name: `Batch ${index}`, actionBasis: 'factoredULS' as const,
      P: seed.P * factor, Mx: seed.Mx * factor, My: seed.My * factor }
  })
  const topology = surface.triangles
  assert.ok(topology)
  let preparations = 0
  Object.defineProperty(topology, 'flatMap', { configurable: true, value: function (...args: Parameters<typeof topology.flatMap>) {
    preparations += 1
    return Array.prototype.flatMap.apply(this, args)
  } })
  const cached = checkLoadcasesUtilizationFromSurface(surface, demands)
  assert.ok(preparations <= 1, `Repeated ${preparations} preparations`)
  delete (topology as unknown as { flatMap?: unknown }).flatMap
  // New topology identities force cold preparation without changing any geometry or demand.
  const uncached = demands.map((demand) => checkLoadcasesUtilizationFromSurface({
    ...surface, triangles: [...topology], designSurface: surface.designSurface
      ? { ...surface.designSurface, triangles: [...topology] } : undefined
  }, [demand])[0])
  assert.deepEqual(cached, uncached)
})

test('AUD-009: diagnostic DTO edits cannot reuse stale vertex/index/direction wrappers', () => {
  const cache = new IndexedSurfaceTopologyCache<{ beta: number }>((a, b) => a.beta === b.beta)
  const points = [{ beta: 0 }, { beta: 0 }, { beta: 1 }, { beta: 2 }]
  const topology = [{ a: 0, b: 1, c: 2 }]
  const first = cache.get(points, topology)
  assert.equal(cache.get(points, topology), first)
  points[1].beta = 1
  assert.notEqual(cache.get(points, topology), first)
  topology[0].c = 3
  assert.equal(cache.get(points, topology)[0].vertices[2], points[3])
  points[3] = { beta: 4 }
  assert.equal(cache.get(points, topology)[0].vertices[2], points[3])
})
