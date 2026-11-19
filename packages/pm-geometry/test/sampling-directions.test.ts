/**
 * F-02 (docs/task-packets/2026-11-11-f02-tension-control-event-directions.md): the directions at
 * which the deepest point of a set changes are exactly the reversed outward normals of its convex
 * hull edges. Oracle: a brute-force angular sweep of the arg-min projection.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeSamplingDirections, netConcreteAreaCovariance, normalizedGapGradientAngles, supportSwitchGradientAngles, wrapGradientAngle } from '../src/index'

const DEG = Math.PI / 180
const degrees = (angles: number[]) => angles.map((angle) => Math.round(angle / DEG * 1e9) / 1e9)

/** Every angle in a fine sweep where the minimum-projection point (with ties) changes. */
const sweptSwitches = (points: Array<{ x: number; y: number }>, steps = 72_000) => {
  const minimiser = (theta: number) => {
    const gx = Math.cos(theta)
    const gy = Math.sin(theta)
    let best = Number.POSITIVE_INFINITY
    let index = -1
    points.forEach((point, candidate) => {
      const value = gx * point.x + gy * point.y
      if (value < best - 1e-9) { best = value; index = candidate }
    })
    return index
  }
  const switches: number[] = []
  let previous = minimiser(0)
  for (let step = 1; step <= steps; step += 1) {
    const theta = (2 * Math.PI * step) / steps
    const current = minimiser(theta)
    if (current !== previous) switches.push(theta)
    previous = current
  }
  return { switches, resolution: (2 * Math.PI) / steps }
}

test('F-02: support switches of an L bar layout and a square layout', () => {
  const lLayout = [{ x: -190, y: -190 }, { x: 0, y: -190 }, { x: 190, y: -190 }, { x: 190, y: 0 }, { x: 190, y: 190 }]
  assert.deepEqual(degrees(supportSwitchGradientAngles(lLayout)), [90, 180, 315])
  const corners = [{ x: -1, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 }]
  assert.deepEqual(degrees(supportSwitchGradientAngles(corners)), [0, 90, 180, 270])
})

test('F-02: switches agree with a brute-force sweep on irregular point sets', () => {
  let seed = 7
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return seed / 2147483648
  }
  for (let trial = 0; trial < 12; trial += 1) {
    const points = Array.from({ length: 4 + trial }, () => ({ x: 800 * random() - 400, y: 600 * random() - 300 }))
    const angles = supportSwitchGradientAngles(points)
    const { switches, resolution } = sweptSwitches(points)
    assert.equal(angles.length, switches.length, `trial ${trial}: switch count`)
    for (const angle of angles) {
      assert.ok(switches.some((value) => Math.abs(wrapGradientAngle(value - angle + Math.PI) - Math.PI) <= 1.5 * resolution),
        `trial ${trial}: ${angle / DEG} deg has no swept switch`)
    }
  }
})

test('F-02: degenerate point sets', () => {
  assert.deepEqual(supportSwitchGradientAngles([]), [])
  assert.deepEqual(supportSwitchGradientAngles([{ x: 3, y: 4 }]), [])
  assert.deepEqual(supportSwitchGradientAngles([{ x: 3, y: 4 }, { x: 3, y: 4 }, { x: 3, y: 4 }]), [])
  // Collinear points switch only where the gradient is perpendicular to their line.
  assert.deepEqual(degrees(supportSwitchGradientAngles([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }])), [135, 315])
  assert.throws(() => supportSwitchGradientAngles([{ x: Number.NaN, y: 0 }, { x: 1, y: 1 }]), RangeError)
})

test('F-02: merged directions keep every seed exactly and drop coincident supplements', () => {
  const seeds = [0, Math.PI / 2, Math.PI].map((angle) => ({ angle, source: 'seed' as const }))
  const merged = mergeSamplingDirections(seeds, [
    { angle: Math.PI / 2 + 1e-12, source: 'tension-control-event' },
    { angle: -Math.PI / 4, source: 'tension-control-event' }
  ])
  assert.deepEqual(merged.map(({ source }) => source), ['seed', 'seed', 'seed', 'tension-control-event'])
  assert.equal(merged[1].angle, Math.PI / 2)
  assert.equal(merged[3].angle, wrapGradientAngle(-Math.PI / 4))
})

