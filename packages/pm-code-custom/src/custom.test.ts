import assert from 'node:assert/strict'
import test from 'node:test'
import {
  EquivalentBlockInputError,
  prepareEquivalentBlockSection,
  type EquivalentBlockSection,
  type Point2
} from '@pm/equivalent-block'
import { aci318Beta1, createAci318Model } from '@pm/code-aci318'
import { createKds142020Model, resolveKds142020BlockParameters } from '@pm/code-kds142020'
import { createCustomBlockModel, evaluateCustomStrengthReduction } from './index'

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

const preparedSection = () => prepareEquivalentBlockSection({
  solids: [{ outer: rectangle(400, 500) }],
  rebars: [
    { id: 'bl', x: -150, y: -200, area: 500, steelLawId: 'main' },
    { id: 'br', x: 150, y: -200, area: 500, steelLawId: 'main' },
    { id: 'tr', x: 150, y: 200, area: 500, steelLawId: 'main' },
    { id: 'tl', x: -150, y: 200, area: 500, steelLawId: 'main' }
  ],
  referencePoint: { x: 0, y: 0 },
  units: 'N-mm-MPa',
  signConvention: 'compression-positive'
} satisfies EquivalentBlockSection)

const states = [
  { neutralAxisAngle: 0, neutralAxisDepth: 120 },
  { neutralAxisAngle: 0, neutralAxisDepth: 400 },
  { neutralAxisAngle: Math.PI / 5, neutralAxisDepth: 260 }
]

/**
 * The generic adapter must not introduce its own mechanics: fed the parameters a published profile
 * resolves, it has to return that profile's numbers exactly, nominal and design alike.
 */
test('custom block reproduces the ACI adapter when given ACI parameters', () => {
  const section = preparedSection()
  const concreteStrength = 35
  const steel = { main: { elasticModulus: 200_000, yieldStress: 420, ultimateStrain: 0.05 } }
  const aci = createAci318Model({
    concreteStrength,
    steel,
    transverseReinforcement: 'tied'
  })
  const custom = createCustomBlockModel({
    concreteStrength,
    block: {
      stressFactor: 0.85,
      depthFactor: aci318Beta1(concreteStrength),
      extremeCompressionStrain: 0.003
    },
    steel,
    transverseReinforcement: 'other',
    transitionRule: { type: 'yield-plus-strain', extraStrain: 0.003 },
    resistanceFactors: {
      phiCompressionOther: 0.65,
      phiCompressionSpiral: 0.75,
      phiTension: 0.9,
      axialCapOther: 0.8,
      axialCapSpiral: 0.85
    }
  })
  const aciNominal = aci.bindNominalEvaluator(section)
  const customNominal = custom.bindNominalEvaluator(section)
  const aciDesign = aci.bindDesignEvaluator(section)
  const customDesign = custom.bindDesignEvaluator(section)
  for (const state of states) {
    for (const key of ['P', 'Mx', 'My'] as const) {
      close(customNominal(state).resultants[key], aciNominal(state).resultants[key])
      close(customDesign(state).resultants[key], aciDesign(state).resultants[key])
    }
  }
  close(custom.axialCap(section), aci.axialCap(section))
})

