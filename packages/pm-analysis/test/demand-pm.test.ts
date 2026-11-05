import assert from 'node:assert/strict'
import test from 'node:test'
import { intersectPmLoadPath, resultantMomentCoordinate } from '../src/index'
import { forwardMomentPaths, type DemandPmPoint } from '../src/demand-pm'

const cutPoint = (M: number, P: number): DemandPmPoint => ({ M, P, Mx: M, My: 0,
  beta: null, theta: M === 0 ? null : M > 0 ? 0 : Math.PI, station: null,
  stationId: null, sourceId: null, role: 'surface-cut' })

test('ENG-AN-003: the forward half of a closed rectangular cut is one open branch across its seam', () => {
  const a = cutPoint(2, 4), b = cutPoint(-2, 4), c = cutPoint(-2, -4), d = cutPoint(2, -4)
  const path = [a, b, c, d, a]
  const before = structuredClone(path)
  const result = forwardMomentPaths([path])
  assert.equal(result.length, 1)
  assert.deepEqual(result[0].map(p => [p.M, p.P]), [[0, -4], [2, -4], [2, 4], [0, 4]])
  assert.equal(result[0][1], d)
  assert.equal(result[0][2], a)
  assert.deepEqual(path, before)
  assert.ok(result[0].filter(p => p.M === 0).every(p => p.sourceId === null && p.beta === null))
})

test('ENG-AN-003: open forward runs remain disconnected with exact axis endpoints', () => {
  const result = forwardMomentPaths([[cutPoint(-2, 0), cutPoint(2, 4), cutPoint(-2, 8), cutPoint(2, 12)]])
  assert.deepEqual(result.map(path => path.map(p => [p.M, p.P])),
    [[[0, 2], [2, 4], [0, 6]], [[0, 10], [2, 12]]])
  assert.deepEqual(forwardMomentPaths([[cutPoint(-1, 0), cutPoint(0, 1), cutPoint(-1, 2)]]), [])
  const boundary = cutPoint(0, 1), end = cutPoint(2, 2)
  assert.deepEqual(forwardMomentPaths([[cutPoint(-2, 0), boundary, end]]), [[boundary, end]])
  assert.deepEqual(forwardMomentPaths([[cutPoint(-2, 0), cutPoint(-1, 1)]]), [])
})

test('ENG-AN-003: forward clipping retains pre-cap qualification and rejects invalid arithmetic', () => {
  const a = { ...cutPoint(-2, 4), role: 'before-cap' as const }
  const b = { ...cutPoint(2, 8), role: 'before-cap' as const }
  assert.deepEqual(forwardMomentPaths([[a, b]])[0].map(p => [p.M, p.P, p.role]),
    [[0, 6, 'before-cap'], [2, 8, 'before-cap']])
  assert.throws(() => forwardMomentPaths([[cutPoint(NaN, 0), b]]), RangeError)
  assert.throws(() => forwardMomentPaths([[cutPoint(-1e308, 0), cutPoint(1e308, 1)]]), RangeError)
})

test('ENG-AN-003: flattened endpoints give the independent x+y=10 crossing, not a 3D capacity', () => {
  const path = [{ P: 10, Mx: 0, My: 0 }, { P: 0, Mx: 6, My: 8 }].map(resultantMomentCoordinate)
  const result = intersectPmLoadPath([path], { P: 2, Mx: 3, My: 0 }, 'proportional3D')
  assert.equal(result.status, 'intersections')
  assert.equal(result.points.length, 1)
  const point = result.points[0]
  assert.ok(point)
  assert.ok(Math.abs(point.lambda - 2) < 1e-12)
  assert.ok(Math.abs(point.M - 6) < 1e-12 && Math.abs(point.P - 4) < 1e-12)
  assert.equal(point.kind, 'crossing')
  assert.ok(Math.abs(point.sources[0]!.fraction - 0.6) < 1e-12)
  assert.notEqual(0.6 * 8, 2 * 0, 'the source 3D segment has My=4.8 while the demand ray has My=0')
})

test('ENG-AN-003: shared vertex crossing and tangency retain distinct contact evidence', () => {
  const demand = { P: 0, Mx: 1, My: 0 }
  for (const [lastP, kind] of [[-1, 'crossing'], [1, 'contact']] as const) {
    const query = intersectPmLoadPath([[{ M: 0, P: 1 }, { M: 1, P: 0 }, { M: 2, P: lastP }]], demand, 'constantAxial')
    assert.equal(query.status, 'intersections')
    assert.equal(query.points.length, 1)
    assert.equal(query.points[0]?.kind, kind)
    assert.equal(query.points[0]?.sources.length, 2)
  }
})

test('ENG-AN-003: preserve disconnected paths, sorted multiple hits and collinear ambiguity', () => {
  const demand = { P: 0, Mx: 1, My: 0 }
  const query = intersectPmLoadPath([
    [{ M: 3, P: 1 }, { M: 3, P: -1 }], [{ M: 1, P: 1 }, { M: 1, P: -1 }]
  ], demand, 'constantAxial')
  assert.equal(query.status, 'intersections')
  assert.deepEqual(query.points.map(point => point.lambda), [1, 3])
  assert.deepEqual(query.points.map(point => point.sources[0]?.path), [1, 0])
  assert.equal(intersectPmLoadPath([[{ M: 0, P: 1 }], [{ M: 2, P: -1 }]], demand, 'constantAxial').status, 'unavailable')
  assert.equal(intersectPmLoadPath([[{ M: 0, P: 0 }, { M: 2, P: 0 }]], demand, 'constantAxial').status, 'overlap')
  assert.equal(intersectPmLoadPath([[{ M: -2, P: 0 }, { M: -1, P: 0 }]], demand, 'constantAxial').status, 'no-intersection')
})

test('ENG-AN-003: Constant P is horizontal and force/moment scale changes preserve its multiplier', () => {
  for (const [fs, ms] of [[1, 1], [1e9, 1e6]]) {
    const result = intersectPmLoadPath([[{ M: 0, P: 10 * fs }, { M: 10 * ms, P: 0 }]],
      { P: 4 * fs, Mx: 3 * ms, My: 0 }, 'constantAxial')
    assert.equal(result.status, 'intersections')
    assert.ok(Math.abs(result.points[0]!.lambda - 2) < 1e-12)
    assert.ok(Math.abs(result.points[0]!.P / fs - 4) < 1e-12)
  }
})

test('ENG-AN-003: zero paths, missing curves and invalid arithmetic fail explicitly', () => {
  const paths = [[{ M: 0, P: 1 }, { M: 1, P: 0 }]]
  for (const basis of ['constantAxial', 'proportional3D'] as const) {
    assert.deepEqual(intersectPmLoadPath(paths, { P: 0, Mx: 0, My: 0 }, basis),
      { status: 'unavailable', reason: 'zero-path', points: [] })
  }
  assert.equal(intersectPmLoadPath(paths, { P: 1, Mx: 0, My: 0 }, 'constantAxial').status, 'unavailable')
  assert.deepEqual(intersectPmLoadPath([], { P: 1, Mx: 1, My: 0 }, 'proportional3D'),
    { status: 'unavailable', reason: 'missing-curve', points: [] })
  assert.deepEqual(intersectPmLoadPath(paths, { P: NaN, Mx: 1, My: 0 }, 'proportional3D'),
    { status: 'unavailable', reason: 'invalid-arithmetic', points: [] })
  assert.equal(intersectPmLoadPath([[{ M: Infinity, P: 1 }, { M: 1, P: 0 }]],
    { P: 1, Mx: 1, My: 0 }, 'proportional3D').status, 'unavailable')
})
