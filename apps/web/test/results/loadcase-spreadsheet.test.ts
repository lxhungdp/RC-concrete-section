import assert from 'node:assert/strict'
import test from 'node:test'
import { createLoadCombination, resultantAtLoadReference } from '@pm/project'
import { UNIT_PRESETS, fromCanonical, toCanonical } from '@pm/units'
import { buildLoadcaseWorkbook, loadcaseWorkbookHeaders } from '../../features/section-editor/loadings/loadcase-xlsx'
import { loadcasesFromSheet, prepareLoadcaseSheet, LoadcaseSheetError, type LoadcaseSheetContext } from '../../features/section-editor/loadings/loadcase-spreadsheet'
import { inspectWorkbookArchive } from '../../features/section-editor/shared/workbook-archive'

const reference = { kind: 'centroid-offset', offsetX: 0, offsetY: 0 } as const
const context = (units = UNIT_PRESETS.metric): LoadcaseSheetContext => ({ units, reference, headers: loadcaseWorkbookHeaders(units) })
const cell = (value: unknown, formula = false, note: string | null = null) => ({ value, formula, note, date: false })
const snapshot = (rows: unknown[][], declared = context()) => ({ rows: [declared.headers.map(value => cell(value)), ...rows.map(row => row.map(value => cell(value)))] })
const load = createLoadCombination({ id: 7, name: 'ULS', P: 1_234_567.890123, Mx: -83_456_789.01234, My: 21_345_678.90123 })

test('ENG-LOAD-001: Update reads evaluated numbers and converts declared units once', () => {
  // Independent arithmetic oracle: 2*100+3*50=350 kN; -25 kN.m and 7.5 kN.m.
  const data = snapshot([[7, 'ULS', 350, -25, 7.5]])
  data.rows[1][2].formula = true
  const [result] = loadcasesFromSheet(data, context())
  assert.deepEqual(result, { id: 7, name: 'ULS', actionBasis: 'factoredULS', P: 350_000, Mx: -25_000_000, My: 7_500_000 })
  assert.equal('formula' in result, false)
})

test('UNITS-003: no-op Update preserves full-precision canonical values at both input origins', () => {
  for (const units of [UNIT_PRESETS.metric, UNIT_PRESETS.us]) for (const offset of [reference, { ...reference, offsetX: 73.125, offsetY: -162.7 }]) {
    const displayed = resultantAtLoadReference(load, offset)
    const declared = { ...context(units), reference: offset, original: [load] }
    const values = [load.id, load.name, fromCanonical('force', displayed.P, units), fromCanonical('moment', displayed.Mx, units), fromCanonical('moment', displayed.My, units)]
    assert.deepEqual(loadcasesFromSheet(snapshot([values], declared), declared), [load])
  }
})

test('ENG-LOAD-001: the reference owner translates a changed force exactly once', () => {
  const offset = { ...reference, offsetX: 100, offsetY: -200 }
  const declared = { ...context(), reference: offset }
  assert.deepEqual(loadcasesFromSheet(snapshot([[1, 'Offset', 10, 3, -4]], declared), declared), [
    { id: 1, name: 'Offset', actionBasis: 'factoredULS', P: 10_000, Mx: 1_000_000, My: -3_000_000 }
  ])
})

test('UNITS-003: formula results never reuse an old literal source record', () => {
  const units = UNIT_PRESETS.us, declared = context(units)
  const displayed = fromCanonical('force', load.P, units)
  const note = 'pm-unit-source/v1 ' + JSON.stringify({ quantity: 'force', unit: units.groups.force, canonical: load.P, displayed })
  const data = snapshot([[7, 'ULS', displayed * 2, 0, 0]], declared)
  data.rows[1][2] = cell(displayed * 2, true, note)
  assert.equal(loadcasesFromSheet(data, declared)[0].P, toCanonical('force', displayed * 2, units))
})

test('stable IDs are reserved before allocating new rows and malformed IDs fail', () => {
  const values = loadcasesFromSheet(snapshot([[null, 'New', 1, 2, 3], [1, 'Existing', 4, 5, 6]]), context())
  assert.deepEqual(values.map(row => row.id), [2, 1])
  for (const id of [1, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '2']) {
    assert.throws(() => loadcasesFromSheet(snapshot([[1, 'First', 1, 2, 3], [id, 'Second', 1, 2, 3]]), context()), LoadcaseSheetError)
  }
})

test('invalid numeric cells and formula errors cannot become zero or partially applied rows', () => {
  for (const invalid of [null, '', '42', true, NaN, Infinity, { error: '#DIV/0!' }, { error: '#CIRC!' }, [1, 2]]) {
    const data = snapshot([[1, 'Valid', 1, 2, 3], [2, 'Invalid', invalid, 2, 3]])
    const before = structuredClone(data)
    assert.throws(() => loadcasesFromSheet(data, context()), /C3: Enter a finite numeric value/)
    assert.deepEqual(data, before)
  }
})

test('empty mapped rows are ignored, clearing the table is allowed, headers remain structural', () => {
  assert.deepEqual(loadcasesFromSheet(snapshot([[7, '', null, null, null]]), context()), [])
  assert.equal(loadcasesFromSheet(snapshot([[1, '', 0, 0, 0]]), context())[0].name, '')
  assert.throws(() => loadcasesFromSheet(snapshot([[1, true, 1, 2, 3]]), context()), /B2/)
  const data = snapshot([[1, 'ULS', 1, 2, 3]])
  data.rows[0][2] = cell('Pu (wrong unit)')
  assert.throws(() => loadcasesFromSheet(data, context()), /Restore header Pu/)
  assert.throws(() => loadcasesFromSheet({ rows: [[cell('ID')]] }, context()), /Invalid spreadsheet row/)
})

