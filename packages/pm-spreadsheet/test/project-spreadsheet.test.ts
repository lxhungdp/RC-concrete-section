import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ExcelJS from 'exceljs'
import { CALCULATION_PROFILE_IDS, applyCalculationProfileToMaterials, createProjectDocument, createEmptyLoadingsInput, parseProjectDocument, type PmProjectDocument } from '@pm/project'
import { buildProjectWorkbook, formatProjectWorkbook } from '../src/project-xlsx'
import { prepareProjectSpreadsheet, projectFromSpreadsheet, exportProjectSpreadsheet, projectFromWorkbookEditor } from '../src/project-spreadsheet'
import { readSheetWorkbook, SheetError, validateGridcraftMapping, prepareWorkbookEditor } from '../src/table'

const base = (): PmProjectDocument => {
  const result = parseProjectDocument(JSON.parse(readFileSync('docs/examples/realistic-sections/KDS-REAL-05-complex-stress-strain.pm-project.json', 'utf8')))
  assert.ok(result.ok, result.ok ? '' : result.error)
  return result.document
}
type Cell = { value: unknown; formula: boolean; date: boolean; note: string | null }
type Snapshot = { properties: { subject: string; description: string }; sheets: Array<{ name: string; rows: Cell[][] }> }
const snapshot = (book: ExcelJS.Workbook): Snapshot => ({ properties: { subject: book.subject, description: book.description },
  sheets: book.worksheets.map(sheet => ({ name: sheet.name, rows: Array.from({ length: sheet.rowCount }, (_, r) => Array.from({ length: sheet.columnCount }, (_, c) => {
    const cell = sheet.getCell(r + 1, c + 1), note = cell.note
    return { value: cell.value, formula: false, date: false, note: typeof note === 'string' ? note : note?.texts?.map(part => part.text).join('') ?? null }
  })) })) })
const setup = async (project = base()) => {
  const prepared = await prepareProjectSpreadsheet(new Uint8Array(await buildProjectWorkbook(project)).buffer)
  const book = await readSheetWorkbook(prepared.bytes)
  return { prepared, book, value: snapshot(book) }
}
const fields = (value: Snapshot, name: string) => value.sheets.find(sheet => sheet.name === name)!.rows
const field = (value: Snapshot, sheet: string, label: string) => fields(value, sheet).find(row => row[0]?.value === label)![1]
const formula = (cell: Cell, value: unknown) => { cell.value = value; cell.formula = true }

test('DEV-ARCH-007: whole-workbook mapping is explicit and bounded; the table mapping stays separate', () => {
  assert.deepEqual(validateGridcraftMapping({ kind: 'workbook', sheet: 'Project' }), { kind: 'workbook', sheet: 'Project' })
  assert.deepEqual(validateGridcraftMapping({ sheet: 'Rebars', columns: 6 }), { sheet: 'Rebars', columns: 6 })
  for (const value of [{ kind: 'other', sheet: 'Project' }, { kind: 'workbook', sheet: 'Bad/name' }, { kind: 'workbook', sheet: 'Project', columns: 64 }]) assert.throws(() => validateGridcraftMapping(value), SheetError)
})

const expectedInputs = (project: PmProjectDocument) => {
  const parsed = parseProjectDocument(createProjectDocument({
    calculationProfileId: project.inputs.calculationProfileId,
    geometry: project.inputs.geometry,
    materials: project.inputs.materials,
    loadings: { ...createEmptyLoadingsInput(), combinations: project.inputs.loadings.combinations }
  }))
  assert.ok(parsed.ok)
  return parsed.document.inputs
}

test('all profile families retain their inputs in four unfrozen and unprotected sheets', async () => {
  const original = base()
  for (const profileId of CALCULATION_PROFILE_IDS) {
    const created = parseProjectDocument(createProjectDocument({ calculationProfileId: profileId, geometry: original.inputs.geometry,
      materials: applyCalculationProfileToMaterials(original.inputs.materials, profileId) }))
    assert.ok(created.ok, created.ok ? '' : created.error)
    const { value, prepared, book } = await setup(created.document)
    assert.equal(prepared.mapping.kind, 'workbook')
    assert.deepEqual(prepared.context.sheets, ['Section', 'Rebar', 'Material', 'Loadings'])
    for (const sheet of book.worksheets) {
      assert.equal(Reflect.get(sheet, 'sheetProtection')?.sheet, undefined)
      assert.ok(sheet.views.every(view => view.state === 'normal'))
    }
    assert.deepEqual((await projectFromSpreadsheet(value, prepared.context)).document.inputs, expectedInputs(created.document))
  }
})

