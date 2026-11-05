import type { Cell, Workbook } from 'exceljs'
import { QUANTITY_UNIT_OPTIONS, UNIT_PRESETS, fromCanonical, toCanonical, quantityUnit, parseQuantityUnitSelection, parseUnitSelection, type Quantity, type UnitContext, type UnitSelection, type QuantityUnitSelection } from '@pm/units'

/** A declared transport context, independent of the active browser preference. */
export const CANONICAL_WORKBOOK_UNITS: UnitSelection = parseUnitSelection({ version: 2,
  groups: { ...UNIT_PRESETS.metric.groups, force: 'N', moment: 'N·mm' } })

export type QuantityCell = { readonly kind: 'quantity'; readonly quantity: Quantity; readonly canonical: number; readonly units: UnitContext }
export const quantityCell = (quantity: Quantity, canonical: number, units: UnitContext): QuantityCell => ({ kind: 'quantity', quantity, canonical, units })
const SOURCE_PREFIX = 'pm-unit-source/v1 '
/** A calculated value cannot claim the canonical precision record of its former literal. */
export const evaluatedCellNote = (formula: boolean, note: string | null): string | undefined =>
  formula && note?.startsWith(SOURCE_PREFIX) ? undefined : note ?? undefined
/** Exact no-op transport where binary64 display conversion is not invertible. The visible numeric
 * value stays authoritative: an authored change always converts using the declared source unit. */
export function encodeQuantityCell(source: QuantityCell): { value: number; note?: string } {
  const displayed = fromCanonical(source.quantity, source.canonical, source.units)
  if (!Object.is(toCanonical(source.quantity, displayed, source.units), source.canonical)) {
    return { value: displayed, note: SOURCE_PREFIX + JSON.stringify({ quantity: source.quantity, unit: quantityUnit(source.quantity, source.units),
      canonical: source.canonical, displayed }) }
  }
  return { value: displayed }
}
export function writeQuantityCell(cell: Cell, source: QuantityCell) {
  const encoded = encodeQuantityCell(source)
  cell.value = encoded.value
  if (encoded.note !== undefined) cell.note = encoded.note
}
export function readQuantityCell(quantity: Quantity, displayed: number, units: UnitContext, note: Cell['note'] | undefined): number {
  const plain = typeof note === 'string' ? note : note?.texts?.map(text => text.text ?? '').join('') ?? ''
  if (plain.startsWith(SOURCE_PREFIX)) {
    const source: unknown = JSON.parse(plain.slice(SOURCE_PREFIX.length))
    if (!source || typeof source !== 'object' || Array.isArray(source)) throw Error('Invalid quantity source record.')
    const record = source as Record<string, unknown>
    if (Object.keys(record).sort().join() !== 'canonical,displayed,quantity,unit' || record.quantity !== quantity ||
        typeof record.canonical !== 'number' || typeof record.displayed !== 'number' || typeof record.unit !== 'string') throw Error('Invalid quantity source record.')
    // A changed unit declaration describes a new authored interpretation, never a retained value.
    if (record.unit === quantityUnit(quantity, units)) {
      if (fromCanonical(quantity, record.canonical, units) !== record.displayed) throw Error('Inconsistent quantity source record.')
      if (displayed === record.displayed) return record.canonical
    }
  }
  return toCanonical(quantity, displayed, units)
}
export function writeWorkbookUnits(book: Workbook, selection: UnitContext, kind: string) {
  const validated = parseQuantityUnitSelection({ version: 1, groups: Object.fromEntries(
    (Object.keys(QUANTITY_UNIT_OPTIONS) as Array<keyof typeof QUANTITY_UNIT_OPTIONS>).map(quantity => [quantity, quantityUnit(quantity, selection)])) })
  const sheet = book.addWorksheet('Units')
  sheet.addRow(['pm-presentation-units', 1, kind])
  sheet.addRow(['Quantity', 'Unit'])
  for (const [quantity, unit] of Object.entries(validated.groups)) sheet.addRow([quantity, unit])
  sheet.getColumn(1).width = 24
  sheet.getColumn(2).width = 24
  sheet.state = 'hidden'
}
export function readWorkbookUnits(book: Workbook, kind: string): QuantityUnitSelection {
  const sheet = book.getWorksheet('Units')
  if (!sheet || sheet.rowCount > 100 || sheet.columnCount > 64) throw Error('Missing or unsupported workbook unit declaration.')
  const rows: Array<Array<string | number>> = []
  sheet.eachRow(row => {
    const values: Array<string | number> = []
    row.eachCell(cell => {
      if (cell.value == null || cell.value === '') return
      if (typeof cell.value !== 'string' && typeof cell.value !== 'number') throw Error('Units require plain text/numeric declarations.')
      values.push(cell.value)
    })
    if (values.length && !(values.length === 1 && String(values[0]).trimStart().startsWith('#'))) rows.push(values)
  })
  if (rows.length !== Object.keys(QUANTITY_UNIT_OPTIONS).length + 2 || rows[0].length !== 3 ||
      rows[0][0] !== 'pm-presentation-units' || rows[0][1] !== 1 || rows[0][2] !== kind ||
      rows[1].length !== 2 || rows[1][0] !== 'Quantity' || rows[1][1] !== 'Unit') throw Error('Missing or unsupported workbook unit declaration.')
  const groups: Record<string, string> = {}
  for (const [index, row] of rows.slice(2).entries()) {
    const [key, value] = row
    if (row.length !== 2 || typeof key !== 'string' || typeof value !== 'string' || Object.hasOwn(groups, key)) throw Error(`Units row ${index + 3}: invalid or duplicate unit declaration.`)
    groups[key] = value
  }
  return parseQuantityUnitSelection({ version: 1, groups })
}
