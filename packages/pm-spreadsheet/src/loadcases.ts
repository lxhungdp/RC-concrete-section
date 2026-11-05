import { allocateIds, createLoadCombination, editLoadAtReference, PROJECT_INPUT_LIMITS, resultantAtCentroid, resultantAtLoadReference, type LoadCombination, type LoadReference } from '@pm/project'
import { fromCanonical, quantityUnit, type UnitContext } from '@pm/units'
import { blankCell as blank, failSheet as fail, readSheetWorkbook, prepareSheetWorkbook, readSheetRows, sheetRowIds, quantityFromSheet } from './table'
import { readWorkbookUnits } from './workbook-units'
import { loadcaseWorkbookHeaders, readLoadReferenceSheet } from './loadcase-xlsx'

export type LoadcaseSheetContext = {
  units: UnitContext
  reference: LoadReference
  headers: readonly string[]
  original?: readonly LoadCombination[]
}

export { SheetError as LoadcaseSheetError } from './table'
export function loadcaseSheetReferenceLabel(context: LoadcaseSheetContext): string {
  const { offsetX, offsetY } = context.reference
  if (offsetX === 0 && offsetY === 0) return 'at C'
  const display = (value: number) => fromCanonical('length', value, context.units).toLocaleString('en-US', { maximumFractionDigits: 3 })
  return `O−C: (${display(offsetX)}, ${display(offsetY)}) ${quantityUnit('length', context.units)}`
}
/** Metadata comes from the file, never the browser's current unit preference. */
export async function prepareLoadcaseSheet(bytes: ArrayBuffer, original?: readonly LoadCombination[]) {
  const workbook = await readSheetWorkbook(bytes)
  const units = readWorkbookUnits(workbook, 'pm-loadcases'), reference = readLoadReferenceSheet(workbook, units)
  const headers = loadcaseWorkbookHeaders(units)
  return prepareSheetWorkbook(workbook, { sheet: 'Loadcases', headers }, { units, reference, headers, original } satisfies LoadcaseSheetContext)
}

/** Read only evaluated scalar values. All validation finishes before the caller changes P-M. */
export function loadcasesFromSheet(value: unknown, context: LoadcaseSheetContext): LoadCombination[] {
  const populated = readSheetRows(value, context.headers, PROJECT_INPUT_LIMITS.combinations)
  const used = sheetRowIds(populated)
  const original = new Map(context.original?.map(item => [item.id, item]))
  const newIds = allocateIds(populated.filter(({ cells }) => blank(cells[0].value)).length, used)
  let newIndex = 0
  return populated.map(({ cells, row }) => {
    const name = cells[1]
    const nameValue = name.value == null ? '' : name.value
    if (typeof nameValue !== 'string') return fail('SHEET_CELL', `B${row}: Name must be text.`)
    const values = [2, 3, 4].map(column => {
      return quantityFromSheet(cells[column], column === 2 ? 'force' : 'moment', context.units, `${String.fromCharCode(65 + column)}${row}`)
    })
    const requestedId = typeof cells[0].value === 'number' ? cells[0].value : newIds[newIndex++]
    if (requestedId === undefined) return fail('SHEET_FORMAT', 'Unable to allocate a loadcase ID.')
    const load = createLoadCombination({ id: requestedId, name: nameValue, P: values[0], Mx: values[1], My: values[2] }, used)
    used.add(load.id)
    const previous = original.get(load.id)
    if (previous) {
      const authored = resultantAtLoadReference(previous, context.reference)
      const patch: Partial<LoadCombination> = { name: load.name }
      for (const [column, key, quantity] of [[2, 'P', 'force'], [3, 'Mx', 'moment'], [4, 'My', 'moment']] as const) {
        if (cells[column].formula || !Object.is(cells[column].value, fromCanonical(quantity, authored[key], context.units))) patch[key] = load[key]
      }
      return editLoadAtReference(previous, patch, context.reference)
    }
    return resultantAtCentroid(load, context.reference)
  })
}
