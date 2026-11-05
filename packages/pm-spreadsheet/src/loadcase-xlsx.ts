import { UNIT_PRESETS, fromCanonical, toCanonical, quantityUnit, parseNumericText, type UnitContext } from '@pm/units'
import { quantityCell, readQuantityCell, writeQuantityCell, readWorkbookUnits, writeWorkbookUnits } from './workbook-units'
import { CENTROID_LOAD_REFERENCE, createLoadCombination, parseLoadReference, resultantAtCentroid, resultantAtLoadReference, type LoadCombination, type LoadReference } from '@pm/project'

/** Explicit frame transport. Older workbooks without this sheet contain centroidal moments. */
export const writeLoadReferenceSheet = (book: import('exceljs').Workbook, reference: LoadReference, units: UnitContext) => {
  const frame = parseLoadReference(reference)
  const sheet = book.addWorksheet('Load reference')
  sheet.addRow(['LOAD_REFERENCE', 1])
  sheet.addRow(['Moment basis', 'load-reference'])
  sheet.addRow(['Kind', frame.kind])
  for (const [label, value] of [['Offset X', frame.offsetX], ['Offset Y', frame.offsetY]] as const) {
    const row = sheet.addRow([`${label} (${quantityUnit('length', units)})`, null])
    writeQuantityCell(row.getCell(2), quantityCell('length', value, units))
  }
  sheet.getColumn(1).width = 25; sheet.getColumn(2).width = 25
}
export const readLoadReferenceSheet = (book: import('exceljs').Workbook, units: UnitContext, required = false): LoadReference => {
  const sheet = book.getWorksheet('Load reference')
  if (!sheet) {
    if (required) throw Error('The load-reference declaration is required.')
    return CENTROID_LOAD_REFERENCE
  }
  const normalized = (value: unknown) => typeof value === 'string' ? value.trim().toUpperCase() : ''
  let fieldColumn: number | null = null
  const fields = new Map<string, import('exceljs').Cell>()
  for (let row = 1; row <= sheet.rowCount; row++) {
    const nonblank: number[] = []
    sheet.getRow(row).eachCell((cell, column) => { if (cell.value != null && String(cell.value).trim() !== '') nonblank.push(column) })
    if (!nonblank.length || normalized(sheet.getCell(row, nonblank[0]).value).startsWith('#')) continue
    const column = nonblank[0]
    const key = normalized(sheet.getCell(row, column).value)
    if (key === 'LOAD_REFERENCE') {
      if (fieldColumn !== null || sheet.getCell(row, column + 1).value !== 1) throw Error('Unsupported load-reference declaration.')
      fieldColumn = column; continue
    }
    if (fieldColumn === null || column !== fieldColumn || !key || fields.has(key) || nonblank.some(c => c > column + 1)) throw Error('Invalid or repeated load-reference field.')
    fields.set(key, sheet.getCell(row, column + 1))
  }
  const x = fields.get(normalized(`Offset X (${quantityUnit('length', units)})`))
  const y = fields.get(normalized(`Offset Y (${quantityUnit('length', units)})`))
  if (fields.size !== 4 || fields.get('MOMENT BASIS')?.value !== 'load-reference' || !x || !y) throw Error('Invalid load-reference fields or units.')
  return parseLoadReference({ kind: fields.get('KIND')?.value,
    offsetX: readQuantityCell('length', readNumber(x.value, 'Load reference X'), units, x.note),
    offsetY: readQuantityCell('length', readNumber(y.value, 'Load reference Y'), units, y.note) })
}

export const loadcaseWorkbookHeaders = (units: UnitContext) => ['ID', 'Name', `Pu (${quantityUnit('force', units)})`, `Mux (${quantityUnit('moment', units)})`, `Muy (${quantityUnit('moment', units)})`]

const excelModule = async () => {
  const imported = await import('exceljs')
  return ((imported as unknown as { default?: typeof imported }).default ?? imported) as typeof imported
}

const toBytes = (buffer: ArrayBuffer | Uint8Array) =>
  buffer instanceof Uint8Array ? new Uint8Array(buffer) : new Uint8Array(buffer)

const asArrayBuffer = (buffer: ArrayBuffer | Uint8Array) => {
  if (buffer instanceof ArrayBuffer) return buffer
  const copy = new Uint8Array(buffer.byteLength)
  copy.set(buffer)
  return copy.buffer
}

const scalar = (value: import('exceljs').CellValue): string | number | boolean | null => {
  if (value == null) return null
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') {
    if ('result' in value) return scalar(value.result as import('exceljs').CellValue)
    if ('text' in value && typeof value.text === 'string') return value.text
    return String(value)
  }
  return value
}

const normalizeHeader = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

