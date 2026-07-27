import assert from 'node:assert/strict'
import test from 'node:test'
import { buildConcreteMesh, TRIANGLE_RULE, type SectionGeometry } from '@pm/geometry'
import {
  MAX_EXACT_MESH_TRIANGLES_PER_FRAME,
  packSectionMeshView,
  sectionMeshRenderPlan
} from './section-mesh-view'

const slenderSection: SectionGeometry = {
  id: 1,
  name: 'Slender display fixture',
  solids: [
    {
      outer: [
        { id: 1, x: 0, y: 0 },
        { id: 2, x: 100, y: 0 },
        { id: 3, x: 100, y: 1000 },
        { id: 4, x: 0, y: 1000 }
      ],
      holes: []
    }
  ]
}

test('the section mesh view packs the exact kernel triangulation into compact cell ranges', () => {
  const mesh = buildConcreteMesh(slenderSection)
  const view = packSectionMeshView(mesh)

  assert.equal(view.triangleCount, mesh.triangles.length)
  assert.equal(view.coordinates.length, mesh.triangles.length * 6)
  assert.equal(view.areas.length, mesh.triangles.length)
  assert.equal(view.metadata.length, mesh.triangles.length * 3)
  assert.equal(view.cellOffsets.length, mesh.report.gridX * mesh.report.gridY + 1)
  assert.equal(view.cellOffsets.at(-1), mesh.triangles.length)
  assert.deepEqual([...view.quadratureRule], TRIANGLE_RULE.flat())

  for (let index = 1; index < view.cellOffsets.length; index++) {
    assert.ok(view.cellOffsets[index] >= view.cellOffsets[index - 1])
  }

  const packedArea = view.areas.reduce((sum, area) => sum + area, 0)
  const sourceArea = mesh.triangles.reduce((sum, triangle) => sum + triangle.area, 0)
  assert.ok(Math.abs(packedArea - sourceArea) <= 1e-9 * Math.max(1, sourceArea))

  const transferredBytes =
    view.coordinates.byteLength +
    view.areas.byteLength +
    view.metadata.byteLength +
    view.cellOffsets.byteLength +
    view.quadratureRule.byteLength
  assert.ok(transferredBytes <= view.triangleCount * 72 + view.cellOffsets.byteLength + 128)
})

test('the render planner bounds exact per-frame work and exposes LOD until cells are inspectable', () => {
  assert.deepEqual(sectionMeshRenderPlan(4, 40_000), { exact: true, stride: 1 })
  assert.equal(sectionMeshRenderPlan(4, MAX_EXACT_MESH_TRIANGLES_PER_FRAME + 1).exact, false)

  const overview = sectionMeshRenderPlan(0.2, 204_800)
  assert.equal(overview.exact, false)
  assert.ok(overview.stride >= 25)
})
