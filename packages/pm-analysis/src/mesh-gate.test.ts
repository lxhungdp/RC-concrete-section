/**
 * An integration mesh that failed its own checks must not reach the evaluator.
 *
 * Before this gate, `buildConcreteMesh` reported a resource limit by returning an empty mesh, and
 * the surface build carried on with the reinforcement alone: for the reference section that plots a
 * complete, plausible interaction diagram whose `P0` is 5 421 kN instead of 33 981 kN.
 */
import { strict as assert } from 'node:assert'
import test from 'node:test'
import { geometryInputRebars, sectionGeometryFromGeometryInput, type SectionGeometry } from '@pm/geometry'
import { AnalysisInputError, buildPreviewSurface } from './index'
import { referenceProjectDocument } from './reference-case'

const document = referenceProjectDocument()
const section = sectionGeometryFromGeometryInput(document.inputs.geometry)
const rebars = geometryInputRebars(document.inputs.geometry)
const materials = document.inputs.materials

const captureThrow = (run: () => unknown): unknown => {
  try {
    run()
  } catch (error) {
    return error
  }
  return assert.fail('expected the call to throw')
}

test('a mesh over its cell budget is a typed fatal error, not a steel-only surface', () => {
  // 640 x 512 cells against the default 250 000 limit.
  const thrown = captureThrow(() => buildPreviewSurface(section, rebars, materials, { cellSize: 2.344 }))

  assert.ok(thrown instanceof AnalysisInputError, `expected AnalysisInputError, got ${thrown}`)
  assert.equal(thrown.code, 'MESH_RESOURCE_LIMIT')
  assert.match(thrown.message, /cell budget/)
})

test('raising the budget deliberately lets the same section through', () => {
  const surface = buildPreviewSurface(section, rebars, materials, { cellSize: 2.344, maxCells: 1_000_000 })
  // P0 is pure compression: alpha*fck*A_net plus the bars.
  assert.ok(surface.points[0].P > 3.3e7, `expected the full P0, got ${surface.points[0].P}`)
})

test('an empty concrete region is rejected instead of integrating nothing', () => {
  const empty: SectionGeometry = { id: 1, name: 'empty', solids: [] }
  const thrown = captureThrow(() => buildPreviewSurface(empty, rebars, materials))

  assert.ok(thrown instanceof AnalysisInputError, `expected AnalysisInputError, got ${thrown}`)
  assert.equal(thrown.code, 'EMPTY_CONCRETE_SECTION')
})

test('a degenerate zero-area outline is rejected', () => {
  const sliver: SectionGeometry = {
    id: 1,
    name: 'collinear',
    solids: [{ outer: [{ id: 1, x: 0, y: 0 }, { id: 2, x: 100, y: 0 }, { id: 3, x: 200, y: 0 }], holes: [] }]
  }
  const thrown = captureThrow(() => buildPreviewSurface(sliver, rebars, materials))
  assert.ok(thrown instanceof AnalysisInputError, `expected AnalysisInputError, got ${thrown}`)
  assert.equal(thrown.code, 'EMPTY_CONCRETE_SECTION')
})
