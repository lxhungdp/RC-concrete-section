import assert from 'node:assert/strict'
import test from 'node:test'
import { createRectangleRing, createSectionSolid, type GeometryInputRebarView, type SectionGeometry } from '@pm/geometry'
import { createDefaultMaterialStore } from '@pm/materials'
import { applyCalculationProfileToMaterials, createDesignBasisForCalculationProfile } from '@pm/project'
import { prepareBlockAnalysis } from '@pm/analysis-equivalent-block'
import { prepareAnalysis, evaluatePreparedState, buildSectionFieldMapFromPrepared } from '../src/index'

const section: SectionGeometry = { id: 1, name: 'Stored-area oracle', solids: [createSectionSolid(createRectangleRing({ width: 400, height: 500 }))] }
const bars = (area: number): GeometryInputRebarView[] => [{ id: 1, x: 40, y: 30, dia: 20, area, steelMaterialId: 1, solidIndex: 0 }]
// Pure tension removes concrete; saturated steel gives an independent F=-fy*As oracle.
test('REBAR-AS-001: stress-strain steel force and field map consume authored As', () => {
  const materials = createDefaultMaterialStore()
  for (const area of [100, 150]) {
    const prepared = prepareAnalysis(section, bars(area), materials)
    const ledger = evaluatePreparedState(prepared, { e0: -0.01, kx: 0, ky: 0 })
    assert.equal(ledger.steel.P, -materials.steel[0].fy * area)
    assert.equal(prepared.rebarFibers[0].area, area)
    const field = buildSectionFieldMapFromPrepared(prepared, { e0: -0.01, kx: 0, ky: 0 })
    assert.equal(field.rebars[0].area, area)
    assert.equal(field.rebars[0].force, -materials.steel[0].fy * area)
  }
})

test('REBAR-AS-001: block steel and displaced-concrete terms use the same authored area', () => {
  const profile = 'aci-318-19-22-equivalent-block' as const
  const materials = applyCalculationProfileToMaterials(createDefaultMaterialStore(), profile)
  const basis = createDesignBasisForCalculationProfile(profile)
  for (const area of [100, 150]) {
    const prepared = prepareBlockAnalysis(profile, section, bars(area), materials, basis)
    const evaluation = prepared.model.bindNominalEvaluator(prepared.section)({ neutralAxisAngle: 0, neutralAxisDepth: 1000 })
    const result = evaluation.source
    assert.ok(result && 'bars' in result)
    const bar = (result as import('@pm/equivalent-block').NominalBlockEvaluation).bars[0]
    assert.equal(bar.area, area)
    assert.equal(bar.dia, 20)
    assert.equal(bar.force, area * (bar.steelStress - bar.displacedConcreteStress))
    assert.equal(bar.Mx, bar.force * 30)
    assert.equal(bar.My, bar.force * 40)
    assert.equal(prepared.section.rebars[0].area, area)
  }
})
