import { strict as assert } from 'node:assert'
import test from 'node:test'
import {
  CAPACITY_FINGERPRINT_POLICY,
  PORTABLE_RESULTANT_NORMALIZED_LIMIT,
  capacityFingerprintProvenanceError,
  compareCapacityFingerprints,
  type CapacityFingerprintCase,
  type CapacityFingerprintRuntime
} from '../bench/fingerprint-policy'

const caseWith = (fingerprint: CapacityFingerprintCase['fingerprint']): CapacityFingerprintCase => ({
  key: 'case',
  fingerprint
})

const baseCase = () => caseWith({
  meshExact: [10, 0, 0],
  meshWarnings: '',
  surfaceP: [100],
  surfaceConcreteP: [80],
  surfaceSteelP: [20],
  surfaceDisplacedP: [-5],
  surfaceMx: [1e9],
  surfaceMy: [5e8],
  contourMx: [2e8],
  contourMy: [1],
  momentPlaneP: [50],
  momentPlaneM: [4e8],
  surfaceStateE0: [0.001]
})

test('exact fingerprint comparison rejects any finite result bit movement', () => {
  const expected = baseCase()
  const observed = structuredClone(expected)
  ;(observed.fingerprint.surfaceP as number[])[0] += 4 * Number.EPSILON * 100

  const deviations = compareCapacityFingerprints([expected], [observed], 'exact')
  assert.equal(deviations.length, 1)
  assert.equal(deviations[0].quantity, 'surfaceP')
  assert.equal(deviations[0].allowed, false)
})

test('portable comparison allows only declared resultants inside the section-scale envelope', () => {
  const expected = baseCase()
  const observed = structuredClone(expected)
  ;(observed.fingerprint.surfaceP as number[])[0] += 4 * Number.EPSILON * 100
  ;(observed.fingerprint.contourMy as number[])[0] += 4 * Number.EPSILON * 1e9

  const deviations = compareCapacityFingerprints([expected], [observed], 'portable')
  assert.equal(deviations.length, 2)
  assert.ok(deviations.every((item) => item.allowed))
  assert.ok(deviations.every((item) => item.sectionNormalized <= PORTABLE_RESULTANT_NORMALIZED_LIMIT))
  assert.ok(
    deviations.find((item) => item.quantity === 'contourMy')!.valueRelative > 1e-7,
    'a near-zero ordinate must be judged against the section moment scale, not itself'
  )
})

test('portable comparison rejects a resultant outside the section-scale envelope', () => {
  const expected = baseCase()
  const observed = structuredClone(expected)
  ;(observed.fingerprint.surfaceMx as number[])[0] += 32 * Number.EPSILON * 1e9

  const deviations = compareCapacityFingerprints([expected], [observed], 'portable')
  assert.equal(deviations.length, 1)
  assert.equal(deviations[0].quantity, 'surfaceMx')
  assert.equal(deviations[0].allowed, false)
})

test('portable comparison keeps geometry and strain-state quantities exact', () => {
  const expected = baseCase()
  const observed = structuredClone(expected)
  ;(observed.fingerprint.meshExact as number[])[0] += Number.EPSILON * 10
  ;(observed.fingerprint.surfaceStateE0 as number[])[0] += Number.EPSILON * 0.001

  const deviations = compareCapacityFingerprints([expected], [observed], 'portable')
  assert.equal(deviations.length, 2)
  assert.ok(deviations.every((item) => !item.allowed))
})

test('portable comparison fails closed for missing cases and quantities', () => {
  const missingQuantity = baseCase()
  delete missingQuantity.fingerprint.meshWarnings
  const deviations = compareCapacityFingerprints([baseCase(), { ...baseCase(), key: 'missing' }], [missingQuantity], 'portable')

  assert.deepEqual(
    deviations.map((item) => [item.caseKey, item.quantity, item.allowed]),
    [['case', 'meshWarnings', false], ['missing', '(case)', false]]
  )
})

const runtime: CapacityFingerprintRuntime = {
  node: 'v24.20.0',
  npm: '11.19.0',
  v8: '13.6.233.17-node.37',
  platform: 'linux',
  arch: 'x64'
}

const baselineProvenance = {
  note: 'test',
  policy: CAPACITY_FINGERPRINT_POLICY,
  ...runtime,
  platform: 'darwin' as const,
  arch: 'arm64',
  cases: []
}

test('exact provenance rejects another platform while portable provenance accepts it', () => {
  assert.match(capacityFingerprintProvenanceError(baselineProvenance, runtime, 'exact')!, /exact comparison/)
  assert.equal(capacityFingerprintProvenanceError(baselineProvenance, runtime, 'portable'), null)
})

test('portable provenance still rejects a different V8 implementation', () => {
  assert.match(
    capacityFingerprintProvenanceError({ ...baselineProvenance, v8: 'different' }, runtime, 'portable')!,
    /expected v8/
  )
})