test('XLSX preparation keeps formulas, helpers, declared units, IDs and source comments', async () => {
  const imported = await import('exceljs'), ExcelJS = imported.default ?? imported, workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load((await buildLoadcaseWorkbook([load])).slice().buffer)
  const sheet = workbook.getWorksheet('Loadcases')!
  sheet.getCell('C2').value = { formula: 'SUM(G2:H2)', result: 999 }
  sheet.getCell('G2').value = 100; sheet.getCell('H2').value = 200
  sheet.getCell('D2').note = 'literal provenance survives'
  const prepared = await prepareLoadcaseSheet(new Uint8Array(await workbook.xlsx.writeBuffer()).buffer)
  const reopened = new ExcelJS.Workbook(); await reopened.xlsx.load(prepared.bytes)
  const output = reopened.getWorksheet('Loadcases')!
  assert.equal(output.getCell('C2').formula, 'SUM(G2:H2)')
  assert.equal(output.getCell('G2').value, 100)
  assert.equal(output.getCell('A2').value, load.id)
  assert.equal(output.getColumn(1).hidden, true)
  assert.ok(JSON.stringify(output.getCell('D2').note).includes('literal provenance survives'))
  assert.equal(reopened.getWorksheet('Units')!.state, 'veryHidden')
  assert.equal(reopened.getWorksheet('Load reference')!.state, 'veryHidden')
  assert.deepEqual(prepared.context.headers, loadcaseWorkbookHeaders(UNIT_PRESETS.metric))
})

test('the mapped header is highlighted and protected while body and future helper cells stay editable', async () => {
  const imported = await import('exceljs'), ExcelJS = imported.default ?? imported
  const prepared = await prepareLoadcaseSheet((await buildLoadcaseWorkbook([load])).slice().buffer)
  const book = new ExcelJS.Workbook(); await book.xlsx.load(prepared.bytes)
  const sheet = book.getWorksheet('Loadcases')!
  for (let column = 1; column <= 5; column++) {
    const header = sheet.getCell(1, column)
    // XLSX omits locked=true because it is the format's default protection state.
    assert.equal(header.protection?.locked ?? true, true)
    assert.equal(header.font.bold, true)
    assert.equal(header.font.color?.argb, 'FFFFFFFF')
    assert.equal(header.fill.type, 'pattern')
    if (header.fill.type === 'pattern') assert.equal(header.fill.fgColor?.argb, 'FF197381')
    assert.equal(sheet.getCell(2, column).protection.locked, false)
  }
  assert.equal(sheet.getCell('F1').protection.locked, false)
  assert.equal(sheet.getCell('C100').protection.locked, false)
  const JSZip = (await import('jszip')).default, zip = await JSZip.loadAsync(prepared.bytes)
  const part = zip.file('xl/worksheets/sheet1.xml'); assert.ok(part)
  assert.match(await part.async('string'), /<sheetProtection\b[^>]*sheet="1"/u)
})

test('untrusted XLSX files are bounded before ZIP expansion', async () => {
  assert.equal(inspectWorkbookArchive(new ArrayBuffer(0))?.code, 'WORKBOOK_FORMAT')
  assert.equal(inspectWorkbookArchive(new ArrayBuffer(10 * 1024 * 1024 + 1))?.code, 'WORKBOOK_RESOURCE_LIMIT')
  await assert.rejects(prepareLoadcaseSheet(new ArrayBuffer(8)), /Invalid XLSX ZIP archive/)
})

test('header locking and colour do not leak into imported cells sharing the same style', async () => {
  const imported = await import('exceljs'), ExcelJS = imported.default ?? imported
  const book = new ExcelJS.Workbook()
  await book.xlsx.load((await buildLoadcaseWorkbook([load])).slice().buffer)
  const sheet = book.getWorksheet('Loadcases')!
  sheet.getCell('B2').style = sheet.getCell('B1').style
  sheet.getCell('F1').value = 'Working input'
  sheet.getCell('F1').style = sheet.getCell('B1').style
  const prepared = await prepareLoadcaseSheet(new Uint8Array(await book.xlsx.writeBuffer()).buffer)
  const reopened = new ExcelJS.Workbook(); await reopened.xlsx.load(prepared.bytes)
  const result = reopened.getWorksheet('Loadcases')!
  for (const address of ['B2', 'F1']) {
    assert.equal(result.getCell(address).protection.locked, false)
    assert.equal(result.getCell(address).font.color?.argb, undefined)
  }
  assert.equal(result.getCell('B1').protection?.locked ?? true, true)
  assert.equal(result.getCell('B1').font.color?.argb, 'FFFFFFFF')
})

test('10,000 new loadcases use the shared batch allocator without repeated ID scans', () => {
  const rows = Array.from({ length: 10_000 }, (_, index) => [null, `LC${index + 1}`, index, 0, 0])
  const output = loadcasesFromSheet(snapshot(rows), context())
  assert.equal(output.length, 10_000)
  assert.equal(output[0].id, 1)
  assert.equal(output.at(-1)!.id, 10_000)
  assert.equal(new Set(output.map(row => row.id)).size, 10_000)
})