test('custom block reproduces the KDS adapter when given KDS parameters', () => {
  const section = preparedSection()
  const concreteStrength = 60
  const steel = { main: { elasticModulus: 200_000, yieldStress: 500, ultimateStrain: 0.05 } }
  const parameters = resolveKds142020BlockParameters(concreteStrength)
  const kds = createKds142020Model({
    concreteStrength,
    steel,
    transverseReinforcement: 'other'
  })
  const custom = createCustomBlockModel({
    concreteStrength,
    block: {
      stressFactor: parameters.eta * 0.85,
      depthFactor: parameters.beta1,
      extremeCompressionStrain: parameters.extremeCompressionStrain,
      /** KDS keeps the literal concentric 0.85·fck reference above the reachable block stress. */
      compressionReferenceStressFactor: 0.85
    },
    steel,
    transverseReinforcement: 'other',
    transitionRule: {
      type: 'fixed-or-yield-multiple',
      yieldStressThreshold: 400,
      fixedStrainLimit: 0.005,
      highStrengthYieldMultiple: 2.5
    },
    resistanceFactors: {
      phiCompressionOther: 0.65,
      phiCompressionSpiral: 0.7,
      phiTension: 0.85,
      axialCapOther: 0.8,
      axialCapSpiral: 0.85
    }
  })
  const kdsNominal = kds.bindNominalEvaluator(section)
  const customNominal = custom.bindNominalEvaluator(section)
  for (const state of states) {
    for (const key of ['P', 'Mx', 'My'] as const) {
      close(customNominal(state).resultants[key], kdsNominal(state).resultants[key])
    }
  }
  close(
    custom.nominalEndpoints(section).compression.resultants.P,
    kds.nominalEndpoints(section).compression.resultants.P
  )
  close(
    custom.physicalCompressionEndpoint(section).resultants.P,
    kds.physicalCompressionEndpoint(section).resultants.P
  )
  assert.equal(
    custom.physicalCompressionEndpoint(section).metadata?.state,
    'equivalent-block-compression-limit'
  )
})

test('a reference stress equal to the block stress leaves one compression pole', () => {
  const section = preparedSection()
  const custom = createCustomBlockModel({
    concreteStrength: 30,
    block: { stressFactor: 0.85, depthFactor: 0.8, extremeCompressionStrain: 0.003 },
    steel: { main: { elasticModulus: 200_000, yieldStress: 400 } },
    transverseReinforcement: 'other',
    transitionRule: { type: 'yield-plus-strain', extraStrain: 0.003 },
    resistanceFactors: {
      phiCompressionOther: 0.65,
      phiCompressionSpiral: 0.75,
      phiTension: 0.9,
      axialCapOther: 0.8,
      axialCapSpiral: 0.85
    }
  })
  close(
    custom.physicalCompressionEndpoint(section).resultants.P,
    custom.nominalEndpoints(section).compression.resultants.P
  )
  assert.equal(custom.physicalCompressionEndpoint(section).metadata?.state, 'pure-compression-P0')
})

test('custom phi follows the selected transition rule', () => {
  const steel = { elasticModulus: 200_000, yieldStress: 500 }
  const yieldStrain = 500 / 200_000
  const factors = { phiCompressionOther: 0.65, phiCompressionSpiral: 0.7, phiTension: 0.85 }

  const aciShaped = evaluateCustomStrengthReduction(
    yieldStrain + 0.0015,
    steel,
    'other',
    factors,
    { type: 'yield-plus-strain', extraStrain: 0.003 }
  )
  close(aciShaped.phi, (0.65 + 0.85) / 2)
  assert.equal(aciShaped.classification, 'transition')

  /** fy = 500 > 400, so the KDS-shaped rule uses 2.5·εy rather than the fixed 0.005. */
  const kdsShaped = evaluateCustomStrengthReduction(
    yieldStrain,
    steel,
    'other',
    factors,
    { type: 'fixed-or-yield-multiple', yieldStressThreshold: 400, fixedStrainLimit: 0.005, highStrengthYieldMultiple: 2.5 }
  )
  close(kdsShaped.tensionControlledLimit, 2.5 * yieldStrain)
  assert.equal(kdsShaped.classification, 'compression-controlled')
})

