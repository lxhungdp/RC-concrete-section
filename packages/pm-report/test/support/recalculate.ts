import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import { HyperFormula } from 'hyperformula'

export const near = (a: number, b: number, scale = 1) => {
  assert.ok(Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b), scale), `${a} versus ${b}`)
}

/** Serialize, reload and recalculate every formula independently of the stored engine results. */
export const recalculate = async (book: ExcelJS.Workbook) => {
  const loaded = new ExcelJS.Workbook()
  await loaded.xlsx.load(await book.xlsx.writeBuffer() as unknown as ArrayBuffer)
  const grids: Record<string, Array<Array<string | number | boolean | null>>> = {}
  for (const sheet of loaded.worksheets) {
    grids[sheet.name] = Array.from({ length: sheet.rowCount }, (_, r) =>
      Array.from({ length: sheet.columnCount }, (_, c) => {
        const cell = sheet.getCell(r + 1, c + 1)
        if (cell.formula) return `=${cell.formula}`
        return typeof cell.value === 'string' || typeof cell.value === 'number' || typeof cell.value === 'boolean'
          ? cell.value
          : null
      }))
  }
  const engine = HyperFormula.buildFromSheets(grids, { licenseKey: 'gpl-v3', useArrayArithmetic: true, smartRounding: false })
  for (const name of loaded.definedNames.model) {
    for (const range of name.ranges) engine.addNamedExpression(name.name, `=${range}`)
  }
  const value = (sheet: string, address: string) =>
    engine.getCellValue(engine.simpleCellAddressFromString(address, engine.getSheetId(sheet)!)!)
  try {
    for (const sheet of loaded.worksheets) {
      sheet.eachRow((row) => row.eachCell((cell) => {
        if (!cell.formula) return
        const actual = value(sheet.name, cell.address)
        assert.ok(actual === null || typeof actual !== 'object', `${sheet.name}!${cell.address}: ${JSON.stringify(actual)}`)
        if (typeof actual !== 'number' || typeof cell.result !== 'number') return
        // Block ray residual caches are ideal zeros. Normalise cancellation by the demand,
        // in the same units as the residual, rather than treating an ideal zero as a load scale.
        let scale = 1
        if (String(sheet.getCell(row.number, 1).value).startsWith('Residual Δ')) {
          const target = cell.formula.match(/-([A-Za-z_][A-Za-z_0-9]*)$/)?.[1]
          assert.ok(target)
          const demand = engine.getNamedExpressionValue(target)
          assert.equal(typeof demand, 'number')
          scale = Math.abs(Number(demand))
        }
        try {
          near(actual, cell.result, scale)
        } catch (error) {
          throw new Error(`${sheet.name}!${cell.address}: ${cell.formula}`, { cause: error })
        }
      }))
    }
  } catch (error) {
    engine.destroy()
    throw error
  }
  return { loaded, engine, value }
}