const findColumn = (
  headers: Map<string, number>,
  aliases: string[],
  required = true
) => {
  const column = aliases.map(normalizeHeader).map((alias) => headers.get(alias)).find((value) => value != null)
  if (column == null && required) throw new Error(`Missing column "${aliases[0]}".`)
  return column
}

const readNumber = (value: unknown, label: string) => {
  const number = typeof value === 'number' ? value : parseNumericText(String(value ?? ''))
  if (!Number.isFinite(number)) throw new Error(`${label} must be a finite number.`)
  return number
}

export const loadcaseWorkbookFileName = 'loadcases.xlsx'

export const buildLoadcaseWorkbook = async (loadcases: LoadCombination[], units: UnitContext = UNIT_PRESETS.metric, reference: LoadReference = CENTROID_LOAD_REFERENCE): Promise<Uint8Array> => {
  const ExcelJS = await excelModule()
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Loadcases')

  writeWorkbookUnits(workbook, units, 'pm-loadcases')
  writeLoadReferenceSheet(workbook, reference, units)
  sheet.addRow(loadcaseWorkbookHeaders(units))
  for (const canonical of loadcases) {
    const loadcase = resultantAtLoadReference(canonical, reference)
    const row = sheet.addRow([
      loadcase.id,
      loadcase.name,
      null, null, null
    ])
    writeQuantityCell(row.getCell(3), quantityCell('force', loadcase.P, units))
    writeQuantityCell(row.getCell(4), quantityCell('moment', loadcase.Mx, units))
    writeQuantityCell(row.getCell(5), quantityCell('moment', loadcase.My, units))
  }

  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true }
  })
  const columnWidths = [10, 30, 16, 16, 16]
  columnWidths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width
  })
  sheet.getColumn(1).numFmt = '0'
  for (const column of [3, 4, 5]) sheet.getColumn(column).numFmt = '0.000'

  return toBytes(await workbook.xlsx.writeBuffer())
}

export const importLoadcaseWorkbook = async (
  buffer: ArrayBuffer | Uint8Array
): Promise<LoadCombination[]> => {
  const ExcelJS = await excelModule()
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(asArrayBuffer(buffer))
  const sheet = workbook.getWorksheet('Loadcases') ?? workbook.worksheets[0]
  if (!sheet) throw new Error('The workbook does not contain a worksheet.')

  const units = readWorkbookUnits(workbook, 'pm-loadcases')
  const reference = readLoadReferenceSheet(workbook, units)
  const declaredHeaders = loadcaseWorkbookHeaders(units)
  const headers = new Map<string, number>()
  sheet.getRow(1).eachCell((cell, column) => headers.set(normalizeHeader(scalar(cell.value)), column))
  const idColumn = findColumn(headers, ['ID', 'No', 'Number'], false)
  const nameColumn = findColumn(headers, ['Name', 'Loadcase', 'Loadcase name'])!
  const puColumn = findColumn(headers, [declaredHeaders[2]])!
  const muxColumn = findColumn(headers, [declaredHeaders[3]])!
  const muyColumn = findColumn(headers, [declaredHeaders[4]])!

  const usedIds = new Set<number>()
  const imported: LoadCombination[] = []
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber)
    const values = [idColumn, nameColumn, puColumn, muxColumn, muyColumn]
      .filter((column): column is number => column != null)
      .map((column) => scalar(row.getCell(column).value))
    if (values.every((value) => value == null || String(value).trim() === '')) continue

    const name = String(scalar(row.getCell(nameColumn).value) ?? '').trim()
    if (!name) throw new Error(`Row ${rowNumber}: Name is required.`)

    const rawId = idColumn == null ? null : scalar(row.getCell(idColumn).value)
    const requestedId = rawId == null || String(rawId).trim() === '' ? undefined : Number(rawId)
    if (
      requestedId !== undefined &&
      (!Number.isInteger(requestedId) || requestedId <= 0 || usedIds.has(requestedId))
    ) {
      throw new Error(`Row ${rowNumber}: ID must be a unique positive integer.`)
    }

    const loadcase = createLoadCombination(
      {
        id: requestedId,
        name,
        P: readQuantityCell('force', readNumber(scalar(row.getCell(puColumn).value), `Row ${rowNumber}: Pu`), units, row.getCell(puColumn).note),
        Mx: readQuantityCell('moment', readNumber(scalar(row.getCell(muxColumn).value), `Row ${rowNumber}: Mux`), units, row.getCell(muxColumn).note),
        My: readQuantityCell('moment', readNumber(scalar(row.getCell(muyColumn).value), `Row ${rowNumber}: Muy`), units, row.getCell(muyColumn).note)
      },
      usedIds
    )
    usedIds.add(loadcase.id)
    imported.push(resultantAtCentroid(loadcase, reference))
  }

  if (imported.length === 0) throw new Error('The workbook must contain at least one loadcase.')
  return imported
}
