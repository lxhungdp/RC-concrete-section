/**
 * Pieces both result workbooks share.
 *
 * The stress-strain ledger and the equivalent-block ledger are different calculations, but they
 * publish the same project inputs, the same steel law, the same defined-name rules and the same
 * visual language. Those live here so a reviewer reading the two files side by side is comparing
 * mechanics, not formatting, and so a fix to an Excel-compatibility rule cannot land in one
 * workbook only.
 */
import type { ConcreteMaterial, SteelMaterial } from '@pm/materials'

export class ExcelExportError extends Error {}

export const HEADER_FILL = 'FFE8EEF7'
export const GROUP_FILL = 'FFD6E4F5'
export const TITLE_FILL = 'FF1F3864'
export const INPUT_FILL = 'FFFFF3CD'
export const CONST_FILL = 'FFEFEFEF'
export const NOTE_COLOR = 'FF6B7280'

/**
 * Excel silently drops a defined name it considers a reference and then removes every formula that
 * used it, which surfaces as a repair dialog rather than an error. The rules below are the ones
 * Excel enforces; the R1C1 prefix rule is the non-obvious one — it is why `u_C1` and the classic
 * `R2D2` are both rejected even though neither is a complete cell address.
 */
const RESERVED_DEFINED_NAMES = new Set([
  'print_area',
  'print_titles',
  'criteria',
  '_filterdatabase',
  'extract',
  'consolidate_area',
  'sheet_title',
  'database'
])

export const invalidDefinedNameReason = (name: string): string | null => {
  if (name.length === 0 || name.length > 255) return 'must be 1 to 255 characters'
  if (!/^[A-Za-z_\\][A-Za-z0-9_.\\]*$/.test(name)) {
    return 'must start with a letter, underscore or backslash and contain only letters, digits, dot or underscore'
  }
  if (RESERVED_DEFINED_NAMES.has(name.toLowerCase())) return 'is reserved by Excel'
  /**
   * Excel only rejects up to three leading letters, because XFD is its last column. Other
   * spreadsheet engines — HyperFormula among them, which is what the export selftest recalculates
   * with — reject any letters-then-digits name. Taking the stricter rule costs nothing (add an
   * underscore, as in `beta_1`) and keeps one name legal everywhere the workbook may be opened.
   */
  if (/^[A-Za-z]+[0-9]+$/.test(name)) return 'reads as an A1-style cell reference in some engines'
  if (/^[RrCc]$/.test(name)) return 'R and C alone are row/column shorthand'
  if (/^[RrCc][0-9]/.test(name)) return 'reads as the start of an R1C1 reference'
  return null
}

/** 1-based column index to an Excel column name. */
export const col = (index: number): string => {
  let name = ''
  let i = index
  while (i > 0) {
    const rest = (i - 1) % 26
    name = String.fromCharCode(65 + rest) + name
    i = Math.floor((i - 1) / 26)
  }
  return name
}

// ---------------------------------------------------------------------------
// Material laws as Excel expressions
//
// Two kinds exist and the difference decides what the workbook can do:
//
//   closed-form  the law is algebra over the named inputs, so Excel can evaluate it per cell and
//                elementwise inside SUMPRODUCT. Everything downstream stays live in fck, fy, ...
//   tabulated    the law is only known as points (a user curve, or any future model without a
//                spreadsheet form). The program writes the sampled curve onto the `Materials`
//                sheet and Excel interpolates it. That works per cell, but INDEX/MATCH does not
//                vectorise, so array integrals over the whole mesh cannot be formulas and are
//                imported as engine values instead.
// ---------------------------------------------------------------------------

export type LawSample = { strain: number; stress: number }

export type MaterialLaw = {
  kind: 'closed-form' | 'tabulated'
  /** Per-cell expression for any strain expression. */
  scalar: (eps: string) => string
  /** Elementwise expression, safe inside SUMPRODUCT. `null` when the law is tabulated. */
  array: ((eps: string) => string) | null
  description: string
  /** Uniform strain grid written to the `Materials` sheet; only for tabulated laws. */
  samples?: LawSample[]
}

/** Ascending, de-duplicated curve: MATCH needs order and the interpolation needs a positive span. */
export const orderedCurve = (points: readonly LawSample[]): LawSample[] => {
  const sorted = [...points].sort((a, b) => a.strain - b.strain)
  const result: LawSample[] = []
  for (const point of sorted) {
    const previous = result[result.length - 1]
    if (previous && Math.abs(point.strain - previous.strain) < 1e-12) {
      result[result.length - 1] = point // a vertical jump keeps its upper branch
      continue
    }
    result.push(point)
  }
  return result
}

