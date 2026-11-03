import assert from 'node:assert/strict'
import test from 'node:test'
import { compileSteelMaterial, createDefaultMaterialStore, materialStoreIssues, resolveLinearHardeningSteel, type SteelMaterial } from '@pm/materials'
import {
  convertSteelHardeningStrengthInput, convertSteelHardeningStrainLimitInput, createSteelHardeningDefinition,
  steelHardeningAuthoringPolicy, steelHardeningInputValues, withSteelHardeningStrainLimitValue
} from '../src/index'
import { buildResistanceMaterialSets, createEn1992DesignBasis, setMaterialFactorComponentValue } from '@pm/design'

test('ENG-MAT-001: On immediately supplies editable valid KDS endpoints using current fy', () => {
  for (const profileId of ['kds-2024-stress-strain', 'kds-142020-equivalent-block', 'custom-stress-strain', 'custom-equivalent-block'] as const) {
    const materials = createDefaultMaterialStore()
    const before = JSON.stringify(materials.steel[0])
    const definition = createSteelHardeningDefinition(profileId, materials.steel[0])
    assert.equal(JSON.stringify(materials.steel[0]), before)
    materials.steel[0].stressStrain = definition
    assert.equal(materialStoreIssues(materials).length, 0)
    assert.equal(definition.epsUk, 0.05)
    assert.deepEqual(definition.ultimateStrength, { type: 'ratio', ratio: 1.08 })
    const law = compileSteelMaterial(materials.steel[0])
    assert.equal(law.limits.epsTensionUltimate, 0.05)
    assert.equal(law.stress(0.05), 432)
    definition.ultimateStrength = { type: 'stress', stress: 440 }
    assert.equal(compileSteelMaterial(materials.steel[0]).stress(0.05), 440)
  }
})

test('ENG-MAT-004: EN endpoint input retains the named recommended design limit without an extra required field', () => {
  const base = createDefaultMaterialStore().steel[0]
  const definition = createSteelHardeningDefinition('en-1992-1-1-2004-stress-strain', base)
  assert.deepEqual(definition.ultimateStrength, { type: 'ratio', ratio: 1.08 })
  assert.equal(definition.epsUk, 0.05)
  definition.ultimateStrength = { type: 'ratio', ratio: 1.1 }
  definition.epsUk = 0.05
  const material: SteelMaterial = { id: 1, name: 'Synthetic EN grade', standard: 'EC2', fy: 500, elasticModulus: 200000,
    factors: { gammaS: 1.15 }, stressStrain: definition }
  assert.ok(Math.abs(compileSteelMaterial(material).stress(-0.045) + 473.7154150197629) < 1e-9)
  assert.ok(Math.abs((compileSteelMaterial(material).limits.epsTensionUltimate ?? 0) - 0.045) < 1e-16)
  assert.match(steelHardeningAuthoringPolicy('en-1992-1-1-2004-stress-strain').description, /preview/)
})

test('ENG-MAT-004: authoring defaults do not enable unsupported ACI/AS steel laws', () => {
  const material = createDefaultMaterialStore().steel[0]
  assert.throws(() => createSteelHardeningDefinition('aci-318-19-22-equivalent-block', material), /does not author/)
  assert.throws(() => createSteelHardeningDefinition('as-3600-2018-amd2-equivalent-block', material), /does not author/)
})

test('ENG-MAT-001: initialization respects current strengths and declared physical bounds', () => {
  for (const fy of [400, 500, 600]) {
    const material = { ...createDefaultMaterialStore().steel[0], fy, limits: { epsU: 0.02 } }
    const before = JSON.stringify(material)
    const definition = createSteelHardeningDefinition('kds-2024-stress-strain', material)
    const law = compileSteelMaterial({ ...material, stressStrain: definition })
    assert.deepEqual(definition.ultimateStrength, { type: 'ratio', ratio: 1.08 })
    assert.equal(steelHardeningInputValues({ ...material, stressStrain: definition })?.ultimateStress, fy * 1.08)
    assert.equal(law.limits.epsTensionUltimate, 0.02)
    assert.equal(law.limits.epsCompressionUltimate, 0.02)
    assert.equal(JSON.stringify(material), before)
  }
})

