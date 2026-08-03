import assert from 'node:assert/strict'
import test from 'node:test'
import { createDefaultMaterialStore } from '@pm/materials'
import type { GeometryInputRebarView, Point2 } from '@pm/geometry'
import {
  buildRebarWorkbook,
  buildSectionWorkbook,
  importRebarWorkbook,
  importSectionWorkbook
} from './section-xlsx'

const point = (id: number, x: number, y: number): Point2 => ({ id, x, y })

const outers: Point2[][][] = [
  [
    [point(1, -200, -300), point(2, 200, -300), point(3, 200, 300), point(4, -200, 300)],
    [point(5, -50, -50), point(6, -50, 50), point(7, 50, 50), point(8, 50, -50)]
  ]
]

const rebars: GeometryInputRebarView[] = [
  { id: 1, solidIndex: 0, dia: 20, x: -140, y: -240, steelMaterialId: 1 },
  { id: 2, solidIndex: 0, dia: 25, x: 140, y: 240, steelMaterialId: 1 }
]

const asArrayBuffer = (bytes: Uint8Array) => {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

test('section workbook round-trips concrete rings and rebars', async () => {
  const materials = createDefaultMaterialStore()
  const bytes = await buildSectionWorkbook({
    name: 'Column A',
    outers,
    rebars,
    steelMaterials: materials.steel
  })
  const imported = await importSectionWorkbook(
    asArrayBuffer(bytes),
    materials.steel,
    materials.defaults.steelMaterialId
  )

  assert.equal(imported.name, 'Column A')
  assert.deepEqual(imported.outers, outers)
  assert.deepEqual(imported.rebars, rebars)
  assert.deepEqual(imported.warnings, [])
})

test('rebar workbook round-trips reinforcement without concrete data', async () => {
  const materials = createDefaultMaterialStore()
  const bytes = await buildRebarWorkbook({
    sectionName: 'Column A',
    rebars,
    steelMaterials: materials.steel
  })
  const imported = await importRebarWorkbook(
    asArrayBuffer(bytes),
    materials.steel,
    materials.defaults.steelMaterialId,
    1
  )

  assert.deepEqual(imported.rebars, rebars)
  assert.deepEqual(imported.warnings, [])
})
