/**
 * The kernel must reject an input it cannot evaluate instead of producing a plausible number.
 *
 * Both cases here used to pass silently:
 *   - a bar pointing at a deleted steel material fell back to the concrete stress, which cancelled
 *     exactly against the displaced-concrete term, so the bar contributed zero;
 *   - the ACI Whitney block ignored `beta1` and applied the uniform stress over the whole
 *     compression zone.
 */
import { strict as assert } from 'node:assert'
import test from 'node:test'
import { geometryInputRebars, sectionGeometryFromGeometryInput } from '@pm/geometry'
import { applyAci318ConcreteDerived, type MaterialStore } from '@pm/materials'
import { AnalysisInputError, buildPreviewSurface, evaluatePreviewState, previewStationState } from './index'
import { referenceProjectDocument } from './reference-case'

const document = referenceProjectDocument()
const section = sectionGeometryFromGeometryInput(document.inputs.geometry)
const rebars = geometryInputRebars(document.inputs.geometry)
const materials = document.inputs.materials
const epsCu = materials.concrete.limits.epsCu
const epsY = materials.steel[0].fy / materials.steel[0].elasticModulus

const captureThrow = (run: () => unknown): unknown => {
  try {
    run()
  } catch (error) {
    return error
  }
  return assert.fail('expected the call to throw')
}

/** Station 5 at 15 degrees — the workbook-verified state, so the steel term is known to be large. */
const state = previewStationState(section, rebars, Math.PI / 12, 5, epsCu, epsY)

test('the reference case has a steel contribution worth losing', () => {
  const ledger = evaluatePreviewState(section, rebars, materials, state)
  // ~3366 kN. If a dangling reference silently zeroed the bars, this is what would disappear.
  assert.ok(ledger.steel.P > 3.0e6, `expected a substantial steel force, got ${ledger.steel.P}`)
})

test('a rebar pointing at a missing steel material is a typed fatal error', () => {
  const orphaned = rebars.map((bar, index) => (index === 0 ? { ...bar, steelMaterialId: 99 } : bar))

  const thrown = captureThrow(() => evaluatePreviewState(section, orphaned, materials, state))

  assert.ok(thrown instanceof AnalysisInputError, `expected AnalysisInputError, got ${thrown}`)
  assert.equal(thrown.code, 'MISSING_STEEL_MATERIAL')
  assert.match(thrown.message, /99/)
  assert.deepEqual(thrown.detail.missing, [{ steelMaterialId: 99, rebarIds: [rebars[0].id] }])
})

test('the surface build rejects a missing steel material too', () => {
  const orphaned = rebars.map((bar) => ({ ...bar, steelMaterialId: 404 }))
  assert.throws(() => buildPreviewSurface(section, orphaned, materials), AnalysisInputError)
})

test('an undeclared steelMaterialId still resolves through the store default', () => {
  const unassigned = rebars.map(({ steelMaterialId: _ignored, ...bar }) => bar)
  const ledger = evaluatePreviewState(section, unassigned, materials, state)
  const reference = evaluatePreviewState(section, rebars, materials, state)
  assert.equal(ledger.steel.P, reference.steel.P)
})

test('the ACI Whitney block is blocked at the kernel, not only in the selector', () => {
  const aciStore: MaterialStore = {
    ...materials,
    concrete: applyAci318ConcreteDerived({ ...materials.concrete, standard: 'ACI318' })
  }
  assert.equal(aciStore.concrete.stressStrain.type, 'aci-whitney-block')

  const thrown = captureThrow(() => buildPreviewSurface(section, rebars, aciStore))

  assert.ok(thrown instanceof AnalysisInputError, `expected AnalysisInputError, got ${thrown}`)
  assert.equal(thrown.code, 'UNSUPPORTED_CONCRETE_MODEL')
  assert.match(thrown.message, /β1|beta1/i)
})
