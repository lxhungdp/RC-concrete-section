import type { Workbook } from 'exceljs'
import { evaluatedCellNote } from './workbook-units'
import { failSheet, readSheetWorkbook, SPREADSHEET_LIMITS, type PreparedSheet, type WorkbookMapping } from './table'
import { inspectWorkbookArchive } from './workbook-archive'
import { formatProjectWorkbook, projectWorkbookInputSheets, projectWorkbookProperties, readProjectWorkbookInputs, type ProjectWorkbookResult } from './project-xlsx'

export type ProjectSpreadsheetContext = Readonly<{
  properties: Readonly<{ subject: string; description: string }>
  sheets: readonly string[]
}>
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const writeWorkbook = async (book: Workbook): Promise<ArrayBuffer> => {
  const bytes = new Uint8Array(await book.xlsx.writeBuffer()).buffer
  const issue = inspectWorkbookArchive(bytes, 'Project spreadsheet')
  if (issue) failSheet(issue.code === 'WORKBOOK_RESOURCE_LIMIT' ? 'SHEET_RESOURCE_LIMIT' : 'SHEET_FORMAT', issue.message)
  return bytes
}

/** Native Open may select another workbook; validate its current metadata, never old file caches. */
export async function projectFromWorkbookEditor(value: unknown): Promise<Extract<ProjectWorkbookResult, { ok: true }>> {
  if (!record(value) || !record(value.properties) || typeof value.properties.subject !== 'string' || typeof value.properties.description !== 'string') {
    return failSheet('SHEET_FORMAT', 'Open a P-M Project XLSX workbook before Update.')
  }
  if (!Array.isArray(value.sheets) || value.sheets.length > SPREADSHEET_LIMITS.sheets) return failSheet('SHEET_FORMAT', 'Invalid workbook sheets.')
  let required: readonly string[]
  try { required = projectWorkbookInputSheets(value.properties.subject) }
  catch { return failSheet('SHEET_FORMAT', 'Open a P-M Project XLSX workbook before Update.') }
  const names = new Set<string>(), inputSheets: unknown[] = []
  for (const sheet of value.sheets) {
    if (!record(sheet) || typeof sheet.name !== 'string' || names.has(sheet.name)) return failSheet('SHEET_FORMAT', 'Invalid or duplicate workbook sheet.')
    names.add(sheet.name)
    if (required.includes(sheet.name)) inputSheets.push(sheet)
  }
  // Independent helper worksheets remain in the native workbook, outside the project input schema.
  if (inputSheets.length !== required.length) return failSheet('SHEET_FORMAT', 'Open a complete P-M Project XLSX workbook before Update.')
  return projectFromSpreadsheet({ ...value, sheets: inputSheets }, { properties: { subject: value.properties.subject, description: value.properties.description }, sheets: required })
}

/** No worksheet protection: schema errors are diagnosed at the atomic Update boundary. */
export async function prepareProjectSpreadsheet(bytes: ArrayBuffer): Promise<PreparedSheet<ProjectSpreadsheetContext, WorkbookMapping>> {
  const book = await readSheetWorkbook(bytes)
  const properties = projectWorkbookProperties(book), sheets = book.worksheets.map(sheet => sheet.name)
  const required = projectWorkbookInputSheets(properties.subject)
  if (required.some(name => !sheets.includes(name))) {
    return failSheet('SHEET_FORMAT', 'Open a complete P-M Project XLSX workbook.')
  }
  for (const sheet of book.worksheets) {
    sheet.unprotect(); sheet.state = 'visible'
    // Keep every project row directly editable in the cells-only authoring view.
    sheet.views = [{ state: 'normal', showGridLines: false }]
  }
  const active = book.views?.[0]?.activeTab ?? 0
  const sheet = sheets[active] ?? 'Section'
  return { bytes: await writeWorkbook(book), mapping: { kind: 'workbook', sheet }, context: { properties, sheets: required } }
}

