import assert from 'node:assert/strict'
import test from 'node:test'
import { buildDirectMomentSection, type PreviewSurfacePoint } from '../src/index'

const point = (id: string, beta: number, station: number, P: number, Mx: number, My: number): PreviewSurfacePoint => {
  const total = { P, Mx, My }, zero = { P: 0, Mx: 0, My: 0 }
  return { id, beta, station, P, Mx, My,
    stationId: station === 0 ? 'pure-compression' : station === 2 ? 'pure-tension' : 'station-1',
    surfaceRole: station === 0 ? 'pure-compression' : station === 2 ? 'pure-tension' : 'physical-state',
    state: { e0: 0, kx: 0, ky: 0 },
    ledger: { total, concrete: total, steel: zero, steelGross: zero, displacedConcrete: zero } }
}

test('ENG-AN-003: Direct beta maps off-direction 3-4-5 actions without changing stored signs or stations', () => {
  const points = [point('c', 0, 0, 10, 0, 0), point('a', 0, 1, 0, 3, -4), point('t', 0, 2, -10, 0, 0)]
  const before = structuredClone(points)
  const actual = buildDirectMomentSection(points, 0, false)
  assert.deepEqual(actual.primary.map(vertex => [vertex.P, vertex.M]), [[10, 0], [0, 5], [-10, 0]])
  assert.equal(actual.primary[1]?.My, -4)
  assert.equal(actual.primary[1]?.stationId, 'station-1')
  assert.deepEqual(points, before)
})

test('ENG-AN-003: opposite beta plots on the negative side while retaining its positive magnitude', () => {
  const points = [point('c', 0, 0, 10, 0, 0), point('a', 0, 1, 0, 3, 4),
    point('b', Math.PI, 1, 0, -8, 6), point('t', 0, 2, -10, 0, 0)]
  const actual = buildDirectMomentSection(points, 0, true)
  assert.equal(actual.displayPaths.length, 2)
  assert.equal(actual.closed, false)
  assert.deepEqual(actual.displayPaths.map(path => path.map(vertex => vertex.MR)), [[0, 5, 0], [0, 10, 0]])
  assert.deepEqual(actual.opposite.map(vertex => vertex.M), [-0, -10, -0])
  assert.ok(actual.opposite.every(vertex => vertex.MR >= 0 && vertex.plotSign === -1 && Math.abs(vertex.M) === vertex.MR))
  assert.ok(actual.primary.every(vertex => vertex.branch === 'primary' && vertex.sectionBeta === 0))
  assert.ok(actual.opposite.every(vertex => vertex.branch === 'opposite' && vertex.sectionBeta === Math.PI))
})
