import assert from 'node:assert/strict'
import test from 'node:test'
import { createLoadCombination } from '@pm/project'
import {
  buildLoadcaseWorkbook,
  importLoadcaseWorkbook
} from '../../features/section-editor/loadings/loadcase-xlsx'

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

test('loadcase workbook exports Excel headers and display units', async () => {
  const loadcases = [
    createLoadCombination({ id: 4, name: 'ULS 1', P: 1_250_000, Mx: -83_500_000, My: 21_250_000 })
  ]
  const bytes = await buildLoadcaseWorkbook(loadcases)
  const workbook = await loadWorkbook(bytes)
  const sheet = workbook.getWorksheet('Loadcases')!

  assert.deepEqual(
    [1, 2, 3, 4, 5].map((column) => sheet.getRow(1).getCell(column).value),
    ['ID', 'Name', 'Pu (kN)', 'Mux (kNm)', 'Muy (kNm)']
  )
  assert.deepEqual(
    [1, 2, 3, 4, 5].map((column) => sheet.getRow(2).getCell(column).value),
    [4, 'ULS 1', 1250, -83.5, 21.25]
  )
})

test('loadcase workbook round-trips ids, names and internal units', async () => {
  const loadcases = [
    createLoadCombination({ id: 2, name: 'Gravity', P: 900_000, Mx: 12_000_000, My: 0 }),
    createLoadCombination({ id: 7, name: 'Wind +Y', P: -125_000, Mx: -4_500_000, My: 66_000_000 })
  ]

  const imported = await importLoadcaseWorkbook(asArrayBuffer(await buildLoadcaseWorkbook(loadcases)))
  assert.deepEqual(imported, loadcases)
})

test('loadcase workbook rejects duplicate ids', async () => {
  const ExcelJS = await import('exceljs')
  const workbook = new (ExcelJS.default ?? ExcelJS).Workbook()
  const sheet = workbook.addWorksheet('Loadcases')
  sheet.addRow(['ID', 'Name', 'Pu (kN)', 'Mux (kNm)', 'Muy (kNm)'])
  sheet.addRow([1, 'LC1', 100, 20, 0])
  sheet.addRow([1, 'LC2', 200, 30, 0])
  const bytes = await workbook.xlsx.writeBuffer()

  await assert.rejects(
    importLoadcaseWorkbook(bytes),
    /Row 3: ID must be a unique positive integer\./
  )
})
