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