test('ENG-LOAD-001/UNITS-005: one snapshot commits edits across all project groups through existing input owners', async () => {
  const p = base(), before = structuredClone(p), { value, prepared } = await setup(p)
  formula(field(value, 'Material', 'fck (MPa)'), 40)
  formula(field(value, 'Material', 'fy (MPa)'), 450)
  formula(field(value, 'Material', 'Es (MPa)'), 210000)
  formula(field(value, 'Section', 'Name'), 'Updated section')
  const section = fields(value, 'Section'), firstVertex = section.findIndex(row => row[0]?.value === 'Outer') + 2
  formula(section[firstVertex][0], -560)
  const bars = fields(value, 'Rebar'), firstBar = bars.findIndex(row => row[0]?.value === 'Rebars') + 2
  formula(bars[firstBar][5], 200)
  const loads = fields(value, 'Loadings'), firstLoad = loads.findIndex(row => row[0]?.value === 'Loadcases') + 2
  formula(loads[firstLoad][1], 2000); formula(loads[firstLoad][2], 3000); formula(loads[firstLoad][3], 4000)
  const q = (await projectFromSpreadsheet(value, prepared.context)).document
  assert.equal(q.inputs.geometry.name, 'Updated section')
  assert.equal(q.inputs.geometry.outers[0].points[0].x, -560)
  assert.equal(q.inputs.geometry.rebars[0].area, 200)
  assert.equal(q.inputs.geometry.rebars[0].dia, p.inputs.geometry.rebars[0].dia)
  assert.equal(q.inputs.materials.concrete.fck, 40)
  assert.equal(q.inputs.materials.steel[0].limits?.epsY, 450 / 210000)
  assert.deepEqual(q.inputs.loadings.reference, createEmptyLoadingsInput().reference)
  assert.equal(q.inputs.loadings.combinations[0].Mx, 3000)
  assert.equal(q.inputs.loadings.combinations[0].My, 4000)
  assert.deepEqual(q.inputs.design, expectedInputs(p).design)
  assert.deepEqual(q.inputs.analysis, expectedInputs(p).analysis)
  assert.deepEqual(p, before)
})

test('UNITS-003: formula results use canonical units and disregard old cell notes', async () => {
  const { value, prepared } = await setup()
  const rows = fields(value, 'Rebar'), index = rows.findIndex(row => row[0]?.value === 'Rebars') + 2
  const cell = rows[index][0]
  cell.note = 'pm-unit-source/v1 ' + JSON.stringify({ quantity: 'barDiameter', unit: 'in', canonical: 22.56758334191025, displayed: 22.56758334191025 / 25.4 })
  formula(cell, 31.75)
  assert.equal((await projectFromSpreadsheet(value, prepared.context)).document.inputs.geometry.rebars[0].dia, 31.75)
})

test('preparation and Save preserve formulas, while Save removes decorative fills and bold', async () => {
  const { book } = await setup(), material = book.getWorksheet('Material')!
  let address = ''
  material.eachRow(row => { if (row.getCell(1).value === 'fck (MPa)') address = row.getCell(2).address })
  material.getCell(address).value = { formula: '20+10', result: 999 }
  material.getCell(address).font = { bold: true, color: { argb: 'FFFF0000' } }
  book.getWorksheet('Section')!.getCell('A1').font = { bold: true }
  book.getWorksheet('Section')!.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF0000' } }
  book.getWorksheet('Section')!.getCell('A3').font = { color: { argb: 'FF0000FF' } }
  const loads = book.getWorksheet('Loadings')!, added = loads.addRow(['New case', 1, 2, 3])
  const prepared = await prepareProjectSpreadsheet(new Uint8Array(await book.xlsx.writeBuffer()).buffer)
  const staged = await readSheetWorkbook(prepared.bytes), values = snapshot(staged)
  formula(field(values, 'Material', 'fck (MPa)'), 30)
  assert.equal((await projectFromSpreadsheet(values, prepared.context)).document.inputs.materials.concrete.fck, 30)
  const saved = await readSheetWorkbook(await exportProjectSpreadsheet(prepared.bytes))
  assert.equal(saved.getWorksheet('Material')!.getCell(address).formula, '20+10')
  assert.equal(saved.getWorksheet('Material')!.getCell(address).result, 999)
  assert.equal(saved.getWorksheet('Material')!.getCell(address).font.color?.argb, 'FF00008B')
  assert.equal(saved.getWorksheet('Section')!.getCell('A3').font.color, undefined)
  for (let column = 1; column <= 4; column++) assert.equal(saved.getWorksheet('Loadings')!.getCell(added.number, column).font.color?.argb, 'FF00008B')
  for (const sheet of saved.worksheets) sheet.eachRow(row => row.eachCell(cell => {
    assert.notEqual(cell.font?.bold, true)
    assert.ok(!cell.fill || cell.fill.type === 'pattern' && cell.fill.pattern === 'none')
  }))
})