/**
 * Exact reproduction of `interpolateLinear` from `@pm/materials`: clamp to the end stresses,
 * linear between the bracketing points. `prefix` names the ranges the `Materials` sheet publishes.
 */
export const tabulatedScalar = (prefix: string, zeroTension: boolean) => (e: string) => {
  const first = `INDEX(${prefix}_eps,1)`
  const last = `INDEX(${prefix}_eps,${prefix}_n)`
  const index = `MIN(MAX(IFERROR(MATCH(${e},${prefix}_eps,1),1),1),${prefix}_n-1)`
  const clamped = `MIN(MAX(${e},${first}),${last})`
  const interpolated =
    `INDEX(${prefix}_sig,${index})+(${clamped}-INDEX(${prefix}_eps,${index}))/` +
    `(INDEX(${prefix}_eps,${index}+1)-INDEX(${prefix}_eps,${index}))*` +
    `(INDEX(${prefix}_sig,${index}+1)-INDEX(${prefix}_sig,${index}))`
  return zeroTension ? `IF(${e}<=0,0,${interpolated})` : interpolated
}

export const concreteLaw = (material: ConcreteMaterial): MaterialLaw => {
  const model = material.stressStrain

  if (model.type === 'kds-parabolic' || model.type === 'ec2-parabolic-rectangular') {
    // Both are the parabola-rectangle family: parabolic to eps0, then a plateau at alpha*fck.
    return {
      kind: 'closed-form',
      scalar: (e) => `IF(${e}>0,IF(${e}<=eco,alpha*fck*(1-(1-${e}/eco)^n),alpha*fck),0)`,
      // Clamp element-wise into (0, eco] so the power never sees a negative base.
      array: (e) =>
        `alpha*fck*(1-(1-((${e})*(${e}>0)*(${e}<eco)+eco*(${e}>=eco))/eco)^n)*((${e})>0)`,
      description:
        model.type === 'kds-parabolic'
          ? 'KDS parabola-rectangle: fc = α·fck·(1−(1−ε/εco)^n) up to εco, then α·fck'
          : 'EC2 parabola-rectangle: fc = α·fck·(1−(1−ε/εc2)^n) up to εc2, then α·fck'
    }
  }

  if (model.type === 'aci-whitney-block' || model.type === 'user-block') {
    return {
      kind: 'closed-form',
      scalar: (e) => `IF(${e}>0,IF(${e}<=ecu,alpha*fck,0),0)`,
      array: (e) => `alpha*fck*((${e})>0)*((${e})<=ecu)`,
      description: model.type === 'user-block'
        ? 'User-defined uniform block: fc = α·fck for 0 < ε ≤ εcu, else 0'
        : 'ACI uniform block: fc = α·fck for 0 < ε ≤ εcu, else 0'
    }
  }

  const points = model.type === 'user-curve' ? model.points : []
  const zeroTension = (model.type === 'user-curve' ? model.zeroTension : undefined) ?? material.limits.ignoreTension
  const samples = orderedCurve(points)
  if (samples.length < 2) {
    throw new ExcelExportError('The concrete stress-strain curve needs at least two distinct points to export.')
  }
  return {
    kind: 'tabulated',
    scalar: tabulatedScalar('Cnc', zeroTension),
    array: null,
    description: `User stress-strain curve, ${samples.length} points, linear between them${
      zeroTension ? ', zero in tension' : ''
    }`,
    samples
  }
}

export const steelLaw = (material: SteelMaterial): MaterialLaw => {
  const model = material.stressStrain

  if (model.type === 'elastic-perfectly-plastic') {
    return {
      kind: 'closed-form',
      scalar: (e) => `MAX(MIN(Es*${e},fy),-fy)`,
      // MIN/MAX aggregate over arrays, so clamp with comparisons instead.
      array: (e) => `Es*(${e})*(ABS(Es*(${e}))<=fy)+fy*(Es*(${e})>fy)-fy*(Es*(${e})<-fy)`,
      description: 'Elastic – perfectly plastic: fs = clamp(Es·ε, −fy, +fy)'
    }
  }

  if (model.type === 'bilinear') {
    const ratio = Math.max(0, model.hardeningRatio)
    const yieldStress = (e: string) => `(fy+Es*${ratio}*(ABS(${e})-fy/Es))`
    return {
      kind: 'closed-form',
      scalar: (e) => `IF(ABS(${e})<=fy/Es,Es*${e},SIGN(${e})*${yieldStress(e)})`,
      array: (e) =>
        `Es*(${e})*(ABS(${e})<=fy/Es)+SIGN(${e})*${yieldStress(`(${e})`)}*(ABS(${e})>fy/Es)`,
      description: `Bilinear with ${(ratio * 100).toFixed(1)}% strain hardening`
    }
  }

  const samples = orderedCurve(model.type === 'user-curve' ? model.points : [])
  if (samples.length < 2) {
    throw new ExcelExportError('The steel stress-strain curve needs at least two distinct points to export.')
  }
  return {
    kind: 'tabulated',
    scalar: tabulatedScalar('Stl', false),
    array: null,
    description: `User stress-strain curve, ${samples.length} points, linear between them`,
    samples
  }
}

