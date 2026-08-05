import assert from 'node:assert/strict'
import test from 'node:test'
import {
  EquivalentBlockInputError,
  prepareEquivalentBlockSection,
  type EquivalentBlockSection,
  type Point2
} from '@pm/equivalent-block'
import {
  aci318Beta1,
  createAci318Model,
  evaluateAci318StrengthReduction
} from '../src/index'

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
    { id: 'bl', x: -150, y: -200, area: 500, steelLawId: 'grade60' },
    { id: 'br', x: 150, y: -200, area: 500, steelLawId: 'grade60' },
    { id: 'tr', x: 150, y: 200, area: 500, steelLawId: 'grade60' },
    { id: 'tl', x: -150, y: 200, area: 500, steelLawId: 'grade60' }
  ] : [],
  referencePoint: { x: 0, y: 0 },
  units: 'N-mm-MPa',
  signConvention: 'compression-positive'
} satisfies EquivalentBlockSection)

test('ACI 318 beta1 follows the SI Whitney-block limits', () => {
  close(aci318Beta1(20), 0.85)
  close(aci318Beta1(28), 0.85)
  close(aci318Beta1(35), 0.80)
  close(aci318Beta1(42), 0.75)
  close(aci318Beta1(56), 0.65)
  close(aci318Beta1(80), 0.65)
})

test('ACI phi transitions from epsilon-y to epsilon-y plus 0.003', () => {
  const grade60 = { elasticModulus: 200_000, yieldStress: 420 }
  const yieldStrain = 420 / 200_000
  close(evaluateAci318StrengthReduction(yieldStrain, grade60, 'tied').phi, 0.65)
  close(evaluateAci318StrengthReduction(yieldStrain, grade60, 'qualifying-spiral').phi, 0.75)
  const middle = evaluateAci318StrengthReduction(yieldStrain + 0.0015, grade60, 'tied')
  close(middle.phi, (0.65 + 0.90) / 2)
  assert.equal(middle.classification, 'transition')
  close(evaluateAci318StrengthReduction(yieldStrain + 0.003, grade60, 'tied').phi, 0.90)
})

test('ACI forward block reproduces an analytical rectangle', () => {
  const model = createAci318Model({
    concreteStrength: 28,
    steel: { grade60: { elasticModulus: 200_000, yieldStress: 420 } },
    transverseReinforcement: 'tied'
  })
  const result = model.bindNominalEvaluator(preparedSection(false))({
    neutralAxisAngle: Math.PI / 2,
    neutralAxisDepth: 200
  })
  const area = 400 * (0.85 * 200)
  close(result.resultants.P, 0.85 * 28 * area)
  close(result.resultants.Mx, result.resultants.P * 165)
  close(result.resultants.My, 0)
})

test('ACI P0, phi compression, and maximum axial strength remain distinct', () => {
  const section = preparedSection()
  const model = createAci318Model({
    concreteStrength: 35,
    steel: { grade60: { elasticModulus: 200_000, yieldStress: 420 } },
    transverseReinforcement: 'tied'
  })
  const steelArea = 4 * 500
  const nominalP0 = 0.85 * 35 * (400 * 500 - steelArea) + 420 * steelArea
  close(model.nominalEndpoints(section).compression.resultants.P, nominalP0)
  close(model.designEndpoints(section).compression.resultants.P, 0.65 * nominalP0)
  close(model.axialCap(section), 0.80 * 0.65 * nominalP0)
})

test('ACI spiral factors change both compression phi and axial cap ratio', () => {
  const section = preparedSection()
  const model = createAci318Model({
    concreteStrength: 35,
    steel: { grade60: { elasticModulus: 200_000, yieldStress: 420 } },
    transverseReinforcement: 'qualifying-spiral'
  })
  const nominalP0 = model.nominalEndpoints(section).compression.resultants.P
  close(model.designEndpoints(section).compression.resultants.P, 0.75 * nominalP0)
  close(model.axialCap(section), 0.85 * 0.75 * nominalP0)
})

test('ACI model applies the resistance factors supplied by the calculation profile', () => {
  const section = preparedSection()
  const resistanceFactors = {
    phiCompressionOther: 0.61,
    phiCompressionSpiral: 0.73,
    phiTension: 0.88,
    transitionExtraStrain: 0.004,
    axialCapOther: 0.72,
    axialCapSpiral: 0.84
  }
  const model = createAci318Model({
    concreteStrength: 35,
    steel: { grade60: { elasticModulus: 200_000, yieldStress: 420 } },
    transverseReinforcement: 'tied',
    resistanceFactors
  })
  const nominal = model.nominalEndpoints(section)
  const design = model.designEndpoints(section)
  close(design.compression.resultants.P, 0.61 * nominal.compression.resultants.P)
  close(design.tension.resultants.P, 0.88 * nominal.tension.resultants.P)
  close(model.axialCap(section), 0.72 * 0.61 * nominal.compression.resultants.P)
  assert.throws(
    () => createAci318Model({
      concreteStrength: 35,
      steel: { grade60: { elasticModulus: 200_000, yieldStress: 420 } },
      transverseReinforcement: 'tied',
      resistanceFactors: { ...resistanceFactors, phiTension: 1.01 }
    }),
    (error: unknown) => error instanceof EquivalentBlockInputError && error.code === 'INVALID_BLOCK_LAW'
  )
})

test('ACI design surface is closed after the standard axial cap is applied', () => {
  const section = preparedSection()
  const model = createAci318Model({
    concreteStrength: 35,
    steel: { grade60: { elasticModulus: 200_000, yieldStress: 420 } },
    transverseReinforcement: 'tied'
  })
  const surface = model.buildDesignSurface(section, {
    seedDirections: 24,
    maxRefinementPasses: 0
  })
  assert.equal(surface.topology.closed, true, JSON.stringify(surface.topology))
  close(surface.axialCap!, model.axialCap(section))
  close(Math.max(...surface.points.map((point) => point.resultants.P)), model.axialCap(section))
})
