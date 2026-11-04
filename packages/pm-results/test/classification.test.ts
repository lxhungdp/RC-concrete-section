import assert from 'node:assert/strict'
import test from 'node:test'
import {
  FIXED_GRID_SCREENING_RELATIVE_UNCERTAINTY,
  classifyUtilization
} from '../src/index'

test('fixed-grid screening exposes adequate, indeterminate, and inadequate states', () => {
  assert.equal(
    classifyUtilization(0.97, FIXED_GRID_SCREENING_RELATIVE_UNCERTAINTY, 'fixed-grid-screening-margin').status,
    'adequate'
  )
  assert.equal(
    classifyUtilization(1.00, FIXED_GRID_SCREENING_RELATIVE_UNCERTAINTY, 'fixed-grid-screening-margin').status,
    'indeterminate'
  )
  assert.equal(
    classifyUtilization(1.03, FIXED_GRID_SCREENING_RELATIVE_UNCERTAINTY, 'fixed-grid-screening-margin').status,
    'inadequate'
  )
})

test('missing intersections and missing adaptive evidence are indeterminate', () => {
  assert.equal(classifyUtilization(null, 0.01, 'adaptive-sampling-estimate').status, 'indeterminate')
  assert.equal(classifyUtilization(0.8, null, 'adaptive-sampling-estimate').status, 'indeterminate')
})

test('ENG-RES-001: exact Fixed limits and invalid values preserve the common rule', () => {
  const classify = (ur: number | null, u: number | null = 0.02) => classifyUtilization(ur, u, 'fixed-grid-screening-margin').status
  assert.deepEqual([0.91, 0.98, 0.980001, 1, 1.02, 1.020001, 1.1].map(ur => classify(ur)),
    ['adequate', 'adequate', 'indeterminate', 'indeterminate', 'indeterminate', 'inadequate', 'inadequate'])
  for (const ur of [null, Number.NaN, Number.POSITIVE_INFINITY, -0.1]) assert.equal(classify(ur), 'indeterminate')
  for (const u of [null, Number.NaN, Number.POSITIVE_INFINITY, -0.01, 1, 1.1]) assert.equal(classify(0.91, u), 'indeterminate')
  assert.equal(classify(1, 0), 'adequate')
})
