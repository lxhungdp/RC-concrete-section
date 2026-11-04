import assert from 'node:assert/strict'
import test from 'node:test'
import { fixedPContourLinePoints, fixedPContourPaths, intersectFixedPContourWithMomentRay,
  sliceFixedPContour, type PreviewSurfacePoint, type SurfaceIndexTriangle } from '../src/index'

const vertex = (P: number, Mx: number, My: number, index: number): PreviewSurfacePoint => ({
  id: `box-${index}`, P, Mx, My, beta: 0, station: index, stationId: null, surfaceRole: 'physical-state',
  state: { e0: 0, kx: 0, ky: 0 }, ledger: {
    concrete: { P, Mx, My }, steel: { P: 0, Mx: 0, My: 0 }, steelGross: { P: 0, Mx: 0, My: 0 },
    displacedConcrete: { P: 0, Mx: 0, My: 0 }, total: { P, Mx, My }
  }
})
const box = (offset = 0, index = 0) => {
  const points = [-2, 2].flatMap(P => [[-4, -6], [4, -6], [4, 6], [-4, 6]]
    .map(([Mx, My], i) => vertex(P, Mx + offset, My, index + i)))
  const triangles: SurfaceIndexTriangle[] = [[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],
    [1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]].map(([a,b,c]) => ({a:a+index,b:b+index,c:c+index}))
  return { points, triangles }
}

test('ENG-AN-003: indexed cuts preserve two components and suppress cap diagonals', () => {
  const first = box(), second = box(20, 8)
  const points = [...first.points, ...second.points], triangles = [...first.triangles, ...second.triangles]
  for (const P of [0, 2, -2]) {
    const contour = sliceFixedPContour(points, P, triangles)
    const paths = fixedPContourPaths(contour)
    assert.equal(paths.length, 2)
    assert.ok(paths.every(path => path.every(point => point.pathClosed && point.P === P)))
    assert.equal(fixedPContourLinePoints(contour).filter(point => point === null).length, 2)
    for (const path of paths) assert.ok(Math.max(...path.map(p => p.Mx)) - Math.min(...path.map(p => p.Mx)) === 8)
    assert.equal(intersectFixedPContourWithMomentRay(contour, 0), null, 'multiple exits cannot publish a radial ratio')
    assert.ok(Math.abs(intersectFixedPContourWithMomentRay(contour, Math.PI)!.M - 4) < 1e-12)
  }
  assert.deepEqual(sliceFixedPContour(points, 2.01, triangles), [])
})

test('ENG-AN-003: box radius agrees analytically after face permutation', () => {
  const { points, triangles } = box()
  for (const faces of [triangles, [...triangles].reverse()]) {
    const contour = sliceFixedPContour(points, 0, faces)
    for (let i = 0; i < 8; i += 1) {
      const theta = (i + 0.37) * Math.PI / 4
      const expected = Math.min(4 / Math.abs(Math.cos(theta)), 6 / Math.abs(Math.sin(theta)))
      assert.ok(Math.abs(intersectFixedPContourWithMomentRay(contour, theta)!.M - expected) < 1e-12)
    }
  }
})

test('ENG-AN-003: an open surface cut cannot publish a qualified contour ratio', () => {
  const { points, triangles } = box()
  const contour = sliceFixedPContour(points, 0, triangles.filter(t => t.a !== 3))
  assert.ok(contour.some(point => point.pathClosed === false))
  assert.equal(intersectFixedPContourWithMomentRay(contour, Math.PI), null)
})

test('ENG-AN-003: outside axes, vertex tangency and nested holes stay unavailable', () => {
  const outside = box(20)
  const contour = sliceFixedPContour(outside.points, 0, outside.triangles)
  assert.equal(intersectFixedPContourWithMomentRay(contour, 0), null)
  assert.equal(intersectFixedPContourWithMomentRay(contour, Math.atan2(6, 16)), null)
  const outer = box(), inner = box(0, 8)
  const shell = [...outer.points, ...inner.points.map(point => ({ ...point, Mx: point.Mx / 2, My: point.My / 2 }))]
  const paths = sliceFixedPContour(shell, 0, [...outer.triangles, ...inner.triangles.map(t => ({ a: t.a, b: t.c, c: t.b }))])
  assert.equal(fixedPContourPaths(paths).length, 2)
  assert.equal(intersectFixedPContourWithMomentRay(paths, 0), null)
})