/** Current engine results only; imported Excel formula caches never enter this boundary. */
export async function projectFromSpreadsheet(value: unknown, context: ProjectSpreadsheetContext): Promise<Extract<ProjectWorkbookResult, { ok: true }>> {
  if (!record(value) || !record(value.properties) || value.properties.subject !== context.properties.subject ||
    value.properties.description !== context.properties.description || !Array.isArray(value.sheets) || value.sheets.length !== context.sheets.length) {
    return failSheet('SHEET_FORMAT', 'The project workbook identity or sheets changed. Reopen the workbook.')
  }
  const names = new Set<string>()
  let slots = 0
  // Bound the dense allocation before constructing an ExcelJS workbook.
  for (const sheet of value.sheets) {
    if (!record(sheet) || typeof sheet.name !== 'string' || !context.sheets.includes(sheet.name) || names.has(sheet.name) || !Array.isArray(sheet.rows)) {
      return failSheet('SHEET_FORMAT', 'Invalid project worksheet snapshot.')
    }
    names.add(sheet.name)
    if (sheet.rows.length > SPREADSHEET_LIMITS.rows) return failSheet('SHEET_RESOURCE_LIMIT', 'Project spreadsheet row limit exceeded.')
    const columns = sheet.rows.length && Array.isArray(sheet.rows[0]) ? sheet.rows[0].length : 0
    if (columns > SPREADSHEET_LIMITS.columns || sheet.rows.some(row => !Array.isArray(row) || row.length !== columns)) return failSheet('SHEET_FORMAT', 'Invalid project worksheet columns.')
    slots += sheet.rows.length * columns
    if (slots > SPREADSHEET_LIMITS.cells) return failSheet('SHEET_RESOURCE_LIMIT', 'Project snapshot exceeds 1,000,000 cells.')
  }
  const module = await import('exceljs'), ExcelJS = module.default ?? module
  const book = new ExcelJS.Workbook()
  book.subject = context.properties.subject; book.description = context.properties.description
  for (const source of value.sheets) {
    // The first pass above establishes this shape; recheck the narrowed branch after the await.
    if (!record(source) || typeof source.name !== 'string' || !Array.isArray(source.rows)) return failSheet('SHEET_FORMAT', 'Invalid project worksheet.')
    const sheet = book.addWorksheet(source.name)
    for (let r = 0; r < source.rows.length; r++) {
      const row: unknown = source.rows[r]
      if (!Array.isArray(row)) return failSheet('SHEET_FORMAT', 'Invalid project row.')
      for (let c = 0; c < row.length; c++) {
        const cell: unknown = row[c], address = `${source.name} row ${r + 1}, column ${c + 1}`
        if (!record(cell) || typeof cell.formula !== 'boolean' || typeof cell.date !== 'boolean' ||
          cell.note !== null && typeof cell.note !== 'string' || !('value' in cell)) return failSheet('SHEET_FORMAT', `${address}: invalid cell snapshot.`)
        const scalar = cell.value
        if (cell.date || scalar !== null && typeof scalar !== 'string' && typeof scalar !== 'boolean' && !(typeof scalar === 'number' && Number.isFinite(scalar))) {
          const detail = record(scalar) && typeof scalar.error === 'string' ? ` (${scalar.error})` : ''
          return failSheet('SHEET_CELL', `${address}: use a finite plain value${detail}.`)
        }
        const target = sheet.getCell(r + 1, c + 1)
        target.value = scalar
        const note = evaluatedCellNote(cell.formula, cell.note)
        if (note !== undefined) target.note = note
      }
    }
  }
  const result = readProjectWorkbookInputs(book)
  if (!result.ok) return failSheet(result.code === 'WORKBOOK_RESOURCE_LIMIT' ? 'SHEET_RESOURCE_LIMIT' : 'SHEET_CELL', result.error)
  return result
}

/** Keep Save formula-bearing and plain, independently of a source file's decorative styles. */
export async function exportProjectSpreadsheet(bytes: ArrayBuffer): Promise<ArrayBuffer> {
  const book = await readSheetWorkbook(bytes)
  projectWorkbookProperties(book)
  for (const sheet of book.worksheets) sheet.unprotect()
  formatProjectWorkbook(book)
  book.calcProperties.fullCalcOnLoad = true
  return writeWorkbook(book)
}