/**
 * F-03(a) (docs/task-packets/2026-11-12-f03-fixed-sampling-supplements.md). Oracles: rectangle second
 * moments b·h³/12 and the parallel-axis theorem for an L and a hollow section; for the gap rule, the
 * normalized gaps measured independently after merging.
 */
const rect = (x0: number, y0: number, x1: number, y1: number) =>
  [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }].map((point, index) => ({ id: index + 1, ...point }))
const section = (outer: ReturnType<typeof rect>, holes: ReturnType<typeof rect>[] = []) =>
  ({ id: 1, name: 'covariance', solids: [{ id: 1, outer, holes }] })

test('F-03: net-concrete area covariance matches rectangle and parallel-axis oracles', () => {
  const offset = netConcreteAreaCovariance(section(rect(100, -50, 400, 650)))
  assert.ok(offset)
  assert.ok(Math.abs(offset.xx - 300 ** 2 / 12) < 1e-6 && Math.abs(offset.yy - 700 ** 2 / 12) < 1e-6 && Math.abs(offset.xy) < 1e-6)
  // L = A (0..600 x 0..200) + B (0..200 x 200..600): composite moments by the parallel-axis theorem.
  const parts = [{ b: 600, h: 200, cx: 300, cy: 100 }, { b: 200, h: 400, cx: 100, cy: 400 }]
  const area = parts.reduce((sum, p) => sum + p.b * p.h, 0)
  const cx = parts.reduce((sum, p) => sum + p.b * p.h * p.cx, 0) / area
  const cy = parts.reduce((sum, p) => sum + p.b * p.h * p.cy, 0) / area
  const expected = {
    xx: parts.reduce((sum, p) => sum + p.b * p.h * (p.b ** 2 / 12 + (p.cx - cx) ** 2), 0) / area,
    yy: parts.reduce((sum, p) => sum + p.b * p.h * (p.h ** 2 / 12 + (p.cy - cy) ** 2), 0) / area,
    xy: parts.reduce((sum, p) => sum + p.b * p.h * (p.cx - cx) * (p.cy - cy), 0) / area
  }
  const l = netConcreteAreaCovariance(section([{ x: 0, y: 0 }, { x: 600, y: 0 }, { x: 600, y: 200 }, { x: 200, y: 200 }, { x: 200, y: 600 }, { x: 0, y: 600 }]
    .map((point, index) => ({ id: index + 1, ...point }))))
  assert.ok(l)
  for (const key of ['xx', 'yy', 'xy'] as const) assert.ok(Math.abs(l[key] - expected[key]) < 1e-6 * Math.abs(expected.xx), `${key}`)
  // A centred 400 x 400 hole in a 600 x 600 square: (600⁴ − 400⁴) / 12 / (600² − 400²).
  const hollow = netConcreteAreaCovariance(section(rect(-300, -300, 300, 300), [rect(-200, -200, 200, 200)]))
  assert.ok(hollow && Math.abs(hollow.xx - (600 ** 4 - 400 ** 4) / 12 / (600 ** 2 - 400 ** 2)) < 1e-6)
})

