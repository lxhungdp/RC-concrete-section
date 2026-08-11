import assert from 'node:assert/strict'
import test from 'node:test'
import { createEmptyGeometryInput } from '@pm/geometry'
import { compileConcreteMaterial, compileSteelMaterial, createDefaultMaterialStore } from '@pm/materials'
import {
  buildResistanceMaterialSets,
  createKdsAppendixDesignBasis,
  materialFactorComponent,
  resolveMaterialFactorExpression,
  setMaterialFactorComponentValue
} from '@pm/design'
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
  assert.equal(calculationProfilesForCode('AS').length, 1)
  assert.equal(DESIGN_CODES.find((code) => code.id === 'AS')?.implementationStatus, 'preview')
})

test('every selectable profile declares a coherent resistance format and concrete-model capability', () => {
  for (const code of ['KDS', 'ACI', 'EN', 'AS'] as const) {
    for (const profile of calculationProfilesForCode(code)) {
      const basis = createDesignBasisForCalculationProfile(profile.id)
      assert.equal(basis.profileId, profile.designProfileId)
      assert.equal(basis.format, profile.resistanceFormat)
      assert.ok(profile.concreteModels.some((model) => model.id === profile.defaultConcreteModelId))
    }
  }
})

test('AS profile applies AS 3600 block materials and round-trips as preview', () => {
  const profileId = 'as-3600-2018-amd2-equivalent-block' as const
  const materials = applyCalculationProfileToMaterials(createDefaultMaterialStore(), profileId)
  const basis = createDesignBasisForCalculationProfile(profileId)
  assert.equal(materials.concrete.standard, 'AS3600')
  assert.equal(materials.concrete.stressStrain.type, 'as3600-equivalent-block')
  assert.ok(materials.steel.every((steel) => steel.standard === 'AS3600'))
  assert.equal(basis.profileId, 'as-3600-2018-amd2')
  assert.equal(basis.verificationStatus, 'draft')

  const document = createProjectDocument({
    calculationProfileId: profileId,
    geometry: createEmptyGeometryInput({ id: 1, name: 'AS preview' }),
    materials,
    design: basis
  })
  const parsed = parseProjectDocument(document)
  assert.equal(parsed.ok, true, parsed.ok ? 'AS project parsed' : parsed.error)
})

test('EN profile applies EC2 materials and round-trips its design-material resistance basis', () => {
  const profileId = 'en-1992-1-1-2004-stress-strain' as const
  const materials = applyCalculationProfileToMaterials(createDefaultMaterialStore(), profileId)
  const basis = createDesignBasisForCalculationProfile(profileId)
  assert.equal(materials.concrete.standard, 'EC2')
  assert.equal(materials.concrete.stressStrain.type, 'ec2-parabolic-rectangular')
  assert.ok(materials.steel.every((steel) => steel.standard === 'EC2'))
  assert.equal(basis.format, 'designMaterialReevaluation')
  assert.equal(materialFactorComponent(basis, 'alphaCc')?.value, 1)
  assert.equal(materialFactorComponent(basis, 'gammaC')?.value, 1.5)
  assert.equal(materialFactorComponent(basis, 'gammaS')?.value, 1.15)

  const document = createProjectDocument({
    calculationProfileId: profileId,
    geometry: createEmptyGeometryInput({ id: 1, name: 'EN preview' }),
    materials,
    design: basis
  })
  const parsed = parseProjectDocument(document)
  assert.equal(parsed.ok, true, parsed.ok ? 'EN project parsed' : parsed.error)
})

