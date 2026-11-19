import assert from 'node:assert/strict'
import test from 'node:test'
import ExcelJS from 'exceljs'
import { UNIT_PRESETS } from '@pm/units'
import { type GeometryInputRebarView, type Point2 } from '@pm/geometry'
import { readSheetRows, validateSheetMapping, SheetError } from '../src/index'
import { buildCoordinateWorkbook, prepareCoordinateSheet, coordinatesFromSheet, buildRebarTableWorkbook,
  prepareRebarTableSheet, rebarsFromSheet, coordinateHeaders, rebarHeaders, type CoordinateTarget, type RebarTarget } from '../src/geometry'

const points: Point2[] = [
  { id: 1, x: -200, y: -200 }, { id: 2, x: 200, y: -200 },
  { id: 3, x: 200, y: 200 }, { id: 4, x: -200, y: 200 }
]
const target: CoordinateTarget = { id: 1, name: 'Section', outers: [[points]], rebars: [], outerIndex: 0, ringIndex: 0 }
const bar: GeometryInputRebarView = { id: 7, solidIndex: 0, dia: 16, area: 123.4567890123, x: -100.123456789, y: 0,
  steelMaterialId: 5, areaSource: { type: 'catalog', dia: 16, area: 123.4567890123,
    catalogId: 'fixture', designation: 'test', label: 'Test only', sourceUrl: 'https://example.com/reference' } }
const rebarTarget: RebarTarget = { section: { id: 1, name: 'Section', solids: [{ outer: points, holes: [] }] },
  rebars: [bar], steelMaterials: [{ id: 5, name: 'Steel' }], defaultSteelMaterialId: 5 }
const cell = (value: unknown, formula = false) => ({ value, formula, date: false, note: null as string | null })
const snapshot = (headers: readonly string[], rows: unknown[][]) => ({ rows: [headers.map(value => cell(value)), ...rows.map(row => row.map(value => cell(value)))] })
async function workbook(bytes: ArrayBuffer | Uint8Array) {
  const book = new ExcelJS.Workbook(); await book.xlsx.load(bytes instanceof Uint8Array ? bytes.slice().buffer : bytes); return book
}
function literalSnapshot(book: ExcelJS.Workbook, name: string, columns: number) {
  const sheet = book.getWorksheet(name)!
  return { rows: Array.from({ length: sheet.rowCount }, (_, row) => Array.from({ length: columns }, (_, column) => {
    const item = sheet.getCell(row + 1, column + 1)
    return { ...cell(item.value), note: typeof item.note === 'string' ? item.note : item.note?.texts?.map(text => text.text).join('') ?? null }
  })) }
}

test('DEV-ARCH: a bounded table mapping supports different sheets/widths and rejects arbitrary descriptors', () => {
  for (const [sheet, columns] of [['Loadcases', 5], ['Coordinates', 3], ['Rebars', 6]] as const) assert.deepEqual(validateSheetMapping({ sheet, columns }), { sheet, columns })
  for (const mapping of [null, { sheet: '../other', columns: 3 }, { sheet: '', columns: 3 }, { sheet: 'x', columns: 65 }, { sheet: 'x', columns: 2.5 }]) {
    assert.throws(() => validateSheetMapping(mapping), SheetError)
  }
})

test('ENG-GEO-001: shared snapshot decoding rejects malformed cells, headers and resource exhaustion', () => {
  const headers = coordinateHeaders(UNIT_PRESETS.metric), data = snapshot(headers, [[1, 0, 0]])
  assert.throws(() => readSheetRows(data, headers, 0), /exceeds 0 rows/)
  assert.throws(() => readSheetRows({ rows: Array(15_626).fill([]) }, Array(64).fill('Header'), 100_000), /snapshot exceeds 1,000,000/)
  assert.throws(() => readSheetRows({ rows: [[cell('ID')]] }, headers, 10), /Invalid spreadsheet row/)
  data.rows[0][1].formula = true
  assert.throws(() => readSheetRows(data, headers, 10), /Restore header/)
})

test('UNITS-003/005: coordinate XLSX no-op preserves exact binary64 values in metric and US', async () => {
  const precise = points.map((point, index) => ({ ...point, x: point.x + (index + 1) * 0.1234567890123 }))
  for (const units of [UNIT_PRESETS.metric, UNIT_PRESETS.us]) {
    const declared = { ...target, outers: [[precise]] }
    const prepared = await prepareCoordinateSheet((await buildCoordinateWorkbook(precise, units)).slice().buffer, declared)
    assert.deepEqual(prepared.mapping, { sheet: 'Coordinates', columns: 3 })
    assert.deepEqual(coordinatesFromSheet(literalSnapshot(await workbook(prepared.bytes), 'Coordinates', 3), prepared.context), precise)
  }
})

