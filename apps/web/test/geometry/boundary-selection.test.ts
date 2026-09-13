import assert from 'node:assert/strict'
import test from 'node:test'
import {
  boundarySelectionStatus,
  shouldHandleBoundaryDelete,
  type BoundaryDeleteShortcutInput
} from '../../features/section-editor/geometry/boundary-selection'

test('DEV-UI-GEO: boundary selection status reports zero, singular, and plural regions', () => {
  assert.equal(boundarySelectionStatus(0), 'No regions selected')
  assert.equal(boundarySelectionStatus(1), '1 region selected')
  assert.equal(boundarySelectionStatus(2), '2 regions selected')
  assert.equal(boundarySelectionStatus(3), '3 regions selected')
})

test('DEV-UI-GEO: Delete handles a non-editable boundary selection in the geometry context', () => {
  const baseline: BoundaryDeleteShortcutInput = {
    key: 'Delete',
    defaultPrevented: false,
    repeat: false,
    selectedCount: 2,
    inBoundaryContext: true,
    editableTarget: false
  }

  assert.equal(shouldHandleBoundaryDelete(baseline), true)
  assert.equal(shouldHandleBoundaryDelete({ ...baseline, key: 'Backspace' }), false)
  assert.equal(shouldHandleBoundaryDelete({ ...baseline, selectedCount: 0 }), false)
  assert.equal(shouldHandleBoundaryDelete({ ...baseline, inBoundaryContext: false }), false)
  assert.equal(shouldHandleBoundaryDelete({ ...baseline, editableTarget: true }), false)
  assert.equal(shouldHandleBoundaryDelete({ ...baseline, defaultPrevented: true }), false)
  assert.equal(shouldHandleBoundaryDelete({ ...baseline, repeat: true }), false)
})