test('DEV-ARCH-007: plain formatting does not allocate the empty rectangle of a sparse workbook', () => {
  const book = new ExcelJS.Workbook(), sheet = book.addWorksheet('Project')
  sheet.getCell(1, 64).value = 'Draft helper'
  sheet.getCell(50_000, 1).value = 123
  assert.equal(sheet.getRow(50_000).cellCount, 1)
  formatProjectWorkbook(book)
  assert.equal(sheet.getRow(50_000).cellCount, 1)
  assert.equal(sheet.getRow(1).actualCellCount, 1)
  assert.equal(sheet.getCell(50_000, 1).value, 123)
})

test('native Open preserves the original workbook; Update validates its current project and leaves helper sheets independent', async () => {
  const p = base(), { book } = await setup(p)
  book.getWorksheet('Section')!.getCell('A1').font = { bold: true }
  const helper = book.addWorksheet('Calculations'); helper.getCell('A1').value = { formula: '20+20', result: -999 }
  const bytes = new Uint8Array(await book.xlsx.writeBuffer()).buffer
  const prepared = await prepareWorkbookEditor(bytes)
  assert.equal(prepared.bytes, bytes, 'Native transport never restyles/reserializes the workbook')
  const foreign = runInNewContext('new Uint8Array(bytes).buffer', { bytes: Array.from(new Uint8Array(bytes)) }) as ArrayBuffer
  assert.equal(foreign instanceof ArrayBuffer, false)
  assert.deepEqual((await prepareWorkbookEditor(foreign)).mapping, prepared.mapping, 'Native file-picker buffers may come from another browser global')
  const unchanged = await readSheetWorkbook(prepared.bytes)
  assert.equal(unchanged.getWorksheet('Section')!.getCell('A1').font.bold, true)
  const data = snapshot(book)
  formula(field(data, 'Material', 'fck (MPa)'), 40)
  const expected = structuredClone(p); expected.inputs.materials.concrete.fck = 40
  assert.deepEqual((await projectFromWorkbookEditor(data)).document.inputs, expectedInputs(expected))
  const duplicate = structuredClone(data); duplicate.sheets.push(duplicate.sheets[0])
  await assert.rejects(projectFromWorkbookEditor(duplicate), /duplicate/)
  const missing = structuredClone(data); missing.sheets = missing.sheets.filter(sheet => sheet.name !== 'Rebar')
  await assert.rejects(projectFromWorkbookEditor(missing), SheetError)
  const blank = new ExcelJS.Workbook(); blank.addWorksheet('Sheet1').getCell('A1').value = 1
  await assert.rejects(projectFromWorkbookEditor(snapshot(blank)), SheetError)
})

test('invalid headers, formula errors, dates, unit conflicts, identities and allocation bounds fail without partial values', async () => {
  const { value, prepared } = await setup()
  const mutations: Array<(draft: Snapshot) => void> = [
    draft => { field(draft, 'Material', 'fck (MPa)').value = { error: '#DIV/0!' } },
    draft => { field(draft, 'Material', 'fck (MPa)').date = true },
    draft => { field(draft, 'Material', 'fck (MPa)').value = Infinity },
    draft => { fields(draft, 'Material').find(row => row[0]?.value === 'fck (MPa)')![0].value = 'Unknown input' },
    draft => { fields(draft, 'Loadings').find(row => row[1]?.value === 'P (N)')![1].value = 'P (kN)' },
    draft => { draft.properties.description = '{}' }, draft => { draft.sheets.pop() },
    draft => { draft.sheets[1].name = draft.sheets[0].name },
    draft => { draft.sheets[0].rows = Array(15626).fill(Array(64).fill({ value: null, formula: false, date: false, note: null })) }
  ]
  for (const mutate of mutations) { const draft = structuredClone(value); mutate(draft); await assert.rejects(projectFromSpreadsheet(draft, prepared.context), SheetError) }
  assert.deepEqual((await projectFromSpreadsheet(value, prepared.context)).document.inputs, expectedInputs(base()))
})