test('ENG-GEO-001: point IDs remain stable; new IDs cannot collide with another ring or a later row', () => {
  const hole = [{ id: 5, x: -10, y: -10 }, { id: 6, x: -10, y: 10 }, { id: 7, x: 10, y: 10 }, { id: 8, x: 10, y: -10 }]
  const declared = { units: UNIT_PRESETS.metric, headers: coordinateHeaders(UNIT_PRESETS.metric), target: { ...target, outers: [[points, hole]] } }
  const rows = [[null, -220, -200], [2, 200, -200], [3, 200, 200], [4, -200, 200]]
  const output = coordinatesFromSheet(snapshot(declared.headers, rows), declared)
  assert.deepEqual(output.map(point => point.id), [9, 2, 3, 4])
  rows[0][0] = 5
  assert.throws(() => coordinatesFromSheet(snapshot(declared.headers, rows), declared), /unique positive integer/)
})

test('ENG-GEO-002: invalid/cleared rings, other incomplete rings and hole intersections block atomic Update', () => {
  const declared = { units: UNIT_PRESETS.metric, headers: coordinateHeaders(UNIT_PRESETS.metric), target }
  for (const rows of [[], [[1, 0, 0], [2, 1, 1], [3, 2, 2]], [[1, -200, -200], [2, 200, 200], [3, 200, -200], [4, -200, 200]]]) {
    assert.throws(() => coordinatesFromSheet(snapshot(declared.headers, rows), declared), SheetError)
  }
  const incomplete = { ...declared, target: { ...target, outers: [[points], [[]]] } }
  assert.throws(() => coordinatesFromSheet(snapshot(declared.headers, points.map(point => [point.id, point.x, point.y])), incomplete), /at least three vertices/)
  assert.deepEqual(target.outers, [[points]])
})

test('UNITS-005: formula-authored US coordinates convert once using the workbook unit declaration', () => {
  const declared = { units: UNIT_PRESETS.us, headers: coordinateHeaders(UNIT_PRESETS.us), target }
  const data = snapshot(declared.headers, [[1, -10, -10], [2, 10, -10], [3, 10, 10], [4, -10, 10]])
  data.rows[1][1].formula = true
  const result = coordinatesFromSheet(data, declared)
  assert.equal(result[0].x, -254); assert.equal(result[2].y, 254)
})

test('ENG-GEO-002: selected Hole edits retain the Outer and reject a hole crossing its boundary', () => {
  const hole = [{ id: 5, x: -10, y: -10 }, { id: 6, x: -10, y: 10 }, { id: 7, x: 10, y: 10 }, { id: 8, x: 10, y: -10 }]
  const declared = { units: UNIT_PRESETS.metric, headers: coordinateHeaders(UNIT_PRESETS.metric),
    target: { ...target, outers: [[points, hole]], ringIndex: 1 } }
  const rows = [[5, -20, -10], [6, -20, 10], [7, 10, 10], [8, 10, -10]]
  const edited = coordinatesFromSheet(snapshot(declared.headers, rows), declared)
  assert.deepEqual(edited.map(point => point.id), [5, 6, 7, 8])
  assert.equal(edited[0].x, -20)
  assert.deepEqual(declared.target.outers, [[points, hole]])
  rows[0][1] = -300
  assert.throws(() => coordinatesFromSheet(snapshot(declared.headers, rows), declared), SheetError)
})

test('REBAR-AS-001/003, UNITS-003: exact no-op retains independent As and source through both unit workbooks', async () => {
  for (const units of [UNIT_PRESETS.metric, UNIT_PRESETS.us]) {
    const prepared = await prepareRebarTableSheet((await buildRebarTableWorkbook(rebarTarget, units)).slice().buffer, rebarTarget)
    assert.deepEqual(prepared.mapping, { sheet: 'Rebars', columns: 6 })
    const result = rebarsFromSheet(literalSnapshot(await workbook(prepared.bytes), 'Rebars', 6), prepared.context)
    assert.deepEqual(result, [bar])
  }
})

test('REBAR-AS-002: diameter edits retain stored As and clear provenance; positional/material edits preserve it', () => {
  const declared = { units: UNIT_PRESETS.metric, headers: rebarHeaders(UNIT_PRESETS.metric), target: rebarTarget }
  const data = snapshot(declared.headers, [[7, 20, bar.area, 5, -100, 0]])
  data.rows[1][1].formula = true
  const changed = rebarsFromSheet(data, declared)[0]
  assert.equal(changed.dia, 20); assert.equal(changed.area, bar.area); assert.deepEqual(changed.areaSource, { type: 'manual' })
  data.rows[1][1] = cell(16)
  assert.deepEqual(rebarsFromSheet(data, declared)[0].areaSource, bar.areaSource)
})

