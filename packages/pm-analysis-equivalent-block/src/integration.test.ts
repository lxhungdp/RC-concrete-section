import assert from 'node:assert/strict'
import test from 'node:test'
import { geometryInputRebars, sectionGeometryFromGeometryInput, type GeometryInput } from '@pm/geometry'
import { createDefaultMaterialStore } from '@pm/materials'
import {
  applyCalculationProfileToMaterials,
  createAnalysisOptionsForProfile,
  createDesignBasisForCalculationProfile,
  createProjectDocument,
  parseProjectDocument,
  serializeProjectDocument,
  type CalculationProfileId,
  type EquivalentBlockAnalysisOptions
} from '@pm/project'
import {
  buildEquivalentBlockFieldMapFromPrepared,
  buildEquivalentBlockPreviewSurfaceFromPrepared,
  prepareBlockAnalysis,
  solveEquivalentBlockDemandFromPrepared
} from './index'

const geometry: GeometryInput = {
  id: 1,
  name: '500 x 700 verification column',
  outers: [{
    id: 1,
    points: [
      { id: 1, x: -250, y: -350 }, { id: 2, x: 250, y: -350 },
      { id: 3, x: 250, y: 350 }, { id: 4, x: -250, y: 350 }
    ],
    holes: []
  }],
  rebars: [
    [-190, -290], [190, -290], [190, 290], [-190, 290], [0, -290], [0, 290]
  ].map(([x, y], index) => ({ id: index + 1, x, y, dia: 25, steelMaterialId: 1 }))
}

const build = (profileId: Exclude<CalculationProfileId, 'kds-2024-stress-strain'>) => {
  const materials = applyCalculationProfileToMaterials(createDefaultMaterialStore(), profileId)
  const design = createDesignBasisForCalculationProfile(profileId)
  const options = createAnalysisOptionsForProfile(profileId) as EquivalentBlockAnalysisOptions
  options.directions.seedCount = 12
  options.directions.refinement = { type: 'fixed' }
  options.neutralAxisStations.refinement = { type: 'fixed' }
  const section = sectionGeometryFromGeometryInput(geometry)
  const rebars = geometryInputRebars(geometry)
  const prepared = prepareBlockAnalysis(profileId, section, rebars, materials, design)
  return { materials, design, options, prepared }
}

for (const profileId of ['kds-142020-equivalent-block', 'aci-318-19-22-equivalent-block'] as const) {
  test(`${profileId}: surface, inverse and exact block field`, () => {
    const input = build(profileId)
    const surface = buildEquivalentBlockPreviewSurfaceFromPrepared(input.prepared, input.options)
    assert.equal(surface.mechanics, 'equivalent-rectangular-block')
    assert.ok(surface.points.length > 100)
    assert.ok(surface.triangles && surface.triangles.length > 100)
    assert.ok(surface.points.every((point) => Number.isFinite(point.P + point.Mx + point.My)))
    const reduced = surface.points.find((point) => point.resistance?.factor && point.equivalentBlock)
    assert.ok(reduced?.resistance?.factor)
    assert.ok(Math.abs(reduced.P - reduced.resistance.factor * reduced.resistance.nominalReference.P) < 1e-8)
    assert.ok(Math.abs(reduced.Mx - reduced.resistance.factor * reduced.resistance.nominalReference.Mx) < 1e-6)
    assert.ok(Math.abs(reduced.My - reduced.resistance.factor * reduced.resistance.nominalReference.My) < 1e-6)
    const source = surface.points.find((point) => point.equivalentBlock && Math.hypot(point.Mx, point.My) > 1e6 && point.P > 0)
    assert.ok(source)
    const inverse = solveEquivalentBlockDemandFromPrepared(input.prepared, input.options, {
      id: 1, name: '0.55 x known design ray', actionBasis: 'factoredULS',
      P: 0.55 * source.P, Mx: 0.55 * source.Mx, My: 0.55 * source.My
    })
    assert.equal(inverse.ok, true)
    assert.ok(inverse.utilization !== null && inverse.utilization > 0 && inverse.utilization < 1)
    assert.ok(typeof inverse.fixedPUtilization === 'number' && inverse.fixedPUtilization > 0)
    assert.ok(inverse.equivalentBlock)
    assert.ok(Math.abs(inverse.equivalentBlock.blockDepth - inverse.equivalentBlock.beta1 * inverse.equivalentBlock.neutralAxisDepth) < 1e-9)
    const field = buildEquivalentBlockFieldMapFromPrepared(input.prepared, {
      neutralAxisAngle: inverse.equivalentBlock.neutralAxisAngle,
      neutralAxisDepth: inverse.equivalentBlock.neutralAxisDepth
    })
    assert.equal(field.mechanics, 'equivalent-rectangular-block')
    assert.ok(field.equivalentBlock?.geometry.length)
    assert.ok(field.triangles.length > 0)
  })
}

test('schema v1 round-trips a block profile without migration', () => {
  const profileId = 'aci-318-19-22-equivalent-block' as const
  const input = build(profileId)
  const document = createProjectDocument({
    calculationProfileId: profileId,
    geometry,
    materials: input.materials,
    analysis: input.options,
    design: input.design
  })
  const parsed = parseProjectDocument(serializeProjectDocument(document))
  assert.equal(document.version, 1)
  assert.equal(parsed.ok, true)
  if (parsed.ok) {
    assert.equal(parsed.document.inputs.calculationProfileId, profileId)
    assert.equal(parsed.document.inputs.analysis.methodId, 'equivalent-block-surface-v1')
  }
})

test('ACI default adaptive profile solves a practical factored demand without a fixed grid', () => {
  const profileId = 'aci-318-19-22-equivalent-block' as const
  const materials = applyCalculationProfileToMaterials(createDefaultMaterialStore(), profileId)
  const design = createDesignBasisForCalculationProfile(profileId)
  const options = createAnalysisOptionsForProfile(profileId) as EquivalentBlockAnalysisOptions
  const prepared = prepareBlockAnalysis(
    profileId,
    sectionGeometryFromGeometryInput(geometry),
    geometryInputRebars(geometry),
    materials,
    design
  )
  const surface = buildEquivalentBlockPreviewSurfaceFromPrepared(prepared, options)
  const inverse = solveEquivalentBlockDemandFromPrepared(prepared, options, {
    id: 9,
    name: 'Practical ULS demand',
    actionBasis: 'factoredULS',
    P: 1_000_000,
    Mx: 100_000_000,
    My: 0
  })
  assert.ok(surface.points.length > 500)
  assert.equal(inverse.ok, true)
  assert.ok(inverse.equivalentBlock)
})
