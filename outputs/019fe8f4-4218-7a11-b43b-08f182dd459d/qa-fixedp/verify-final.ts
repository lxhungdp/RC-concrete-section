import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ExcelJS from 'exceljs'
import { HyperFormula } from 'hyperformula'

const primitive = (cell: ExcelJS.Cell): string | number | boolean | null => {
  const value = cell.value
  if (value === null || value === undefined) return null
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  if ('formula' in value && typeof value.formula === 'string') return `=${value.formula}`
  if ('result' in value) {
    const result = value.result
    return typeof result === 'string' || typeof result === 'number' || typeof result === 'boolean' ? result : null
  }
  return null
}

const main = async () => {
  const output = resolve(process.cwd(), 'outputs/019fe8f4-4218-7a11-b43b-08f182dd459d/fixed-p-chart-audit-sample.xlsx')
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(output)
  const sheets: Record<string, Array<Array<string | number | boolean | null>>> = {}
  for (const sheet of workbook.worksheets) {
    sheets[sheet.name] = Array.from({ length: sheet.rowCount }, (_, row) =>
      Array.from({ length: sheet.columnCount }, (_, column) => primitive(sheet.getCell(row + 1, column + 1)))
    )
  }
  const engine = HyperFormula.buildFromSheets(sheets, {
    licenseKey: 'gpl-v3',
    useArrayArithmetic: true,
    smartRounding: false
  })
  for (const entry of workbook.definedNames.model) {
    for (const range of entry.ranges) engine.addNamedExpression(entry.name, `=${range}`)
  }
  const failures: string[] = []
  for (const sheet of workbook.worksheets) {
    const sheetId = engine.getSheetId(sheet.name)
    if (sheetId === undefined) continue
    engine.getSheetValues(sheetId).forEach((row, rowIndex) => row.forEach((value, columnIndex) => {
      if (value !== null && typeof value === 'object' && 'type' in value) {
        failures.push(`${sheet.name}!R${rowIndex + 1}C${columnIndex + 1}: ${String(value.type)}`)
      }
    }))
  }
  for (const sheetName of ['FixedP_Lower', 'FixedP_Upper']) {
    const sheet = workbook.getWorksheet(sheetName)!
    const sheetId = engine.getSheetId(sheetName)!
    const headers = new Map<string, number>()
    for (let column = 1; column <= sheet.columnCount; column++) {
      const header = sheet.getCell(7, column).value
      if (typeof header === 'string') headers.set(header, column)
    }
    const value = (row: number, header: string) => {
      const column = headers.get(header)!
      const address = engine.simpleCellAddressFromString(`${sheet.getColumn(column).letter}${row}`, sheetId)!
      return Number(engine.getCellValue(address))
    }
    for (let row = 8; row <= sheet.rowCount; row++) {
      if (!sheet.getCell(row, headers.get('Source key')!).value) continue
      for (const component of ['P', 'Mx', 'My']) {
        const actual = value(row, `Final ${component}`)
        const expected = value(row, `Engine ${component}`)
        const tolerance = Math.max(1e-9, Math.abs(expected) * 1e-9)
        if (!Number.isFinite(actual) || Math.abs(actual - expected) > tolerance) {
          failures.push(`${sheetName}!R${row} ${component}: formula=${actual}, engine=${expected}`)
        }
      }
    }
  }
  writeFileSync(
    resolve(process.cwd(), 'outputs/019fe8f4-4218-7a11-b43b-08f182dd459d/qa-fixedp/calculated-errors.txt'),
    failures.join('\n')
  )
  if (failures.length > 0) throw new Error(failures.slice(0, 10).join('\n'))
}

void main()
