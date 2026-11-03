import assert from 'node:assert/strict'
import test from 'node:test'
import type { PointCalculationAudit } from '@pm/analysis'
import {
  chartResultantValue,
  chartTableValue,
  chartValueLabel,
  isReconciledPointAudit,
  type ChartTableVerticalRow,
  type ChartTableFixedPRow
} from '../../features/section-editor/results/chart-data-table'

// Minimal view-contract fixtures; these tests do not evaluate or qualify mechanics.
const vertical = {
  kind: 'vertical', evidence: { stage: 'design' },
  design: { total: { P: -42, M: 330 } },
  nominal: { total: { P: -53, M: 440 } }
} as ChartTableVerticalRow
const fixedP = {
  kind: 'fixedP', evidence: { stage: 'design' },
  design: { Mx: 70, My: -25 }, nominal: { Mx: 95, My: -40 }
} as ChartTableFixedPRow

test('value traces select the exact row component and stage without rounding or absolute values', () => {
  assert.equal(chartTableValue(vertical, 'P'), -42)
  assert.equal(chartTableValue(vertical, 'M'), 330)
  assert.equal(chartTableValue(fixedP, 'Mx'), 70)
  assert.equal(chartTableValue(fixedP, 'My'), -25)
  assert.equal(chartTableValue({ ...fixedP, evidence: { ...fixedP.evidence, stage: 'nominal' } }, 'My'), -40)
  assert.equal(chartTableValue({ ...vertical, evidence: { ...vertical.evidence, stage: 'nominal' } }, 'P'), -53)
})

test('a source mismatch or missing resistance stage cannot substitute another result value', () => {
  assert.equal(chartTableValue(vertical, 'Mx'), null)
  assert.equal(chartTableValue(fixedP, 'M'), null)
  assert.equal(chartTableValue({ ...fixedP, design: null }, 'My'), null)
})

test('resultant selection retains canonical signs and the existing direct-meridian projection', () => {
  const resultant = { P: -10, Mx: 30, My: -40 }
  assert.equal(chartResultantValue(resultant, 'P', 90), -10)
  assert.equal(chartResultantValue(resultant, 'Mx', 90), 30)
  assert.equal(chartResultantValue(resultant, 'My', 90), -40)
  assert.ok(Math.abs(chartResultantValue(resultant, 'M', 90) + 40) < 1e-12)
  assert.equal(chartValueLabel('Mx', 'design'), 'Mrx')
  assert.equal(chartValueLabel('My', 'nominal'), 'Mny')
})

test('focused derivations fail closed for unavailable, unreconciled or missing source audits', () => {
  const audit = {
    kind: 'stress-strain', resistanceFactor: null, resistanceFactorCalculation: null, reconciliation: { ok: true }, nominalReferenceReconciliation: { ok: true }
  } as Extract<PointCalculationAudit, { kind: 'stress-strain' }>
  assert.equal(isReconciledPointAudit(audit), true)
  assert.equal(isReconciledPointAudit({ ...audit, resistanceFactor: 0.65 }), false,
    'a displayed global factor requires its own matching calculation evidence')
  assert.equal(isReconciledPointAudit(undefined), false)
  assert.equal(isReconciledPointAudit({ kind: 'unavailable', pointId: 'missing', stage: 'design', reason: 'missing-physical-state', message: 'No physical evidence' }), false)
  assert.equal(isReconciledPointAudit({ ...audit, reconciliation: { ...audit.reconciliation, ok: false } }), false)
  const cap = { kind: 'axial-cap', reconciliation: { ok: true }, preCap: { audit } } as PointCalculationAudit
  assert.equal(isReconciledPointAudit(cap), true)
  assert.equal(isReconciledPointAudit({ kind: 'axial-cap', reconciliation: { ok: false } } as PointCalculationAudit), false)
})
