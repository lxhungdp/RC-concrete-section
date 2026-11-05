import type { Workbook } from 'exceljs'
import type { Quantity, UnitContext } from '@pm/units'
import { readQuantityCell } from './workbook-units'
import { inspectWorkbookArchive } from './workbook-archive'

export const SPREADSHEET_PROTOCOL = { type: 'pm-gridcraft', version: 2 } as const
export const SPREADSHEET_LIMITS = Object.freeze({ rows: 100_001, columns: 64, cells: 1_000_000 })
export type SheetMapping = Readonly<{ sheet: string; columns: number }>
export type SheetCell = Readonly<{ value: unknown; formula: boolean; note: string | null; date: boolean }>
export type PreparedSheet<C> = Readonly<{ bytes: ArrayBuffer; mapping: SheetMapping; context: C }>
export type SheetSchema = Readonly<{ sheet: string; headers: readonly string[]; hiddenColumns?: readonly number[] }>
export class SheetError extends Error {
  constructor(readonly code: 'SHEET_CELL' | 'SHEET_FORMAT' | 'SHEET_RESOURCE_LIMIT' | 'SHEET_TARGET', message: string) {
    super(message); this.name = 'SheetError'
  }
}
export const failSheet = (code: SheetError['code'], message: string): never => { throw new SheetError(code, message) }
export const blankCell = (value: unknown) => value == null || typeof value === 'string' && value.trim() === ''
const record = (value: unknown): value is Record<string, unknown> => value != null && typeof value === 'object' && !Array.isArray(value)

export function validateSheetMapping(value: unknown): SheetMapping {
  if (!record(value) || typeof value.sheet !== 'string' || !value.sheet.length || value.sheet.length > 31 ||
    /[\\/?*\[\]:]/u.test(value.sheet) || typeof value.columns !== 'number' || !Number.isInteger(value.columns) || value.columns < 2 || value.columns > SPREADSHEET_LIMITS.columns) {
    return failSheet('SHEET_FORMAT', 'Invalid spreadsheet table mapping.')
  }
  return { sheet: value.sheet, columns: value.columns }
}

export async function readSheetWorkbook(bytes: ArrayBuffer): Promise<Workbook> {
  const archive = inspectWorkbookArchive(bytes, 'Spreadsheet workbook')
  if (archive) failSheet(archive.code === 'WORKBOOK_RESOURCE_LIMIT' ? 'SHEET_RESOURCE_LIMIT' : 'SHEET_FORMAT', archive.message)
  const imported = await import('exceljs'), ExcelJS = imported.default ?? imported
  const book = new ExcelJS.Workbook()
  await book.xlsx.load(bytes)
  let count = 0
  for (const sheet of book.worksheets) {
    if (sheet.rowCount > SPREADSHEET_LIMITS.rows || sheet.columnCount > SPREADSHEET_LIMITS.columns) failSheet('SHEET_RESOURCE_LIMIT', 'Spreadsheet dimensions exceed the supported limits.')
    sheet.eachRow(row => row.eachCell(() => { count++ }))
  }
  if (count > SPREADSHEET_LIMITS.cells) failSheet('SHEET_RESOURCE_LIMIT', 'Spreadsheet exceeds 1,000,000 populated cells.')
  return book
}