const near = (actual: number, expected: number) => assert.ok(
  Math.abs(actual - expected) <= 64 * Number.EPSILON * Math.max(1, Math.abs(expected)), `${actual} versus ${expected}`
)
const curve = (): SteelMaterial => {
  const material = createDefaultMaterialStore().steel[0]
  return { ...material, stressStrain: { type: 'linear-hardening', epsUk: 0.05,
    ultimateStrength: { type: 'ratio', ratio: 1.1 }, strainLimit: { type: 'factor', value: 0.9 } } }
}

test('ENG-MAT-002: changing strength/cutoff input bases preserves the line and limit without mutating input', () => {
  const source = curve()
  let material = source
  const original = JSON.stringify(material)
  const baseline = resolveLinearHardeningSteel(material)
  for (let cycle = 0; cycle < 3; cycle++) {
    for (const type of ['stress', 'ratio'] as const) {
      const change = convertSteelHardeningStrengthInput(material, type)
      assert.ok(change.ok)
      material = { ...material, stressStrain: change.definition }
    }
    for (const type of ['absolute', 'factor'] as const) {
      const change = convertSteelHardeningStrainLimitInput(material, type)
      assert.ok(change.ok)
      material = { ...material, stressStrain: change.definition }
    }
  }
  const actual = resolveLinearHardeningSteel(material)
  for (const key of ['yieldStress', 'ultimateStress', 'epsYield', 'epsUk', 'epsUd', 'hardeningModulus'] as const) near(actual[key], baseline[key])
  const law = compileSteelMaterial(material)
  for (const eps of [-0.04, -0.001, 0, 0.001, 0.04]) {
    const expected = Math.abs(eps) <= 0.002 ? 200000 * eps
      : Math.sign(eps) * (400 + 40 * (Math.abs(eps) - 0.002) / 0.048)
    near(law.stress(eps), expected)
  }
  assert.equal(JSON.stringify(source), original)
})

test('ENG-MAT-001: selected strength and strain bases determine which inputs follow fy and epsUk', () => {
  const initial = curve()
  const stress = convertSteelHardeningStrengthInput(initial, 'stress')
  const direct = convertSteelHardeningStrainLimitInput(initial, 'absolute')
  assert.ok(stress.ok && direct.ok)
  near(steelHardeningInputValues({ ...initial, fy: 420 })?.ultimateStress ?? 0, 462)
  near(steelHardeningInputValues({ ...initial, fy: 420, stressStrain: stress.definition })?.ultimateStress ?? 0, 440)
  if (initial.stressStrain.type !== 'linear-hardening') throw new Error('Invalid fixture.')
  near(steelHardeningInputValues({ ...initial, stressStrain: { ...initial.stressStrain, epsUk: 0.06 } })?.epsUd ?? 0, 0.054)
  near(steelHardeningInputValues({ ...initial, stressStrain: { ...direct.definition, epsUk: 0.06 } })?.epsUd ?? 0, 0.045)
})

test('ENG-MAT-005: 90% and 100% alter only the tensile cutoff of the same construction line', () => {
  const material = curve()
  if (material.stressStrain.type !== 'linear-hardening') throw new Error('Invalid fixture.')
  const base = resolveLinearHardeningSteel(material)
  for (const percent of [90, 100]) {
    const definition = withSteelHardeningStrainLimitValue(material.stressStrain, percent)
    const next = { ...material, stressStrain: definition }
    const actual = resolveLinearHardeningSteel(next)
    near(actual.epsUd, percent === 90 ? 0.045 : 0.05)
    assert.equal(actual.hardeningModulus, base.hardeningModulus)
    near(steelHardeningInputValues(next)?.strainLimitInputValue ?? 0, percent)
    const physical = steelHardeningInputValues({ ...next, limits: { epsU: 0.02 } })
    assert.equal(physical?.effectiveTensionLimit, 0.02)
  }
  const direct = convertSteelHardeningStrainLimitInput(material, 'absolute')
  assert.ok(direct.ok)
  assert.equal(withSteelHardeningStrainLimitValue(direct.definition, 0.04).strainLimit.value, 0.04)
  const invalid = { ...material, stressStrain: withSteelHardeningStrainLimitValue(material.stressStrain, 120) }
  assert.throws(() => compileSteelMaterial(invalid), /requires/)
})

