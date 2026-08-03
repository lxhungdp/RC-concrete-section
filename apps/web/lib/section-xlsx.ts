import { createSectionSolid, summarizeSection, type GeometryInputRebarView, type Point2 } from '@pm/geometry'
import type { SteelMaterial } from '@pm/materials'

const SECTION_SCHEMA = 'pm-section-xlsx'
const REBAR_SCHEMA = 'pm-rebar-xlsx'
const SCHEMA_VERSION = 1

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

export const sectionWorkbookFileName = (name: string) => `${safeFileStem(name)}-section.xlsx`
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
  row.height = 22
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1677A8' } }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF0E5D86' } } }
  })
}

const styleDataSheet = (sheet: import('exceljs').Worksheet, widths: number[]) => {
  sheet.views = [{ state: 'frozen', ySplit: 1, showGridLines: false }]
  widths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width
  })
  styleHeader(sheet.getRow(1))
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: widths.length } }
}

const addInstructionsSheet = (
  workbook: import('exceljs').Workbook,
  title: string,
  schema: string,
  notes: string[]
) => {
  const sheet = workbook.addWorksheet('Instructions', { views: [{ showGridLines: false }] })
  sheet.columns = [{ width: 24 }, { width: 78 }]
  sheet.mergeCells('A1:B1')
  sheet.getCell('A1').value = title
  sheet.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FF0E5D86' } }
  sheet.getCell('A1').alignment = { vertical: 'middle' }
  sheet.getRow(1).height = 28
  sheet.addRow(['Schema', schema])
  sheet.addRow(['Version', SCHEMA_VERSION])
  sheet.addRow(['Length unit', 'mm'])
  sheet.addRow(['Coordinate system', 'X right, Y up; positive rotation is counter-clockwise'])
  sheet.addRow([])
  notes.forEach((note, index) => sheet.addRow([index === 0 ? 'Editing notes' : '', note]))
  sheet.getColumn(1).font = { bold: true, color: { argb: 'FF364152' } }
  sheet.getColumn(2).alignment = { wrapText: true, vertical: 'top' }
}

const addRebarSheet = (
  workbook: import('exceljs').Workbook,
  rebars: GeometryInputRebarView[],
  steelMaterials: SteelMaterial[]
) => {
  const materialById = new Map(steelMaterials.map((material) => [material.id, material]))
  const sheet = workbook.addWorksheet('Rebars')
  sheet.addRow(['Bar ID', 'Outer No', 'Diameter mm', 'X mm', 'Y mm', 'Material ID', 'Material Name'])
  rebars.forEach((bar) => {
    const material = bar.steelMaterialId == null ? undefined : materialById.get(bar.steelMaterialId)
    sheet.addRow([
      bar.id,
      bar.solidIndex + 1,
      bar.dia,
      bar.x,
      bar.y,
      bar.steelMaterialId ?? '',
      material?.name ?? ''
    ])
  })
  styleDataSheet(sheet, [12, 12, 16, 16, 16, 14, 24])
  sheet.getColumn(1).numFmt = '0'
  sheet.getColumn(2).numFmt = '0'
  sheet.getColumn(3).numFmt = '0.000'
  sheet.getColumn(4).numFmt = '0.000'
  sheet.getColumn(5).numFmt = '0.000'
  sheet.getColumn(6).numFmt = '0'
  return sheet
}

export const buildSectionWorkbook = async (input: SectionWorkbookInput): Promise<Uint8Array> => {
  const ExcelJS = await excelModule()
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'P-M Column Designer'
  workbook.created = new Date()

  addInstructionsSheet(workbook, 'P-M Section Exchange Workbook', SECTION_SCHEMA, [
    'Edit numeric cells directly. Do not add a repeated closing vertex; the app closes every ring automatically.',
    'OUTER rings use Hole No = 0. HOLE rings use a positive Hole No within their parent Outer No.',
    'The Rebars sheet is optional. Unknown material names are mapped to the current project default with a warning.'
  ])

  const boundary = workbook.addWorksheet('Boundary', { views: [{ showGridLines: false }] })
  boundary.columns = [{ width: 24 }, { width: 44 }]
  boundary.addRows([
    ['Property', 'Value'],
    ['Schema', SECTION_SCHEMA],
    ['Version', SCHEMA_VERSION],
    ['Name', input.name],
    ['Length unit', 'mm'],
    ['Outer count', input.outers.length],
    ['Rebar count', input.rebars.length]
  ])
  styleHeader(boundary.getRow(1))

  const vertices = workbook.addWorksheet('Vertices')
  vertices.addRow(['Outer No', 'Ring', 'Hole No', 'Vertex No', 'Point ID', 'X mm', 'Y mm'])
  input.outers.forEach((outer, outerIndex) => {
    outer.forEach((ring, ringIndex) => {
      ring.forEach((point, pointIndex) => {
        vertices.addRow([
          outerIndex + 1,
          ringIndex === 0 ? 'OUTER' : 'HOLE',
          ringIndex === 0 ? 0 : ringIndex,
          pointIndex + 1,
          point.id,
          point.x,
          point.y
        ])
      })
    })
  })
  styleDataSheet(vertices, [12, 12, 12, 14, 12, 18, 18])
  for (const column of [1, 3, 4, 5]) vertices.getColumn(column).numFmt = '0'
  vertices.getColumn(6).numFmt = '0.000'
  vertices.getColumn(7).numFmt = '0.000'

  addRebarSheet(workbook, input.rebars, input.steelMaterials)
  return toBytes(await workbook.xlsx.writeBuffer())
}

