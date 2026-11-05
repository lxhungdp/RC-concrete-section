import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { parseProjectDocument } from '@pm/project'
import { projectSpreadsheetRevision, sameProjectSpreadsheetRevision } from '../features/section-editor/project/project-spreadsheet-state'

test('whole-project stale checks cover every applied input and remain valid for repeated commits', () => {
  const parsed = parseProjectDocument(JSON.parse(readFileSync('docs/examples/realistic-sections/KDS-REAL-05-complex-stress-strain.pm-project.json', 'utf8')))
  assert.ok(parsed.ok, parsed.ok ? '' : parsed.error)
  const p = parsed.document, expected = projectSpreadsheetRevision(p)
  assert.equal(sameProjectSpreadsheetRevision(projectSpreadsheetRevision(p), expected), true)
  for (const key of ['geometry', 'materials', 'loadings', 'analysis', 'design'] as const) {
    const changed = { ...p, inputs: { ...p.inputs, [key]: structuredClone(p.inputs[key]) } }
    assert.equal(sameProjectSpreadsheetRevision(projectSpreadsheetRevision(changed), expected), false, key)
  }
  const next = structuredClone(p), nextExpected = projectSpreadsheetRevision(next)
  assert.equal(sameProjectSpreadsheetRevision(projectSpreadsheetRevision(next), nextExpected), true)
  assert.equal(sameProjectSpreadsheetRevision(projectSpreadsheetRevision(next), expected), false)
  assert.equal(sameProjectSpreadsheetRevision(projectSpreadsheetRevision({ ...p, meta: { ...p.meta, name: 'Changed' } }), expected), false)
  assert.equal(sameProjectSpreadsheetRevision(projectSpreadsheetRevision({ ...p, meta: { ...p.meta, information: { ...p.meta.information } } }), expected), true,
    'Export may clone unchanged metadata without changing an applied input')
  for (const key of Object.keys(p.meta.information) as Array<keyof typeof p.meta.information>) {
    const changed = { ...p, meta: { ...p.meta, information: { ...p.meta.information, [key]: 'Changed' } } }
    assert.equal(sameProjectSpreadsheetRevision(projectSpreadsheetRevision(changed), expected), false, key)
  }
})
