import assert from 'node:assert/strict'
import test from 'node:test'
import { compileSteelMaterial, resolveLinearHardeningSteel, materialStoreIssues, createDefaultMaterialStore, type SteelMaterial } from '../src/index'
import { buildResistanceMaterialSets, createEn1992DesignBasis } from '@pm/design'

const steel = (): SteelMaterial => ({
  id: 1, name: 'Declared hardening', standard: 'EC2', fy: 500, elasticModulus: 200000,
  stressStrain: { type: 'linear-hardening', ultimateStrength: { type: 'ratio', ratio: 1.1 }, epsUk: 0.05, strainLimit: { type: 'factor', value: 0.9 } }
})
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} versus ${expected}`)

test('ENG-MAT-002: hardening is exactly the straight line between yield and endpoint; Off is horizontal', () => {
  const material = steel()
  const law = compileSteelMaterial(material)
  const yieldPoint = { strain: 500 / 200000, stress: 500 }
  const endpoint = { strain: 0.05, stress: 550 }
  for (const ratio of [0, 0.125, 0.5, 0.875, 1]) {
    const strain = yieldPoint.strain * (1 - ratio) + endpoint.strain * ratio
    const expected = yieldPoint.stress * (1 - ratio) + endpoint.stress * ratio
    near(law.stress(strain), expected)
    near(law.stress(-strain), -expected)
  }
  const off = compileSteelMaterial({ ...material, stressStrain: { type: 'elastic-perfectly-plastic' } })
  for (const strain of [0.0025, 0.01, 0.05]) near(off.stress(strain), 500)
})

test('endpoint hardening reaches the declared construction point and the independent earlier design cutoff', () => {
  const material = steel()
  material.factors = { gammaS: 1.15 }
  const p = resolveLinearHardeningSteel(material)
  const law = compileSteelMaterial(material)
  near(p.yieldStress, 434.7826086956522)
  near(p.epsYield, 0.002173913043478261)
  near(law.stress(p.epsUd), 473.7154150197629)
  near(law.stress(p.epsUk), 478.2608695652174)
  near(law.stress(-p.epsUd), -473.7154150197629)
  near(law.stress(p.epsYield), p.yieldStress)
  assert.equal(law.limits.epsTensionUltimate, 0.045000000000000005)
  assert.equal(law.limits.epsCompressionUltimate, undefined)
  for (const strain of [0.001, 0.01, -0.01]) {
    const h = 1e-7
    near((law.stress(strain + h) - law.stress(strain - h)) / (2 * h) / 1e6, law.tangent(strain) / 1e6)
  }
})

test('design reevaluation reconstructs the hardening slope without reducing Es or reference inputs', () => {
  const store = createDefaultMaterialStore()
  store.steel = [steel()]
  const saved = JSON.stringify(store)
  const sets = buildResistanceMaterialSets(store, createEn1992DesignBasis())
  const a = resolveLinearHardeningSteel(sets.referenceMaterials.steel[0])
  const b = resolveLinearHardeningSteel(sets.designMaterials.steel[0])
  near(a.ultimateStress, 550)
  near(b.ultimateStress, 550 / 1.15)
  assert.notEqual(a.hardeningModulus, b.hardeningModulus)
  assert.equal(sets.designMaterials.steel[0].elasticModulus, 200000)
  assert.equal(JSON.stringify(store), saved)
})

test('absolute strength and cutoff inputs have the same resolved law and respect an independent physical bound', () => {
  const a = steel()
  const b = steel()
  b.stressStrain = { type: 'linear-hardening', ultimateStrength: { type: 'stress', stress: 550 }, epsUk: 0.05, strainLimit: { type: 'absolute', value: 0.045000000000000005 } }
  assert.deepEqual(resolveLinearHardeningSteel(a), resolveLinearHardeningSteel(b))
  b.limits = { epsU: 0.02 }
  assert.equal(compileSteelMaterial(b).limits.epsTensionUltimate, 0.02)
  assert.equal(compileSteelMaterial(b).limits.epsCompressionUltimate, 0.02)
})

test('incomplete or contradictory hardening fails validation and compilation', () => {
  for (const edit of [
    { epsUk: 0 }, { epsUk: Number.POSITIVE_INFINITY },
    { ultimateStrength: { type: 'ratio' as const, ratio: 1 } },
    { strainLimit: { type: 'factor' as const, value: 1.1 } },
    { strainLimit: { type: 'absolute' as const, value: 0.001 } }
  ]) {
    const item = steel()
    if (item.stressStrain.type !== 'linear-hardening') throw new Error('Invalid test fixture.')
    item.stressStrain = { ...item.stressStrain, ...edit }
    const store = createDefaultMaterialStore()
    store.steel = [item]
    assert.ok(materialStoreIssues(store).length > 0)
    assert.throws(() => compileSteelMaterial(item))
  }
})
