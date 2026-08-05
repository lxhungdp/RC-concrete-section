import assert from 'node:assert/strict'
import test from 'node:test'
import { createEmptyGeometryInput } from '@pm/geometry'
import { compileConcreteMaterial, compileSteelMaterial, createDefaultMaterialStore } from '@pm/materials'
import { buildResistanceMaterialSets } from '@pm/design'
import {
  DESIGN_CODES,
  activeConcreteModelId,
  applyCalculationProfileToMaterials,
  applyConcreteModelToMaterials,
  calculationProfile,
  calculationProfilesForCode,
  createDesignBasisForCalculationProfile,
  createProjectDocument,
  parseProjectDocument
} from '../src/index'

test('the standard registry separates Code from calculation method and excludes Custom as a Code', () => {
  assert.deepEqual(DESIGN_CODES.map((code) => code.id), ['KDS', 'ACI', 'EN', 'AS'])
  assert.equal(calculationProfilesForCode('KDS').length, 2)
  assert.equal(calculationProfilesForCode('ACI').length, 1)
  assert.equal(calculationProfilesForCode('EN').length, 1)
  assert.equal(calculationProfilesForCode('AS').length, 0)
  assert.equal(DESIGN_CODES.find((code) => code.id === 'AS')?.implementationStatus, 'not-implemented')
})

test('every selectable profile declares a coherent resistance format and concrete-model capability', () => {
  for (const code of ['KDS', 'ACI', 'EN'] as const) {
    for (const profile of calculationProfilesForCode(code)) {
      const basis = createDesignBasisForCalculationProfile(profile.id)
      assert.equal(basis.profileId, profile.designProfileId)
      assert.equal(basis.format, profile.resistanceFormat)
      assert.ok(profile.concreteModels.some((model) => model.id === profile.defaultConcreteModelId))
    }
  }
})

test('EN profile applies EC2 materials and round-trips its design-material resistance basis', () => {
  const profileId = 'en-1992-1-1-2004-stress-strain' as const
  const materials = applyCalculationProfileToMaterials(createDefaultMaterialStore(), profileId)
  const basis = createDesignBasisForCalculationProfile(profileId)
  assert.equal(materials.concrete.standard, 'EC2')
  assert.equal(materials.concrete.stressStrain.type, 'ec2-parabolic-rectangular')
  assert.ok(materials.steel.every((steel) => steel.standard === 'EC2'))
  assert.equal(basis.format, 'designMaterialReevaluation')
  assert.equal(basis.factors.alphaCc, 1)
  assert.equal(basis.factors.gammaC, 1.5)
  assert.equal(basis.factors.gammaS, 1.15)

  const document = createProjectDocument({
    calculationProfileId: profileId,
    geometry: createEmptyGeometryInput({ id: 1, name: 'EN preview' }),
    materials,
    design: basis
  })
  const parsed = parseProjectDocument(document)
  assert.equal(parsed.ok, true, parsed.ok ? 'EN project parsed' : parsed.error)
})

test('a user curve is a concrete-model choice under a Code, not a Custom standard', () => {
  const profileId = 'kds-2024-stress-strain' as const
  const materials = applyConcreteModelToMaterials(
    applyCalculationProfileToMaterials(createDefaultMaterialStore(), profileId),
    profileId,
    'user-stress-strain-curve'
  )
  assert.equal(materials.concrete.standard, 'KDS')
  assert.equal(materials.concrete.stressStrain.type, 'user-curve')
  assert.equal(activeConcreteModelId(profileId, materials.concrete), 'user-stress-strain-curve')
  assert.equal(calculationProfile(profileId).code, 'KDS')
})

test('EN DesignBasis is the canonical owner of partial factors even if a material snapshot is stale', () => {
  const profileId = 'en-1992-1-1-2004-stress-strain' as const
  const materials = applyCalculationProfileToMaterials(createDefaultMaterialStore(), profileId)
  const basis = createDesignBasisForCalculationProfile(profileId)
  if (basis.format !== 'designMaterialReevaluation') throw new Error('Expected EN design-material basis')
  basis.factors.alphaCc = 0.9
  basis.factors.gammaC = 1.6
  basis.factors.gammaS = 1.2
  const resolved = buildResistanceMaterialSets(materials, basis)
  assert.equal(resolved.designMaterials.concrete.factors?.alpha, 0.9)
  assert.equal(resolved.designMaterials.concrete.factors?.gammaC, 1.6)
  assert.ok(resolved.designMaterials.steel.every((steel) => steel.factors?.gammaS === 1.2))
  assert.equal(resolved.referenceMaterials.concrete.factors?.gammaC, undefined)
  assert.ok(resolved.referenceMaterials.steel.every((steel) => steel.factors?.gammaS === undefined))

  const designConcrete = compileConcreteMaterial(resolved.designMaterials.concrete)
  const referenceConcrete = compileConcreteMaterial(resolved.referenceMaterials.concrete)
  assert.ok(Math.abs(designConcrete.stress(0.003) - 0.9 / 1.6 * materials.concrete.fck) < 1e-12)
  assert.ok(Math.abs(referenceConcrete.stress(0.003) - materials.concrete.fck) < 1e-12)

  const steel = materials.steel[0]
  if (!steel) throw new Error('Expected the default reinforcement material')
  const designSteel = compileSteelMaterial(resolved.designMaterials.steel[0]!)
  const referenceSteel = compileSteelMaterial(resolved.referenceMaterials.steel[0]!)
  assert.ok(Math.abs(designSteel.stress(0.01) - steel.fy / 1.2) < 1e-12)
  assert.ok(Math.abs(referenceSteel.stress(0.01) - steel.fy) < 1e-12)
})
