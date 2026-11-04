import assert from 'node:assert/strict'
import test from 'node:test'
import {
  compileConcreteMaterial, compileKdsParabolicConcrete, compileSteelMaterial,
  compileElasticPerfectlyPlasticSteel, compileBilinearSteel,
  compileAciWhitneyConcrete, compileAs3600BlockConcrete, compileUserBlockConcrete,
  compileEc2ParabolicRectangularConcrete, compileConcreteUserCurve, compileSteelUserCurve,
  compileLinearHardeningSteel,
  createDefaultMaterialStore, MaterialInputError, MaterialEvaluationError, materialStoreIssues
} from '../src/index'

test('ENG-MAT-001 AUD-002: generic and direct compilers reject invalid declared parameters', () => {
  const { concrete } = createDefaultMaterialStore()
  assert.equal(concrete.stressStrain.type, 'kds-parabolic')
  if (concrete.stressStrain.type !== 'kds-parabolic') return
  concrete.stressStrain.eps0 = -1
  for (const compile of [compileConcreteMaterial, compileKdsParabolicConcrete]) {
    assert.throws(() => compile(concrete), MaterialInputError)
  }
})

test('ENG-MAT-001/002 AUD-003: inconsistent yield snapshots fail rather than changing a tangent', () => {
  for (const type of ['elastic-perfectly-plastic', 'bilinear'] as const) {
    const steel = createDefaultMaterialStore().steel[0]
    steel.stressStrain = type === 'bilinear' ? { type, hardeningRatio: 0.01 } : { type }
    steel.limits = { ...steel.limits, epsY: 0.02 }
    assert.ok(materialStoreIssues({ ...createDefaultMaterialStore(), steel: [steel] }).length)
    assert.throws(() => compileSteelMaterial(steel), MaterialInputError)
  }
})

test('ENG-MAT-001 AUD-002: model-specific compilers reject a different valid model', () => {
  const { concrete, steel: [steel] } = createDefaultMaterialStore()
  for (const compile of [compileAciWhitneyConcrete, compileAs3600BlockConcrete, compileUserBlockConcrete,
    compileEc2ParabolicRectangularConcrete, compileConcreteUserCurve]) {
    assert.throws(() => compile(concrete), MaterialInputError)
  }
  assert.throws(() => compileKdsParabolicConcrete({ ...concrete, stressStrain: {
    type: 'user-curve', points: [{ strain: 0, stress: 0 }, { strain: 0.003, stress: 20 }],
    interpolation: 'linear', extrapolation: 'clamp'
  } }), MaterialInputError)
  for (const compile of [compileBilinearSteel, compileLinearHardeningSteel, compileSteelUserCurve]) {
    assert.throws(() => compile(steel), MaterialInputError)
  }
  assert.throws(() => compileElasticPerfectlyPlasticSteel({ ...steel,
    stressStrain: { type: 'bilinear', hardeningRatio: 0.01 } }), MaterialInputError)
})

test('ENG-MAT-002/005: effective yield agrees with an independent stress derivative on both stages', () => {
  for (const scale of [1, 0.9]) {
    const steel = createDefaultMaterialStore().steel[0]
    steel.factors = { resistanceScale: scale }
    const epsY = steel.fy * scale / steel.elasticModulus
    steel.limits = { ...steel.limits, epsY }
    const law = compileElasticPerfectlyPlasticSteel(steel)
    for (const sign of [-1, 1]) {
      const strain = sign * 2 * epsY, step = epsY * 1e-6
      assert.equal(law.tangent(strain), 0)
      assert.equal((law.stress(strain + step) - law.stress(strain - step)) / (2 * step), 0)
      assert.equal(law.tangent(sign * epsY / 2), steel.elasticModulus)
    }
  }
})

test('ENG-MAT-002 AUD-002: compiled laws reject non-finite strains and overflow', () => {
  const store = createDefaultMaterialStore()
  const laws = [compileConcreteMaterial(store.concrete), compileElasticPerfectlyPlasticSteel(store.steel[0])]
  for (const law of laws) for (const value of [NaN, Infinity, -Infinity]) {
    assert.throws(() => law.stress(value), MaterialEvaluationError)
    assert.throws(() => law.tangent(value), MaterialEvaluationError)
  }
  const hardening = { ...store.steel[0], stressStrain: { type: 'bilinear' as const, hardeningRatio: 1 } }
  assert.throws(() => compileBilinearSteel(hardening).stress(Number.MAX_VALUE), MaterialEvaluationError)
  const overflow = { ...store.steel[0], fy: Number.MAX_VALUE, factors: { resistanceScale: 2 }, limits: undefined }
  assert.throws(() => compileElasticPerfectlyPlasticSteel(overflow), MaterialEvaluationError)
})
