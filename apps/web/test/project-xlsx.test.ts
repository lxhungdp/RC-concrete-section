import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { parseProjectDocument } from '@pm/project'
import { UNIT_PRESETS } from '@pm/units'
import * as owner from '@pm/spreadsheet/project-xlsx'
import * as web from '../features/section-editor/project/project-xlsx'

test('Project menu delegates the first workbook format to the single package owner', async () => {
  assert.equal(web.buildProjectWorkbook, owner.buildProjectWorkbook)
  assert.equal(web.importProjectWorkbook, owner.importProjectWorkbook)
  assert.equal(web.projectWorkbookFileName, owner.projectWorkbookFileName)
  assert.equal(web.PROJECT_WORKBOOK_MAX_BYTES, owner.PROJECT_WORKBOOK_MAX_BYTES)
  const parsed = parseProjectDocument(JSON.parse(readFileSync('docs/examples/realistic-sections/KDS-REAL-05-complex-stress-strain.pm-project.json', 'utf8')))
  assert.ok(parsed.ok, parsed.ok ? '' : parsed.error)
  for (const units of [UNIT_PRESETS.metric, UNIT_PRESETS.us]) {
    const bytes = await web.buildProjectWorkbook(parsed.document, units)
    const result = await web.importProjectWorkbook(new Uint8Array(bytes).buffer)
    assert.ok(result.ok, result.ok ? '' : result.error)
    assert.deepEqual(result.document, parsed.document)
  }
})
