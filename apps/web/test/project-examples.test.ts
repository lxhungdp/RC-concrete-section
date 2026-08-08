import assert from 'node:assert/strict'
import test from 'node:test'
import { parseProjectDocument } from '@pm/project'
import { PROJECT_EXAMPLES } from '../features/section-editor/project-examples'
import { recentProjectFromRaw } from '../features/section-editor/recent-project'

test('every project-menu example is a valid version-1 project document', () => {
  assert.ok(PROJECT_EXAMPLES.length >= 5)
  assert.equal(new Set(PROJECT_EXAMPLES.map((example) => example.id)).size, PROJECT_EXAMPLES.length)

  for (const example of PROJECT_EXAMPLES) {
    const parsed = parseProjectDocument(example.document)
    assert.equal(parsed.ok, true, parsed.ok ? example.label : `${example.label}: ${parsed.error}`)
    if (parsed.ok) assert.equal(parsed.document.version, 1)
  }
})

test('Recent accepts current version-1 projects and rejects invalid local data', () => {
  const recent = recentProjectFromRaw(PROJECT_EXAMPLES[0]!.document)
  assert.ok(recent)
  assert.equal(recentProjectFromRaw('{"version":0}'), null)
  assert.equal(recentProjectFromRaw('not json'), null)
})
