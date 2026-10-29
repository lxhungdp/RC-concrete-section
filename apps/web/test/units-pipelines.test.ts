import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { geometryInputRebars, sectionGeometryFromGeometryInput } from '@pm/geometry'
import { parseProjectDocument } from '@pm/project'
import { UNIT_PRESETS, commitQuantity, editableQuantity, fromCanonical, selectUnit } from '@pm/units'
import { buildColumnReportModel } from '@pm/report/report-model'
import { buildPreviewSurfaceFallback, checkLoadcasesFallback } from '../application/analysis/fallback'
import { buildProjectWorkbook, importProjectWorkbook } from '../features/section-editor/project/project-xlsx'
import { buildLoadcaseWorkbook, importLoadcaseWorkbook } from '../features/section-editor/loadings/loadcase-xlsx'
import { quantityCell, readQuantityCell, writeQuantityCell } from '../features/section-editor/shared/workbook-units'
import { appendPresentationSummary } from '../../../packages/pm-report/src/excel/presentation-summary'

for (const file of ['docs/examples/realistic-sections/KDS-REAL-05-complex-stress-strain.pm-project.json',
  'docs/examples/equivalent-block/ACI-EB-01-rectangle-8-bars.pm-project.json']) {
  test(`UNITS-001/002/006: both-mechanics canonical and result invariants: ${file}`, () => {
    const parsed = parseProjectDocument(readFileSync(file, 'utf8'))
    assert.ok(parsed.ok)
    const project = parsed.document
    const { geometry, materials, analysis, design, calculationProfileId, loadings } = project.inputs
    const input = { section: sectionGeometryFromGeometryInput(geometry), rebars: geometryInputRebars(geometry),
      materialStore: materials, analysisOptions: analysis, designBasis: design, calculationProfileId }
    const { surface } = buildPreviewSurfaceFallback(input)
    const checks = checkLoadcasesFallback({ surface, loadcases: loadings.combinations })
    const initial = JSON.stringify({ project, surface, checks })
    const reportInput = { ...input, surface, loadcases: loadings.combinations, detailLoadcaseIds: [loadings.combinations[0].id],
      projectName: project.meta.name, projectInformation: project.meta.information, sectionName: geometry.name }
    const metric = buildColumnReportModel({ ...reportInput, presentationUnits: UNIT_PRESETS.metric })
    const us = buildColumnReportModel({ ...reportInput, presentationUnits: UNIT_PRESETS.us })
    assert.equal(us.combinations.length, metric.combinations.length)
    us.combinations.forEach((row, index) => {
      const expected = loadings.combinations[index]
      assert.equal(row.p, fromCanonical('force', expected.P, UNIT_PRESETS.us))
      assert.equal(row.verdict, metric.combinations[index].verdict)
      assert.equal(row.utilization, metric.combinations[index].utilization)
      assert.deepEqual(row.utilizationInterval, metric.combinations[index].utilizationInterval)
    })
    assert.ok(us.sectionProperties.some(([, value]) => value.includes('in²')))
    assert.ok(us.identity.some(([label, value]) => label === 'Units' && value.includes('bar diameter in') && value.includes('modulus ksi')))
    for (const [label, value] of us.details[0].resultants.filter(([label]) => label.startsWith('Residual |Δ'))) {
      assert.ok(value.endsWith(label === 'Residual |ΔP|' ? ' kip' : ' kip·ft'))
    }
    for (const selection of [UNIT_PRESETS.us, selectUnit(UNIT_PRESETS.metric, 'length', 'm'), UNIT_PRESETS.metric]) {
      for (const point of surface.points) for (const [q, value] of [['force', point.P], ['moment', point.Mx], ['moment', point.My]] as const) {
        assert.equal(commitQuantity(q, editableQuantity(q, value, selection), value, selection), value)
      }
    }
    assert.equal(JSON.stringify({ project, surface, checks }), initial)
    assert.deepEqual(checkLoadcasesFallback({ surface, loadcases: loadings.combinations }), checks)
  })
}

