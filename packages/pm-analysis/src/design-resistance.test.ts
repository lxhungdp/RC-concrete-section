import { strict as assert } from 'node:assert'
import test from 'node:test'
import { geometryInputRebars, sectionGeometryFromGeometryInput } from '@pm/geometry'
import {
  buildResistanceMaterialSets,
  createEn1992DesignBasis,
  createKdsBasicDesignBasis,
  designBasisIssues,
  designBasisRequiresOverrideReason,
  evaluateGlobalStrengthReduction
} from '@pm/design'
import { createLoadCombination, createDefaultAnalysisOptions } from '@pm/project'
import {
  buildDesignPreviewSurfaceFromPrepared,
  checkLoadcaseUtilizationFromSurface,
  prepareAnalysis
} from './index'
import { referenceProjectDocument } from './reference-case'

const document = referenceProjectDocument()
const section = sectionGeometryFromGeometryInput(document.inputs.geometry)
const rebars = geometryInputRebars(document.inputs.geometry)
const materials = document.inputs.materials

const compactOptions = () => {
  const options = createDefaultAnalysisOptions()
  options.directions.seed = { type: 'uniform', count: 8, startDeg: 0 }
  options.directions.refinement = { type: 'fixed', probe: { stationIds: [] } }
  return options
}

test('KDS current profile identifies the 2024 code set without misdating its resistance clauses', () => {
  const basis = createKdsBasicDesignBasis()
  assert.equal(basis.profileId, 'kds-2024-current-set')
  assert.match(basis.identity.document, /KDS 2024 current set/)
  assert.match(basis.identity.document, /KDS 14 20 10:2021/)
  assert.match(basis.identity.amendment ?? '', /2024-879/)
})

test('disabling only the optional axial limit does not require an override reason', () => {
  const basis = createKdsBasicDesignBasis()
  basis.axialCapEnabled = false
  basis.modified = true
  assert.equal(designBasisRequiresOverrideReason(basis), false)
  assert.equal(
    designBasisIssues(basis).some((issue) => issue.includes('reason')),
    false
  )

  basis.factors.phiCompressionOther = 0.66
  assert.equal(designBasisRequiresOverrideReason(basis), true)
  assert.equal(
    designBasisIssues(basis).some((issue) => issue.includes('reason')),
    true
  )
})

test('global strength reduction is classified and interpolated at the declared strain limits', () => {
  const basis = createKdsBasicDesignBasis()
  const epsY = 0.002

  const compression = evaluateGlobalStrengthReduction(basis, epsY, epsY)
  assert.equal(compression.classification, 'compression-controlled')
  assert.equal(compression.phi, 0.65)

  const transition = evaluateGlobalStrengthReduction(basis, epsY + 0.0015, epsY)
  assert.equal(transition.classification, 'transition')
  assert.ok(Math.abs(transition.phi - 0.75) < 1e-12)

  const tension = evaluateGlobalStrengthReduction(basis, epsY + 0.003, epsY)
  assert.equal(tension.classification, 'tension-controlled')
  assert.equal(tension.phi, 0.85)
})

test('global-factor profiles remove embedded material factors before applying one resultant factor', () => {
  const source = structuredClone(materials)
  source.concrete.factors = { ...source.concrete.factors, gammaC: 1.5 }
  source.steel = source.steel.map((steel) => ({
    ...steel,
    factors: { ...steel.factors, gammaS: 1.15 }
  }))
  const sets = buildResistanceMaterialSets(source, createKdsBasicDesignBasis())

  assert.equal(sets.referenceMaterials.concrete.factors?.gammaC, undefined)
  assert.equal(sets.designMaterials.concrete.factors?.gammaC, undefined)
  assert.ok(sets.referenceMaterials.steel.every((steel) => steel.factors?.gammaS === undefined))
  assert.deepEqual(sets.referenceMaterials, sets.designMaterials)
})

