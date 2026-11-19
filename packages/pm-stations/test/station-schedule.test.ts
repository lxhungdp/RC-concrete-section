import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ADAPTIVE_DEPTH_RATIOS,
  ADAPTIVE_INITIAL_STATION_COUNT,
  ADAPTIVE_STEEL_STRAIN_YIELD_RATIOS,
  UNIFIED_DEPTH_RATIOS,
  UNIFIED_STATION_COUNT,
  UNIFIED_STATION_SCHEDULE,
  UNIFIED_STEEL_STRAIN_YIELD_RATIOS
} from '../src/index'

test('unified-27-v2 owns the exact fixed production criteria', () => {
  assert.equal(UNIFIED_STATION_SCHEDULE, 'unified-27-v2')
  assert.equal(UNIFIED_STATION_COUNT, 27)
  assert.deepEqual([...UNIFIED_DEPTH_RATIOS], [3, 2, 1.5, 1.2, 1.1, 1])
  assert.deepEqual([...UNIFIED_STEEL_STRAIN_YIELD_RATIOS], [
    0, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5, 7.5, 10, 20
  ])
  assert.equal(2 + UNIFIED_DEPTH_RATIOS.length + UNIFIED_STEEL_STRAIN_YIELD_RATIOS.length, 27)
})

test('adaptive seed remains distinct from the fixed production schedule', () => {
  assert.equal(ADAPTIVE_INITIAL_STATION_COUNT, 14)
  assert.deepEqual([...ADAPTIVE_DEPTH_RATIOS], [2, 1])
  assert.deepEqual([...ADAPTIVE_STEEL_STRAIN_YIELD_RATIOS], [0, 0.25, 0.5, 0.75, 1, 1.5, 2, 4, 10, 20])
})