export const concreteAlphaSource = (material: ConcreteMaterial) => {
  const model = material.stressStrain
  const modelAlpha = 'alpha' in model ? model.alpha : undefined
  return material.factors?.gammaC !== undefined
    ? material.factors.alpha ?? modelAlpha ?? 1
    : modelAlpha ?? material.factors?.alpha ?? 1
}

export const concreteEffectiveAlpha = (material: ConcreteMaterial) =>
  concreteAlphaSource(material) / (material.factors?.gammaC ?? 1)

export const steelDesignFy = (material: SteelMaterial) => material.fy / (material.factors?.gammaS ?? 1)

export const concreteModelParameters = (material: ConcreteMaterial) => {
  const model = material.stressStrain
  if (model.type === 'kds-parabolic') {
    return { eps0: model.eps0, epsCu: model.epsCu, n: model.n, alpha: concreteEffectiveAlpha(material) }
  }
  if (model.type === 'ec2-parabolic-rectangular') {
    return { eps0: model.epsC2, epsCu: model.epsCu2, n: model.n, alpha: concreteEffectiveAlpha(material) }
  }
  if (model.type === 'aci-whitney-block' || model.type === 'user-block') {
    return { eps0: material.limits.eps0 ?? 0.002, epsCu: model.epsCu, n: 2, alpha: concreteEffectiveAlpha(material) }
  }
  return { eps0: material.limits.eps0 ?? 0.002, epsCu: material.limits.epsCu, n: 2, alpha: 0.85 }
}

/** exceljs ships CJS; the browser bundle and Node resolve the namespace differently. */
export const createWorkbook = async () => {
  const imported = await import('exceljs')
  const ExcelJS = ((imported as unknown as { default?: typeof imported }).default ?? imported) as typeof imported
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'P-M Column Designer'
  workbook.created = new Date()
  // No cached results are written, so Excel must evaluate everything on open.
  workbook.calcProperties.fullCalcOnLoad = true
  return workbook
}

/** Single gate for defined names so an Excel-invalid one fails here, not in the repair dialog. */
export const createDefineName = (workbook: import('exceljs').Workbook) => {
  const claimed = new Set<string>()
  return (location: string, name: string) => {
    const reason = invalidDefinedNameReason(name)
    if (reason) throw new ExcelExportError(`Defined name "${name}" ${reason}.`)
    if (claimed.has(name.toLowerCase())) {
      throw new ExcelExportError(`Defined name "${name}" is used twice; Excel names are case-insensitive.`)
    }
    claimed.add(name.toLowerCase())
    workbook.definedNames.add(location, name)
  }
}

export const title = (sheet: import('exceljs').Worksheet, row: number, text: string, span: number) => {
  const cell = sheet.getCell(row, 2)
  cell.value = text
  cell.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TITLE_FILL } }
  cell.alignment = { vertical: 'middle' }
  sheet.mergeCells(row, 2, row, 1 + span)
  sheet.getRow(row).height = 22
}

export const sectionHeading = (sheet: import('exceljs').Worksheet, row: number, text: string, span: number) => {
  const cell = sheet.getCell(row, 2)
  cell.value = text
  cell.font = { bold: true, size: 11, color: { argb: 'FF1F3864' } }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GROUP_FILL } }
  sheet.mergeCells(row, 2, row, 1 + span)
}

export const headerRow = (
  sheet: import('exceljs').Worksheet,
  row: number,
  labels: readonly string[],
  firstColumn = 2
) => {
  labels.forEach((label, index) => {
    const cell = sheet.getCell(row, firstColumn + index)
    cell.value = label
    cell.font = { bold: true, size: 10 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
    cell.alignment = { horizontal: 'center', wrapText: true, vertical: 'middle' }
    cell.border = { top: { style: 'thin' }, left: { style: 'hair' }, bottom: { style: 'thin' }, right: { style: 'hair' } }
  })
  sheet.getRow(row).height = 28
}

export const noteCell = (sheet: import('exceljs').Worksheet, row: number, column: number, text: string) => {
  const cell = sheet.getCell(row, column)
  cell.value = text
  cell.font = { italic: true, color: { argb: NOTE_COLOR } }
  cell.alignment = { wrapText: true, vertical: 'top' }
  return cell
}
