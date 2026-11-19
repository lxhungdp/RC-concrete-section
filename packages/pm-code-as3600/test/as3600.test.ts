import assert from 'node:assert/strict'
import test from 'node:test'
import {
  as3600Alpha2,
  as3600BendingPhi,
  as3600Gamma,
  createAs3600Model,
  evaluateAs3600StrengthReduction
} from '../src/index'
import { prepareEquivalentBlockSection } from '@pm/equivalent-block'

test('AS 3600:2018 stress-block coefficients follow the declared equations', () => {
  assert.equal(as3600Alpha2(40), 0.79)
  assert.equal(as3600Gamma(40), 0.87)
  assert.equal(as3600Alpha2(100), 0.7)
  assert.equal(as3600Gamma(100), 0.72)
})

test('AS 3600 bending phi is bounded by Table 2.2.2 limits', () => {
  assert.equal(as3600BendingPhi(0), 0.85)
  assert.equal(as3600BendingPhi(1), 0.65)
  assert.ok(as3600BendingPhi(0.5) > 0.65)
  assert.ok(as3600BendingPhi(0.5) < 0.85)
})

test('AS 3600 compression interaction transitions between phi_o and bending phi', () => {
  const atBalance = evaluateAs3600StrengthReduction({
    nominalAxial: 1000,
    balancedAxial: 1000,
    pureTensionAxial: -500,
    neutralAxisRatio: 0.5,
    compressionPhi: 0.6
  })
  const zeroAxial = evaluateAs3600StrengthReduction({
    nominalAxial: 0,
    balancedAxial: 1000,
    pureTensionAxial: -500,
    neutralAxisRatio: 0.5,
    compressionPhi: 0.6
  })
  assert.equal(atBalance.phi, 0.6)
  assert.equal(zeroAxial.phi, as3600BendingPhi(0.5))
})

test('AS 3600 tension interaction reaches 0.85 at the pure-tension pole', () => {
  const result = evaluateAs3600StrengthReduction({
    nominalAxial: -500,
    balancedAxial: 1000,
    pureTensionAxial: -500,
    neutralAxisRatio: 0.5,
    compressionPhi: 0.6
  })
  assert.equal(result.phi, 0.85)
  assert.equal(result.classification, 'combined-tension')
})

test('AS 3600 forward adapter reproduces an analytical rectangular concrete block', () => {
  const section = prepareEquivalentBlockSection({
    solids: [{ outer: [
      { x: -150, y: -250 }, { x: 150, y: -250 },
      { x: 150, y: 250 }, { x: -150, y: 250 }
    ] }],
    rebars: [{ id: '1', x: -120, y: 0, area: 500, steelLawId: '1' }],
    referencePoint: { x: 0, y: 0 },
    units: 'N-mm-MPa',
    signConvention: 'compression-positive'
  })
  const model = createAs3600Model({
    concreteStrength: 40,
    steel: { '1': { elasticModulus: 200000, yieldStress: 500 } },
    compressionPhiClass: 'ordinary'
  })
  const evaluation = model.bindNominalEvaluator(section)({
    neutralAxisAngle: 0,
    neutralAxisDepth: 100
  }).source
  assert.ok(evaluation)
  const expectedArea = 500 * as3600Gamma(40) * 100
  const expectedForce = expectedArea * as3600Alpha2(40) * 40
  assert.ok(Math.abs(evaluation.concrete.area - expectedArea) < 1e-8)
  assert.ok(Math.abs(evaluation.concrete.force - expectedForce) < 1e-6)
})
