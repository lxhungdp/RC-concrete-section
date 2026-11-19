/**
 * `resolveEquivalentBlockLaws` (Materials σ–ε block view, 2026-11-09 review item 1) returns exactly
 * the reference and design block laws that `prepareBlockAnalysis` builds for the analysis.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { createAci318DesignBasis, createKdsAppendixDesignBasis, createKdsBasicDesignBasis } from '@pm/design'
import { geometryInputRebars, sectionGeometryFromGeometryInput, type GeometryInput } from '@pm/geometry'
import { createKdsConcrete, createKdsRebarSteel, type MaterialStore } from '@pm/materials'
import { applyCalculationProfileToMaterials } from '@pm/project'
import { prepareBlockAnalysis, resolveEquivalentBlockLaws } from '../src/index'

const geometry: GeometryInput = {
  id: 1, name: 'Block laws',
  outers: [{ id: 1, points: [{ id: 1, x: -200, y: -200 }, { id: 2, x: 200, y: -200 }, { id: 3, x: 200, y: 200 }, { id: 4, x: -200, y: 200 }], holes: [] }],
  rebars: [[-150, -150], [150, -150], [150, 150], [-150, 150]].map(([x, y], index) => ({ id: index + 1, steelMaterialId: 1, dia: 25, area: 491, x, y }))
}
const source: MaterialStore = {
  strainSign: 'compression-positive',
  concrete: createKdsConcrete({ name: 'C40', fck: 40 }),
  steel: [createKdsRebarSteel({ id: 1, name: 'SD400', fy: 400, elasticModulus: 200000 })],
  defaults: { steelMaterialId: 1 }
}

test('block laws match the prepared analysis models for KDS (both routes) and ACI', () => {
  for (const [profileId, basis] of [
    ['kds-142020-equivalent-block', createKdsBasicDesignBasis()],
    ['kds-142020-equivalent-block', createKdsAppendixDesignBasis()],
    ['aci-318-19-22-equivalent-block', createAci318DesignBasis()]
  ] as const) {
    const materials = applyCalculationProfileToMaterials(source, profileId)
    const laws = resolveEquivalentBlockLaws(profileId, materials, basis)
    const prepared = prepareBlockAnalysis(profileId, sectionGeometryFromGeometryInput(geometry), geometryInputRebars(geometry), materials, basis)
    assert.deepEqual(laws.reference, prepared.referenceModel.blockLaw)
    assert.deepEqual(laws.design, prepared.designModel.blockLaw)
  }
  // The Appendix design block is reduced; the global-factor route keeps one block.
  const appendix = resolveEquivalentBlockLaws('kds-142020-equivalent-block',
    applyCalculationProfileToMaterials(source, 'kds-142020-equivalent-block'), createKdsAppendixDesignBasis())
  assert.ok(appendix.design.compressionStress < appendix.reference.compressionStress)
})

test('a fibre profile has no block law', () => {
  assert.throws(() => resolveEquivalentBlockLaws('kds-2024-stress-strain', source, createKdsBasicDesignBasis()), /stress-strain integration/)
})
