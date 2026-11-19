import { strict as assert } from 'node:assert'
import test from 'node:test'
import { buildConcreteMesh, type Point2, type SectionGeometry } from '@pm/geometry'

const ring = (coordinates: Array<[number, number]>, firstId: number): Point2[] =>
  coordinates.map(([x, y], index) => ({ id: firstId + index, x, y }))

const cases: SectionGeometry[] = [
  {
    id: 1,
    name: 'axis-aligned with hole',
    solids: [
      {
        outer: ring([[-300, -250], [300, -250], [300, 250], [-300, 250]], 1),
        holes: [ring([[-90, -70], [-90, 70], [90, 70], [90, -70]], 10)]
      }
    ]
  },
  {
    id: 2,
    name: 'concave oblique boundary',
    solids: [
      {
        outer: ring([[-280, -210], [240, -170], [110, -15], [270, 210], [-60, 180], [-90, 15], [-250, 90]], 20),
        holes: []
      }
    ]
  },
  {
    id: 3,
    name: 'disconnected regions',
    solids: [
      { outer: ring([[-310, -140], [-70, -190], [-30, 110], [-280, 170]], 40), holes: [] },
      { outer: ring([[40, -170], [300, -90], [240, 190], [70, 120]], 50), holes: [] }
    ]
  }
]

const integrateQuadratic = (mesh: ReturnType<typeof buildConcreteMesh>) =>
  mesh.points.reduce(
    (sum, point) => sum + point.area * (2 + 3 * point.x - 4 * point.y + point.x ** 2 + 0.5 * point.x * point.y),
    0
  )

for (const section of cases) {
  test(`spatial mesh matches all-cells boolean reference: ${section.name}`, () => {
    const accelerated = buildConcreteMesh(section, { cellSize: 17.5 })
    const reference = buildConcreteMesh(section, { cellSize: 17.5, spatialAcceleration: false })

    assert.equal(accelerated.report.ok, true, accelerated.report.warnings.join('; '))
    assert.equal(reference.report.ok, true, reference.report.warnings.join('; '))
    assert.deepEqual(accelerated.report.exact, reference.report.exact)
    assert.equal(accelerated.report.gridX, reference.report.gridX)
    assert.equal(accelerated.report.gridY, reference.report.gridY)

    const scale = Math.max(1, Math.abs(integrateQuadratic(reference)))
    assert.ok(
      Math.abs(integrateQuadratic(accelerated) - integrateQuadratic(reference)) <= 5e-13 * scale,
      'degree-2 quadrature changed after spatial classification'
    )
    for (const key of ['area', 'firstMomentX', 'firstMomentY'] as const) {
      const expected = reference.report.meshed[key]
      assert.ok(
        Math.abs(accelerated.report.meshed[key] - expected) <= 5e-13 * Math.max(1, Math.abs(expected)),
        `${key} changed after spatial classification`
      )
    }
  })
}
