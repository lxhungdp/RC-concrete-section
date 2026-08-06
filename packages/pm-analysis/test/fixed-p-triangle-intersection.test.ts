import { strict as assert } from 'node:assert'
import test from 'node:test'
import {
  contourStrainAngleSamples,
  intersectFixedPContourWithMomentRay,
  sliceFixedPContour,
  type PreviewSurfacePoint,
  type SurfaceIndexTriangle
} from '../src/index'

const point = (
  id: string,
  beta: number,
  station: number,
  P: number,
  Mx: number,
  My: number
): PreviewSurfacePoint => ({
  id,
  beta,
  station,
  stationId: null,
  surfaceRole: 'physical-state',
  P,
  Mx,
  My
} as PreviewSurfacePoint)

const close = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) <= 1e-9, `${actual} != ${expected}`)

const A = point('A', 0, 0, 10, 100, 0)
const D = point('D', 0, 1, -10, 200, 0)
const B = point('B', Math.PI / 2, 0, 10, 0, 100)
const C = point('C', Math.PI / 2, 1, -10, 0, 300)
const points = [A, D, B, C]
const topology: SurfaceIndexTriangle[] = [
  { a: 0, b: 2, c: 3 }, // ABC
  { a: 0, b: 3, c: 1 } // ACD — shared diagonal AC
]

test('fixed-P slicing keeps the diagonal intersection of the authoritative triangle mesh', () => {
  const contour = sliceFixedPContour(points, 0, topology)
  const sampled = contourStrainAngleSamples(contour)
  const intermediate = contour.filter((item) => !item.onSampledDirection)

  assert.equal(contour.length, 3)
  assert.equal(sampled.length, 2, 'the two meridians provide the red sampled points')
  assert.equal(intermediate.length, 1, 'the shared AC diagonal provides one blue intermediate point')

  close(sampled[0].Mx, 150)
  close(sampled[0].My, 0)
  close(sampled[1].Mx, 0)
  close(sampled[1].My, 200)
  close(intermediate[0].Mx, 50)
  close(intermediate[0].My, 150)
  assert.ok(contour.every((item) => item.P === 0))
})

test('the second interpolation uses the two triangle-cut chords, including the diagonal vertex', () => {
  const contour = [
    ...sliceFixedPContour(points, 0, topology),
    { beta: Math.PI, P: 0, Mx: -150, My: 0, onSampledDirection: true },
    { beta: 3 * Math.PI / 2, P: 0, Mx: 0, My: -200, onSampledDirection: true }
  ].sort((a, b) => Math.atan2(a.My, a.Mx) - Math.atan2(b.My, b.Mx))
  const hit = intersectFixedPContourWithMomentRay(contour, Math.PI / 4)

  assert.ok(hit)
  close(hit.Mx, 90)
  close(hit.My, 90)
  close(hit.M, 90 * Math.SQRT2)
})

test('reversing the axial order on a triangle edge does not change its plane intersection', () => {
  const reversed = [D, A, C, B]
  const reversedTopology: SurfaceIndexTriangle[] = [
    { a: 1, b: 3, c: 2 },
    { a: 1, b: 2, c: 0 }
  ]

  const contour = sliceFixedPContour(reversed, 0, reversedTopology)
  assert.equal(contour.length, 3)
  assert.ok(contour.some((item) => !item.onSampledDirection && item.Mx === 50 && item.My === 150))
})

test('a fixed-P level outside the triangle mesh returns no contour vertices', () => {
  assert.deepEqual(sliceFixedPContour(points, 100, topology), [])
})
