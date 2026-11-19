import assert from 'node:assert/strict'
import test from 'node:test'
import { buildResistanceMaterialSets, createKdsAppendixDesignBasis, withSteelModelModification, type DesignBasis } from '@pm/design'
import {
  compileSteelMaterial,
  createDefaultMaterialStore,
  describeConcreteMaterialLaw,
  type MaterialStore,
  type SteelMaterial
} from '@pm/materials'
import { applyCalculationProfileToMaterials, createDesignBasisForCalculationProfile } from '@pm/project'
import { CONCRETE_MARKS, lawMarks, operatingStrainRange, steelLawMarks } from '../../features/section-editor/results/operating-chart-marks'

// Review case: KDS rebar with Post-yield hardening k = fuk/fy = 1.2, εuk = 0.05 and εud = 100% εuk.
const FY = 400, K = 1.2, EPS_UK = 0.05
const PROFILE = 'kds-2024-stress-strain'
const store = (stressStrain: SteelMaterial['stressStrain'], epsU?: number): MaterialStore => {
  const materials = applyCalculationProfileToMaterials(createDefaultMaterialStore(), PROFILE)
  materials.steel = materials.steel.map((steel) => ({ ...steel, fy: FY, stressStrain,
    limits: { ...steel.limits, epsY: FY / steel.elasticModulus, ...(epsU === undefined ? {} : { epsU }) } }))
  return materials
}
const hardening: SteelMaterial['stressStrain'] = {
  type: 'linear-hardening', ultimateStrength: { type: 'ratio', ratio: K }, epsUk: EPS_UK, strainLimit: { type: 'factor', value: 1 }
}
const globalBasis = (materials: MaterialStore) => withSteelModelModification(createDesignBasisForCalculationProfile(PROFILE), materials)

/** The rebar chart inputs exactly as Demand Check builds them: the state material of the basis. */
const rebarChart = (materials: MaterialStore, basis: DesignBasis) => {
  const sets = buildResistanceMaterialSets(materials, basis)
  const steel = sets.stateMaterials.steel[0]!
  const law = compileSteelMaterial(steel)
  return { law, marks: steelLawMarks(steel, law.limits), multiplier: sets.reinforcementDesignMultiplier }
}
const near = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) <= 1e-9 * Math.max(1, Math.abs(expected)), `${actual} versus ${expected}`)
/** Largest stress rise past yield that the plotted range can show on the given side. */
const plottedRise = (law: ReturnType<typeof compileSteelMaterial>, end: number) =>
  Math.abs(law.stress(end)) - Math.abs(law.stress(Math.sign(end) * law.limits.epsYield!))

test('a hardening rebar chart widens to the defined branch end on each side with an operating point', () => {
  const materials = store(hardening)
  const { law, marks } = rebarChart(materials, globalBasis(materials))
  // Global-resultant route: the state law is the reference law, fu,eff = k·fy at the construction point.
  near(law.stress(EPS_UK), K * FY)
  near(law.stress(-EPS_UK), -K * FY)
  assert.deepEqual(marks.filter((mark) => mark.label.endsWith('εuk') || mark.label.endsWith('εu')),
    [{ strain: EPS_UK, label: 'εuk', extend: true }, { strain: -EPS_UK, label: '−εu', extend: true }])

  // Review field ULS-1 at capacity: every bar compressed, εs,max = 0.00304 just past εy = 0.002.
  const compressed = operatingStrainRange([0.00304, 0], marks)
  assert.equal(compressed.lo, 0)
  near(compressed.hi, EPS_UK * 1.15)
  // The defined inclined branch is drawn to fu = 480 MPa, not 2.5 MPa above a 400 MPa "plateau".
  assert.ok(plottedRise(law, compressed.hi) >= (K - 1) * FY, `rise ${plottedRise(law, compressed.hi)}`)
  const tension = operatingStrainRange([-0.00201, 0.00124], marks)
  near(tension.lo, -EPS_UK * 1.15)
  near(tension.hi, EPS_UK * 1.15)
})

test('on the material-factor route k scales the stage yield strength of the drawn law', () => {
  const materials = store(hardening)
  const { law, marks, multiplier } = rebarChart(materials, createKdsAppendixDesignBasis())
  assert.ok(multiplier > 0 && multiplier < 1)
  // engineering/04 §5: fy,eff and fu,eff take the same stage strength multiplier; Es is unchanged.
  near(law.limits.epsYield!, FY * multiplier / materials.steel[0]!.elasticModulus)
  near(law.stress(EPS_UK), K * FY * multiplier)
  assert.ok(marks.some((mark) => mark.label === 'εuk' && mark.strain === EPS_UK && mark.extend))
})

test('a declared physical bound ends the drawn hardening branch on both sides', () => {
  const materials = store(hardening, 0.03)
  const { marks } = rebarChart(materials, globalBasis(materials))
  assert.deepEqual(marks.filter((mark) => !mark.label.endsWith('εy')),
    [{ strain: 0.03, label: 'εu', extend: true }, { strain: -0.03, label: '−εu', extend: true }])
  near(operatingStrainRange([0.00304], marks).hi, 0.03 * 1.15)
})

test('plateau steel and concrete keep ultimate strains inside the operating range only', () => {
  const materials = store({ type: 'elastic-perfectly-plastic' }, 0.05)
  const { marks } = rebarChart(materials, globalBasis(materials))
  assert.deepEqual(marks.filter((mark) => !mark.label.endsWith('εy')),
    [{ strain: 0.05, label: 'εu', extend: false }, { strain: -0.05, label: '−εu', extend: false }])
  near(operatingStrainRange([0.00304, 0], marks).hi, 0.00304 * 1.15)
  near(operatingStrainRange([0.001], marks).hi, 0.002 * 1.15)

  const concrete = materials.concrete
  const concreteMarks = lawMarks(describeConcreteMaterialLaw(concrete), CONCRETE_MARKS, [1], {})
  assert.ok(concreteMarks.length > 0 && concreteMarks.every((mark) => mark.extend && mark.strain > 0))
  near(operatingStrainRange([0.0015, -0.002], concreteMarks).hi, Math.max(0.002, ...concreteMarks.map((mark) => mark.strain)) * 1.15)
})
