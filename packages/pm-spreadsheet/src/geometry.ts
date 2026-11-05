import { allocateIds, GEOMETRY_INPUT_LIMITS, geometryInputFromOuterRings, rebarArea, rebarAreaSource,
  validateGeometryInput, validatePolygonSection, type GeometryInputRebarView, type Point2, type SectionGeometry } from '@pm/geometry'
import { quantityUnit, type UnitContext } from '@pm/units'
import { blankCell, failSheet, numericSheetCell, prepareSheetWorkbook, quantityFromSheet, readSheetRows,
  readSheetWorkbook, sheetRowIds, type SheetCell } from './table'
import { quantityCell, readWorkbookUnits, writeQuantityCell, writeWorkbookUnits } from './workbook-units'

export type CoordinateTarget = Readonly<{
  id: number; name: string; outers: Point2[][][]; rebars: GeometryInputRebarView[]
  outerIndex: number; ringIndex: number
}>
export type CoordinateSheetContext = Readonly<{ units: UnitContext; headers: readonly string[]; target: CoordinateTarget }>
export type RebarTarget = Readonly<{
  section: SectionGeometry; rebars: GeometryInputRebarView[]; steelMaterials: readonly { id: number; name: string }[]
  defaultSteelMaterialId: number
}>
export type RebarSheetContext = Readonly<{ units: UnitContext; headers: readonly string[]; target: RebarTarget }>
export const coordinateHeaders = (units: UnitContext) => ['ID', `X (${quantityUnit('length', units)})`, `Y (${quantityUnit('length', units)})`]
export const rebarHeaders = (units: UnitContext) => ['ID', `Dia (${quantityUnit('barDiameter', units)})`, `As (${quantityUnit('area', units)})`, 'Material ID', `X (${quantityUnit('length', units)})`, `Y (${quantityUnit('length', units)})`]
const COORDINATES_KIND = 'pm-coordinate-table-v1', REBAR_KIND = 'pm-rebar-table-v1'

async function newBook(kind: string, units: UnitContext) {
  const imported = await import('exceljs'), ExcelJS = imported.default ?? imported
  const book = new ExcelJS.Workbook()
  writeWorkbookUnits(book, units, kind)
  return book
}
export async function buildCoordinateWorkbook(points: readonly Point2[], units: UnitContext): Promise<Uint8Array> {
  const book = await newBook(COORDINATES_KIND, units), sheet = book.addWorksheet('Coordinates')
  sheet.addRow(coordinateHeaders(units))
  for (const point of points) {
    const row = sheet.addRow([point.id])
    writeQuantityCell(row.getCell(2), quantityCell('length', point.x, units))
    writeQuantityCell(row.getCell(3), quantityCell('length', point.y, units))
  }
  for (const column of [2, 3]) { sheet.getColumn(column).width = 20; sheet.getColumn(column).numFmt = '0.000' }
  return new Uint8Array(await book.xlsx.writeBuffer())
}
export async function prepareCoordinateSheet(bytes: ArrayBuffer, target: CoordinateTarget) {
  const book = await readSheetWorkbook(bytes), units = readWorkbookUnits(book, COORDINATES_KIND), headers = coordinateHeaders(units)
  return prepareSheetWorkbook(book, { sheet: 'Coordinates', headers }, { units, headers, target } satisfies CoordinateSheetContext)
}

function allocatedRowIds(rows: readonly { cells: readonly SheetCell[]; row: number }[], reserved: readonly number[], previous: readonly number[]) {
  const used = sheetRowIds(rows, reserved)
  const allocated = allocateIds(rows.filter(({ cells }) => blankCell(cells[0].value)).length, new Set([...used, ...previous]))
  let index = 0
  return rows.map(({ cells }) => {
    const id = blankCell(cells[0].value) ? allocated[index++] : cells[0].value
    if (typeof id !== 'number') return failSheet('SHEET_FORMAT', 'Unable to allocate a row ID.')
    return id
  })
}
function geometryIssues(issues: readonly { path: string; code: string; message: string }[]) {
  if (issues.length) failSheet('SHEET_CELL', issues.slice(0, 8).map(issue => `${issue.path}: ${issue.message} [${issue.code}]`).join('; '))
}

