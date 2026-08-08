import { createLoadCombination, type LoadCombination } from '@pm/project'

const HEADERS = ['ID', 'Name', 'Pu (kN)', 'Mux (kNm)', 'Muy (kNm)']

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
  const number = typeof value === 'number' ? value : Number(String(value ?? '').trim())
  if (!Number.isFinite(number)) throw new Error(`${label} must be a finite number.`)
  return number
}

export const loadcaseWorkbookFileName = 'loadcases.xlsx'

export const buildLoadcaseWorkbook = async (loadcases: LoadCombination[]): Promise<Uint8Array> => {
  const ExcelJS = await excelModule()
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Loadcases')

  sheet.addRow(HEADERS)
  for (const loadcase of loadcases) {
    sheet.addRow([
      loadcase.id,
      loadcase.name,
      loadcase.P / 1000,
      loadcase.Mx / 1_000_000,
      loadcase.My / 1_000_000
    ])
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

export const downloadLoadcaseWorkbook = async (loadcases: LoadCombination[]) => {
  const bytes = await buildLoadcaseWorkbook(loadcases)
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const blob = new Blob([copy.buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = loadcaseWorkbookFileName
  anchor.click()
  URL.revokeObjectURL(url)
}

export const importLoadcaseWorkbook = async (
  buffer: ArrayBuffer | Uint8Array
): Promise<LoadCombination[]> => {
  const ExcelJS = await excelModule()
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(asArrayBuffer(buffer))
  const sheet = workbook.getWorksheet('Loadcases') ?? workbook.worksheets[0]
  if (!sheet) throw new Error('The workbook does not contain a worksheet.')

  const headers = new Map<string, number>()
  sheet.getRow(1).eachCell((cell, column) => headers.set(normalizeHeader(scalar(cell.value)), column))
  const idColumn = findColumn(headers, ['ID', 'No', 'Number'], false)
  const nameColumn = findColumn(headers, ['Name', 'Loadcase', 'Loadcase name'])!
  const puColumn = findColumn(headers, ['Pu (kN)', 'Pu'])!
  const muxColumn = findColumn(headers, ['Mux (kNm)', 'Mux'])!
  const muyColumn = findColumn(headers, ['Muy (kNm)', 'Muy'])!

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
        P: readNumber(scalar(row.getCell(puColumn).value), `Row ${rowNumber}: Pu`) * 1000,
        Mx: readNumber(scalar(row.getCell(muxColumn).value), `Row ${rowNumber}: Mux`) * 1_000_000,
        My: readNumber(scalar(row.getCell(muyColumn).value), `Row ${rowNumber}: Muy`) * 1_000_000
      },
      usedIds
    )
    usedIds.add(loadcase.id)
    imported.push(loadcase)
  }

  if (imported.length === 0) throw new Error('The workbook must contain at least one loadcase.')
  return imported
}