test('design surface preserves IDs and pairs every uncapped design state with its nominal reference', () => {
  const basis = createKdsBasicDesignBasis()
  const sets = buildResistanceMaterialSets(materials, basis)
  const surface = buildDesignPreviewSurfaceFromPrepared(
    prepareAnalysis(section, rebars, sets.stateMaterials),
    materials,
    basis,
    compactOptions()
  )

  assert.equal(surface.points.length, surface.nominalPoints.length)
  assert.deepEqual(
    surface.points.map((point) => point.id),
    surface.nominalPoints.map((point) => point.id)
  )
  for (const point of surface.points.filter((item) => !item.resistance?.axialCapApplied)) {
    const nominalAtState = surface.nominalPoints.find((item) => item.id === point.id)
    assert.deepEqual(point.state, nominalAtState?.state)
  }

  const uncapped = surface.points.find(
    (point) => point.resistance && !point.resistance.axialCapApplied && Math.abs(point.P) > 1
  )
  assert.ok(uncapped?.resistance?.factor)
  const nominal = surface.nominalPoints.find((point) => point.id === uncapped?.id)
  assert.ok(nominal)
  assert.ok(Math.abs(uncapped.P - nominal.P * uncapped.resistance.factor) < Math.abs(uncapped.P) * 1e-10 + 1e-6)
  assert.ok(Math.abs(uncapped.Mx - nominal.Mx * uncapped.resistance.factor) < Math.abs(uncapped.Mx) * 1e-10 + 1e-6)
  assert.ok(surface.points.some((point) => point.resistance?.axialCapApplied))
  const capCentres = surface.points.filter((point) => point.station === 0)
  assert.ok(capCentres.every((point) => Math.abs(point.Mx) < 1e-8 && Math.abs(point.My) < 1e-8))
  assert.ok(capCentres.every((point) => Math.abs(point.P - capCentres[0].P) < 1e-8))
})

test('design-material format reevaluates the same strain states with design material strengths', () => {
  const basis = createEn1992DesignBasis()
  const sets = buildResistanceMaterialSets(materials, basis)
  const surface = buildDesignPreviewSurfaceFromPrepared(
    prepareAnalysis(section, rebars, sets.stateMaterials),
    materials,
    basis,
    compactOptions()
  )
  const point = surface.points.find((item) => Math.abs(item.P) > 1)
  assert.ok(point)
  assert.equal(point.resistance?.factor, null)
  assert.equal(point.resistance?.format, 'designMaterialReevaluation')
  assert.ok(point.resistance?.stages.includes('design-material-reevaluation'))
})

test('factored ULS utilization uses the 3D proportional demand ray', () => {
  const basis = createKdsBasicDesignBasis()
  const sets = buildResistanceMaterialSets(materials, basis)
  const surface = buildDesignPreviewSurfaceFromPrepared(
    prepareAnalysis(section, rebars, sets.stateMaterials),
    materials,
    basis,
    compactOptions()
  )
  const tensionPole = surface.points.reduce((minimum, point) => (point.P < minimum.P ? point : minimum))
  const loadcase = createLoadCombination({
    name: 'Half pure-tension resistance',
    P: tensionPole.P / 2,
    Mx: 0,
    My: 0
  })
  const result = checkLoadcaseUtilizationFromSurface(surface, loadcase)

  assert.ok(result.proportionalUtilization != null)
  assert.ok(Math.abs(result.proportionalUtilization - 0.5) < 0.02)
  assert.equal(result.utilization, result.proportionalUtilization)
  assert.equal(result.adequate, true)

  const compressionPole = surface.points.find((point) => point.station === 0)
  assert.ok(compressionPole)
  const compressionResult = checkLoadcaseUtilizationFromSurface(
    surface,
    createLoadCombination({
      name: 'Half capped compression resistance',
      P: compressionPole.P / 2,
      Mx: 0,
      My: 0
    })
  )
  assert.ok(compressionResult.proportionalUtilization != null)
  assert.ok(Math.abs(compressionResult.proportionalUtilization - 0.5) < 0.02)
})
