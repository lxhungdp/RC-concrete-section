import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEMAND_GRID_SPLIT_DEFAULT,
  clampDemandGridSplit,
  createDemandCheckView,
  demandGridKeyboardSplit,
  demandGridPointerSplit
} from '../../features/section-editor/results/results-view'

test('the Demand Check chart grid opens at an even 2 x 2 split', () => {
  assert.deepEqual(createDemandCheckView().gridSplit, { x: 0.5, y: 0.5 })
  assert.deepEqual(DEMAND_GRID_SPLIT_DEFAULT, { x: 0.5, y: 0.5 })
})

test('the split stays between 25% and 75% and rejects non-finite values', () => {
  assert.deepEqual(clampDemandGridSplit({ x: 0.1, y: 0.9 }), { x: 0.25, y: 0.75 })
  assert.deepEqual(clampDemandGridSplit({ x: Number.NaN, y: 0.6 }), { x: 0.5, y: 0.6 })
})

test('arrow keys move one axis by 2% (Shift 8%), Home resets, other keys are ignored', () => {
  const split = { x: 0.5, y: 0.5 }
  assert.deepEqual(demandGridKeyboardSplit('ArrowRight', false, split), { x: 0.52, y: 0.5 })
  assert.deepEqual(demandGridKeyboardSplit('ArrowUp', true, split), { x: 0.5, y: 0.42 })
  assert.deepEqual(demandGridKeyboardSplit('ArrowLeft', true, { x: 0.27, y: 0.5 }), { x: 0.25, y: 0.5 })
  assert.deepEqual(demandGridKeyboardSplit('Home', false, { x: 0.7, y: 0.3 }), { x: 0.5, y: 0.5 })
  assert.equal(demandGridKeyboardSplit('Enter', false, split), null)
})

test('a pointer position maps to the track fraction, excluding the pane gap', () => {
  const box = { left: 100, top: 50, width: 806, height: 606 }
  // The centre of the gap is the even split.
  assert.deepEqual(demandGridPointerSplit({ x: 503, y: 353 }, box, 6), { x: 0.5, y: 0.5 })
  const moved = demandGridPointerSplit({ x: 103 + 0.6 * 800, y: 53 + 0.4 * 600 }, box, 6)
  assert.ok(Math.abs(moved.x - 0.6) < 1e-12 && Math.abs(moved.y - 0.4) < 1e-12)
  assert.deepEqual(demandGridPointerSplit({ x: 0, y: 10_000 }, box, 6), { x: 0.25, y: 0.75 })
})
