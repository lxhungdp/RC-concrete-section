/** UNITS-001..006: presentation boundaries only; canonical P-M numbers never change on selection. */
export { UnitConversionError } from '@jscad/engineering-units'
import { convertQuantity, US_DEFINITIONS, UnitConversionError, type ConvertibleQuantity } from '@jscad/engineering-units'

export type Quantity = 'length' | 'barDiameter' | 'area' | 'inertia' | 'sectionModulus' |
  'force' | 'moment' | 'stress' | 'modulus' | 'curvature' | 'density'
export const UNIT_OPTIONS = {
  length: ['mm', 'cm', 'm', 'in', 'ft'],
  force: ['N', 'kN', 'lbf', 'kip'],
  moment: ['N·mm', 'N·m', 'kN·mm', 'kN·m', 'lbf·in', 'lbf·ft', 'kip·in', 'kip·ft'],
  stress: ['MPa', 'GPa', 'psi', 'ksi'],
  density: ['kg/m³', 'lbm/ft³']
} as const
export type UnitGroup = keyof typeof UNIT_OPTIONS
export type UnitGroups = { readonly [K in UnitGroup]: (typeof UNIT_OPTIONS)[K][number] }
export type UnitSelection = Readonly<{ version: 2; groups: UnitGroups }>
/** Explicit source units in editable workbooks remain independent of UI grouping. */
export const QUANTITY_UNIT_OPTIONS = { ...UNIT_OPTIONS, barDiameter: UNIT_OPTIONS.length, modulus: UNIT_OPTIONS.stress } as const
type QuantityUnitGroups = { readonly [K in keyof typeof QUANTITY_UNIT_OPTIONS]: (typeof QUANTITY_UNIT_OPTIONS)[K][number] }
export type QuantityUnitSelection = Readonly<{ version: 1; groups: QuantityUnitGroups }>
export type UnitContext = Readonly<{ groups: UnitGroups & Partial<Pick<QuantityUnitGroups, 'barDiameter' | 'modulus'>> }>
export const UNIT_PRESETS: Readonly<Record<'metric' | 'us', UnitSelection>> = Object.freeze({
  metric: Object.freeze({ version: 2, groups: Object.freeze({
    length: 'mm', force: 'kN', moment: 'kN·m', stress: 'MPa', density: 'kg/m³'
  }) }),
  us: Object.freeze({ version: 2, groups: Object.freeze({
    length: 'in', force: 'kip', moment: 'kip·ft', stress: 'ksi', density: 'lbm/ft³'
  }) })
})
export const CANONICAL_UNITS: Readonly<Record<Quantity, string>> = Object.freeze({
  length: 'mm', barDiameter: 'mm', area: 'mm²', inertia: 'mm⁴', sectionModulus: 'mm³',
  force: 'N', moment: 'N·mm', stress: 'MPa', modulus: 'MPa', curvature: 'mm⁻¹', density: 'kg/m³'
})
export const DISPLAY_UNITS_STORAGE_KEY = 'pm-column.display-units.v2'
/** Unmigrated v1 preference, removed on load so no stale browser entry outlives its reader. */
export const RETIRED_DISPLAY_UNITS_STORAGE_KEY = 'pm-column.display-units.v1'
export const DISPLAY_UNIT_COMMAND_EFFECT = 'RETAIN' as const

