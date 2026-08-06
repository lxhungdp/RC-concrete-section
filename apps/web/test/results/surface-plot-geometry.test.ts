import assert from 'node:assert/strict'
import test from 'node:test'
import type { PreviewSurfacePoint } from '@pm/analysis'
import {
  buildClosedSurfaceTriangles,
  isIntermediateStationValue,
  isMeridianOrParallelEdge,
  triangulatePlanarPolygon,
  type PlanarPoint
} from '../../features/section-editor/results/surface-plot-geometry'

const point = (beta: number, station: number): PreviewSurfacePoint => ({
  id: `${beta}:${station}`,
  beta,
  station,
  stationId: null,
  surfaceRole: 'physical-state',
  P: station,
  Mx: Math.cos(beta) * (station + 1),
  My: Math.sin(beta) * (station + 1),
  state: { e0: 0, kx: 0, ky: 0 },
  ledger: {
    concrete: { P: 0, Mx: 0, My: 0 },
    steelGross: { P: 0, Mx: 0, My: 0 },
    displacedConcrete: { P: 0, Mx: 0, My: 0 },
    steel: { P: 0, Mx: 0, My: 0 },
    total: { P: 0, Mx: 0, My: 0 }
  }
})

test('structured surface topology closes the final beta row back to the first', () => {
  const betas = [0, 1, 2]
  const points = betas.flatMap((beta) => [point(beta, 0), point(beta, 1), point(beta, 2)])
  const triangles = buildClosedSurfaceTriangles(points)
  assert.equal(triangles.length, betas.length * 2 * 2)

  const seamLeft = 6
  const seamRight = 0
  assert.ok(
    triangles.some(({ a, b, c }) => [a, b, c].includes(seamLeft) && [a, b, c].includes(seamRight)),
    'missing last-to-first beta seam'
  )
})

test('visible surface grid keeps meridians and parallels but hides diagonals', () => {
  const points = [point(0, 0), point(0, 1), point(1, 0), point(1, 1)]
  assert.equal(isMeridianOrParallelEdge(points, 0, 1), true, 'meridian edge was hidden')
  assert.equal(isMeridianOrParallelEdge(points, 0, 2), true, 'parallel edge was hidden')
  assert.equal(isMeridianOrParallelEdge(points, 0, 3), false, 'diagonal edge was shown')
})

test('vertical-slice markers distinguish numbered stations from intermediate vertices', () => {
  assert.equal(isIntermediateStationValue(7), false)
  assert.equal(isIntermediateStationValue(7 + 1e-8), false)
  assert.equal(isIntermediateStationValue(7.36), true)
  assert.equal(isIntermediateStationValue(undefined), false)
})

const polygonArea = (points: readonly PlanarPoint[]) => Math.abs(points.reduce((area, point, index) => {
  const next = points[(index + 1) % points.length]
  return area + point.u * next.v - next.u * point.v
}, 0) / 2)

test('plane fill triangulation stays inside a concave section boundary', () => {
  const polygon = [
    { u: 0, v: 0 },
    { u: 3, v: 0 },
    { u: 3, v: 1 },
    { u: 1, v: 1 },
    { u: 1, v: 3 },
    { u: 0, v: 3 }
  ]
  const triangles = triangulatePlanarPolygon(polygon)
  const triangleArea = triangles.reduce((sum, { a, b, c }) =>
    sum + Math.abs(
      (polygon[b].u - polygon[a].u) * (polygon[c].v - polygon[a].v) -
      (polygon[b].v - polygon[a].v) * (polygon[c].u - polygon[a].u)
    ) / 2, 0)

  assert.equal(triangles.length, polygon.length - 2)
  assert.equal(triangleArea, polygonArea(polygon))
})
