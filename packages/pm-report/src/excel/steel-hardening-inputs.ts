import type { SteelMaterial } from '@pm/materials'
import { steelHardeningWorkbookInputs } from './workbook-common'
import { setFormula, styleInput, tableBlock } from './sheet-layout'

/** Workbook-local names: no grade may borrow another grade's endpoint or tangent. */
export const steelHardeningNames = (prefix: string): Record<string, string> => Object.fromEntries([
  'steel_peak_ratio', 'steel_fu_input', 'steel_fu_model', 'steel_eps_uk',
  'steel_limit_input', 'steel_eps_limit', 'steel_Eh', 'steel_res_scale', 'gamma_s'
].map((name) => [name, `${prefix}${name}`]))

export const bindSteelFormulaNames = (formula: string, names: Readonly<Record<string, string>>) =>
  formula.replace(/\b[A-Za-z_][A-Za-z_0-9]*\b/g, (name) => names[name] ?? name)

/** Reuse the main calculation workbook's formulas, with explicit stage multipliers. */
export const writeSteelHardeningInputs = (
  sheet: import('exceljs').Worksheet,
  row: number,
  material: SteelMaterial,
  names: Readonly<Record<string, string>>,
  defineName: (location: string, name: string) => void
): number => {
  const inputs = steelHardeningWorkbookInputs(material)
  if (inputs.length === 0) return row
  const entries = [
    { label: 'Stage resistance multiplier', value: material.factors?.resistanceScale ?? 1, unit: '-', name: 'steel_res_scale' },
    { label: 'Stage partial factor', value: material.factors?.gammaS ?? 1, unit: '-', name: 'gamma_s' },
    ...inputs
  ]
  const first = tableBlock(sheet, row, `Steel ${material.id} hardening inputs`, ['Parameter', 'Value', 'Unit'])
  entries.forEach((entry, index) => {
    const current = first + index
    sheet.getCell(current, 1).value = entry.label
    sheet.getCell(current, 3).value = entry.unit
    const name = names[entry.name]
    if (!name) throw new Error(`Hardening workbook name ${entry.name} is missing for steel ${material.id}.`)
    defineName(`'${sheet.name.replaceAll("'", "''")}'!$B$${current}`, name)
    const cell = sheet.getCell(current, 2)
    if ('formula' in entry && entry.formula) setFormula(cell, bindSteelFormulaNames(entry.formula, names), entry.value, '0.000000000')
    else { cell.value = entry.value; cell.numFmt = '0.000000000'; styleInput(cell) }
  })
  return first + entries.length + 2
}