export function coordinatesFromSheet(value: unknown, context: CoordinateSheetContext): Point2[] {
  const { target, units, headers } = context
  const current = target.outers[target.outerIndex]?.[target.ringIndex]
  if (!current) return failSheet('SHEET_TARGET', 'The selected coordinate ring no longer exists.')
  const reserved = target.outers.flatMap((outer, oi) => outer.flatMap((ring, ri) =>
    oi === target.outerIndex && ri === target.ringIndex ? [] : ring.map(point => point.id)))
  const rows = readSheetRows(value, headers, GEOMETRY_INPUT_LIMITS.verticesPerRing)
  const ids = allocatedRowIds(rows, reserved, current.map(point => point.id))
  const points = rows.map(({ cells, row }, index) => ({ id: ids[index],
    x: quantityFromSheet(cells[1], 'length', units, `B${row}`), y: quantityFromSheet(cells[2], 'length', units, `C${row}`) }))
  const outers = target.outers.map((outer, oi) => outer.map((ring, ri) => oi === target.outerIndex && ri === target.ringIndex ? points : ring))
  // Validate raw rings before conversion, whose editor adapter omits incomplete rings.
  geometryIssues(validatePolygonSection({ solids: outers.map(outer => ({ outer: outer[0] ?? [], holes: outer.slice(1) })), rebars: target.rebars }))
  geometryIssues(validateGeometryInput(geometryInputFromOuterRings(target.id, target.name, outers, target.rebars)))
  return points
}

export async function buildRebarTableWorkbook(target: RebarTarget, units: UnitContext): Promise<Uint8Array> {
  const book = await newBook(REBAR_KIND, units), sheet = book.addWorksheet('Rebars')
  sheet.addRow(rebarHeaders(units))
  for (const bar of target.rebars) {
    const row = sheet.addRow([bar.id, null, null, bar.steelMaterialId ?? target.defaultSteelMaterialId])
    writeQuantityCell(row.getCell(2), quantityCell('barDiameter', bar.dia, units))
    writeQuantityCell(row.getCell(3), quantityCell('area', rebarArea(bar), units))
    writeQuantityCell(row.getCell(5), quantityCell('length', bar.x, units))
    writeQuantityCell(row.getCell(6), quantityCell('length', bar.y, units))
  }
  for (const column of [2, 3, 5, 6]) { sheet.getColumn(column).width = 19; sheet.getColumn(column).numFmt = '0.000' }
  sheet.getColumn(4).width = 16
  // The ID is the foreign key; names in the independent helper legend are only labels.
  sheet.getCell('H1').value = 'Material ID'; sheet.getCell('I1').value = 'Name'
  target.steelMaterials.forEach((material, index) => { sheet.getCell(index + 2, 8).value = material.id; sheet.getCell(index + 2, 9).value = material.name })
  sheet.getColumn(9).width = 24
  return new Uint8Array(await book.xlsx.writeBuffer())
}
export async function prepareRebarTableSheet(bytes: ArrayBuffer, target: RebarTarget) {
  const book = await readSheetWorkbook(bytes), units = readWorkbookUnits(book, REBAR_KIND), headers = rebarHeaders(units)
  return prepareSheetWorkbook(book, { sheet: 'Rebars', headers }, { units, headers, target } satisfies RebarSheetContext)
}
export function rebarsFromSheet(value: unknown, context: RebarSheetContext): GeometryInputRebarView[] {
  const { target, units, headers } = context, rows = readSheetRows(value, headers, GEOMETRY_INPUT_LIMITS.rebars)
  const ids = allocatedRowIds(rows, [], target.rebars.map(bar => bar.id)), previous = new Map(target.rebars.map(bar => [bar.id, bar]))
  const materials = new Set(target.steelMaterials.map(material => material.id))
  const bars = rows.map(({ cells, row }, index): GeometryInputRebarView => {
    const dia = quantityFromSheet(cells[1], 'barDiameter', units, `B${row}`), area = quantityFromSheet(cells[2], 'area', units, `C${row}`)
    if (dia <= 0 || area <= 0) return failSheet('SHEET_CELL', `Row ${row}: Dia and As must be greater than zero.`)
    const steelMaterialId = numericSheetCell(cells[3], `D${row}`)
    if (!Number.isSafeInteger(steelMaterialId) || !materials.has(steelMaterialId)) return failSheet('SHEET_CELL', `D${row}: Enter an existing steel material ID.`)
    const original = previous.get(ids[index])
    const retained = original && Object.is(dia, original.dia) && Object.is(area, rebarArea(original))
    return { id: ids[index], solidIndex: original?.solidIndex ?? 0, dia, area,
      areaSource: retained ? rebarAreaSource(original) : { type: 'manual' },
      ...(original && original.steelMaterialId === undefined && steelMaterialId === target.defaultSteelMaterialId ? {} : { steelMaterialId }),
      x: quantityFromSheet(cells[4], 'length', units, `E${row}`), y: quantityFromSheet(cells[5], 'length', units, `F${row}`) }
  })
  geometryIssues(validatePolygonSection({ solids: target.section.solids, rebars: bars }))
  return bars
}
