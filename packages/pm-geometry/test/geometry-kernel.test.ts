import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildConcreteMesh,
  createRectangleRing,
  sectionCentroid,
  signedPolygonArea,
  summarizeSection,
  type Point2,
  type SectionGeometry
} from '../src/index'

const close = (actual: number, expected: number, tolerance = 1e-10) =>
  assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`)

test('multi-solid area and centroid with an off-centre hole match the closed form', () => {
  const geometry: SectionGeometry = {
    id: 1,
    name: 'analytical multi-solid',
    solids: [
      {
        outer: createRectangleRing({ width: 10, height: 8 }),
        holes: [createRectangleRing({ width: 2, height: 2, center: { x: 1, y: 0 }, usedIds: [1, 2, 3, 4] })]
      },
      {
        outer: createRectangleRing({ width: 4, height: 6, center: { x: 20, y: 5 }, usedIds: [1, 2, 3, 4, 5, 6, 7, 8] }),
        holes: []
      }
    ]
  }

  const summary = summarizeSection(geometry)
  close(summary.area, 100)
  close(summary.centroid.x, 4.76)
  close(summary.centroid.y, 1.2)
  close(sectionCentroid(geometry).x, 4.76)
  close(sectionCentroid(geometry).y, 1.2)
})

test('triangle/quadrature mesh conserves area for deterministic perturbed polygons', () => {
  let state = 0x5eed1234
  const random = () => {
    state = (1664525 * state + 1013904223) >>> 0
    return state / 0x1_0000_0000
  }

  for (let sample = 0; sample < 20; sample += 1) {
    const ring: Point2[] = Array.from({ length: 12 }, (_, index) => {
      const angle = 2 * Math.PI * index / 12
      const radius = 85 + 30 * random()
      return { id: index + 1, x: radius * Math.cos(angle), y: radius * Math.sin(angle) }
    })
    const geometry: SectionGeometry = {
      id: sample + 1,
      name: `perturbed-${sample}`,
      solids: [{ outer: ring, holes: [] }]
    }
    const mesh = buildConcreteMesh(geometry, { cellSize: 300, maxCells: 4, maxSubdivision: 2 })
    const expectedArea = Math.abs(signedPolygonArea(ring))
    const triangleArea = mesh.triangles.reduce((sum, triangle) => sum + triangle.area, 0)
    close(triangleArea, expectedArea, 1e-9)
    close(mesh.report.meshed.area, expectedArea, 1e-9)
    assert.equal(mesh.report.ok, true, mesh.report.warnings.join('; '))
  }
})

test('three-point triangle rule integrates a degree-2 polynomial exactly', () => {
  const geometry: SectionGeometry = {
    id: 1,
    name: 'unit right triangle',
    solids: [{
      outer: [
        { id: 1, x: 0, y: 0 },
        { id: 2, x: 1, y: 0 },
        { id: 3, x: 0, y: 1 }
      ],
      holes: []
    }]
  }
  const mesh = buildConcreteMesh(geometry, { cellSize: 2, maxCells: 1, maxSubdivision: 0 })
  const polynomial = (x: number, y: number) => x * x + 2 * x * y + 3 * y * y + 4 * x + 5 * y + 6
  const integrated = mesh.points.reduce((sum, point) => sum + point.area * polynomial(point.x, point.y), 0)

  // On x >= 0, y >= 0, x + y <= 1:
  // int(1)=1/2, int(x)=int(y)=1/6, int(x^2)=int(y^2)=1/12, int(xy)=1/24.
  const expected = 1 / 12 + 2 / 24 + 3 / 12 + 4 / 6 + 5 / 6 + 6 / 2
  close(integrated, expected, 1e-12)
})