test('ENG-MAT-001: invalid mode conversion returns evidence instead of an invented reciprocal or reset', () => {
  const material = curve()
  const stress = convertSteelHardeningStrengthInput(material, 'stress')
  const direct = convertSteelHardeningStrainLimitInput(material, 'absolute')
  assert.ok(stress.ok && direct.ok)
  const invalidFy = { ...material, fy: 0, stressStrain: stress.definition }
  const invalidStrain = { ...material, stressStrain: { ...direct.definition, epsUk: 0 } }
  const before = JSON.stringify([invalidFy, invalidStrain])
  const strengthChange = convertSteelHardeningStrengthInput(invalidFy, 'ratio')
  const strainChange = convertSteelHardeningStrainLimitInput(invalidStrain, 'factor')
  assert.equal(strengthChange.ok, false)
  assert.equal(strainChange.ok, false)
  if (!strengthChange.ok) assert.match(strengthChange.error, /positive finite/)
  if (!strainChange.ok) assert.match(strainChange.error, /positive finite/)
  assert.equal(JSON.stringify([invalidFy, invalidStrain]), before)
})

test('ENG-MAT-005: linked cutoff fields select the last edited basis without a mode control', () => {
  const material = curve()
  if (material.stressStrain.type !== 'linear-hardening') throw new Error('Invalid fixture.')
  const absolute = withSteelHardeningStrainLimitValue(material.stressStrain, 0.04, 'absolute')
  assert.deepEqual(absolute.strainLimit, { type: 'absolute', value: 0.04 })
  near(steelHardeningInputValues({ ...material, stressStrain: absolute })?.strainLimitPercent ?? 0, 80)
  const directAfterEndpointEdit = { ...absolute, epsUk: 0.06 }
  assert.equal(steelHardeningInputValues({ ...material, stressStrain: directAfterEndpointEdit })?.epsUd, 0.04)
  const factor = withSteelHardeningStrainLimitValue(directAfterEndpointEdit, 90, 'factor')
  assert.deepEqual(factor.strainLimit, { type: 'factor', value: 0.9 })
  near(steelHardeningInputValues({ ...material, stressStrain: factor })?.epsUd ?? 0, 0.054)
  const factorAfterEndpointEdit = { ...factor, epsUk: 0.05 }
  near(steelHardeningInputValues({ ...material, stressStrain: factorAfterEndpointEdit })?.epsUd ?? 0, 0.045)
  assert.deepEqual(material.stressStrain.strainLimit, { type: 'factor', value: 0.9 })
})

test('ENG-MAT-001: an unusual valid yield range gets a compatible starter in both resistance stages', () => {
  const materials = createDefaultMaterialStore()
  const material = { ...materials.steel[0], standard: 'EC2' as const, fy: 500, elasticModulus: 1000 }
  const basis = setMaterialFactorComponentValue(createEn1992DesignBasis(), 'gammaS', 0.5)
  const definition = createSteelHardeningDefinition('en-1992-1-1-2004-stress-strain', material, basis)
  assert.ok(definition.epsUk > 1 / 0.9)
  materials.steel = [{ ...material, stressStrain: definition }]
  const sets = buildResistanceMaterialSets(materials, basis)
  for (const steel of [sets.referenceMaterials.steel[0], sets.designMaterials.steel[0]]) {
    const law = compileSteelMaterial(steel)
    assert.ok((law.limits.epsTensionUltimate ?? 0) > (law.limits.epsYield ?? 0))
  }
})

test('ENG-MAT-001: starter initialization does not replace invalid existing material data', () => {
  const material = createDefaultMaterialStore().steel[0]
  for (const edit of [{ fy: Number.NaN }, { elasticModulus: 0 }, { limits: { epsU: 0.001 } }]) {
    assert.throws(() => createSteelHardeningDefinition('kds-2024-stress-strain', { ...material, ...edit }))
  }
})
