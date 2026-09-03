import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createAci318DesignBasis,
  createAs3600DesignBasis,
  createEn1992DesignBasis,
  createKdsAppendixDesignBasis,
  createKdsBasicDesignBasis,
  designProfileGuidance,
  evaluateGlobalStrengthReduction,
  minimumEccentricityCandidates
} from '../src/index'

test('global strength reduction evaluates compression, transition and tension branches in isolation', () => {
  const basis = createAci318DesignBasis()
  const epsY = 0.0025
  const limit = epsY + 0.003

  const compression = evaluateGlobalStrengthReduction(basis, epsY, epsY, 500)
  assert.equal(compression.classification, 'compression-controlled')
  assert.equal(compression.phi, 0.65)

  const transitionStrain = (epsY + limit) / 2
  const transition = evaluateGlobalStrengthReduction(basis, transitionStrain, epsY, 500)
  assert.equal(transition.classification, 'transition')
  assert.equal(transition.phi, 0.65 + 0.5 * (0.9 - 0.65))

  const tension = evaluateGlobalStrengthReduction(basis, limit, epsY, 500)
  assert.equal(tension.classification, 'tension-controlled')
  assert.equal(tension.phi, 0.9)
})

test('KDS transition limit switches at the declared yield-stress threshold', () => {
  const basis = createKdsBasicDesignBasis()
  const epsY400 = 400 / 200_000
  const epsY500 = 500 / 200_000
  assert.equal(evaluateGlobalStrengthReduction(basis, 1, epsY400, 400).tensionControlledLimit, 0.005)
  assert.equal(evaluateGlobalStrengthReduction(basis, 1, epsY500, 500).tensionControlledLimit, 2.5 * epsY500)
})

test('minimum-eccentricity demand candidates are owned only by a basis that declares the rule', () => {
  const demand = { P: 1_000, Mx: 0, My: 0 }
  const projectedDepth = (nx: number, ny: number) => Math.abs(nx) * 400 + Math.abs(ny) * 600

  for (const basis of [createKdsBasicDesignBasis(), createAci318DesignBasis(), createEn1992DesignBasis(), createAs3600DesignBasis()]) {
    assert.deepEqual(minimumEccentricityCandidates(basis, demand, projectedDepth), [])
  }

  const appendix = minimumEccentricityCandidates(createKdsAppendixDesignBasis(), demand, projectedDepth)
  assert.deepEqual(appendix, [
    { Mx: 33_000, My: 0, eccentricityMm: 33 },
    { Mx: 0, My: 27_000, eccentricityMm: 27 }
  ])
})

test('draft EN and AS guidance surfaces unresolved minimum-eccentricity applicability', () => {
  assert.match(designProfileGuidance('en-1992-1-1-2004-default').designCurve, /no minimum-eccentricity/i)
  assert.match(designProfileGuidance('as-3600-2018-amd2').designCurve, /Minimum eccentricity/i)
  assert.match(designProfileGuidance('as-3600-2018-amd2').doNotCombine, /stays draft/i)
})

