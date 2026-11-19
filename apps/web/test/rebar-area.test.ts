import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import ExcelJS from 'exceljs'
import { createProjectDocument, parseProjectDocument, serializeProjectDocument } from '@pm/project'
import { rebarArea } from '@pm/geometry'
import { UNIT_PRESETS, selectUnit } from '@pm/units'
import { REBAR_CATALOGS, catalogRebarProperties } from '../features/section-editor/geometry/rebar-catalog'
import { buildProjectWorkbook, importProjectWorkbook } from '../features/section-editor/project/project-xlsx'
import { buildRebarWorkbook, importRebarWorkbook } from '../features/section-editor/geometry/section-xlsx'

const fixture = () => {
  const parsed = parseProjectDocument(readFileSync('docs/examples/equivalent-block/ACI-EB-01-rectangle-8-bars.pm-project.json', 'utf8'))
  assert.ok(parsed.ok)
  return parsed.document
}
const selected = () => {
  const catalog = REBAR_CATALOGS.find(item => item.tab === 'JIS')!
  return catalogRebarProperties(catalog, catalog.rows.find(row => row.designation === 'D25')!)
}
const project = () => {
  const legacy = fixture()
  const saved = createProjectDocument({ ...legacy.inputs, meta: legacy.meta })
  saved.inputs.geometry.rebars[0] = { ...saved.inputs.geometry.rebars[0], ...selected() }
  const canonical = parseProjectDocument(saved)
  assert.ok(canonical.ok)
  return canonical.document
}
const close = (value: number, expected: number) => assert.ok(Math.abs(value - expected) <= 4 * Number.EPSILON * Math.max(1, Math.abs(expected)))

test('REBAR-AS-004: published anchors stay scoped by catalog and independent source-unit basis', () => {
  assert.equal(REBAR_CATALOGS.length, 10)
  assert.equal(REBAR_CATALOGS.reduce((sum, c) => sum + c.rows.length, 0), 101)
  const read = (tab: string, size: string) => {
    const c = REBAR_CATALOGS.find(c => c.tab === tab)!
    return catalogRebarProperties(c, c.rows.find(row => row.designation === size)!)
  }
  assert.equal(read('TCVN', 'D25').area, 491)
  assert.equal(read('JIS', 'D25').dia, 25.4)
  assert.equal(read('JIS', 'D25').area, 506.7)
  assert.equal(read('KS', 'D19').area, 286.5)
  assert.equal(read('ASTM SI', '25').area, 510)
  close(read('ASTM US', '#8').area, 509.6764)
  assert.equal(read('Canada', '10M').area, 100)
  assert.equal(read('AS/NZS AU', 'N36').area, 1020)
  assert.equal(read('BS', 'D25').area, 490.9)
  assert.equal(read('DIN', '18').area, 254)
  for (const catalog of REBAR_CATALOGS) {
    assert.equal(new Set(catalog.rows.map(row => row.designation)).size, catalog.rows.length)
    for (const row of catalog.rows) {
      const value = catalogRebarProperties(catalog, row)
      assert.ok(Number.isFinite(value.area) && value.area > 0 && Number.isFinite(value.dia) && value.dia > 0)
    }
  }
})

test('REBAR-AS-003: JSON v2 preserves edited As, rejects missing areas, and retains the exact v1 read contract', () => {
  const legacy = fixture()
  assert.equal(legacy.version, 1)
  const saved = project()
  assert.equal(saved.version, 3)
  for (let i = 1; i < saved.inputs.geometry.rebars.length; i++) {
    assert.equal(saved.inputs.geometry.rebars[i].area, rebarArea(legacy.inputs.geometry.rebars[i], 'equivalent-block'))
  }
  const bar = saved.inputs.geometry.rebars[0]
  bar.area = 300
  const parsed = parseProjectDocument(serializeProjectDocument(saved))
  assert.ok(parsed.ok)
  assert.equal(parsed.document.inputs.geometry.rebars[0].area, 300)
  assert.equal(parsed.document.inputs.geometry.rebars[0].dia, 25.4)
  assert.deepEqual(parsed.document.inputs.geometry.rebars[0].areaSource, { type: 'manual' })
  delete bar.area
  assert.equal(parseProjectDocument(saved).ok, false)
  const invalidV1 = project()
  invalidV1.version = 1
  assert.equal(parseProjectDocument(invalidV1).ok, false)
})

test('UNITS-005 / REBAR-AS-003: area and source survive Project XLSX and unit-aware standalone Excel', async () => {
  const original = project()
  for (const units of [UNIT_PRESETS.metric, UNIT_PRESETS.us, selectUnit(UNIT_PRESETS.metric, 'length', 'ft')]) {
    const bytes = await buildProjectWorkbook(original, units)
    const imported = await importProjectWorkbook(new Uint8Array(bytes).buffer)
    assert.ok(imported.ok, imported.ok ? '' : imported.error)
    imported.document.inputs.geometry.rebars.forEach((bar, i) => {
      const expected = original.inputs.geometry.rebars[i]
      assert.equal(bar.dia, expected.dia)
      assert.equal(bar.area, expected.area)
      assert.deepEqual(bar.areaSource, expected.areaSource)
    })
    const bars = original.inputs.geometry.rebars.map(bar => ({ ...bar, solidIndex: 0 }))
    const standalone = await buildRebarWorkbook({ sectionName: 'Independent As', rebars: bars, steelMaterials: original.inputs.materials.steel, units })
    const restored = await importRebarWorkbook(new Uint8Array(standalone).buffer, original.inputs.materials.steel, 1, 1)
    assert.deepEqual(restored.rebars, bars)
  }
  const book = new ExcelJS.Workbook()
  await book.xlsx.load(new Uint8Array(await buildProjectWorkbook(original)).buffer)
  const sheet = book.getWorksheet('Rebar')!
  const header = sheet.getRows(1, sheet.rowCount)!.find(row => row.getCell(1).value === 'Rebars')!
  sheet.getCell(header.number + 2, 6).value = 322.58
  const edited = await importProjectWorkbook(new Uint8Array(await book.xlsx.writeBuffer()).buffer)
  assert.ok(edited.ok, edited.ok ? '' : edited.error)
  close(edited.document.inputs.geometry.rebars[0].area!, 322.58)
  assert.deepEqual(edited.document.inputs.geometry.rebars[0].areaSource, { type: 'manual' })
  assert.equal(edited.document.inputs.geometry.rebars[0].dia, 25.4)
  sheet.getCell(header.number + 2, 6).value = null
  assert.equal((await importProjectWorkbook(new Uint8Array(await book.xlsx.writeBuffer()).buffer)).ok, false)
})
