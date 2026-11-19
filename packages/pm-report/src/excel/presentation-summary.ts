import { CANONICAL_UNITS, fromCanonical, parseUnitSelection, quantityUnit, type Quantity, type UnitSelection } from '@pm/units'
import type { Workbook } from 'exceljs'
import type { SectionGeometry, GeometryInputRebarView } from '@pm/geometry'
import type { MaterialStore } from '@pm/materials'
import { parseLoadReference, resultantAtLoadReference, type LoadReference } from '@pm/project'

type Resultant = { P: number; Mx: number; My: number }
type Input = {
  loadReference?: LoadReference
  presentationUnits?: UnitSelection
  section: SectionGeometry
  rebars: readonly GeometryInputRebarView[]
  materialStore?: MaterialStore
  loadcases?: readonly (Resultant & { name: string })[]
  loadcase?: (Resultant & { name: string }) | null
  surface?: { bounds: { P: readonly number[]; Mx: readonly number[]; My: readonly number[] } }
  point?: Resultant
  states?: readonly { label: string; point: Resultant }[]
}
/** UNITS-006: explicit canonical source fields only; existing formula cells, IDs and ledgers are untouched. */
export function appendPresentationSummary(book: Workbook, input: Input) {
  if (input.loadReference) {
    const reference = parseLoadReference(input.loadReference)
    const referenceSheet = book.addWorksheet('Load reference')
    referenceSheet.addRow(['PREVIEW — applied input reference'])
    referenceSheet.addRow(['Origin', 'Exact net-concrete centroid + offsets; axes remain parallel'])
    referenceSheet.addRow(['Offset X (mm)', reference.offsetX])
    referenceSheet.addRow(['Offset Y (mm)', reference.offsetY])
    referenceSheet.addRow(['Calculation and formula audit sheets use centroidal moments. Input copies about O are listed separately.'])
    referenceSheet.addRow(['Name', 'P (N)', 'Mx at C (N.mm)', 'My at C (N.mm)', 'Mux at O (N.mm)', 'Muy at O (N.mm)'])
    for (const load of input.loadcases ?? []) {
      const atO = resultantAtLoadReference(load, reference)
      referenceSheet.addRow([load.name, load.P, load.Mx, load.My, atO.Mx, atO.My])
    }
    referenceSheet.columns.forEach(column => { column.width = 27 })
  }
  if (!input.presentationUnits) return
  const units = parseUnitSelection(input.presentationUnits)
  const sheet = book.addWorksheet('Display')
  sheet.addRow(['PREVIEW — selected display units'])
  sheet.addRow(['Formula audit sheets retain their declared calculation units. This sheet converts copies only.'])
  sheet.addRow(['Item', 'Quantity', 'Canonical value', 'Canonical unit', 'Display value', 'Display unit'])
  const add = (label: string, quantity: Quantity, value: number) => {
    sheet.addRow([label, quantity, value, CANONICAL_UNITS[quantity], fromCanonical(quantity, value, units), quantityUnit(quantity, units)])
  }
  const vector = (label: string, value: Resultant) => {
    add(`${label} · P`, 'force', value.P)
    add(`${label} · Mx`, 'moment', value.Mx)
    add(`${label} · My`, 'moment', value.My)
  }
  for (const [group, unit] of Object.entries(units.groups)) sheet.addRow([`Display preference · ${group}`, '', '', '', '', unit])
  input.rebars.forEach(bar => {
    add(`Bar #${bar.id} · diameter`, 'barDiameter', bar.dia)
    add(`Bar #${bar.id} · x`, 'length', bar.x)
    add(`Bar #${bar.id} · y`, 'length', bar.y)
  })
  if (input.materialStore) {
    add('Concrete · fck', 'stress', input.materialStore.concrete.fck)
    input.materialStore.steel.forEach(steel => { add(`${steel.name} · fy`, 'stress', steel.fy); add(`${steel.name} · Es`, 'modulus', steel.elasticModulus) })
  }
  for (const load of input.loadcases ?? (input.loadcase ? [input.loadcase] : [])) vector(`Demand · ${load.name}`, load)
  if (input.surface) for (const [component, quantity] of [['P', 'force'], ['Mx', 'moment'], ['My', 'moment']] as const) {
    input.surface.bounds[component].forEach((value, index) => add(`Stored surface bound · ${component} · ${index === 0 ? 'min' : 'max'}`, quantity, value))
  }
  if (input.point) vector('Selected stored result', input.point)
  input.states?.forEach(state => vector(state.label, state.point))
  sheet.columns.forEach((column, index) => { column.width = index === 0 ? 54 : 24 })
  sheet.getRow(3).font = { bold: true }
  sheet.getColumn(3).numFmt = '0.###############E+00'
  sheet.getColumn(5).numFmt = '0.###############E+00'
}
