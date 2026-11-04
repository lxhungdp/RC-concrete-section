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
    designCheck: { evaluated: true, definition: 'proportional3D', adequacy: 'adequate', utilizationInterval: {
      lower: 0.49, upper: 0.51, relativeUncertainty: 0.02, evidence: 'fixed-grid-screening-margin' } },
    capacityField: { status: 'available', boundary: { kind: 'design' }, state: { e0: 0.002, kx: 3e-6, ky: -4e-6 },
      response: { P: 200, Mx: 40, My: -20 }, loadFactor: 2, residual: { P: 0, Mx: 0, My: 0 },
      residualNorm: 0, iterations: 4, admissibility, resistance: null, message: 'Capacity diagnostic' }
  }
}

const methods = ['strain-domain-surface-v1', 'equivalent-block-surface-v1'] as const

test('ENG-RES-001: field basis follows mechanics and classification, with distinct stored states', () => {
  for (const method of methods) for (const adequacy of ['adequate', 'inadequate', 'indeterminate'] as const) {
    for (const converged of [true, false]) {
      const source = result()
      assert.ok(source.designCheck.evaluated)
      source.designCheck.adequacy = adequacy
      source.ok = converged
      source.converged = converged
      const capacity = method === 'equivalent-block-surface-v1' || adequacy === 'inadequate'
      const before = JSON.stringify(source)
      const field = resolveLoadcaseField(source, method)
      assert.equal(field.basis, capacity ? 'capacity' : 'demand')
      if (!capacity && !converged) {
        assert.ok(field.status === 'unavailable')
        assert.equal(field.reason, 'non-converged')
      } else {
        assert.ok(field.status === 'available')
        assert.ok(source.capacityField?.status === 'available')
        const expected = capacity ? source.capacityField : source
        assert.equal(field.state, expected.state)
        assert.equal(field.response, expected.response)
        assert.equal(field.loadFactor, capacity ? source.capacityField.loadFactor : 1)
      }
      assert.equal(JSON.stringify(source), before, 'selection cannot alter the check or stored evidence')
    }
  }
})

test('ENG-RES-001: before-cap evidence remains explicit whenever capacity is selected', () => {
  for (const method of methods) for (const adequacy of ['adequate', 'inadequate'] as const) {
    if (method === 'strain-domain-surface-v1' && adequacy === 'adequate') continue
    const source = result()
    assert.ok(source.designCheck.evaluated)
    source.designCheck.adequacy = adequacy
    assert.ok(source.capacityField?.status === 'available')
    source.capacityField.boundary = { kind: 'before-axial-cap', limit: 150 }
    const field = resolveLoadcaseField(source, method)
    assert.ok(field.status === 'available' && field.basis === 'capacity')
    assert.deepEqual(field.boundary, { kind: 'before-axial-cap', limit: 150 })
    for (const limit of [Number.NaN, 250]) {
      source.capacityField.boundary = { kind: 'before-axial-cap', limit }
      assert.equal(resolveLoadcaseField(source, method).status, 'unavailable')
    }
  }
})

test('ENG-RES-001: unchecked, mismatched, non-finite and inadmissible evidence fails closed', () => {
  for (const method of methods) {
    const unchecked = result()
    unchecked.designCheck = { evaluated: false }
    assert.equal(resolveLoadcaseField(unchecked, method).status, 'unavailable')
    const mismatched = result()
    mismatched.loadcaseId = 2
    assert.equal(resolveLoadcaseField(mismatched, method).status, 'unavailable')
    for (const invalid of ['state', 'factor', 'admissibility'] as const) {
      const source = result()
      assert.ok(source.designCheck.evaluated)
      source.designCheck.adequacy = 'inadequate'
      assert.ok(source.capacityField?.status === 'available')
      if (invalid === 'state') source.capacityField.state.kx = Number.NaN
      if (invalid === 'factor') source.capacityField.loadFactor = 0
      if (invalid === 'admissibility') source.capacityField.admissibility = { ...source.capacityField.admissibility, ok: false }
      assert.equal(resolveLoadcaseField(source, method).status, 'unavailable', invalid)
    }
  }
  for (const invalid of ['state', 'ok', 'admissibility'] as const) {
    const source = result()
    if (invalid === 'state') source.state.kx = Number.NaN
    if (invalid === 'ok') source.ok = false
    if (invalid === 'admissibility') source.admissibility = { ...source.admissibility, ok: false }
    const field = resolveLoadcaseField(source, 'strain-domain-surface-v1')
    assert.equal(field.status, 'unavailable', invalid)
    assert.equal(field.basis, 'demand', 'failed demand cannot fall back to available capacity')
  }
})

test('ENG-RES-001: missing capacity never substitutes demand and unavailable reasons are preserved', () => {
  for (const method of methods) for (const adequacy of ['adequate', 'inadequate', 'indeterminate'] as const) {
    if (method === 'strain-domain-surface-v1' && adequacy !== 'inadequate') continue
    const source = result()
    assert.ok(source.designCheck.evaluated)
    source.designCheck.adequacy = adequacy
    delete source.capacityField
    const missing = resolveLoadcaseField(source, method)
    assert.ok(missing.status === 'unavailable')
    assert.equal(missing.basis, 'capacity')
    assert.equal(missing.reason, 'missing-capacity-evidence')
    for (const reason of ['zero-demand', 'non-converged', 'axial-cap', 'evaluation-error'] as const) {
      source.capacityField = { status: 'unavailable', reason, iterations: 0, message: 'Unavailable capacity.' }
      assert.deepEqual(resolveLoadcaseField(source, method), { ...source.capacityField, basis: 'capacity' })
    }
  }
})
