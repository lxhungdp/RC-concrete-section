import { createSectionSolid, summarizeSection, type GeometryInputRebarView, type Point2 } from '@pm/geometry'
import type { SteelMaterial } from '@pm/materials'

export type SectionWorkbookInput = {
  name: string
  outers: Point2[][][]
  rebars: GeometryInputRebarView[]
  steelMaterials: SteelMaterial[]
}

export type ImportedSectionWorkbook = {
  name: string
  outers: Point2[][][]
  rebars: GeometryInputRebarView[]
  warnings: string[]
}

export type RebarWorkbookInput = {
  sectionName: string
  rebars: GeometryInputRebarView[]
  steelMaterials: SteelMaterial[]
}

const safeFileStem = (value: string) =>
  value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '') || 'section'

export const sectionWorkbookFileName = (name: string) => `${safeFileStem(name)}.xlsx`
export const rebarWorkbookFileName = (name: string) => `${safeFileStem(name)}-rebars.xlsx`

const excelModule = async () => {
  const imported = await import('exceljs')
  return ((imported as unknown as { default?: typeof imported }).default ?? imported) as typeof imported
}

const toBytes = (buffer: ArrayBuffer | Uint8Array) =>
  buffer instanceof Uint8Array ? new Uint8Array(buffer) : new Uint8Array(buffer)

