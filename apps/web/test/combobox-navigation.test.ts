import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nextComboboxIndex, searchComboboxIndex } from '../features/section-editor/shared/combobox-navigation'

const choices = [
  { label: 'Alpha', disabled: false },
  { label: 'Blocked', disabled: true },
  { label: 'Beta', disabled: false },
  { label: 'Bravo', disabled: false }
]

test('combobox exploration skips disabled choices and stays inside endpoints', () => {
  assert.equal(nextComboboxIndex(choices, 0, 'ArrowDown'), 2)
  assert.equal(nextComboboxIndex(choices, 2, 'ArrowUp'), 0)
  assert.equal(nextComboboxIndex(choices, 3, 'ArrowDown'), 3)
  assert.equal(nextComboboxIndex(choices, -1, 'ArrowUp'), 3)
  assert.equal(nextComboboxIndex(choices, 2, 'Home'), 0)
  assert.equal(nextComboboxIndex(choices, 0, 'End'), 3)
  assert.equal(nextComboboxIndex(choices, 0, 'PageDown'), 3)
  assert.equal(nextComboboxIndex(choices, 3, 'PageUp'), 0)
  assert.equal(nextComboboxIndex([{ label: 'Disabled', disabled: true }], 0, 'End'), -1)
  assert.equal(nextComboboxIndex([], -1, 'ArrowDown'), -1)
})

test('typeahead cycles enabled labels, retains multi-character matching and reports no match', () => {
  assert.equal(searchComboboxIndex(choices, 'b', -1), 2)
  assert.equal(searchComboboxIndex(choices, 'b', 2), 3)
  assert.equal(searchComboboxIndex(choices, 'b', 3), 2)
  assert.equal(searchComboboxIndex(choices, 'BR', -1), 3)
  assert.equal(searchComboboxIndex(choices, 'blocked', -1), -1)
  assert.equal(searchComboboxIndex([], 'b', -1), -1)
})
