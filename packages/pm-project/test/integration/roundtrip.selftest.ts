import assert from 'node:assert/strict'
import { createEmptyGeometryInput } from '@pm/geometry'
import {
  createDefaultMaterialStore,
  createKdsRebarSteel
} from '@pm/materials'
import {
  applyCalculationProfileToMaterials,
  CONCRETE_MODELS_FOR_MECHANICS,
  createEmptyLoadingsInput,
  createEmptyProjectDocument,
  createLoadCombination,
  createProjectDocument,
  parseProjectDocument,
  serializeProjectDocument
} from '../../src/index'

const run = () => {
  const materials = createDefaultMaterialStore()
  const steel2 = createKdsRebarSteel({ name: 'SD500', fy: 500 }, materials.steel.map((item) => item.id))
  materials.steel.push(steel2)

  const geometry = createEmptyGeometryInput({ id: 1, name: 'Roundtrip section' })
  geometry.outers = [
    {
      id: 1,
      points: [
        { id: 1, x: 0, y: 0 },
        { id: 2, x: 400, y: 0 },
        { id: 3, x: 400, y: 600 },
        { id: 4, x: 0, y: 600 }
      ],
      holes: [
        {
          id: 1,
          points: [
            { id: 5, x: 100, y: 100 },
            { id: 6, x: 200, y: 100 },
            { id: 7, x: 200, y: 200 },
            { id: 8, x: 100, y: 200 }
          ]
        }
      ]
    }
  ]
  geometry.rebars = [
    { id: 1, dia: 25, x: 50, y: 50, steelMaterialId: 1 },
    { id: 2, dia: 25, x: 350, y: 550, steelMaterialId: 2 }
  ]

  const loadings = createEmptyLoadingsInput()
  loadings.combinations.push(createLoadCombination({ name: 'ULS', P: 1_000_000, Mx: 50_000_000, My: 0 }, []))

  const original = createProjectDocument({
    geometry,
    materials,
    loadings,
    meta: { id: 1, name: 'Roundtrip project' }
  })

  const raw = serializeProjectDocument(original)
  const json = JSON.parse(raw) as Record<string, unknown>
  assert.equal(json.version, 1)
  assert.equal((json.inputs as { geometry: { unit?: unknown } }).geometry.unit, undefined)
  assert.equal((json.inputs as { materials: { unit?: unknown } }).materials.unit, undefined)
  assert.equal((json.inputs as { loadings: { forceUnit?: unknown } }).loadings.forceUnit, undefined)

  const parsed = parseProjectDocument(raw)
  assert.equal(parsed.ok, true)
  if (!parsed.ok) return

  assert.equal(parsed.document.meta.id, 1)
  assert.equal(parsed.document.inputs.geometry.outers[0]?.points[0]?.id, 1)
  assert.equal(parsed.document.inputs.materials.concrete.id, 1)
  assert.equal(parsed.document.inputs.materials.concrete.mc, 2350)
  assert.equal(parsed.document.inputs.materials.concrete.standard, 'KDS')
  assert.equal(parsed.document.inputs.materials.concrete.stressStrain.type, 'kds-parabolic')
  assert.ok((parsed.document.inputs.materials.concrete.factors?.alpha ?? 0) > 0)
  assert.equal(parsed.document.inputs.materials.concrete.factors?.gammaC, undefined)
  assert.ok((parsed.document.inputs.materials.concrete.elasticModulus ?? 0) > 0)
  assert.equal(parsed.document.inputs.materials.steel[0]?.standard, 'KDS')
  assert.equal(parsed.document.inputs.materials.steel[0]?.factors?.gammaS, undefined)
  assert.equal(
    parsed.document.inputs.materials.steel[0]?.limits?.epsY,
    parsed.document.inputs.materials.steel[0]!.fy / parsed.document.inputs.materials.steel[0]!.elasticModulus
  )
  assert.equal(parsed.document.inputs.materials.steel[1]?.id, 2)
  assert.equal(parsed.document.inputs.geometry.rebars[1]?.steelMaterialId, 2)
  assert.equal(parsed.document.inputs.loadings.combinations[0]?.P, 1_000_000)
  assert.equal(parsed.document.inputs.loadings.combinations[0]?.actionBasis, 'factoredULS')
  assert.equal(parsed.document.inputs.design.profileId, 'kds-2024-current-set')
  assert.equal(parsed.document.inputs.design.format, 'globalResultantFactor')
  const parsedAnalysis = parsed.document.inputs.analysis
  assert.equal(parsedAnalysis.methodId, 'strain-domain-surface-v1')
  if (parsedAnalysis.methodId !== 'strain-domain-surface-v1') throw new Error('Expected curve analysis options')
  assert.equal(parsedAnalysis.stations.intermediate.length, 23)
  assert.deepEqual(parsedAnalysis.directions.seed, {
    type: 'uniform',
    count: 36,
    startDeg: 0
  })
  assert.deepEqual(parsedAnalysis.directions.refinement, {
    type: 'adaptive',
    tolerance: 0.005,
    maxPasses: 6,
    maxDirections: 360,
    probe: 'all'
  })

  const empty = createEmptyProjectDocument({ id: 1, name: 'Empty' })
  const emptyParsed = parseProjectDocument(serializeProjectDocument(empty))
  assert.equal(emptyParsed.ok, true)

  /**
   * Both custom profiles must survive a canonical round trip, and the profile/material/design
   * coherence check must accept exactly the combination the profile itself produces.
   */
  for (const profileId of ['custom-stress-strain', 'custom-equivalent-block'] as const) {
    const customMaterials = applyCalculationProfileToMaterials(createDefaultMaterialStore(), profileId)
    const customDocument = createProjectDocument({
      calculationProfileId: profileId,
      geometry,
      materials: customMaterials,
      loadings,
      meta: { id: 2, name: `Custom ${profileId}` }
    })
    const customParsed = parseProjectDocument(serializeProjectDocument(customDocument))
    assert.equal(customParsed.ok, true, `${profileId} must round trip`)
    if (!customParsed.ok) return
    assert.equal(customParsed.document.inputs.calculationProfileId, profileId)
    assert.equal(customParsed.document.inputs.materials.concrete.standard, 'CUSTOM')
    assert.equal(customParsed.document.inputs.design.profileId, 'custom-user-defined')
    assert.equal(customParsed.document.inputs.design.verificationStatus, 'user-defined')
    /** The block profile must switch the law; the fibre profile keeps whatever fibre law it had. */
    assert.ok(
      CONCRETE_MODELS_FOR_MECHANICS[
        profileId === 'custom-equivalent-block' ? 'equivalent-rectangular-block' : 'stress-strain-integration'
      ].includes(customParsed.document.inputs.materials.concrete.stressStrain.type),
      `${profileId} seeded an unevaluable concrete model`
    )
    assert.equal(
      customParsed.document.inputs.analysis.methodId,
      profileId === 'custom-equivalent-block' ? 'equivalent-block-surface-v1' : 'strain-domain-surface-v1'
    )
    /** Canonical form is the parser's output, so a second pass must be byte-identical. */
    const canonical = serializeProjectDocument(customParsed.document)
    const reparsed = parseProjectDocument(canonical)
    assert.equal(reparsed.ok, true, `${profileId} canonical form must re-parse`)
    if (!reparsed.ok) return
    assert.equal(
      serializeProjectDocument(reparsed.document),
      canonical,
      `${profileId} canonical form must be stable`
    )
  }

  /** A block law must not be accepted by a fibre profile, and vice versa. */
  const mismatched = JSON.parse(serializeProjectDocument(createProjectDocument({
    calculationProfileId: 'custom-stress-strain',
    geometry,
    materials: applyCalculationProfileToMaterials(createDefaultMaterialStore(), 'custom-equivalent-block'),
    loadings,
    meta: { id: 3, name: 'Mismatched custom' }
  }))) as Record<string, unknown>
  const mismatchedParsed = parseProjectDocument(JSON.stringify(mismatched))
  assert.equal(mismatchedParsed.ok, false, 'a user-block law must not reach the fibre kernel')

  console.log('pm-project roundtrip selftest: ok')
}

run()