test('a hardening steel law raises resistance above the elastic-perfectly-plastic law', () => {
  const section = preparedSection()
  const base = {
    concreteStrength: 30,
    block: { stressFactor: 0.85, depthFactor: 0.8, extremeCompressionStrain: 0.003 },
    transverseReinforcement: 'other' as const,
    transitionRule: { type: 'yield-plus-strain' as const, extraStrain: 0.003 },
    resistanceFactors: {
      phiCompressionOther: 0.65,
      phiCompressionSpiral: 0.75,
      phiTension: 0.9,
      axialCapOther: 0.8,
      axialCapSpiral: 0.85
    }
  }
  const state = { neutralAxisAngle: 0, neutralAxisDepth: 90 }
  const plastic = createCustomBlockModel({
    ...base,
    steel: { main: { elasticModulus: 200_000, yieldStress: 400, ultimateStrain: 0.05 } }
  }).bindNominalEvaluator(section)(state)
  const hardening = createCustomBlockModel({
    ...base,
    steel: {
      main: {
        elasticModulus: 200_000,
        yieldStress: 400,
        ultimateStrain: 0.05,
        law: { type: 'bilinear', hardeningRatio: 0.02 }
      }
    }
  }).bindNominalEvaluator(section)(state)
  /** Compare the moment magnitude so the check does not depend on which axis this state bends about. */
  const moment = (resultants: { Mx: number; My: number }) => Math.hypot(resultants.Mx, resultants.My)
  assert.ok(
    moment(hardening.resultants) > moment(plastic.resultants),
    `hardening moment ${moment(hardening.resultants)} should exceed plastic ${moment(plastic.resultants)}`
  )

  /** A user table that reproduces elastic-perfectly-plastic must reproduce its resultants too. */
  const tabulated = createCustomBlockModel({
    ...base,
    steel: {
      main: {
        elasticModulus: 200_000,
        yieldStress: 400,
        ultimateStrain: 0.05,
        law: {
          type: 'user-curve',
          points: [
            { strain: -0.05, stress: -400 },
            { strain: -0.002, stress: -400 },
            { strain: 0, stress: 0 },
            { strain: 0.002, stress: 400 },
            { strain: 0.05, stress: 400 }
          ]
        }
      }
    }
  }).bindNominalEvaluator(section)(state)
  close(tabulated.resultants.P, plastic.resultants.P, 1e-9)
  close(tabulated.resultants.Mx, plastic.resultants.Mx, 1e-9)
})

test('custom block rejects parameters it cannot evaluate', () => {
  const valid = {
    concreteStrength: 30,
    block: { stressFactor: 0.85, depthFactor: 0.8, extremeCompressionStrain: 0.003 },
    steel: { main: { elasticModulus: 200_000, yieldStress: 400 } },
    transverseReinforcement: 'other' as const,
    transitionRule: { type: 'yield-plus-strain' as const, extraStrain: 0.003 },
    resistanceFactors: {
      phiCompressionOther: 0.65,
      phiCompressionSpiral: 0.75,
      phiTension: 0.9,
      axialCapOther: 0.8,
      axialCapSpiral: 0.85
    }
  }
  assert.doesNotThrow(() => createCustomBlockModel(valid))
  assert.throws(
    () => createCustomBlockModel({ ...valid, block: { ...valid.block, depthFactor: 1.2 } }),
    EquivalentBlockInputError,
    'β1 above 1.0 makes the block deeper than the compression zone'
  )
  assert.throws(
    () => createCustomBlockModel({ ...valid, block: { ...valid.block, stressFactor: 0 } }),
    EquivalentBlockInputError
  )
  assert.throws(
    () => createCustomBlockModel({ ...valid, block: { ...valid.block, extremeCompressionStrain: -0.003 } }),
    EquivalentBlockInputError
  )
  assert.throws(() => createCustomBlockModel({ ...valid, steel: {} }), EquivalentBlockInputError)
  assert.throws(
    () => createCustomBlockModel({
      ...valid,
      resistanceFactors: { ...valid.resistanceFactors, phiTension: 1.2 }
    }),
    EquivalentBlockInputError
  )
  assert.throws(
    () => createCustomBlockModel({
      ...valid,
      transitionRule: { type: 'yield-plus-strain', extraStrain: 0 }
    }),
    EquivalentBlockInputError
  )
  assert.throws(
    () => createCustomBlockModel({
      ...valid,
      block: { ...valid.block, compressionReferenceStressFactor: 0.5 }
    }),
    EquivalentBlockInputError,
    'a reference stress below the block stress would put P0 inside the surface'
  )
})
