import assert from 'node:assert/strict'
import test from 'node:test'
import { compileConcreteMaterial, createDefaultMaterialStore } from '@pm/materials'
import { applyCalculationProfileToMaterials } from '@pm/project'
import { withConcreteCompressionStrain, withConcreteTensionPolicy } from '../features/section-editor/materials/material-inputs'

test('ENG-MAT-002: KDS and EN peak edits reach the actual parabola and preserve the source definition', () => {
  for (const profile of ['kds-2024-stress-strain', 'en-1992-1-1-2004-stress-strain'] as const) {
    const original = applyCalculationProfileToMaterials(createDefaultMaterialStore(), profile).concrete
    const snapshot = structuredClone(original)
    const edited = withConcreteCompressionStrain(original, 'peak', 0.0025)
    const model = edited.stressStrain
    assert.ok(model.type === 'kds-parabolic' || model.type === 'ec2-parabolic-rectangular')
    assert.equal(edited.limits.eps0, 0.0025)
    assert.equal(model.type === 'kds-parabolic' ? model.eps0 : model.epsC2, 0.0025)
    // At half of the declared peak strain, the quadratic branch has reached 3/4 of its plateau.
    const peak = profile === 'kds-2024-stress-strain' ? 25.5 : 30
    const law = compileConcreteMaterial(edited)
    assert.equal(law.stress(0.00125), 0.75 * peak)
    assert.equal(law.tangent(0.00125), peak / 0.0025)
    assert.deepEqual(original, snapshot)
    assert.equal(edited.mc, original.mc)
    assert.equal(edited.elasticModulus, original.elasticModulus)
  }
})

test('ENG-MAT-001/002: ultimate edits align the evaluated cutoff and declared limit; invalid drafts fail closed', () => {
  for (const profile of ['kds-2024-stress-strain', 'en-1992-1-1-2004-stress-strain', 'custom-equivalent-block'] as const) {
    const original = applyCalculationProfileToMaterials(createDefaultMaterialStore(), profile).concrete
    const edited = withConcreteCompressionStrain(original, 'ultimate', 0.004)
    const law = compileConcreteMaterial(edited)
    assert.equal(edited.limits.epsCu, 0.004)
    assert.equal(law.limits.epsCompressionUltimate, 0.004)
    assert.ok(law.stress(0.0038) > 0)
    assert.equal(law.stress(0.0041), 0)
    assert.throws(() => compileConcreteMaterial(withConcreteCompressionStrain(original, 'ultimate', 0)))
    assert.throws(() => compileConcreteMaterial(withConcreteCompressionStrain(original, 'peak', NaN)))
  }
})

test('ENG-MAT-002: a user-curve tension edit overrides its existing explicit policy and reaches interpolation', () => {
  const original = createDefaultMaterialStore().concrete
  original.stressStrain = {
    type: 'user-curve', interpolation: 'linear', extrapolation: 'clamp', zeroTension: false,
    points: [{ strain: -0.001, stress: -2 }, { strain: 0, stress: 0 }, { strain: 0.0033, stress: 25.5 }]
  }
  const snapshot = structuredClone(original)
  assert.equal(compileConcreteMaterial(original).stress(-0.0005), -1)
  const ignored = withConcreteTensionPolicy(original, true)
  assert.equal(ignored.limits.ignoreTension, true)
  assert.equal(compileConcreteMaterial(ignored).stress(-0.0005), 0)
  const included = withConcreteTensionPolicy(ignored, false)
  assert.equal(included.limits.ignoreTension, false)
  assert.equal(compileConcreteMaterial(included).stress(-0.0005), -1)
  assert.deepEqual(original, snapshot)
  assert.throws(() => withConcreteTensionPolicy(createDefaultMaterialStore().concrete, false))
})
