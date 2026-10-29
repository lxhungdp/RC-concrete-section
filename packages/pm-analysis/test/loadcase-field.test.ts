import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveLoadcaseField, type InversePreviewResult } from '../src/index'

// Deliberately distinct stored states: the oracle here is routing/identity, not a mechanics solve.
const result = (): InversePreviewResult => {
  const admissibility = { evaluated: true, ok: true, maxConcreteCompression: 0.001,
    concreteLimit: 0.0033, maxSteelTension: 0, steelTensionLimit: null, violations: [] }
  return {
    ok: true, converged: true, admissibility, loadcaseId: 1,
    demand: { id: 1, name: 'Demand', actionBasis: 'factoredULS', P: 100, Mx: 20, My: -10 },
    state: { e0: 0.0002, kx: 1e-6, ky: -2e-6 },
    response: { P: 100, Mx: 20, My: -10 }, residual: { P: 0, Mx: 0, My: 0 },
    residualNorm: 0, iterations: 2, utilization: 0.5, contourPoint: null, message: 'Demand diagnostic',
    designCheck: { evaluated: true, adequacy: 'adequate', utilizationInterval: {
      lower: 0.49, upper: 0.51, relativeUncertainty: 0.02, evidence: 'fixed-grid-screening-margin' } },
    capacityField: { status: 'available', boundary: { kind: 'design' }, state: { e0: 0.002, kx: 3e-6, ky: -4e-6 },
      response: { P: 200, Mx: 40, My: -20 }, loadFactor: 2, residual: { P: 0, Mx: 0, My: 0 },
      residualNorm: 0, iterations: 4, admissibility, resistance: null, message: 'Capacity diagnostic' }
  }
}

test('ENG-RES-001: non-NG selects stored demand equilibrium, never the available capacity field', () => {
  for (const adequacy of ['adequate', 'indeterminate'] as const) {
    const source = result()
    assert.ok(source.designCheck.evaluated)
    source.designCheck.adequacy = adequacy
    const before = JSON.stringify(source)
    const field = resolveLoadcaseField(source, 'strain-domain-surface-v1')
    assert.equal(field.status, 'available')
    if (field.status !== 'available') return
    assert.equal(field.basis, 'demand')
    assert.equal(field.state, source.state)
    assert.equal(field.response, source.response)
    assert.equal(field.loadFactor, 1)
    assert.equal(JSON.stringify(source), before, 'query cannot alter the check or stored evidence')
  }
})

test('ENG-RES-001: NG selects capacity even when demand equilibrium converged', () => {
  const source = result()
  assert.ok(source.designCheck.evaluated)
  source.designCheck.adequacy = 'inadequate'
  const field = resolveLoadcaseField(source, 'strain-domain-surface-v1')
  assert.equal(field.status, 'available')
  assert.ok(source.capacityField?.status === 'available')
  if (field.status !== 'available') return
  assert.equal(field.basis, 'capacity')
  assert.equal(field.state, source.capacityField.state)
  assert.equal(field.response, source.capacityField.response)
  source.capacityField.boundary = { kind: 'before-axial-cap', limit: 150 }
  const beforeCap = resolveLoadcaseField(source, 'strain-domain-surface-v1')
  assert.ok(beforeCap.status === 'available' && beforeCap.basis === 'capacity')
  assert.deepEqual(beforeCap.boundary, { kind: 'before-axial-cap', limit: 150 })
  source.capacityField.boundary = { kind: 'before-axial-cap', limit: Number.NaN }
  assert.equal(resolveLoadcaseField(source, 'strain-domain-surface-v1').status, 'unavailable')
  source.capacityField.boundary = { kind: 'before-axial-cap', limit: 250 }
  assert.equal(resolveLoadcaseField(source, 'strain-domain-surface-v1').status, 'unavailable')
})

test('ENG-RES-001: failed non-NG inverse cannot fall back to capacity; block cannot masquerade as demand', () => {
  const source = result()
  source.ok = false
  source.converged = false
  const failed = resolveLoadcaseField(source, 'strain-domain-surface-v1')
  assert.equal(failed.status, 'unavailable')
  if (failed.status === 'unavailable') assert.equal(failed.reason, 'non-converged')
  const block = resolveLoadcaseField(result(), 'equivalent-block-surface-v1')
  assert.equal(block.status, 'unavailable')
  if (block.status === 'unavailable') assert.equal(block.reason, 'unsupported-demand-equilibrium')
})

test('ENG-RES-001: unchecked, non-finite, inadmissible and unresolved capacity evidence fail closed', () => {
  const unchecked = result()
  unchecked.designCheck = { evaluated: false }
  assert.equal(resolveLoadcaseField(unchecked, 'strain-domain-surface-v1').status, 'unavailable')
  const mismatched = result()
  mismatched.loadcaseId = 2
  assert.equal(resolveLoadcaseField(mismatched, 'strain-domain-surface-v1').status, 'unavailable')
  const nonFinite = result()
  nonFinite.state.kx = Number.NaN
  assert.equal(resolveLoadcaseField(nonFinite, 'strain-domain-surface-v1').status, 'unavailable')
  const inadmissible = result()
  inadmissible.ok = false
  inadmissible.admissibility = { ...inadmissible.admissibility, ok: false }
  const rejected = resolveLoadcaseField(inadmissible, 'strain-domain-surface-v1')
  assert.equal(rejected.status, 'unavailable')
  if (rejected.status === 'unavailable') assert.equal(rejected.reason, 'inadmissible')
  const ng = result()
  assert.ok(ng.designCheck.evaluated)
  ng.designCheck.adequacy = 'inadequate'
  ng.capacityField = { status: 'unavailable', reason: 'axial-cap', iterations: 0, message: 'No unique cap field.' }
  const field = resolveLoadcaseField(ng, 'equivalent-block-surface-v1')
  assert.equal(field.status, 'unavailable')
  assert.equal(field.basis, 'capacity')
})
