import assert from 'node:assert/strict'
import test from 'node:test'
import { PROJECT_INPUT_LIMITS, ProjectResourceLimitError } from '@pm/project'
import { readProjectJsonText } from '../features/section-editor/project/project-json'

test('AUD-004: an oversized JSON file is rejected before invoking text()', async () => {
  let reads = 0
  const text = async () => { reads += 1; return '{}' }
  await assert.rejects(readProjectJsonText({ size: PROJECT_INPUT_LIMITS.jsonBytes + 1, text }), ProjectResourceLimitError)
  assert.equal(reads, 0)
  assert.equal(await readProjectJsonText({ size: 2, text }), '{}')
  assert.equal(reads, 1)
})