test('both KDS mechanics round-trip the independently selected Appendix material-factor route', () => {
  const design = createKdsAppendixDesignBasis()
  for (const profileId of ['kds-2024-stress-strain', 'kds-142020-equivalent-block'] as const) {
    const document = createProjectDocument({
      calculationProfileId: profileId,
      geometry: createEmptyGeometryInput({ id: 1, name: `KDS Appendix ${profileId}` }),
      materials: applyCalculationProfileToMaterials(createDefaultMaterialStore(), profileId),
      design
    })
    const parsed = parseProjectDocument(document)
    assert.equal(parsed.ok, true, parsed.ok ? `${profileId} parsed` : parsed.error)
    if (!parsed.ok) continue
    assert.equal(parsed.document.inputs.design.profileId, 'kds-142020-2022-appendix-material-factors')
    assert.equal(parsed.document.inputs.design.format, 'designMaterialReevaluation')
  }
})

test('project parser rejects nonphysical material ordinates and rebar diameter', () => {
  const base = createProjectDocument({
    geometry: createEmptyGeometryInput({ id: 1, name: 'Invalid input gate' }),
    materials: createDefaultMaterialStore()
  })
  const negativeStrength = structuredClone(base)
  negativeStrength.inputs.materials.concrete.fck = -30
  const strengthResult = parseProjectDocument(negativeStrength)
  assert.equal(strengthResult.ok, false)
  if (!strengthResult.ok) assert.match(strengthResult.error, /fck must be positive/)

  const duplicateCurve = structuredClone(base)
  duplicateCurve.inputs.materials.steel[0].stressStrain = {
    type: 'user-curve',
    interpolation: 'linear',
    points: [{ strain: 0, stress: 0 }, { strain: 0, stress: 100 }]
  }
  const curveResult = parseProjectDocument(duplicateCurve)
  assert.equal(curveResult.ok, false)
  if (!curveResult.ok) assert.match(curveResult.error, /duplicate strain/)

  const invalidBar = structuredClone(base)
  invalidBar.inputs.geometry.rebars.push({ id: 1, dia: 0, x: 0, y: 0, steelMaterialId: 1 })
  const barResult = parseProjectDocument(invalidBar)
  assert.equal(barResult.ok, false)
  if (!barResult.ok) assert.match(barResult.error, /dia must be positive/)
})

test('KDS parser enforces reinforcement and concrete applicability limits', () => {
  const base = createProjectDocument({
    geometry: createEmptyGeometryInput({ id: 1, name: 'KDS applicability gate' }),
    materials: createDefaultMaterialStore()
  })
  const highStrengthSteel = structuredClone(base)
  highStrengthSteel.inputs.materials.steel[0].fy = 601
  const steelResult = parseProjectDocument(highStrengthSteel)
  assert.equal(steelResult.ok, false)
  if (!steelResult.ok) assert.match(steelResult.error, /must not exceed 600 MPa/)

  const highStrengthConcrete = structuredClone(base)
  highStrengthConcrete.inputs.materials.concrete.fck = 91
  const concreteResult = parseProjectDocument(highStrengthConcrete)
  assert.equal(concreteResult.ok, false)
  if (!concreteResult.ok) assert.match(concreteResult.error, /stop at fck = 90 MPa/)
})

test('legacy EN scalar partial factors migrate to the generic factor-expression schema', () => {
  const profileId = 'en-1992-1-1-2004-stress-strain' as const
  const document = createProjectDocument({
    calculationProfileId: profileId,
    geometry: createEmptyGeometryInput({ id: 1, name: 'Legacy EN migration' }),
    materials: applyCalculationProfileToMaterials(createDefaultMaterialStore(), profileId),
    design: createDesignBasisForCalculationProfile(profileId)
  })
  const legacy = structuredClone(document) as unknown as {
    inputs: { design: Record<string, unknown> }
  }
  legacy.inputs.design.basisVersion = 1
  legacy.inputs.design.factors = { alphaCc: 0.9, gammaC: 1.6, gammaS: 1.2 }
  delete legacy.inputs.design.compressionEndpoint

  const parsed = parseProjectDocument(legacy)
  assert.equal(parsed.ok, true, parsed.ok ? 'legacy EN parsed' : parsed.error)
  if (!parsed.ok || parsed.document.inputs.design.format !== 'designMaterialReevaluation') return
  assert.equal(parsed.document.inputs.design.basisVersion, 3)
  assert.equal(parsed.document.inputs.design.compressionEndpoint, 'peak-stress-strain')
  assert.equal(materialFactorComponent(parsed.document.inputs.design, 'alphaCc')?.value, 0.9)
  assert.equal(materialFactorComponent(parsed.document.inputs.design, 'gammaC')?.value, 1.6)
  assert.equal(materialFactorComponent(parsed.document.inputs.design, 'gammaS')?.value, 1.2)
})