test('UNITS-005: unit-aware workbooks preserve IDs, read their declared units, and reject missing unit metadata', async () => {
  const parsed = parseProjectDocument(readFileSync('docs/examples/realistic-sections/KDS-REAL-05-complex-stress-strain.pm-project.json', 'utf8'))
  assert.ok(parsed.ok)
  const project = parsed.document
  const bytes = await buildProjectWorkbook(project, UNIT_PRESETS.us)
  const imported = await importProjectWorkbook(new Uint8Array(bytes).buffer)
  assert.ok(imported.ok, imported.ok ? '' : imported.error)
  assert.deepEqual(imported.document.inputs.geometry.rebars.map(b => [b.id, b.steelMaterialId]), project.inputs.geometry.rebars.map(b => [b.id, b.steelMaterialId]))
  assert.deepEqual(imported.document.inputs, project.inputs, 'untouched unit-aware workbooks must retain the original binary64 inputs')
  // Authored unit conversions are independently bounded by binary64 roundoff.
  const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) <= 4 * Number.EPSILON * Math.max(1, Math.abs(expected)))
  imported.document.inputs.geometry.outers.forEach((outer, i) => outer.points.forEach((p, j) => {
    assert.equal(p.id, project.inputs.geometry.outers[i].points[j].id)
    close(p.x, project.inputs.geometry.outers[i].points[j].x)
    close(p.y, project.inputs.geometry.outers[i].points[j].y)
  }))
  const loads = project.inputs.loadings.combinations
  const restored = await importLoadcaseWorkbook(await buildLoadcaseWorkbook(loads, UNIT_PRESETS.us))
  assert.deepEqual(restored, loads)
  restored.forEach((load, index) => { assert.equal(load.id, loads[index].id); close(load.P, loads[index].P); close(load.Mx, loads[index].Mx); close(load.My, loads[index].My) })
  const ExcelJS = await import('exceljs')
  const book = new (ExcelJS.default ?? ExcelJS).Workbook()
  await book.xlsx.load(new Uint8Array(bytes).buffer)
  book.removeWorksheet('Units')
  const missing = await importProjectWorkbook(new Uint8Array(await book.xlsx.writeBuffer()).buffer)
  assert.equal(missing.ok, false)
})

test('UNITS-003/005: source precision records cannot override authored cells or inconsistent source values', async () => {
  const ExcelJS = await import('exceljs')
  const book = new (ExcelJS.default ?? ExcelJS).Workbook()
  const cell = book.addWorksheet('Input').getCell('A1')
  const canonical = 15.000000000000002
  writeQuantityCell(cell, quantityCell('length', canonical, UNIT_PRESETS.us))
  const displayed = cell.value as number
  assert.equal(readQuantityCell('length', displayed, UNIT_PRESETS.us, cell.note), canonical)
  assert.equal(readQuantityCell('length', 2, UNIT_PRESETS.us, cell.note), 50.8)
  assert.throws(() => readQuantityCell('length', displayed, UNIT_PRESETS.us,
    'pm-unit-source/v1 ' + JSON.stringify({ quantity: 'length', canonical: 100, displayed, unit: 'in' })))
  assert.throws(() => readQuantityCell('force', displayed, UNIT_PRESETS.us,
    'pm-unit-source/v1 ' + JSON.stringify({ quantity: 'length', canonical, displayed, unit: 'in' })))
})

test('UNITS-006: selected-unit audit summary leaves every existing formula and canonical value unchanged', async () => {
  const ExcelJS = await import('exceljs')
  const book = new (ExcelJS.default ?? ExcelJS).Workbook()
  const ledger = book.addWorksheet('Ledger')
  ledger.addRow([1000, { formula: 'A1*2', result: 2000 }])
  const before = JSON.stringify(ledger.model)
  appendPresentationSummary(book, { presentationUnits: UNIT_PRESETS.us, section: { id: 1, name: 'Test', solids: [] }, rebars: [],
    loadcases: [{ name: 'Signed demand', P: 4448.2216152605, Mx: -1355817.9483314004, My: 0 }] })
  assert.equal(JSON.stringify(ledger.model), before)
  const summary = book.getWorksheet('Display')!
  const demand = summary.getRow(11)
  assert.equal(demand.getCell(3).value, 4448.2216152605)
  assert.equal(demand.getCell(5).value, 1)
  assert.equal(demand.getCell(6).value, 'kip')
})