const downloadBytes = (bytes: Uint8Array, fileName: string) => {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const blob = new Blob([copy.buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

export const downloadSectionWorkbook = async (input: SectionWorkbookInput) => {
  const bytes = await buildSectionWorkbook(input)
  downloadBytes(bytes, sectionWorkbookFileName(input.name))
}

export const downloadRebarWorkbook = async (input: RebarWorkbookInput) => {
  const bytes = await buildRebarWorkbook(input)
  downloadBytes(bytes, rebarWorkbookFileName(input.sectionName))
}

const styleHeader = (row: import('exceljs').Row) => {
  row.eachCell((cell) => {
    cell.font = { bold: true }
  })
}

const styleDataSheet = (sheet: import('exceljs').Worksheet, widths: number[]) => {
  widths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width
  })
  styleHeader(sheet.getRow(1))
}

const addBoundarySheet = (workbook: import('exceljs').Workbook, outers: Point2[][][]) => {
  const sheet = workbook.addWorksheet('Boundary')
  sheet.addRow(['Outer', 'Hole', 'id', 'X', 'Y'])
  outers.forEach((rings, outerIndex) => {
    rings.forEach((ring, ringIndex) => {
      ring.forEach((point) => {
        sheet.addRow([outerIndex + 1, ringIndex, point.id, point.x, point.y])
      })
    })
  })
  styleDataSheet(sheet, [10, 10, 10, 14, 14])
  for (const column of [1, 2, 3]) sheet.getColumn(column).numFmt = '0'
  sheet.getColumn(4).numFmt = '0.000'
  sheet.getColumn(5).numFmt = '0.000'
  return sheet
}

const addRebarSheet = (
  workbook: import('exceljs').Workbook,
  rebars: GeometryInputRebarView[],
  steelMaterials: SteelMaterial[]
) => {
  const materialById = new Map(steelMaterials.map((material) => [material.id, material]))
  const sheet = workbook.addWorksheet('Rebars')
  sheet.addRow(['id', 'Dia', 'Mat', 'X', 'Y'])
  rebars.forEach((bar) => {
    const material = bar.steelMaterialId == null ? undefined : materialById.get(bar.steelMaterialId)
    sheet.addRow([bar.id, bar.dia, material?.name ?? bar.steelMaterialId ?? '', bar.x, bar.y])
  })
  styleDataSheet(sheet, [10, 10, 18, 14, 14])
  sheet.getColumn(1).numFmt = '0'
  sheet.getColumn(2).numFmt = '0.000'
  sheet.getColumn(4).numFmt = '0.000'
  sheet.getColumn(5).numFmt = '0.000'
  return sheet
}

export const buildSectionWorkbook = async (input: SectionWorkbookInput): Promise<Uint8Array> => {
  const ExcelJS = await excelModule()
  const workbook = new ExcelJS.Workbook()
  addBoundarySheet(workbook, input.outers)
  if (input.rebars.length > 0) addRebarSheet(workbook, input.rebars, input.steelMaterials)
  return toBytes(await workbook.xlsx.writeBuffer())
}

export const buildRebarWorkbook = async (input: RebarWorkbookInput): Promise<Uint8Array> => {
  const ExcelJS = await excelModule()
  const workbook = new ExcelJS.Workbook()
  addRebarSheet(workbook, input.rebars, input.steelMaterials)
  return toBytes(await workbook.xlsx.writeBuffer())
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

const normalizedHeader = (value: unknown) => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ')

const headerMap = (sheet: import('exceljs').Worksheet) => {
  const map = new Map<string, number>()
  sheet.getRow(1).eachCell((cell, column) => map.set(normalizedHeader(scalar(cell.value)), column))
  return map
}

const readCell = (row: import('exceljs').Row, headers: Map<string, number>, name: string) => {
  const column = headers.get(normalizedHeader(name))
  return column == null ? null : scalar(row.getCell(column).value)
}

const finiteNumber = (value: unknown, label: string) => {
  const number = typeof value === 'number' ? value : Number(String(value ?? '').trim())
  if (!Number.isFinite(number)) throw new Error(`${label} must be a finite number.`)
  return number
}

const positiveInteger = (value: unknown, label: string) => {
  const number = finiteNumber(value, label)
  if (!Number.isInteger(number) || number <= 0) throw new Error(`${label} must be a positive integer.`)
  return number
}

const nonNegativeInteger = (value: unknown, label: string) => {
  const number = finiteNumber(value, label)
  if (!Number.isInteger(number) || number < 0) throw new Error(`${label} must be a non-negative integer.`)
  return number
}

const optionalPositiveInteger = (value: unknown) => {
  if (value == null || String(value).trim() === '') return undefined
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : undefined
}

const resolveMaterialId = (
  matValue: unknown,
  materials: SteelMaterial[],
  defaultMaterialId: number,
  warnings: string[],
  rowNumber: number
) => {
  const id = optionalPositiveInteger(matValue)
  if (id != null && materials.some((material) => material.id === id)) return id
  const name = String(matValue ?? '').trim().toLowerCase()
  const named = name ? materials.find((material) => material.name.trim().toLowerCase() === name) : undefined
  if (named) return named.id
  if (matValue != null && String(matValue).trim() !== '') {
    warnings.push(`Rebars row ${rowNumber}: unknown steel material "${String(matValue)}"; mapped to material ${defaultMaterialId}.`)
  }
  return defaultMaterialId
}

const parseRebarsSheet = (
  sheet: import('exceljs').Worksheet | undefined,
  materials: SteelMaterial[],
  defaultMaterialId: number,
  warnings: string[]
): GeometryInputRebarView[] => {
  if (!sheet) return []
  const headers = headerMap(sheet)
  for (const header of ['id', 'Dia', 'X', 'Y']) {
    if (!headers.has(normalizedHeader(header))) {
      throw new Error(`Rebars sheet is missing the "${header}" column.`)
    }
  }

  const rebars: GeometryInputRebarView[] = []
  const usedIds = new Set<number>()
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber)
    if (row.cellCount === 0) continue
    const idValue = readCell(row, headers, 'id')
    if (idValue == null || String(idValue).trim() === '') continue
    const id = positiveInteger(idValue, `Rebars row ${rowNumber} id`)
    if (usedIds.has(id)) throw new Error(`Rebars row ${rowNumber}: duplicate id ${id}.`)
    usedIds.add(id)
    const dia = finiteNumber(readCell(row, headers, 'Dia'), `Rebars row ${rowNumber} Dia`)
    if (dia <= 0) throw new Error(`Rebars row ${rowNumber}: Dia must be greater than zero.`)
    rebars.push({
      id,
      solidIndex: 0,
      dia,
      x: finiteNumber(readCell(row, headers, 'X'), `Rebars row ${rowNumber} X`),
      y: finiteNumber(readCell(row, headers, 'Y'), `Rebars row ${rowNumber} Y`),
      steelMaterialId: resolveMaterialId(
        readCell(row, headers, 'Mat'),
        materials,
        defaultMaterialId,
        warnings,
        rowNumber
      )
    })
  }
  return rebars
}

const readWorkbook = async (buffer: ArrayBuffer) => {
  const ExcelJS = await excelModule()
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  return workbook
}

type RingEntry = { order: number; point: Point2 }

