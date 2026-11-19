import assert from 'node:assert/strict'
import test from 'node:test'
import type { PreviewSurfacePoint } from '@pm/analysis'
import {
  buildDirectMeridianSection,
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
  stationId: `adaptive-station-test-${station}`,
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

test('fallback topology rejects unequal independent station schedules instead of pairing row indices', () => {
  const points = [
    point(0, 0), point(0, 0.4), point(0, 1),
    point(1, 0), point(1, 0.7), point(1, 0.9), point(1, 1)
  ]
  assert.throws(
    () => buildClosedSurfaceTriangles(points),
    /Explicit surface topology is required/
  )
})

test('visible surface grid keeps meridians and parallels but hides diagonals', () => {
  const points = [point(0, 0), point(0, 1), point(1, 0), point(1, 1)]
  assert.equal(isMeridianOrParallelEdge(points, 0, 1), true, 'meridian edge was hidden')
  assert.equal(isMeridianOrParallelEdge(points, 0, 2), true, 'parallel edge was hidden')
  assert.equal(isMeridianOrParallelEdge(points, 0, 3), false, 'diagonal edge was shown')
  const capFacePoint = { ...point(0, -1), surfaceRole: 'axial-cap' as const, onSampledDirection: false }
  assert.equal(
    isMeridianOrParallelEdge([...points, capFacePoint], 0, 4),
    false,
    'an internal cap-face edge was shown as a meridian'
  )
})

test('visible grid treats a shared pole edge as every meridian and never index-pairs adaptive rows', () => {
  const pole = {
    ...point(0, 0),
    surfaceRole: 'pure-compression' as const,
    stationId: 'pure-compression' as const,
    Mx: 0,
    My: 0
  }
  const row90 = point(Math.PI / 2, 0.4)
  const unrelated = point(Math.PI, 0.4)
  unrelated.stationId = 'adaptive-station-other'
  assert.equal(isMeridianOrParallelEdge([pole, row90], 0, 1), true)
  assert.equal(isMeridianOrParallelEdge([row90, unrelated], 0, 1), false)
})

test('vertical-slice markers distinguish numbered stations from intermediate vertices', () => {
  assert.equal(isIntermediateStationValue(7), false)
  assert.equal(isIntermediateStationValue(7 + 1e-8), false)
  assert.equal(isIntermediateStationValue(7.36), true)
  assert.equal(isIntermediateStationValue(undefined), false)
})

test('direct opposite meridian reuses shared equivalent-block poles and closes one loop', () => {
  const compression = {
    ...point(0, 0),
    id: 'compression-pole',
    surfaceRole: 'pure-compression' as const,
    stationId: 'pure-compression' as const,
    P: 10,
    Mx: 0,
    My: 0
  }
  const tension = {
    ...point(0, 1),
    id: 'tension-pole',
    surfaceRole: 'pure-tension' as const,
    stationId: 'pure-tension' as const,
    P: -10,
    Mx: 0,
    My: 0
  }
  const primary = { ...point(0, 0.4), id: 'primary', Mx: 5, My: 0 }
  const opposite = { ...point(Math.PI, 0.4), id: 'opposite', Mx: -6, My: 0 }
  const section = buildDirectMeridianSection(
    [compression, tension, primary, opposite],
    0,
    true
  )

  assert.equal(section.primary[0]?.id, compression.id)
  assert.equal(section.primary.at(-1)?.id, tension.id)
  assert.equal(section.opposite[0]?.id, compression.id)
  assert.equal(section.opposite.at(-1)?.id, tension.id)
  assert.ok(section.primary.every((item) => item.sectionPointRole === 'surface-vertex'))
  assert.equal(section.displayPaths.length, 1)
  assert.equal(section.closed, true)
  assert.equal(section.displayPaths[0][0]?.id, section.displayPaths[0].at(-1)?.id)
  assert.ok(section.displayPaths[0].some((item) => item.Mx > 0))
  assert.ok(section.displayPaths[0].some((item) => item.Mx < 0))
})

test('direct capped meridians close across their two cap endpoints without welding cap to tension', () => {
  const tension = {
    ...point(0, 1),
    id: 'tension-pole',
    surfaceRole: 'pure-tension' as const,
    stationId: 'pure-tension' as const,
    P: -10,
    Mx: 0,
    My: 0
  }
  const primaryCap = {
    ...point(0, -1),
    id: 'primary-cap',
    surfaceRole: 'axial-cap' as const,
    onSampledDirection: true,
    P: 8,
    Mx: 2,
    My: 0
  }
  const oppositeCap = {
    ...point(Math.PI, -1),
    id: 'opposite-cap',
    surfaceRole: 'axial-cap' as const,
    onSampledDirection: true,
    P: 8,
    Mx: -3,
    My: 0
  }
  const internalCapFace = {
    ...point(0, -1),
    id: 'internal-cap-face',
    surfaceRole: 'axial-cap' as const,
    onSampledDirection: false,
    P: 8,
    Mx: -100,
    My: 0
  }
  const primary = { ...point(0, 0.5), id: 'primary', Mx: 5, My: 0 }
  const opposite = { ...point(Math.PI, 0.5), id: 'opposite', Mx: -6, My: 0 }
  const section = buildDirectMeridianSection(
    [tension, primaryCap, oppositeCap, internalCapFace, primary, opposite],
    0,
    true
  )
  const loop = section.displayPaths[0]
  const capCenter = loop[0]

  assert.equal(section.closed, true)
  assert.equal(capCenter.surfaceRole, 'axial-cap')
  assert.equal(capCenter.P, primaryCap.P)
  assert.equal(capCenter.Mx, 0)
  assert.equal(capCenter.My, 0)
  assert.equal(loop[1]?.id, primaryCap.id)
  assert.equal(loop.at(-2)?.id, oppositeCap.id)
  assert.equal(loop.at(-1)?.Mx, 0)
  assert.equal(loop.at(-1)?.My, 0)
  assert.equal(loop.filter((item) => item.surfaceRole === 'pure-tension').length, 1)
  assert.equal(loop.some((item) => item.id === internalCapFace.id), false)
})

test('one capped meridian keeps the Pmax segment from the axial center to its cap crossing', () => {
  const tension = {
    ...point(0, 1),
    id: 'tension-pole',
    surfaceRole: 'pure-tension' as const,
    stationId: 'pure-tension' as const,
    P: -10,
    Mx: 0,
    My: 0
  }
  const cap = {
    ...point(0, -1),
    id: 'positive-cap',
    surfaceRole: 'axial-cap' as const,
    onSampledDirection: true,
    P: 8,
    Mx: 3,
    My: 0
  }
  const state = { ...point(0, 0.5), id: 'positive-state', P: 6, Mx: 5, My: 0 }
  const section = buildDirectMeridianSection([tension, cap, state], 0, false)
  const path = section.displayPaths[0]

  assert.equal(section.closed, false)
  assert.equal(path.length, 4)
  assert.deepEqual(
    path.slice(0, 2).map((item) => [item.Mx, item.P]),
    [[0, 8], [3, 8]]
  )
  assert.equal(path.at(-1)?.id, tension.id)
  assert.equal(path[0]?.sectionPointRole, 'axial-center')
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
