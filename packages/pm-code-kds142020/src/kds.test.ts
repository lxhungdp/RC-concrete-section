import assert from 'node:assert/strict'
import test from 'node:test'
import {
  EquivalentBlockInputError,
  prepareEquivalentBlockSection,
  type EquivalentBlockSection,
  type Point2
} from '@pm/equivalent-block'
import {
  createKds142020Model,
  evaluateKds142010StrengthReduction,
  resolveKds142020BlockParameters
} from './index'

const close = (actual: number, expected: number, relative = 1e-9) => {
  const scale = Math.max(1, Math.abs(actual), Math.abs(expected))
  assert.ok(Math.abs(actual - expected) <= relative * scale, `${actual} != ${expected}`)
}

const rectangle = (width: number, height: number): Point2[] => [
  { x: -width / 2, y: -height / 2 },
  { x: width / 2, y: -height / 2 },
  { x: width / 2, y: height / 2 },
  { x: -width / 2, y: height / 2 }
]

const preparedSection = (withBars = true) => prepareEquivalentBlockSection({
  solids: [{ outer: rectangle(400, 500) }],
  rebars: withBars ? [
    { id: 'bl', x: -150, y: -200, area: 500, steelLawId: 'sd400' },
    { id: 'br', x: 150, y: -200, area: 500, steelLawId: 'sd400' },
    { id: 'tr', x: 150, y: 200, area: 500, steelLawId: 'sd400' },
    { id: 'tl', x: -150, y: 200, area: 500, steelLawId: 'sd400' }
  ] : [],
  referencePoint: { x: 0, y: 0 },
  units: 'N-mm-MPa',
  signConvention: 'compression-positive'
} satisfies EquivalentBlockSection)

test('KDS Table 4.1-2 nodes and intermediate strengths resolve deterministically', () => {
  assert.deepEqual(resolveKds142020BlockParameters(40), {
    concreteStrength: 40,
    eta: 1,
    beta1: 0.8,
    extremeCompressionStrain: 0.0033,
    peakCompressionStrain: 0.002,
    source: 'table-4.1-2'
  })
  const at60 = resolveKds142020BlockParameters(60)
  close(at60.eta, 0.95)
  close(at60.beta1, 0.76)
  close(at60.extremeCompressionStrain, 0.0031)
  const at45 = resolveKds142020BlockParameters(45)
  close(at45.eta, 0.985)
  close(at45.beta1, 0.8)
  close(at45.extremeCompressionStrain, 0.00325)
  close(at45.peakCompressionStrain, 0.00205)
})

test('KDS strengths above 90 MPa require an explicit documented override', () => {
  assert.throws(
    () => resolveKds142020BlockParameters(100),
    (error: unknown) => error instanceof EquivalentBlockInputError && error.code === 'INVALID_BLOCK_LAW'
  )
  const resolved = resolveKds142020BlockParameters(100, {
    eta: 0.82,
    beta1: 0.68,
    extremeCompressionStrain: 0.0027,
    peakCompressionStrain: 0.0026,
    basis: 'Project-specific qualification report'
  })
  assert.equal(resolved.source, 'documented-override')
})

test('KDS phi uses 0.005 through SD400 and 2.5 epsilon-y above SD400', () => {
  const sd400 = { elasticModulus: 200_000, yieldStress: 400 }
  const tiedMid = evaluateKds142010StrengthReduction(0.0035, sd400, 'other')
  close(tiedMid.phi, 0.75)
  assert.equal(tiedMid.classification, 'transition')
  close(evaluateKds142010StrengthReduction(0.001, sd400, 'qualifying-spiral').phi, 0.70)
  close(evaluateKds142010StrengthReduction(0.005, sd400, 'other').phi, 0.85)

  const sd500 = { elasticModulus: 200_000, yieldStress: 500 }
  const highStrength = evaluateKds142010StrengthReduction(0.00625, sd500, 'other')
  close(highStrength.yieldStrain, 0.0025)
  close(highStrength.tensionControlledLimit, 0.00625)
  close(highStrength.phi, 0.85)
})

test('KDS forward block reproduces an analytical rectangle at fck 40 MPa', () => {
  const model = createKds142020Model({
    concreteStrength: 40,
    steel: { sd400: { elasticModulus: 200_000, yieldStress: 400 } },
    transverseReinforcement: 'other'
  })
  const result = model.bindNominalEvaluator(preparedSection(false))({
    neutralAxisAngle: Math.PI / 2,
    neutralAxisDepth: 200
  })
  const area = 400 * (0.8 * 200)
  close(result.resultants.P, 0.85 * 40 * area)
  close(result.resultants.Mx, result.resultants.P * 170)
  close(result.resultants.My, 0)
})

test('KDS pure-compression P0 is separate from the eta-reduced flexural block', () => {
  const section = preparedSection()
  const model = createKds142020Model({
    concreteStrength: 60,
    steel: { sd400: { elasticModulus: 200_000, yieldStress: 400 } },
    transverseReinforcement: 'other'
  })
  close(model.blockLaw.compressionStress, 0.95 * 0.85 * 60)
  const nominalP0 = model.nominalEndpoints(section).compression.resultants.P
  const steelArea = 4 * 500
  close(nominalP0, 0.85 * 60 * (400 * 500 - steelArea) + 400 * steelArea)
  close(model.designEndpoints(section).compression.resultants.P, 0.65 * nominalP0)
  close(model.axialCap(section), 0.80 * 0.65 * nominalP0)
})

test('KDS model applies the resistance factors supplied by the calculation profile', () => {
  const section = preparedSection()
  const resistanceFactors = {
    phiCompressionOther: 0.62,
    phiCompressionSpiral: 0.72,
    phiTension: 0.86,
    transitionExtraStrain: 0.0035,
    axialCapOther: 0.74,
    axialCapSpiral: 0.83
  }
  const model = createKds142020Model({
    concreteStrength: 40,
    steel: { sd400: { elasticModulus: 200_000, yieldStress: 400 } },
    transverseReinforcement: 'other',
    resistanceFactors
  })
  const nominal = model.nominalEndpoints(section)
  const design = model.designEndpoints(section)
  close(design.compression.resultants.P, 0.62 * nominal.compression.resultants.P)
  close(design.tension.resultants.P, 0.86 * nominal.tension.resultants.P)
  close(model.axialCap(section), 0.74 * 0.62 * nominal.compression.resultants.P)
  assert.throws(
    () => createKds142020Model({
      concreteStrength: 40,
      steel: { sd400: { elasticModulus: 200_000, yieldStress: 400 } },
      transverseReinforcement: 'other',
      resistanceFactors: { ...resistanceFactors, axialCapOther: 1.01 }
    }),
    (error: unknown) => error instanceof EquivalentBlockInputError && error.code === 'INVALID_BLOCK_LAW'
  )
})

test('KDS design surface is closed after the standard axial cap is applied', () => {
  const section = preparedSection()
  const model = createKds142020Model({
    concreteStrength: 40,
    steel: { sd400: { elasticModulus: 200_000, yieldStress: 400 } },
    transverseReinforcement: 'other'
  })
  const surface = model.buildDesignSurface(section, {
    seedDirections: 24,
    maxRefinementPasses: 0
  })
  assert.equal(surface.topology.closed, true, JSON.stringify(surface.topology))
  close(surface.axialCap!, model.axialCap(section))
  close(Math.max(...surface.points.map((point) => point.resultants.P)), model.axialCap(section))
})
