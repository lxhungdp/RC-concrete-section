import assert from 'node:assert/strict'
import test from 'node:test'
import { createDefaultMaterialStore, createKdsRebarSteel } from '@pm/materials'
import type { GeometryInputRebarView, Point2 } from '@pm/geometry'
import {
  buildRebarWorkbook,
  buildSectionWorkbook,
  importRebarWorkbook,
  importSectionWorkbook
} from './section-xlsx'

const point = (id: number, x: number, y: number): Point2 => ({ id, x, y })

const asArrayBuffer = (bytes: Uint8Array) => {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

const loadWorkbook = async (bytes: Uint8Array) => {
  const ExcelJS = await import('exceljs')
  const workbook = new (ExcelJS.default ?? ExcelJS).Workbook()
  await workbook.xlsx.load(asArrayBuffer(bytes))
  return workbook
}

const rect = (ids: [number, number, number, number], halfW: number, halfH: number): Point2[] => [
  point(ids[0], -halfW, -halfH),
  point(ids[1], halfW, -halfH),
  point(ids[2], halfW, halfH),
  point(ids[3], -halfW, halfH)
]

const singleOuter = [
  [rect([1, 2, 3, 4], 200, 300)]
]

const outerWithHole = [
  [
    rect([1, 2, 3, 4], 200, 300),
    rect([5, 6, 7, 8], 50, 50)
  ]
]

const twoOuters = [
  [rect([1, 2, 3, 4], 150, 150)],
  [rect([11, 12, 13, 14], 100, 80).map((p) => ({ ...p, x: p.x + 400 }))]
]

const twoHoles = [
  [
    rect([1, 2, 3, 4], 300, 300),
    rect([5, 6, 7, 8], 40, 40).map((p) => ({ ...p, x: p.x - 120 })),
    rect([9, 10, 11, 12], 40, 40).map((p) => ({ ...p, x: p.x + 120 }))
  ]
]

const insideRebars: GeometryInputRebarView[] = [
  { id: 1, solidIndex: 0, dia: 20, x: -140, y: -240, steelMaterialId: 1 },
  { id: 2, solidIndex: 0, dia: 25, x: 140, y: 240, steelMaterialId: 1 }
]

const outsideRebars: GeometryInputRebarView[] = [
  { id: 10, solidIndex: 0, dia: 16, x: -999, y: -999, steelMaterialId: 1 },
  { id: 11, solidIndex: 0, dia: 18, x: 0, y: 0, steelMaterialId: 1 }
]

test('boundary-only rectangle round-trips without Rebars sheet', async () => {
  const materials = createDefaultMaterialStore()
  const bytes = await buildSectionWorkbook({
    name: 'Rect',
    outers: singleOuter,
    rebars: [],
    steelMaterials: materials.steel
  })
  const workbook = await loadWorkbook(bytes)
  assert.ok(workbook.getWorksheet('Boundary'))
  assert.equal(workbook.getWorksheet('Rebars'), undefined)

  const imported = await importSectionWorkbook(
    asArrayBuffer(bytes),
    materials.steel,
    materials.defaults.steelMaterialId,
    'From file'
  )
  assert.equal(imported.name, 'From file')
  assert.deepEqual(imported.outers, singleOuter)
  assert.equal(imported.rebars.length, 0)
  assert.deepEqual(imported.warnings, [])
})

test('boundary with hole and rebars round-trips Hole indices', async () => {
  const materials = createDefaultMaterialStore()
  const bytes = await buildSectionWorkbook({
    name: 'Hollow',
    outers: outerWithHole,
    rebars: insideRebars,
    steelMaterials: materials.steel
  })
  const workbook = await loadWorkbook(bytes)
  const boundary = workbook.getWorksheet('Boundary')!
  assert.deepEqual(
    [1, 2, 3, 4, 5].map((column) => boundary.getRow(1).getCell(column).value),
    ['Outer', 'Hole', 'id', 'X', 'Y']
  )
  // Outer ring Hole=0, first hole Hole=1
  assert.equal(boundary.getRow(2).getCell(1).value, 1)
  assert.equal(boundary.getRow(2).getCell(2).value, 0)
  assert.equal(boundary.getRow(6).getCell(2).value, 1)

  const imported = await importSectionWorkbook(
    asArrayBuffer(bytes),
    materials.steel,
    materials.defaults.steelMaterialId
  )
  assert.deepEqual(imported.outers, outerWithHole)
  assert.equal(imported.rebars.length, 2)
  assert.equal(imported.rebars[0]?.dia, 20)
  assert.equal(imported.rebars[0]?.steelMaterialId, 1)
  assert.equal(imported.rebars[1]?.id, 2)
})

test('multi-outer boundary round-trips Outer indices', async () => {
  const materials = createDefaultMaterialStore()
  const bytes = await buildSectionWorkbook({
    name: 'Union-like',
    outers: twoOuters,
    rebars: [],
    steelMaterials: materials.steel
  })
  const workbook = await loadWorkbook(bytes)
  const boundary = workbook.getWorksheet('Boundary')!
  const outerNos = new Set<number>()
  for (let row = 2; row <= boundary.rowCount; row++) {
    const value = boundary.getRow(row).getCell(1).value
    if (typeof value === 'number') outerNos.add(value)
  }
  assert.deepEqual([...outerNos].sort((a, b) => a - b), [1, 2])

  const imported = await importSectionWorkbook(
    asArrayBuffer(bytes),
    materials.steel,
    materials.defaults.steelMaterialId
  )
  assert.equal(imported.outers.length, 2)
  assert.deepEqual(imported.outers, twoOuters)
})

test('outer with two holes round-trips Hole 0/1/2', async () => {
  const materials = createDefaultMaterialStore()
  const bytes = await buildSectionWorkbook({
    name: 'Two voids',
    outers: twoHoles,
    rebars: [],
    steelMaterials: materials.steel
  })
  const imported = await importSectionWorkbook(
    asArrayBuffer(bytes),
    materials.steel,
    materials.defaults.steelMaterialId
  )
  assert.equal(imported.outers[0]?.length, 3)
  assert.deepEqual(imported.outers, twoHoles)
})

test('section workbook is data-only tables with no side metadata', async () => {
  const materials = createDefaultMaterialStore()
  const bytes = await buildSectionWorkbook({
    name: 'Column A',
    outers: outerWithHole,
    rebars: insideRebars,
    steelMaterials: materials.steel
  })
  const workbook = await loadWorkbook(bytes)
  const boundary = workbook.getWorksheet('Boundary')!
  const rebarSheet = workbook.getWorksheet('Rebars')!
  assert.equal(boundary.getCell('G1').value, null)
  assert.equal(boundary.getCell('H1').value, null)
  assert.equal(rebarSheet.getCell('G1').value, null)
  assert.deepEqual(
    [1, 2, 3, 4, 5].map((column) => rebarSheet.getRow(1).getCell(column).value),
    ['id', 'Dia', 'Mat', 'X', 'Y']
  )
})

test('section import keeps outside rebars for user editing', async () => {
  const materials = createDefaultMaterialStore()
  const bytes = await buildSectionWorkbook({
    name: 'Outside ok',
    outers: singleOuter,
    rebars: outsideRebars,
    steelMaterials: materials.steel
  })
  const imported = await importSectionWorkbook(
    asArrayBuffer(bytes),
    materials.steel,
    materials.defaults.steelMaterialId
  )
  assert.equal(imported.rebars.length, 2)
  assert.equal(imported.rebars[0]?.x, -999)
  assert.equal(imported.rebars[0]?.y, -999)
  assert.equal(imported.rebars[1]?.x, 0)
  assert.equal(imported.rebars[1]?.y, 0)
})

test('rebar-only workbook round-trips id/dia/mat/x/y', async () => {
  const materials = createDefaultMaterialStore()
  materials.steel.push(createKdsRebarSteel({ id: 2, name: 'SD500', fy: 500 }))
  const mixed: GeometryInputRebarView[] = [
    { id: 1, solidIndex: 0, dia: 20, x: -100, y: -100, steelMaterialId: 1 },
    { id: 2, solidIndex: 0, dia: 32, x: 100, y: 100, steelMaterialId: 2 }
  ]
  const bytes = await buildRebarWorkbook({
    sectionName: 'Column A',
    rebars: mixed,
    steelMaterials: materials.steel
  })
  const workbook = await loadWorkbook(bytes)
  assert.ok(workbook.getWorksheet('Rebars'))
  assert.equal(workbook.getWorksheet('Boundary'), undefined)

  const imported = await importRebarWorkbook(
    asArrayBuffer(bytes),
    materials.steel,
    materials.defaults.steelMaterialId,
    1
  )
  assert.equal(imported.rebars.length, 2)
  assert.equal(imported.rebars[0]?.steelMaterialId, 1)
  assert.equal(imported.rebars[1]?.steelMaterialId, 2)
  assert.equal(imported.rebars[1]?.dia, 32)
  assert.deepEqual(imported.warnings, [])
})

test('rebar-only workbook keeps outside coordinates', async () => {
  const materials = createDefaultMaterialStore()
  const bytes = await buildRebarWorkbook({
    sectionName: 'Column A',
    rebars: outsideRebars,
    steelMaterials: materials.steel
  })
  const imported = await importRebarWorkbook(
    asArrayBuffer(bytes),
    materials.steel,
    materials.defaults.steelMaterialId,
    1
  )
  assert.equal(imported.rebars.length, 2)
  assert.deepEqual(
    imported.rebars.map((bar) => [bar.id, bar.x, bar.y]),
    [
      [10, -999, -999],
      [11, 0, 0]
    ]
  )
})

test('unknown Mat name maps to default material with warning', async () => {
  const ExcelJS = await import('exceljs')
  const workbook = new (ExcelJS.default ?? ExcelJS).Workbook()
  const sheet = workbook.addWorksheet('Rebars')
  sheet.addRow(['id', 'Dia', 'Mat', 'X', 'Y'])
  sheet.addRow([1, 20, 'UnknownSteel', 10, 20])
  const bytes = new Uint8Array(await workbook.xlsx.writeBuffer())
  const materials = createDefaultMaterialStore()
  const imported = await importRebarWorkbook(
    asArrayBuffer(bytes),
    materials.steel,
    materials.defaults.steelMaterialId,
    1
  )
  assert.equal(imported.rebars[0]?.steelMaterialId, materials.defaults.steelMaterialId)
  assert.equal(imported.warnings.length, 1)
  assert.match(imported.warnings[0] ?? '', /unknown steel material/i)
})

test('duplicate rebar id is rejected', async () => {
  const ExcelJS = await import('exceljs')
  const workbook = new (ExcelJS.default ?? ExcelJS).Workbook()
  const sheet = workbook.addWorksheet('Rebars')
  sheet.addRow(['id', 'Dia', 'Mat', 'X', 'Y'])
  sheet.addRow([1, 20, '', 0, 0])
  sheet.addRow([1, 25, '', 10, 10])
  const bytes = new Uint8Array(await workbook.xlsx.writeBuffer())
  const materials = createDefaultMaterialStore()
  await assert.rejects(
    () =>
      importRebarWorkbook(asArrayBuffer(bytes), materials.steel, materials.defaults.steelMaterialId, 1),
    /duplicate id 1/i
  )
})