/** One template policy for every mapped table. Helpers and future body cells stay editable. */
export async function prepareSheetWorkbook<C>(book: Workbook, schema: SheetSchema, context: C): Promise<PreparedSheet<C>> {
  const mapping = validateSheetMapping({ sheet: schema.sheet, columns: schema.headers.length })
  const sheet = book.getWorksheet(mapping.sheet)
  if (!sheet) return failSheet('SHEET_FORMAT', `The workbook needs a ${mapping.sheet} sheet.`)
  schema.headers.forEach((header, index) => {
    if (sheet.getCell(1, index + 1).value !== header) failSheet('SHEET_FORMAT', `Column ${index + 1} must be ${header}.`)
  })
  for (let column = 1; column <= SPREADSHEET_LIMITS.columns; column++) sheet.getColumn(column).protection = { locked: false }
  sheet.eachRow(row => {
    row.protection = { locked: false }
    row.eachCell(cell => { cell.style = { ...cell.style }; cell.protection = { locked: false } })
  })
  schema.headers.forEach((_, index) => {
    const cell = sheet.getCell(1, index + 1)
    // ExcelJS may share imported styles between headers and body cells.
    cell.style = { ...cell.style }; cell.protection = { locked: true }
    cell.font = { ...cell.font, bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF197381' } }
  })
  await sheet.protect('', { selectLockedCells: true, selectUnlockedCells: true,
    formatCells: true, formatColumns: true, formatRows: true, insertRows: true, deleteRows: true,
    insertColumns: false, deleteColumns: false, sort: true, autoFilter: true })
  for (const column of schema.hiddenColumns ?? [1]) sheet.getColumn(column).hidden = true
  sheet.views = [{ state: 'frozen', ySplit: 1, activeCell: 'B2' }]
  for (const item of book.worksheets) if (item !== sheet) item.state = 'veryHidden'
  sheet.state = 'visible'
  book.views = [{ x: 0, y: 0, width: 1200, height: 800, visibility: 'visible', firstSheet: 0, activeTab: book.worksheets.indexOf(sheet) }]
  const bytes = new Uint8Array(await book.xlsx.writeBuffer()).buffer
  return { bytes, mapping, context }
}

/** Decodes only the mapped scalar cells. A helper column never becomes engineering input. */
export function readSheetRows(value: unknown, headers: readonly string[], maxItems: number) {
  if (!record(value) || !Array.isArray(value.rows) || !value.rows.length) return failSheet('SHEET_FORMAT', 'Missing spreadsheet rows.')
  if (value.rows.length > SPREADSHEET_LIMITS.rows) return failSheet('SHEET_RESOURCE_LIMIT', 'Spreadsheet row limit exceeded.')
  if (value.rows.length * headers.length > SPREADSHEET_LIMITS.cells) return failSheet('SHEET_RESOURCE_LIMIT', 'Mapped spreadsheet snapshot exceeds 1,000,000 cells.')
  const rows = value.rows.map((row: unknown, index: number): SheetCell[] => {
    if (!Array.isArray(row) || row.length !== headers.length) return failSheet('SHEET_FORMAT', `Invalid spreadsheet row ${index + 1}.`)
    return row.map((cell: unknown) => {
      if (!record(cell) || typeof cell.formula !== 'boolean' || typeof cell.date !== 'boolean' ||
          cell.note !== null && typeof cell.note !== 'string' || !('value' in cell)) return failSheet('SHEET_FORMAT', `Invalid cell data in row ${index + 1}.`)
      return { value: cell.value, formula: cell.formula, note: cell.note, date: cell.date }
    })
  })
  rows[0].forEach((cell, index) => {
    if (cell.formula || cell.value !== headers[index]) failSheet('SHEET_FORMAT', `Restore header ${headers[index]}.`)
  })
  const populated = rows.slice(1).map((cells, index) => ({ cells, row: index + 2 }))
    .filter(({ cells }) => !cells.slice(1).every(cell => blankCell(cell.value)))
  if (populated.length > maxItems) return failSheet('SHEET_RESOURCE_LIMIT', `The table exceeds ${maxItems} rows.`)
  return populated
}

/** Reserve all literal IDs before allocating blanks, including IDs in later rows. */
export function sheetRowIds(rows: readonly { cells: readonly SheetCell[]; row: number }[], reserved: Iterable<number> = []) {
  const used = new Set(reserved)
  for (const { cells, row } of rows) {
    const id = cells[0]
    if (id.formula || id.date) failSheet('SHEET_CELL', `A${row}: ID must be a literal positive integer.`)
    if (blankCell(id.value)) continue
    if (typeof id.value !== 'number' || !Number.isSafeInteger(id.value) || id.value <= 0 || used.has(id.value)) return failSheet('SHEET_CELL', `A${row}: ID must be a unique positive integer.`)
    used.add(id.value)
  }
  return used
}

export function numericSheetCell(cell: SheetCell, address: string): number {
  if (cell.date || typeof cell.value !== 'number' || !Number.isFinite(cell.value)) {
    const detail = record(cell.value) && typeof cell.value.error === 'string' ? ` (${cell.value.error})` : ''
    return failSheet('SHEET_CELL', `${address}: Enter a finite numeric value${detail}.`)
  }
  return cell.value
}
export function quantityFromSheet(cell: SheetCell, quantity: Quantity, units: UnitContext, address: string) {
  const value = numericSheetCell(cell, address)
  try { return readQuantityCell(quantity, value, units, cell.formula ? undefined : cell.note ?? undefined) }
  catch (error) { return failSheet('SHEET_CELL', `${address}: ${error instanceof Error ? error.message : String(error)}`) }
}