export function parseUnitSelection(raw: unknown): UnitSelection {
  return parseSelection(raw, 2, UNIT_OPTIONS)
}
export function parseQuantityUnitSelection(raw: unknown): QuantityUnitSelection {
  return parseSelection(raw, 1, QUANTITY_UNIT_OPTIONS)
}
function parseSelection<V extends number, T extends Record<string, readonly string[]>>(raw: unknown, version: V, options: T): Readonly<{
  version: V; groups: { readonly [K in keyof T]: T[K][number] }
}> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new UnitConversionError('E-UNIT-SYMBOL', 'Invalid display unit selection')
  const item = raw as Record<string, unknown>
  if (Object.keys(item).sort().join() !== 'groups,version' || item.version !== version ||
      !item.groups || typeof item.groups !== 'object' || Array.isArray(item.groups)) {
    throw new UnitConversionError('E-UNIT-SYMBOL', 'Unsupported display unit preference')
  }
  const groups = item.groups as Record<string, unknown>
  if (Object.keys(groups).sort().join() !== Object.keys(options).sort().join() ||
      Object.entries(options).some(([key, choices]) => !(choices as readonly unknown[]).includes(groups[key]))) {
    throw new UnitConversionError('E-UNIT-SYMBOL', 'Unsupported display unit group')
  }
  const selected = Object.freeze({ ...groups }) as { readonly [K in keyof T]: T[K][number] }
  return Object.freeze({ version, groups: selected })
}
export function selectUnit<K extends UnitGroup>(selection: UnitSelection, group: K, unit: UnitGroups[K]): UnitSelection {
  return parseUnitSelection({ version: 2, groups: { ...selection.groups, [group]: unit } })
}
export function quantityUnit(quantity: Quantity, selection: UnitContext): string {
  const length = selection.groups.length
  switch (quantity) {
    case 'barDiameter': return selection.groups.barDiameter ?? length
    case 'modulus': return selection.groups.modulus ?? selection.groups.stress
    case 'area': return `${length}²`
    case 'inertia': return `${length}⁴`
    case 'sectionModulus': return `${length}³`
    case 'curvature': return `${length}⁻¹`
    default: return selection.groups[quantity]
  }
}
const sharedRole = (quantity: Quantity): ConvertibleQuantity => quantity === 'barDiameter' ? 'length' : quantity as ConvertibleQuantity
const representable = (value: number, converted: number): number => {
  if (!Number.isFinite(value)) throw new UnitConversionError('E-UNIT-NONFINITE', 'A finite number is required')
  if (!Number.isFinite(converted) || (value !== 0 && converted === 0)) throw new UnitConversionError('E-UNIT-REPRESENTATION', 'Conversion overflow or nonzero underflow')
  return converted
}
/** Explicit source/target conversion, never an inferred scale or a new engineering equation. */
export function convertUnit(quantity: Quantity, value: number, source: string, target: string): number {
  if (!Object.hasOwn(CANONICAL_UNITS, quantity)) throw new UnitConversionError('E-UNIT-QUANTITY', `Unsupported quantity: ${quantity}`)
  if (quantity === 'curvature') {
    const lengths: Readonly<Record<string, string>> = { 'mm⁻¹': 'mm', 'cm⁻¹': 'cm', 'm⁻¹': 'm', 'in⁻¹': 'in', 'ft⁻¹': 'ft' }
    if (!lengths[source] || !lengths[target]) throw new UnitConversionError('E-UNIT-SYMBOL', 'Unsupported curvature unit')
    return representable(value, value * convertQuantity('length', 1, lengths[target], lengths[source]))
  }
  if (quantity === 'density') {
    // NIST SP 811: international pound mass / international foot cubed; not force density.
    const scales: Readonly<Record<string, number>> = { 'kg/m³': 1, 'lbm/ft³': US_DEFINITIONS.poundMass / US_DEFINITIONS.foot ** 3 }
    if (!Object.hasOwn(scales, source) || !Object.hasOwn(scales, target)) throw new UnitConversionError('E-UNIT-SYMBOL', 'Unsupported mass density unit')
    return representable(value, value * (scales[source] / scales[target]))
  }
  return convertQuantity(sharedRole(quantity), value, source, target)
}
export function fromCanonical(quantity: Quantity, value: number, selection: UnitContext): number {
  return convertUnit(quantity, value, CANONICAL_UNITS[quantity], quantityUnit(quantity, selection))
}
export function toCanonical(quantity: Quantity, value: number, selection: UnitContext): number {
  return convertUnit(quantity, value, quantityUnit(quantity, selection), CANONICAL_UNITS[quantity])
}
export function parseNumericText(text: string): number {
  const raw = text.trim()
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(raw)) throw new UnitConversionError('E-UNIT-NONFINITE', 'Enter a finite decimal number')
  const number = Number(raw)
  if (!Number.isFinite(number) || (number === 0 && /[1-9]/.test(raw.split(/e/i)[0]))) throw new UnitConversionError('E-UNIT-REPRESENTATION', 'Number is outside the supported range')
  return number
}
export function editableQuantity(quantity: Quantity, canonical: number, selection: UnitContext): string {
  const displayed = fromCanonical(quantity, canonical, selection)
  const raw = String(displayed)
  for (let digits = 1; digits <= 17; digits++) {
    const candidate = Number(displayed.toPrecision(digits))
    if (String(candidate).length < raw.length && toCanonical(quantity, candidate, selection) === canonical) return String(candidate)
  }
  return raw
}
export function commitQuantity(quantity: Quantity, text: string, original: number, selection: UnitContext): number {
  const parsed = parseNumericText(text)
  return parsed === Number(editableQuantity(quantity, original, selection)) ? original : toCanonical(quantity, parsed, selection)
}
export function formatQuantity(quantity: Quantity, canonical: number, selection: UnitContext, digits = 3): string {
  const displayed = fromCanonical(quantity, canonical, selection)
  const rounded = displayed.toLocaleString('en-US', { maximumFractionDigits: digits })
  return displayed !== 0 && Number(rounded.replaceAll(',', '')) === 0 ? displayed.toExponential(digits) : rounded
}
/** Presentation only. Never seed an editing draft or no-op commit with this rounded text. */
export function formatInputQuantity(quantity: Quantity, canonical: number, selection: UnitContext): string {
  return formatQuantity(quantity, canonical, selection, quantity === 'modulus' ? 1 : 3).replaceAll(',', '')
}
/** Unit-specific field adapters for declared material/project transport fields. */
export function fieldQuantity(path: string): Quantity | null {
  if (path === 'stressStrain.ultimateStrength.stress') return 'stress'
  const key = path.split('.').at(-1)
  if (key === 'elasticModulus') return 'modulus'
  if (['fck', 'fy', 'yieldStressThreshold'].includes(key ?? '')) return 'stress'
  if (['cellSize', 'constantMm'].includes(key ?? '')) return 'length'
  if (key === 'mc') return 'density'
  return null
}