test('DesignBasis v2 EN projects migrate the former eps_cu endpoint to the domain-5 eps_c2 pivot', () => {
  const profileId = 'en-1992-1-1-2004-stress-strain' as const
  const legacy = createProjectDocument({
    calculationProfileId: profileId,
    geometry: createEmptyGeometryInput({ id: 1, name: 'Legacy EN endpoint' }),
    materials: applyCalculationProfileToMaterials(createDefaultMaterialStore(), profileId),
    design: createDesignBasisForCalculationProfile(profileId)
  }) as unknown as { inputs: { design: Record<string, unknown> } }
  legacy.inputs.design.basisVersion = 2
  legacy.inputs.design.compressionEndpoint = 'ultimate-strain'

  const parsed = parseProjectDocument(legacy)
  assert.equal(parsed.ok, true, parsed.ok ? 'legacy EN endpoint parsed' : parsed.error)
  if (!parsed.ok || parsed.document.inputs.design.format !== 'designMaterialReevaluation') return
  assert.equal(parsed.document.inputs.design.basisVersion, 3)
  assert.equal(parsed.document.inputs.design.compressionEndpoint, 'peak-stress-strain')
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

test('an EN project can document and round-trip an explicit UMD concrete curve', () => {
  const profileId = 'en-1992-1-1-2004-stress-strain' as const
  const materials = applyConcreteModelToMaterials(
    applyCalculationProfileToMaterials(createDefaultMaterialStore(), profileId),
    profileId,
    'user-stress-strain-curve'
  )
  const design = createDesignBasisForCalculationProfile(profileId)
  design.modified = true
  design.materialModelModified = true
  design.overrideReason = 'Use the explicit UMD design-level concrete curve supplied with the verification case.'

  assert.equal(materials.concrete.standard, 'EC2')
  assert.equal(activeConcreteModelId(profileId, materials.concrete), 'user-stress-strain-curve')

  const document = createProjectDocument({
    calculationProfileId: profileId,
    geometry: createEmptyGeometryInput({ id: 1, name: 'UMD explicit curve' }),
    materials,
    design
  })
  const parsed = parseProjectDocument(document)
  assert.equal(parsed.ok, true, parsed.ok ? 'UMD-style EN project parsed' : parsed.error)
})

test('EN DesignBasis is the canonical owner of partial factors even if a material snapshot is stale', () => {
  const profileId = 'en-1992-1-1-2004-stress-strain' as const
  const materials = applyCalculationProfileToMaterials(createDefaultMaterialStore(), profileId)
  const initial = createDesignBasisForCalculationProfile(profileId)
  if (initial.format !== 'designMaterialReevaluation') throw new Error('Expected EN design-material basis')
  const basis = setMaterialFactorComponentValue(
    setMaterialFactorComponentValue(
      setMaterialFactorComponentValue(initial, 'alphaCc', 0.9),
      'gammaC',
      1.6
    ),
    'gammaS',
    1.2
  )
  const resolved = buildResistanceMaterialSets(materials, basis)
  assert.equal(resolved.designMaterials.concrete.factors?.resistanceScale, 0.9 / 1.6)
  assert.equal(resolveMaterialFactorExpression(basis.factors.concrete), 0.9 / 1.6)
  assert.ok(resolved.designMaterials.steel.every((steel) => steel.factors?.resistanceScale === 1 / 1.2))
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