test('ENG-GEO-005: existing default-material references round-trip without guessing imported missing IDs', async () => {
  const { steelMaterialId: _, ...defaultBar } = bar
  const target = { ...rebarTarget, rebars: [defaultBar] }
  const prepared = await prepareRebarTableSheet((await buildRebarTableWorkbook(target, UNIT_PRESETS.metric)).slice().buffer, target)
  const data = literalSnapshot(await workbook(prepared.bytes), 'Rebars', 6)
  assert.equal(data.rows[1][3].value, 5)
  assert.deepEqual(rebarsFromSheet(data, prepared.context), [defaultBar])
  data.rows[1][3].value = null
  assert.throws(() => rebarsFromSheet(data, prepared.context), /finite numeric/)
})

test('REBAR-AS-001/003: independent formula As uses evaluated scalar values and ignores stale source notes', () => {
  const declared = { units: UNIT_PRESETS.us, headers: rebarHeaders(UNIT_PRESETS.us), target: rebarTarget }
  const data = snapshot(declared.headers, [[7, 0.5, 0.5, 5, -4, 0]])
  data.rows[1][2] = { ...cell(0.5, true), note: 'pm-unit-source/v1 ' + JSON.stringify({ quantity: 'area', unit: 'in²', canonical: bar.area, displayed: 0.5 }) }
  const output = rebarsFromSheet(data, declared)[0]
  assert.equal(output.dia, 12.7); assert.equal(output.area, 322.58)
  assert.deepEqual(output.areaSource, { type: 'manual' })
})

test('ENG-GEO-001/005: invalid material, nonpositive As/dia, errors, dates, outside disks and overlap fail closed', () => {
  const declared = { units: UNIT_PRESETS.metric, headers: rebarHeaders(UNIT_PRESETS.metric), target: rebarTarget }
  for (const row of [[7, 16, 123, 999, 0, 0], [7, 0, 123, 5, 0, 0], [7, 16, -1, 5, 0, 0], [7, 16, 123, 5, 199, 0], [7, 16, { error: '#DIV/0!' }, 5, 0, 0]]) {
    assert.throws(() => rebarsFromSheet(snapshot(declared.headers, [row]), declared), SheetError)
  }
  const date = snapshot(declared.headers, [[7, 16, 123, 5, 0, 0]])
  date.rows[1][1].date = true
  assert.throws(() => rebarsFromSheet(date, declared), /finite numeric value/)
  assert.throws(() => rebarsFromSheet(snapshot(declared.headers, [[7, 16, 123, 5, 0, 0], [8, 16, 123, 5, 1, 1]]), declared), /overlap/)
  assert.deepEqual(rebarsFromSheet(snapshot(declared.headers, []), declared), [])
})

test('shared XLSX template protects only mapped headings for coordinate and rebar tables', async () => {
  const prepared = [await prepareCoordinateSheet((await buildCoordinateWorkbook(points, UNIT_PRESETS.metric)).slice().buffer, target),
    await prepareRebarTableSheet((await buildRebarTableWorkbook(rebarTarget, UNIT_PRESETS.metric)).slice().buffer, rebarTarget)]
  for (const result of prepared) {
    const book = await workbook(result.bytes), sheet = book.getWorksheet(result.mapping.sheet)!
    for (let column = 1; column <= result.mapping.columns; column++) {
      assert.equal(sheet.getCell(1, column).protection?.locked ?? true, true)
      assert.equal(sheet.getCell(1, column).font.bold, true)
      assert.equal(sheet.getCell(2, column).protection.locked, false)
    }
    assert.equal(sheet.getCell('J1').protection.locked, false)
    assert.equal(sheet.getCell('B100').protection.locked, false)
    assert.equal(sheet.getColumn(1).hidden, true)
  }
})

test('UNITS-005: mismatched table kinds and headings never reinterpret an imported workbook', async () => {
  const bytes = (await buildCoordinateWorkbook(points, UNIT_PRESETS.metric)).slice().buffer
  await assert.rejects(prepareRebarTableSheet(bytes, rebarTarget), /unit declaration/)
  const book = await workbook(bytes); book.getWorksheet('Coordinates')!.getCell('B1').value = 'X (in)'
  await assert.rejects(prepareCoordinateSheet(new Uint8Array(await book.xlsx.writeBuffer()).buffer, target), /must be X/)
})
