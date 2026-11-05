import assert from 'node:assert/strict'
import test from 'node:test'
import { geometryInputRebars, rebarArea, sectionGeometryFromGeometryInput, type GeometryInput } from '@pm/geometry'
import { createDefaultMaterialStore } from '@pm/materials'
import { buildResistanceMaterialSets, withSteelModelModification } from '@pm/design'
import { applyCalculationProfileToMaterials, createAdaptiveAnalysisOptions, createAnalysisOptionsForProfile, createDesignBasisForCalculationProfile, createSteelHardeningDefinition, UNIFIED_STATION_COUNT } from '@pm/project'
import { AnalysisInputError, analysisStations, buildExactDirectionCurveFromPrepared, evaluatePreparedState, prepareAnalysis, stationDefinitionLabel } from '../src/index'

const geometry: GeometryInput = {
  id: 1, name: 'Midpoint analytical rectangle',
  outers: [{ id: 1, holes: [], points: [{ id: 1, x: -200, y: -300 }, { id: 2, x: 200, y: -300 }, { id: 3, x: 200, y: 300 }, { id: 4, x: -200, y: 300 }] }],
  rebars: [[-150, -250], [150, -250], [150, 250], [-150, 250]].map(([x, y], index) => ({ id: index + 1, x, y, dia: 25, steelMaterialId: 1 }))
}
const section = sectionGeometryFromGeometryInput(geometry)
const bars = geometryInputRebars(geometry)
const relativeRoundoff = (actual: number, expected: number) => {
  assert.ok(Math.abs(actual - expected) <= 32 * Number.EPSILON * Math.max(Math.abs(actual), Math.abs(expected)), `${actual} != ${expected}`)
}

test('ENG-AN-002: the explicit midpoint cannot silently overrun an adaptive station budget', () => {
  const profile = 'kds-2024-stress-strain'
  const materials = applyCalculationProfileToMaterials(createDefaultMaterialStore(), profile)
  const basis = createDesignBasisForCalculationProfile(profile)
  const prepared = prepareAnalysis(section, bars, materials)
  const options = createAdaptiveAnalysisOptions()
  if (options.stations.refinement.type !== 'adaptive') throw new Error('Wrong fixture mode.')
  options.stations.refinement.maxStations = analysisStations(options).length
  assert.throws(() => buildExactDirectionCurveFromPrepared(prepared, materials, basis, options, 0),
    (error: unknown) => error instanceof AnalysisInputError && error.code === 'INVALID_ANALYSIS_OPTIONS' && /midpoint/.test(error.message))
})

