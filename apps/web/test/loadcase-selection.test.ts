import assert from 'node:assert/strict'
import test from 'node:test'
import { selectLoadcaseFromRow } from '../features/section-editor/loadings/loadcase-selection'

test('clicking a cell selects the loadcase represented by its row', () => {
  const selections: number[] = []

  selectLoadcaseFromRow(1, 2, (id) => selections.push(id))

  assert.deepEqual(selections, [2])
})

test('clicking a cell in the selected row does not request duplicate analysis', () => {
  const selections: number[] = []

  selectLoadcaseFromRow(2, 2, (id) => selections.push(id))

  assert.deepEqual(selections, [])
})