const toRing = (entries: RingEntry[], label: string) => {
  const ordered = [...entries].sort((a, b) => a.order - b.order)
  if (ordered.length < 3) throw new Error(`${label} must contain at least three vertices.`)
  return ordered.map((entry) => entry.point)
}

const parseBoundarySheet = (sheet: import('exceljs').Worksheet): Point2[][][] => {
  const headers = headerMap(sheet)
  for (const header of ['Outer', 'Hole', 'id', 'X', 'Y']) {
    if (!headers.has(normalizedHeader(header))) {
      throw new Error(`Boundary sheet is missing the "${header}" column.`)
    }
  }

  type OuterEntry = { rings: Map<number, RingEntry[]> }
  const grouped = new Map<number, OuterEntry>()
  const usedPointIds = new Set<number>()

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber)
    if (row.cellCount === 0) continue
    const outerRaw = readCell(row, headers, 'Outer')
    if (outerRaw == null || String(outerRaw).trim() === '') continue
    const outerNo = positiveInteger(outerRaw, `Boundary row ${rowNumber} Outer`)
    const holeNo = nonNegativeInteger(readCell(row, headers, 'Hole'), `Boundary row ${rowNumber} Hole`)
    const id = positiveInteger(readCell(row, headers, 'id'), `Boundary row ${rowNumber} id`)
    if (usedPointIds.has(id)) throw new Error(`Boundary row ${rowNumber}: duplicate id ${id}.`)
    usedPointIds.add(id)
    const entry = grouped.get(outerNo) ?? { rings: new Map<number, RingEntry[]>() }
    const ring = entry.rings.get(holeNo) ?? []
    ring.push({
      order: ring.length + 1,
      point: {
        id,
        x: finiteNumber(readCell(row, headers, 'X'), `Boundary row ${rowNumber} X`),
        y: finiteNumber(readCell(row, headers, 'Y'), `Boundary row ${rowNumber} Y`)
      }
    })
    entry.rings.set(holeNo, ring)
    grouped.set(outerNo, entry)
  }

  if (grouped.size === 0) throw new Error('The Boundary sheet does not contain any points.')
  const outerNumbers = [...grouped.keys()].sort((a, b) => a - b)
  if (outerNumbers.some((number, index) => number !== index + 1)) {
    throw new Error('Outer values must form a continuous sequence starting at 1.')
  }
  return outerNumbers.map((outerNo) => {
    const entry = grouped.get(outerNo)!
    const holeNumbers = [...entry.rings.keys()].sort((a, b) => a - b)
    if (!holeNumbers.includes(0)) throw new Error(`Outer ${outerNo} is missing its outer ring (Hole = 0).`)
    return holeNumbers.map((holeNo) =>
      toRing(entry.rings.get(holeNo)!, holeNo === 0 ? `Outer ${outerNo}` : `Outer ${outerNo} Hole ${holeNo}`)
    )
  })
}

export const importSectionWorkbook = async (
  buffer: ArrayBuffer,
  materials: SteelMaterial[],
  defaultMaterialId: number,
  fallbackName = 'Imported section'
): Promise<ImportedSectionWorkbook> => {
  const workbook = await readWorkbook(buffer)
  const boundarySheet = workbook.getWorksheet('Boundary')
  if (!boundarySheet) throw new Error('The workbook does not contain a Boundary sheet.')

  const outers = parseBoundarySheet(boundarySheet)
  const warnings: string[] = []
  const rebars = parseRebarsSheet(
    workbook.getWorksheet('Rebars'),
    materials,
    defaultMaterialId,
    warnings
  )
  const name = fallbackName.trim() || 'Imported section'
  const summary = summarizeSection({
    id: 1,
    name,
    solids: outers.map((rings) => createSectionSolid(rings[0], rings.slice(1)))
  })
  if (summary.area <= 0) throw new Error('The imported concrete boundary has zero net area.')
  warnings.push(...summary.warnings)
  return { name, outers, rebars, warnings }
}

export const importRebarWorkbook = async (
  buffer: ArrayBuffer,
  materials: SteelMaterial[],
  defaultMaterialId: number,
  _outerCount: number
) => {
  const workbook = await readWorkbook(buffer)
  const sheet = workbook.getWorksheet('Rebars')
  if (!sheet) throw new Error('The workbook does not contain a Rebars sheet.')
  const warnings: string[] = []
  const rebars = parseRebarsSheet(sheet, materials, defaultMaterialId, warnings)
  return { rebars, warnings }
}