test('F-03: normalized gaps close to the base spacing, preserve order and stay bounded', () => {
  const seeds = Array.from({ length: 36 }, (_, index) => index * 10 * DEG)
  const step = 10 * DEG
  assert.deepEqual(normalizedGapGradientAngles(seeds, { xx: 5, yy: 5, xy: 0 }, step), [])
  for (const covariance of [{ xx: 250 ** 2 / 12, yy: 2500 ** 2 / 12, xy: 0 }, { xx: 9e4, yy: 1e4, xy: 2.5e4 }]) {
    const added = normalizedGapGradientAngles(seeds, covariance, step)
    assert.ok(added.length > 0 && added.length <= seeds.length, `${added.length} added`)
    const all = [...seeds, ...added].map(wrapGradientAngle).sort((a, b) => a - b)
    // Independent measurement of the normalized gaps with S = C^(1/2) by eigen-decomposition.
    const { xx, yy, xy } = covariance
    const half = Math.sqrt(((xx - yy) / 2) ** 2 + xy ** 2), mean = (xx + yy) / 2
    const angle = 0.5 * Math.atan2(2 * xy, xx - yy)
    const [l1, l2] = [Math.sqrt(mean + half), Math.sqrt(mean - half)]
    const [c, s] = [Math.cos(angle), Math.sin(angle)]
    const normalized = (theta: number) => {
      const u = c * Math.cos(theta) + s * Math.sin(theta), v = -s * Math.cos(theta) + c * Math.sin(theta)
      const [a, b] = [l1 * u, l2 * v]
      return wrapGradientAngle(Math.atan2(s * a + c * b, c * a - s * b))
    }
    const phis = all.map(normalized)
    for (let index = 0; index < phis.length; index += 1) {
      assert.ok(phis[(index + 1) % phis.length] !== phis[index])
      const gap = wrapGradientAngle(phis[(index + 1) % phis.length] - phis[index])
      assert.ok(gap <= step + 1e-9, `normalized gap ${gap / DEG} deg`)
    }
    // Cyclic order is preserved: normalized angles increase around the circle exactly once.
    const descents = phis.filter((phi, index) => index > 0 && phi < phis[index - 1]).length
    assert.ok(descents <= 1)
  }
  assert.throws(() => normalizedGapGradientAngles([0, Number.NaN], { xx: 1, yy: 1, xy: 0 }, step), RangeError)
  assert.throws(() => normalizedGapGradientAngles(seeds, { xx: 1, yy: 0, xy: 0 }, step), RangeError)
})

test('ENG-GEO-004/R3: covariance and normalized-gap rows survive world-coordinate translation', () => {
  const seeds = Array.from({ length: 36 }, (_, index) => index * 10 * DEG)
  const translate = (ring: ReturnType<typeof rect>, x: number, y: number) =>
    ring.map(point => ({ ...point, x: point.x + x, y: point.y + y }))
  for (const [outer, holes, expected] of [
    [rect(-125, -1250, 125, 1250), [], { xx: 250 ** 2 / 12, yy: 2500 ** 2 / 12, xy: 0 }],
    [rect(-300, -300, 300, 300), [rect(-200, -200, 200, 200)],
      { xx: (600 ** 4 - 400 ** 4) / 12 / (600 ** 2 - 400 ** 2), yy: (600 ** 4 - 400 ** 4) / 12 / (600 ** 2 - 400 ** 2), xy: 0 }]
  ] as const) {
    const base = netConcreteAreaCovariance(section([...outer], [...holes]))
    assert.ok(base)
    for (const [x, y] of [[1e8, 1e8], [-1e8, 1e8], [1e9, -1e9]]) {
      const moved = netConcreteAreaCovariance(section(translate([...outer], x, y), holes.map(hole => translate(hole, x, y))))
      assert.ok(moved)
      for (const key of ['xx', 'yy', 'xy'] as const) assert.ok(Math.abs(moved[key] - expected[key]) < 1e-6, key)
      assert.deepEqual(normalizedGapGradientAngles(seeds, moved, 10 * DEG), normalizedGapGradientAngles(seeds, base, 10 * DEG))
    }
  }
  assert.equal(netConcreteAreaCovariance({ id: 1, name: 'empty', solids: [] }), null)
  const invalid = rect(0, 0, 10, 10)
  invalid[0].x = NaN
  assert.equal(netConcreteAreaCovariance(section(invalid)), null)
  assert.throws(() => normalizedGapGradientAngles(seeds, { xx: -1, yy: 2, xy: 0 }, 10 * DEG), RangeError)
  // Only covariance shape matters for angles; a finite scale must not overflow its determinant.
  assert.deepEqual(normalizedGapGradientAngles(seeds, { xx: 1e308, yy: 1e308, xy: 0 }, 10 * DEG), [])
})