for (const profile of ['kds-2024-stress-strain', 'en-1992-1-1-2004-stress-strain'] as const) {
  for (const hardening of [false, true]) {
    test(`ENG-AN-002: ${profile}, hardening ${hardening ? 'On' : 'Off'}, has one physical 50% seed in both resistance stages`, () => {
      const materials = applyCalculationProfileToMaterials(createDefaultMaterialStore(), profile)
      let basis = createDesignBasisForCalculationProfile(profile)
      const steel = materials.steel[0]
      steel.stressStrain = hardening ? createSteelHardeningDefinition(profile, steel, basis) : { type: 'elastic-perfectly-plastic' }
      basis = withSteelModelModification(basis, materials)
      const sets = buildResistanceMaterialSets(materials, basis)
      const prepared = prepareAnalysis(section, bars, sets.stateMaterials)
      const referencePrepared = prepareAnalysis(section, bars, sets.referenceMaterials)
      const options = createAnalysisOptionsForProfile(profile)
      if (options.methodId !== 'strain-domain-surface-v1') throw new Error('Wrong fixture mechanics.')
      const curve = buildExactDirectionCurveFromPrepared(prepared, materials, basis, options, 0)
      const transitions = curve.stations.filter(station => station.definition.kind === 'tension-pole-transition-ratio')
      assert.equal(curve.stations.length, UNIFIED_STATION_COUNT + 1)
      assert.equal(transitions.length, 1)
      const transition = transitions[0]
      assert.equal(transition.fixed, true)
      assert.equal(transition.id, 'pure-tension-transition-50')
      assert.equal(stationDefinitionLabel(transition.definition), 'Pure tens 50%')
      assert.deepEqual(transition.definition, {
        kind: 'tension-pole-transition-ratio', from: analysisStations(options).at(-2)?.definition, ratio: 0.5
      })
      assert.equal(curve.stations.at(-2)?.id, transition.id)
      assert.equal(curve.stations.filter(s => s.definition.kind === 'pure-tension').length, 1)

      assert.ok(curve.nominalCurve && curve.designCurve)
      const pole = curve.nominalCurve.find(p => p.stationId === 'pure-tension')
      const point = curve.nominalCurve.find(p => p.stationId === transition.id)
      assert.ok(pole && point)
      const target = pole.state.e0
      // Independent beta=0 equalities. Finite boundary joint: eps(top)=epsCu and
      // eps(bottom bar)=target. The legacy three-leg path is halfway from its
      // concrete-limit pivot to zero concrete strain at ratio 0.5.
      const topStrain = sets.stateMaterials.concrete.limits.epsCu * (hardening ? 1 : 0.5)
      const curvature = (topStrain - target) / (300 - -250)
      const e0 = target + curvature * 250
      relativeRoundoff(point.state.e0, e0)
      relativeRoundoff(point.state.kx, curvature)
      assert.equal(point.state.ky, 0)
      assert.notDeepEqual(point.state, pole.state)
      const response = evaluatePreparedState(referencePrepared, point.state)
      relativeRoundoff(point.P, response.total.P)
      relativeRoundoff(point.Mx, response.total.Mx)

      // Independent per-bar endpoint-law summation; no production material evaluator.
      const definition = sets.referenceMaterials.steel[0]
      const fy = definition.fy * (definition.factors?.resistanceScale ?? 1) / (definition.factors?.gammaS ?? 1)
      const Es = definition.elasticModulus, epsY = fy / Es
      const model = definition.stressStrain
      let H = 0
      if (model.type === 'linear-hardening') {
        const fu = (model.ultimateStrength.type === 'ratio' ? definition.fy * model.ultimateStrength.ratio : model.ultimateStrength.stress) * (definition.factors?.resistanceScale ?? 1) / (definition.factors?.gammaS ?? 1)
        H = (fu - fy) / (model.epsUk - epsY)
      }
      let P = 0, Mx = 0
      for (const bar of bars) {
        const strain = e0 + curvature * bar.y
        const stress = Math.abs(strain) <= epsY ? Es * strain : Math.sign(strain) * (fy + H * (Math.abs(strain) - epsY))
        const F = stress * rebarArea(bar)
        P += F; Mx += F * bar.y
      }
      relativeRoundoff(point.ledger.steelGross.P, P)
      relativeRoundoff(point.ledger.steelGross.Mx, Mx)
      assert.equal(point.ledger.displacedConcrete.P, 0, 'All bars are in tension in this analytical fixture.')
      const designMidpoint = curve.designCurve.filter(p => p.stationId === transition.id)
      assert.equal(designMidpoint.length, 1)
      const designPoint = designMidpoint[0]
      assert.ok(designPoint.resistance)
      const designResponse = evaluatePreparedState(prepared, designPoint.state)
      let factor = 1
      if (basis.format === 'globalResultantFactor') {
        assert.ok(designPoint.resistance.factor !== null)
        factor = designPoint.resistance.factor
      } else {
        assert.equal(designPoint.resistance.factor, null, 'Material reductions are already compiled.')
      }
      relativeRoundoff(designPoint.P, designResponse.total.P * factor)
      relativeRoundoff(designPoint.Mx, designResponse.total.Mx * factor)
    })
  }
}
