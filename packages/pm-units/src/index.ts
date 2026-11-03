/** UNITS-001..006: presentation boundaries only; canonical P-M numbers never change on selection. */
export { UnitConversionError } from '@jscad/engineering-units'
import { convertQuantity, US_DEFINITIONS, UnitConversionError, type ConvertibleQuantity } from '@jscad/engineering-units'

export type Quantity = 'length' | 'barDiameter' | 'area' | 'inertia' | 'sectionModulus' |
  'force' | 'moment' | 'stress' | 'modulus' | 'curvature' | 'density'
export const UNIT_OPTIONS = {
  length: ['mm', 'cm', 'm', 'in', 'ft'], barDiameter: ['mm', 'in'],
  force: ['N', 'kN', 'lbf', 'kip'],
  moment: ['N·mm', 'N·m', 'kN·mm', 'kN·m', 'lbf·in', 'lbf·ft', 'kip·in', 'kip·ft'],
  stress: ['MPa', 'psi', 'ksi'], modulus: ['MPa', 'GPa', 'psi', 'ksi'],
  density: ['kg/m³', 'lbm/ft³']
} as const
export type UnitGroup = keyof typeof UNIT_OPTIONS
export type UnitGroups = { readonly [K in UnitGroup]: (typeof UNIT_OPTIONS)[K][number] }
export type UnitSelection = Readonly<{ version: 1; preset: 'metric' | 'us' | 'custom'; groups: UnitGroups }>
export const UNIT_PRESETS: Readonly<Record<'metric' | 'us', UnitSelection>> = Object.freeze({
  metric: Object.freeze({ version: 1, preset: 'metric', groups: Object.freeze({
    length: 'mm', barDiameter: 'mm', force: 'kN', moment: 'kN·m', stress: 'MPa', modulus: 'MPa', density: 'kg/m³'
  }) }),
  us: Object.freeze({ version: 1, preset: 'us', groups: Object.freeze({
    length: 'in', barDiameter: 'in', force: 'kip', moment: 'kip·ft', stress: 'ksi', modulus: 'ksi', density: 'lbm/ft³'
  }) })
})
export const CANONICAL_UNITS: Readonly<Record<Quantity, string>> = Object.freeze({
  length: 'mm', barDiameter: 'mm', area: 'mm²', inertia: 'mm⁴', sectionModulus: 'mm³',
  force: 'N', moment: 'N·mm', stress: 'MPa', modulus: 'MPa', curvature: 'mm⁻¹', density: 'kg/m³'
})
export const DISPLAY_UNITS_STORAGE_KEY = 'pm-column.display-units.v1'
export const DISPLAY_UNIT_COMMAND_EFFECT = 'RETAIN' as const

export function parseUnitSelection(raw: unknown): UnitSelection {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new UnitConversionError('E-UNIT-SYMBOL', 'Invalid display unit selection')
  const item = raw as Record<string, unknown>
  if (Object.keys(item).sort().join() !== 'groups,preset,version' || item.version !== 1 ||
      !['metric', 'us', 'custom'].includes(String(item.preset)) || !item.groups || typeof item.groups !== 'object' || Array.isArray(item.groups)) {
    throw new UnitConversionError('E-UNIT-SYMBOL', 'Unsupported display unit preference')
  }
  const groups = item.groups as Record<string, unknown>
  if (Object.keys(groups).sort().join() !== Object.keys(UNIT_OPTIONS).sort().join() ||
      Object.entries(UNIT_OPTIONS).some(([key, options]) => !(options as readonly unknown[]).includes(groups[key]))) {
    throw new UnitConversionError('E-UNIT-SYMBOL', 'Unsupported display unit group')
  }
  const selected = Object.freeze({ ...groups }) as UnitGroups
  if (item.preset !== 'custom' && JSON.stringify(selected) !== JSON.stringify(UNIT_PRESETS[item.preset as 'metric' | 'us'].groups) &&
      Object.keys(UNIT_OPTIONS).some(key => selected[key as UnitGroup] !== UNIT_PRESETS[item.preset as 'metric' | 'us'].groups[key as UnitGroup])) {
    throw new UnitConversionError('E-UNIT-SYMBOL', 'Preset and selected units disagree')
  }
  return Object.freeze({ version: 1, preset: item.preset as UnitSelection['preset'], groups: selected })
}
export function selectUnit<K extends UnitGroup>(selection: UnitSelection, group: K, unit: UnitGroups[K]): UnitSelection {
  return parseUnitSelection({ version: 1, preset: 'custom', groups: { ...selection.groups, [group]: unit } })
}
export function quantityUnit(quantity: Quantity, selection: UnitSelection): string {
  const length = selection.groups.length
  switch (quantity) {
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
export function fromCanonical(quantity: Quantity, value: number, selection: UnitSelection): number {
  return convertUnit(quantity, value, CANONICAL_UNITS[quantity], quantityUnit(quantity, selection))
}
export function toCanonical(quantity: Quantity, value: number, selection: UnitSelection): number {
  return convertUnit(quantity, value, quantityUnit(quantity, selection), CANONICAL_UNITS[quantity])
}
export function parseNumericText(text: string): number {
  const raw = text.trim()
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(raw)) throw new UnitConversionError('E-UNIT-NONFINITE', 'Enter a finite decimal number')
  const number = Number(raw)
  if (!Number.isFinite(number) || (number === 0 && /[1-9]/.test(raw.split(/e/i)[0]))) throw new UnitConversionError('E-UNIT-REPRESENTATION', 'Number is outside the supported range')
  return number
}
export function editableQuantity(quantity: Quantity, canonical: number, selection: UnitSelection): string {
  const displayed = fromCanonical(quantity, canonical, selection)
  const raw = String(displayed)
  for (let digits = 1; digits <= 17; digits++) {
    const candidate = Number(displayed.toPrecision(digits))
    if (String(candidate).length < raw.length && toCanonical(quantity, candidate, selection) === canonical) return String(candidate)
  }
  return raw
}
export function commitQuantity(quantity: Quantity, text: string, original: number, selection: UnitSelection): number {
  const parsed = parseNumericText(text)
  return parsed === Number(editableQuantity(quantity, original, selection)) ? original : toCanonical(quantity, parsed, selection)
}
export function formatQuantity(quantity: Quantity, canonical: number, selection: UnitSelection, digits = 3): string {
  const displayed = fromCanonical(quantity, canonical, selection)
  const rounded = displayed.toLocaleString('en-US', { maximumFractionDigits: digits })
  return displayed !== 0 && Number(rounded.replaceAll(',', '')) === 0 ? displayed.toExponential(digits) : rounded
}
/** Presentation only. Never seed an editing draft or no-op commit with this rounded text. */
export function formatInputQuantity(quantity: Quantity, canonical: number, selection: UnitSelection): string {
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
