import assert from 'node:assert/strict'
import test from 'node:test'
import { buildConcreteMesh, createRectangleOuter, type SectionGeometry } from '@pm/geometry'
import { createDefaultMaterialStore } from '@pm/materials'
import {
  AnalysisInputError, evaluatePreparedState, evaluatePreparedStateWithTangent,
  prepareAnalysis, prepareAnalysisFromMesh
} from '../src/index'

const rectangle = (width: number, height: number): SectionGeometry => ({
  id: 1, name: 'API boundary oracle',
  solids: [{ outer: createRectangleOuter({ width, height }), holes: [] }]
})
const section = rectangle(200, 100)
const materials = createDefaultMaterialStore()
const mesh = buildConcreteMesh(section, { cellSize: 10 })
const fatal = (code: AnalysisInputError['code']) => (error: unknown) =>
  error instanceof AnalysisInputError && error.code === code

test('ENG-GEO-003/006 AUD-001: equal area cannot substitute a different source geometry', () => {
  const other = rectangle(100, 200)
  const wrong = buildConcreteMesh(other, { cellSize: 10 })
  assert.equal(wrong.report.exact.area, mesh.report.exact.area)
  assert.throws(() => prepareAnalysisFromMesh(section, [], materials, wrong), fatal('MESH_GEOMETRY_MISMATCH'))
  assert.doesNotThrow(() => prepareAnalysisFromMesh(structuredClone(section), [], materials, structuredClone(mesh)))
  assert.doesNotThrow(() => prepareAnalysisFromMesh({ ...section, id: 2, name: 'Renamed' }, [], materials, mesh))
})

test('ENG-GEO-001 AUD-002: invalid origins, including overflow, fail before integration', () => {
  for (const value of [NaN, Infinity, -Infinity]) {
    assert.throws(() => prepareAnalysisFromMesh(section, [], materials, mesh, { x: value, y: 0 }), fatal('NON_FINITE_ANALYSIS'))
  }
})

test('ENG-MAT-002 AUD-002: a non-finite plane cannot be reported as zero force', () => {
  const prepared = prepareAnalysisFromMesh(section, [], materials, mesh)
  for (const name of ['e0', 'kx', 'ky'] as const) {
    for (const value of [NaN, Infinity, -Infinity]) {
      const state = { e0: 0, kx: 0, ky: 0, [name]: value }
      assert.throws(() => evaluatePreparedState(prepared, state), fatal('NON_FINITE_ANALYSIS'))
      assert.throws(() => evaluatePreparedStateWithTangent(prepared, state), fatal('NON_FINITE_ANALYSIS'))
    }
  }
  assert.throws(() => evaluatePreparedState(prepared, { e0: 0, kx: Number.MAX_VALUE, ky: 0 }), fatal('NON_FINITE_ANALYSIS'))
  assert.deepEqual(evaluatePreparedState(prepared, { e0: 0, kx: 0, ky: 0 }).total, { P: 0, Mx: 0, My: 0 })
})

test('ENG-GEO-006: a correctly bound quadratic mesh reproduces the rectangle integral', () => {
  const prepared = prepareAnalysis(section, [], materials, { cellSize: 10 })
  const e0 = 0.001, kx = 0.000005
  const model = materials.concrete.stressStrain
  assert.equal(model.type, 'kds-parabolic')
  if (model.type !== 'kds-parabolic') return
  const peak = model.alpha * materials.concrete.fck
  // Integrate sigma(e0+k*y)*y over the symmetric rectangle. Odd terms vanish.
  const secondMoment = 200 * ((50 ** 3 - (-50) ** 3) / 3)
  const expected = peak * (2 * kx / model.eps0) * (1 - e0 / model.eps0) * secondMoment
  const result = evaluatePreparedState(prepared, { e0, kx, ky: 0 }).total
  assert.ok(Math.abs(result.Mx - expected) <= Number.EPSILON * 16 * expected)
})
