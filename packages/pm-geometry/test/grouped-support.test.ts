import assert from 'node:assert/strict'
import test from 'node:test'
import { prepareGroupedPointSupports } from '../src/index'

test('group support extremes reproduce exhaustive affine strain checks in arbitrary directions', () => {
  const points = Array.from({ length: 512 }, (_, id) => ({ id, group: id % 8, x: Math.sin(id * 17.3) * 300, y: Math.cos(id * 3.7) * 400 }))
  const supports = prepareGroupedPointSupports(points, (point) => String(point.group))
  for (let index = 0; index < 360; index += 1) {
    const angle = index * Math.PI / 180
    const nx = Math.sin(angle)
    const ny = Math.cos(angle)
    const e0 = Math.sin(index) * 0.02
    const curvature = 0.00007
    for (const group of supports(nx, ny)) {
      const values = points.filter((point) => String(point.group) === group.groupId).map((point) => e0 + curvature * (nx * point.x + ny * point.y))
      const at = (point: typeof points[number]) => e0 + curvature * (nx * point.x + ny * point.y)
      assert.equal(at(group.minimum), Math.min(...values))
      assert.equal(at(group.maximum), Math.max(...values))
    }
  }
  const first = supports(1, 0)
  assert.strictEqual(supports(1, 0), first)
  assert.equal(supports(0, 0).length, 8)
  assert.throws(() => supports(Number.NaN, 1))
})