export const buildRebarWorkbook = async (input: RebarWorkbookInput): Promise<Uint8Array> => {
  const ExcelJS = await excelModule()
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'P-M Column Designer'
  workbook.created = new Date()
  addInstructionsSheet(workbook, 'P-M Rebar Exchange Workbook', REBAR_SCHEMA, [
    'This workbook changes reinforcement only. Importing it never changes the concrete boundary.',
    'Outer No is one-based. Every imported bar must belong to an existing concrete outer.',
    'Material ID or Material Name must identify a steel material in the current project.'
  ])
  const context = workbook.addWorksheet('Context', { views: [{ showGridLines: false }] })
  context.columns = [{ width: 24 }, { width: 44 }]
  context.addRows([
    ['Property', 'Value'],
    ['Schema', REBAR_SCHEMA],
    ['Version', SCHEMA_VERSION],
    ['Section name', input.sectionName],
    ['Length unit', 'mm'],
    ['Rebar count', input.rebars.length]
  ])
  styleHeader(context.getRow(1))
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

const optionalPositiveInteger = (value: unknown) => {
  if (value == null || String(value).trim() === '') return undefined
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : undefined
}

const resolveMaterialId = (
  idValue: unknown,
  nameValue: unknown,
  materials: SteelMaterial[],
  defaultMaterialId: number,
  warnings: string[],
  rowNumber: number
) => {
  const id = optionalPositiveInteger(idValue)
  if (id != null && materials.some((material) => material.id === id)) return id
  const name = String(nameValue ?? '').trim().toLowerCase()
  const named = name ? materials.find((material) => material.name.trim().toLowerCase() === name) : undefined
  if (named) return named.id
  warnings.push(`Rebars row ${rowNumber}: unknown steel material; mapped to material ${defaultMaterialId}.`)
  return defaultMaterialId
}

const parseRebarsSheet = (
  sheet: import('exceljs').Worksheet | undefined,
  materials: SteelMaterial[],
  defaultMaterialId: number,
  outerCount: number,
  warnings: string[]
): GeometryInputRebarView[] => {
  if (!sheet) return []
  const headers = headerMap(sheet)
  const required = ['Bar ID', 'Outer No', 'Diameter mm', 'X mm', 'Y mm']
  for (const header of required) {
    if (!headers.has(normalizedHeader(header))) throw new Error(`Rebars sheet is missing the "${header}" column.`)
  }
  const rebars: GeometryInputRebarView[] = []
  const usedIds = new Set<number>()
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber)
    if (row.cellCount === 0) continue
    const id = positiveInteger(readCell(row, headers, 'Bar ID'), `Rebars row ${rowNumber} Bar ID`)
    if (usedIds.has(id)) throw new Error(`Rebars row ${rowNumber}: duplicate Bar ID ${id}.`)
    usedIds.add(id)
    const outerNo = positiveInteger(readCell(row, headers, 'Outer No'), `Rebars row ${rowNumber} Outer No`)
    if (outerNo > outerCount) throw new Error(`Rebars row ${rowNumber}: Outer No ${outerNo} does not exist.`)
    const dia = finiteNumber(readCell(row, headers, 'Diameter mm'), `Rebars row ${rowNumber} Diameter mm`)
    if (dia <= 0) throw new Error(`Rebars row ${rowNumber}: Diameter mm must be greater than zero.`)
    rebars.push({
      id,
      solidIndex: outerNo - 1,
      dia,
      x: finiteNumber(readCell(row, headers, 'X mm'), `Rebars row ${rowNumber} X mm`),
      y: finiteNumber(readCell(row, headers, 'Y mm'), `Rebars row ${rowNumber} Y mm`),
      steelMaterialId: resolveMaterialId(
        readCell(row, headers, 'Material ID'),
        readCell(row, headers, 'Material Name'),
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

const metadataValue = (sheet: import('exceljs').Worksheet | undefined, key: string) => {
  if (!sheet) return undefined
  for (let rowNumber = 1; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber)
    if (String(scalar(row.getCell(1).value) ?? '').trim().toLowerCase() === key.toLowerCase()) {
      return scalar(row.getCell(2).value)
    }
  }
  return undefined
}

export const importSectionWorkbook = async (
  buffer: ArrayBuffer,
  materials: SteelMaterial[],
  defaultMaterialId: number
): Promise<ImportedSectionWorkbook> => {
  const workbook = await readWorkbook(buffer)
  const boundarySheet = workbook.getWorksheet('Boundary')
  const schema = metadataValue(boundarySheet, 'Schema')
  if (schema != null && String(schema).trim() !== SECTION_SCHEMA) {
    throw new Error(`Unsupported section workbook schema "${schema}".`)
  }
  const vertices = workbook.getWorksheet('Vertices')
  if (!vertices) throw new Error('The workbook does not contain a Vertices sheet.')
  const headers = headerMap(vertices)
  const required = ['Outer No', 'Ring', 'Hole No', 'Vertex No', 'Point ID', 'X mm', 'Y mm']
  for (const header of required) {
    if (!headers.has(normalizedHeader(header))) throw new Error(`Vertices sheet is missing the "${header}" column.`)
  }

  type RingEntry = { order: number; point: Point2 }
  type OuterEntry = { outer: RingEntry[]; holes: Map<number, RingEntry[]> }
  const grouped = new Map<number, OuterEntry>()
  const usedPointIds = new Set<number>()
  for (let rowNumber = 2; rowNumber <= vertices.rowCount; rowNumber++) {
    const row = vertices.getRow(rowNumber)
    if (row.cellCount === 0) continue
    const outerNo = positiveInteger(readCell(row, headers, 'Outer No'), `Vertices row ${rowNumber} Outer No`)
    const ringKind = String(readCell(row, headers, 'Ring') ?? '').trim().toUpperCase()
    if (ringKind !== 'OUTER' && ringKind !== 'HOLE') {
      throw new Error(`Vertices row ${rowNumber}: Ring must be OUTER or HOLE.`)
    }
    const holeNo = ringKind === 'HOLE'
      ? positiveInteger(readCell(row, headers, 'Hole No'), `Vertices row ${rowNumber} Hole No`)
      : 0
    const order = positiveInteger(readCell(row, headers, 'Vertex No'), `Vertices row ${rowNumber} Vertex No`)
    const id = positiveInteger(readCell(row, headers, 'Point ID'), `Vertices row ${rowNumber} Point ID`)
    if (usedPointIds.has(id)) throw new Error(`Vertices row ${rowNumber}: duplicate Point ID ${id}.`)
    usedPointIds.add(id)
    const entry = grouped.get(outerNo) ?? { outer: [], holes: new Map<number, RingEntry[]>() }
    const ring = ringKind === 'OUTER' ? entry.outer : entry.holes.get(holeNo) ?? []
    ring.push({
      order,
      point: {
        id,
        x: finiteNumber(readCell(row, headers, 'X mm'), `Vertices row ${rowNumber} X mm`),
        y: finiteNumber(readCell(row, headers, 'Y mm'), `Vertices row ${rowNumber} Y mm`)
      }
    })
    if (ringKind === 'HOLE') entry.holes.set(holeNo, ring)
    grouped.set(outerNo, entry)
  }

  if (grouped.size === 0) throw new Error('The Vertices sheet does not contain any boundary points.')
  const outerNumbers = [...grouped.keys()].sort((a, b) => a - b)
  if (outerNumbers.some((number, index) => number !== index + 1)) {
    throw new Error('Outer No values must form a continuous sequence starting at 1.')
  }
  const toRing = (entries: RingEntry[], label: string) => {
    const ordered = [...entries].sort((a, b) => a.order - b.order)
    if (ordered.length < 3) throw new Error(`${label} must contain at least three vertices.`)
    if (new Set(ordered.map((entry) => entry.order)).size !== ordered.length) {
      throw new Error(`${label} contains duplicate Vertex No values.`)
    }
    return ordered.map((entry) => entry.point)
  }
  const outers = outerNumbers.map((outerNo) => {
    const entry = grouped.get(outerNo)!
    const holes = [...entry.holes.entries()]
      .sort(([a], [b]) => a - b)
      .map(([holeNo, entries]) => toRing(entries, `Outer ${outerNo} Hole ${holeNo}`))
    return [toRing(entry.outer, `Outer ${outerNo}`), ...holes]
  })
  const warnings: string[] = []
  const rebars = parseRebarsSheet(
    workbook.getWorksheet('Rebars'),
    materials,
    defaultMaterialId,
    outers.length,
    warnings
  )
  const name = String(metadataValue(boundarySheet, 'Name') ?? 'Imported section').trim() || 'Imported section'
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
  outerCount: number
) => {
  const workbook = await readWorkbook(buffer)
  const schema = metadataValue(workbook.getWorksheet('Context'), 'Schema')
  if (schema != null && String(schema).trim() !== REBAR_SCHEMA) {
    throw new Error(`Unsupported rebar workbook schema "${schema}".`)
  }
  const warnings: string[] = []
  const sheet = workbook.getWorksheet('Rebars')
  if (!sheet) throw new Error('The workbook does not contain a Rebars sheet.')
  const rebars = parseRebarsSheet(sheet, materials, defaultMaterialId, outerCount, warnings)
  return { rebars, warnings }
}
