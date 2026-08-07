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

test('a plane coincident with an axial cap keeps only cap-boundary meridians sampled', () => {
  const cap0 = {
    ...point('cap-0', 0, -1, 10, 100, 0),
    surfaceRole: 'axial-cap' as const,
    onSampledDirection: true
  }
  const cap90 = {
    ...point('cap-90', Math.PI / 2, -1, 10, 0, 100),
    surfaceRole: 'axial-cap' as const,
    onSampledDirection: true
  }
  const internal = {
    ...point('cap-internal', 0, -1, 10, 50, 50),
    surfaceRole: 'axial-cap' as const,
    onSampledDirection: false
  }
  const contour = sliceFixedPContour(
    [cap0, cap90, internal],
    10,
    [{ a: 0, b: 1, c: 2 }]
  )

  assert.equal(contour.length, 3)
  assert.equal(contourStrainAngleSamples(contour).length, 2)
  assert.equal(contour.filter((item) => !item.onSampledDirection).length, 1)
})

test('a cap-boundary edge remains a sampled meridian immediately below Pmax', () => {
  const cap0 = {
    ...point('cap-0', 0, -1, 10, 100, 0),
    surfaceRole: 'axial-cap' as const,
    onSampledDirection: true
  }
  const cap90 = {
    ...point('cap-90', Math.PI / 2, -1, 10, 0, 100),
    surfaceRole: 'axial-cap' as const,
    onSampledDirection: true
  }
  const low0 = point('low-0', 0, 1, 8, 120, 0)
  const low90 = point('low-90', Math.PI / 2, 1, 8, 0, 120)
  const contour = sliceFixedPContour(
    [cap0, cap90, low0, low90],
    9,
    [{ a: 0, b: 1, c: 3 }, { a: 0, b: 3, c: 2 }]
  )
  const sampled = contourStrainAngleSamples(contour)

  assert.equal(sampled.length, 2)
  assert.ok(sampled.some((item) => item.beta === 0 && item.Mx === 110 && item.My === 0))
  assert.ok(sampled.some((item) => item.beta === Math.PI / 2 && item.Mx === 0 && item.My === 110))
})

test('a shared axial pole contributes one correctly labelled intersection to every meridian', () => {
  const pole = { ...point('pole', 0, 0, 10, 0, 0), surfaceRole: 'pure-compression' as const }
  const rows = [
    point('row-0', 0, 1, 0, 4, 0),
    point('row-120', 2 * Math.PI / 3, 1, 0, -2, 3.464),
    point('row-240', 4 * Math.PI / 3, 1, 0, -2, -3.464)
  ]
  const points = [pole, ...rows]
  const contour = sliceFixedPContour(points, 9, [
    { a: 0, b: 1, c: 2 },
    { a: 0, b: 2, c: 3 },
    { a: 0, b: 3, c: 1 }
  ])
  const sampled = contourStrainAngleSamples(contour)
  assert.equal(sampled.length, 3)
  assert.deepEqual(
    sampled.map((entry) => Number(entry.beta.toFixed(12))),
    rows.map((entry) => Number(entry.beta.toFixed(12)))
  )
})
