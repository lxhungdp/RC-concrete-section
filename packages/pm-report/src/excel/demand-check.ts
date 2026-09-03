/**
 * Demand Check workbook: the whole check, one sheet group per selected loadcase.
 *
 * The PDF answers "is it adequate"; this workbook answers "show me". Its contract is the one the
 * chart-audit workbook already publishes — a displayed number is a formula over the project inputs
 * wherever the mechanics can be written as spreadsheet algebra, and an engine constant is shaded
 * and named as one wherever it cannot. Nothing here is a second calculation of a published result.
 *
 * Sheets
 *   Summary          every combination with its utilization and verdict, and what was worked through
 *   Geometry         rings, bars and the project loadcases, about the analysis origin
 *   Materials        concrete and steel laws, resistance basis, tabulated curves
 *   Mesh             the integration mesh the program used (stress-strain mechanics only)
 *   LCi_Inverse      the inverse calculation for one loadcase: the strain plane (ε0, κx, κy) it
 *                    converged on, the bar-by-bar and concrete ledger at that plane, the residual
 *                    against the demand, and the utilization
 *   LCi_Vertical     the vertical P-M meridian in that loadcase's own strain direction
 *   LCi_FixedP_Lo    the stations bracketing that loadcase's axial force from below
 *   LCi_FixedP_Up    ... and from above
 *   LCi_FixedP       the Mx-My contour interpolated between the two
 *
 * The last four are the Section Results chart audits, written by the same functions, so a curve
 * exported from the Result menu and the same curve exported here are one calculation, not two.
 */
import {
  evaluatePreparedState,
  type InversePreviewResult,
  type PreviewSurface,
  type ResultantLedger
} from '@pm/analysis'
import type { DesignBasis } from '@pm/design'
import type { NominalBlockEvaluation } from '@pm/equivalent-block'
import type { GeometryInputRebarView, SectionGeometry } from '@pm/geometry'
import {
  compileConcreteMaterial,
  compileSteelMaterial,
  type MaterialStore
} from '@pm/materials'
import {
  calculationProfile,
  type CalculationAnalysisOptions,
  type CalculationProfileId,
  type LoadCombination,
  type ProjectInformation
} from '@pm/project'
import { solveLoadcases, type SolvedLoadcase } from '../model/loadcase-solutions'
import {
  prepareAuditContext,
  writeFixedPAuditSheets,
  writeVerticalAuditSheet,
  type AuditContext
} from './chart-audit'
import { injectSheetCharts, type SheetChart } from './sheet-charts'
import {
  addLegend,
  blockHeading,
  freezeUnder,
  reportTitle,
  setFormula,
  sheetNote,
  styleGenerated,
  styleHeader,
  styleInput,
  tableBlock,
  zebraRows
} from './sheet-layout'
import { createDefineName, createWorkbook, ExcelExportError } from './workbook-common'

export type DemandCheckExcelInput = {
  projectName: string
  projectInformation?: ProjectInformation
  sectionName: string
  calculationProfileId: CalculationProfileId
  section: SectionGeometry
  rebars: GeometryInputRebarView[]
  materialStore: MaterialStore
  designBasis: DesignBasis
  analysisOptions: CalculationAnalysisOptions
  /** Governing surface already built by the application; never rebuilt here. */
  surface: PreviewSurface
  loadcases: readonly LoadCombination[]
  /** Combinations to work through, one sheet group each. May be none, some, or all. */
  detailLoadcaseIds: readonly number[]
}

const KN = 1_000
const KNM = 1_000_000
const kn = (value: number) => value / KN
const knm = (value: number) => value / KNM

const safeStem = (value: string) =>
  (value || 'demand-check')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'demand-check'

export const demandCheckWorkbookFileName = (
  input: Pick<DemandCheckExcelInput, 'projectName' | 'detailLoadcaseIds'>
) => `${safeStem(input.projectName)}-demand-check-${input.detailLoadcaseIds.length}LC.xlsx`

const verdictOf = (result: InversePreviewResult) => {
  if (!result.designCheck.evaluated) return 'NOT CHECKED'
  return result.designCheck.adequacy.toUpperCase()
}

const loadcaseAngleDeg = (loadcase: LoadCombination) =>
  Math.abs(loadcase.Mx) < 1e-9 && Math.abs(loadcase.My) < 1e-9
    ? 0
    : (Math.atan2(loadcase.My, loadcase.Mx) * 180) / Math.PI

// ---------------------------------------------------------------------------
// Inverse sheet
// ---------------------------------------------------------------------------

/**
 * The inverse sheet carries two shapes of table: narrow symbol/value blocks and the wide bar
 * ledger. Rather than let the narrow ones stop four columns short of the wide one, their `Note`
 * column runs out to the same edge, so every block on the sheet is exactly as wide as the sheet and
 * the printed page has one straight right margin.
 */
const INVERSE_SPAN = 11
const NOTE_COLUMN = 4

/** Symbol/value block whose note column reaches the sheet edge. Returns the first body row. */
const keyValueBlock = (sheet: import('exceljs').Worksheet, row: number, title: string) => {
  blockHeading(sheet, row, title, INVERSE_SPAN)
  styleHeader(sheet, row + 1, ['Symbol', 'Value', 'Unit', 'Note'])
  sheet.mergeCells(row + 1, NOTE_COLUMN, row + 1, INVERSE_SPAN)
  return row + 2
}

/** One symbol/value row; the note spans the rest of the block. */
const keyValueNote = (sheet: import('exceljs').Worksheet, row: number, text: string) => {
  const cell = sheet.getCell(row, NOTE_COLUMN)
  cell.value = text
  cell.alignment = { wrapText: true, vertical: 'middle' }
  sheet.mergeCells(row, NOTE_COLUMN, row, INVERSE_SPAN)
}

type InverseNames = {
  e0: string
  kx: string
  ky: string
  pu: string
  mux: string
  muy: string
}

/**
 * The step both curve groups depend on: which strain plane balances this demand.
 *
 * Newton and its tangent modulus stay in the program — a general material law has no closed-form
 * derivative — so the plane arrives as three engine constants. What the workbook then does is the
 * part a reviewer needs: integrate the section at that plane by formula and show that the result
 * balances the demand. `ε0`, `κx` and `κy` are named, so editing one moves the whole ledger below
 * and the residual reports the consequence instead of hiding it.
 */
const writeInverseSheet = (
  sheet: import('exceljs').Worksheet,
  context: AuditContext,
  solution: SolvedLoadcase,
  names: InverseNames,
  blockEvaluation: NominalBlockEvaluation | null,
  /**
   * Resistance factor between the ledger below and the checked response, or null when the two are
   * the same stage. The block route with a global resultant factor integrates the characteristic
   * block and then scales the resultant, so its ledger is the nominal one and φ is a visible step;
   * the stress-strain route applies its factor when the surface is built, not to this response.
   */
  nominalToDesignFactor: number | null
) => {
  const { loadcase, result } = solution
  const state = result.state
  const curvature = Math.hypot(state.kx, state.ky)
  const origin = context.origin
  const isBlock = blockEvaluation !== null
  sheet.columns = [26, 18, 14, 16, 16, 16, 18, 16, 16, 16, 18].map((width) => ({ width }))

  // Engine ledger at this plane, used only to cache what the formulas evaluate to.
  const ledger: ResultantLedger | null =
    context.prepared && !isBlock ? evaluatePreparedState(context.prepared, state) : null

  reportTitle(sheet, `INVERSE CALCULATION — ${loadcase.name}`, INVERSE_SPAN)
  addLegend(sheet, 2, INVERSE_SPAN)

  const demandFirst = keyValueBlock(sheet, 4, 'Factored demand')
  const demandRows: Array<[string, number, string, string, string]> = [
    ['Pu', kn(loadcase.P), 'kN', 'Factored axial force, compression positive', names.pu],
    ['Mux', knm(loadcase.Mx), 'kN·m', 'Factored moment about x through the net concrete centroid', names.mux],
    ['Muy', knm(loadcase.My), 'kN·m', 'Factored moment about y through the net concrete centroid', names.muy]
  ]
  demandRows.forEach(([symbol, value, unit, note, definedName], index) => {
    const r = demandFirst + index
    sheet.getCell(r, 1).value = symbol
    sheet.getCell(r, 2).value = value
    sheet.getCell(r, 2).numFmt = '#,##0.000'
    sheet.getCell(r, 3).value = unit
    keyValueNote(sheet, r, note)
    styleInput(sheet.getCell(r, 2))
    context.defineName(`'${sheet.name}'!$B$${r}`, definedName)
  })
  let row = demandFirst + demandRows.length
  sheet.getCell(row, 1).value = 'θL'
  setFormula(
    sheet.getCell(row, 2),
    `=IF(AND(${names.mux}=0,${names.muy}=0),0,MOD(DEGREES(ATAN2(${names.mux},${names.muy})),360))`,
    ((loadcaseAngleDeg(loadcase) % 360) + 360) % 360,
    '#,##0.0000'
  )
  sheet.getCell(row, 3).value = 'deg'
  keyValueNote(sheet, row, 'Demand moment direction. A query angle on the finished surface, never a strain direction.')
  row += 1

  // The solver balances the code-adjusted demand when a rule produced one, so the residual below
  // must be measured against that, not against the entry the user typed. Both are published.
  let targetRefs = { p: names.pu, mx: names.mux, my: names.muy }
  const adjusted = result.codeAdjustedDemand
  if (adjusted) {
    const adjustedRows: Array<[string, number, string]> = [
      ['Pu (code-adjusted)', kn(adjusted.P), 'kN'],
      ['Mux (code-adjusted)', knm(adjusted.Mx), 'kN·m'],
      ['Muy (code-adjusted)', knm(adjusted.My), 'kN·m']
    ]
    adjustedRows.forEach(([label, value, unit], index) => {
      const r = row + index
      sheet.getCell(r, 1).value = label
      sheet.getCell(r, 2).value = value
      sheet.getCell(r, 2).numFmt = '#,##0.000'
      sheet.getCell(r, 3).value = unit
      keyValueNote(sheet, r, result.minimumEccentricityMm === undefined
        ? 'A code rule adjusted the demand before solving; the original entry is retained above.'
        : `Minimum eccentricity e_min = ${result.minimumEccentricityMm.toFixed(3)} mm applied before solving.`)
      styleGenerated(sheet.getCell(r, 2))
    })
    targetRefs = { p: `$B$${row}`, mx: `$B$${row + 1}`, my: `$B$${row + 2}` }
    row += adjustedRows.length
  }

  const planeFirst = keyValueBlock(sheet, row + 1, 'Converged strain plane')
  const planeRows: Array<[string, number, string, string, string]> = [
    ['ε0', state.e0, '–', 'Strain at the analysis origin; ε(x,y) = ε0 + κx·y + κy·x', names.e0],
    ['κx', state.kx, '1/mm', 'Curvature about x', names.kx],
    ['κy', state.ky, '1/mm', 'Curvature about y', names.ky]
  ]
  planeRows.forEach(([symbol, value, unit, note, definedName], index) => {
    const r = planeFirst + index
    sheet.getCell(r, 1).value = symbol
    sheet.getCell(r, 2).value = value
    sheet.getCell(r, 2).numFmt = '0.000000000E+00'
    sheet.getCell(r, 3).value = unit
    keyValueNote(sheet, r, note)
    styleGenerated(sheet.getCell(r, 2))
    context.defineName(`'${sheet.name}'!$B$${r}`, definedName)
  })
  row = planeFirst + planeRows.length

  const kappa = `SQRT(${names.kx}^2+${names.ky}^2)`
  const betaRow = row
  sheet.getCell(row, 1).value = 'βeq'
  setFormula(
    sheet.getCell(row, 2),
    `=IF(${names.kx}^2+${names.ky}^2=0,0,MOD(DEGREES(ATAN2(${names.kx},${names.ky})),360))`,
    curvature > 1e-14 ? (((Math.atan2(state.ky, state.kx) * 180) / Math.PI) % 360 + 360) % 360 : 0,
    '#,##0.0000'
  )
  sheet.getCell(row, 3).value = 'deg'
  keyValueNote(sheet, row, 'Strain-gradient direction; the meridian the vertical sheet publishes')
  row += 1
  sheet.getCell(row, 1).value = 'κ'
  setFormula(sheet.getCell(row, 2), `=${kappa}`, curvature, '0.000000000E+00')
  sheet.getCell(row, 3).value = '1/mm'
  keyValueNote(sheet, row, 'Resultant curvature')
  row += 1
  sheet.getCell(row, 1).value = 'αNA'
  setFormula(
    sheet.getCell(row, 2),
    `=IF(${names.kx}^2+${names.ky}^2=0,0,MOD(DEGREES(ATAN2(-${names.kx},${names.ky})),180))`,
    curvature > 1e-14 ? ((((Math.atan2(state.ky, -state.kx) * 180) / Math.PI) % 180) + 180) % 180 : 0,
    '#,##0.0000'
  )
  sheet.getCell(row, 3).value = 'deg'
  keyValueNote(sheet, row, 'Neutral-axis line direction; the tangent (−κx, κy) to the ε = 0 line')
  row += 1

  const betaRef = `$B$${betaRow}`
  const betaRad = curvature > 1e-14 ? Math.atan2(state.ky, state.kx) : 0
  const projections = context.section.solids.flatMap((solid) =>
    solid.outer.map(
      (point) =>
        (point.y - origin.y) * Math.cos(betaRad) + (point.x - origin.x) * Math.sin(betaRad)
    )
  )
  const zMax = projections.length > 0 ? Math.max(...projections) : 0
  const zMin = projections.length > 0 ? Math.min(...projections) : 0
  const zcRow = row
  sheet.getCell(row, 1).value = 'zc'
  setFormula(
    sheet.getCell(row, 2),
    `=${context.scalarExtreme('MAX', context.exteriorGeometryRows, betaRef)}`,
    zMax,
    '#,##0.000'
  )
  sheet.getCell(row, 3).value = 'mm'
  keyValueNote(sheet, row, 'Projection of the extreme compression fibre on βeq')
  row += 1
  const ztRow = row
  sheet.getCell(row, 1).value = 'zt'
  setFormula(
    sheet.getCell(row, 2),
    `=${context.scalarExtreme('MIN', context.exteriorGeometryRows, betaRef)}`,
    zMin,
    '#,##0.000'
  )
  sheet.getCell(row, 3).value = 'mm'
  keyValueNote(sheet, row, 'Projection of the extreme tension fibre on βeq')
  row += 1
  const derived: Array<[string, string, number, string, string, string]> = [
    ['Dθ', `=$B$${zcRow}-$B$${ztRow}`, zMax - zMin, 'mm', 'Projected section depth in the strain direction', '#,##0.000'],
    ['εc', `=${names.e0}+${kappa}*$B$${zcRow}`, state.e0 + curvature * zMax, '–', 'Strain at the extreme compression fibre', '0.000000'],
    ['εt', `=${names.e0}+${kappa}*$B$${ztRow}`, state.e0 + curvature * zMin, '–', 'Strain at the extreme tension fibre; negative in tension', '0.000000'],
    [
      'c',
      `=IF(${kappa}=0,$B$${zcRow}-$B$${ztRow},$B$${zcRow}+${names.e0}/${kappa})`,
      curvature > 1e-14 ? zMax + state.e0 / curvature : zMax - zMin,
      'mm',
      'Neutral-axis depth from the extreme compression fibre',
      '#,##0.000'
    ]
  ]
  derived.forEach(([label, formula, value, unit, note, numFmt], index) => {
    const r = row + index
    sheet.getCell(r, 1).value = label
    setFormula(sheet.getCell(r, 2), formula, value, numFmt)
    sheet.getCell(r, 3).value = unit
    keyValueNote(sheet, r, note)
  })
  row += derived.length + 1

  // ---- Reinforcement ledger ----------------------------------------------
  sheetNote(
    sheet,
    row,
    INVERSE_SPAN,
    isBlock
      ? 'Equivalent-block mechanics: bar strain and steel stress come from the block state the solver converged on, and the displaced-concrete stress is the block stress where the bar lies inside the block. Force and moments are formulas over those values and the shared Geometry sheet.'
      : 'Every column is a formula. Strain is the plane above evaluated at the bar; steel stress is the Materials law; the concrete the bar displaces is subtracted with the same concrete law the mesh integration uses.'
  )
  const barFirst = tableBlock(sheet, row + 1, 'Reinforcement ledger at the converged plane', [
    'Bar', 'x local (mm)', 'y local (mm)', 'As (mm²)', 'ε', 'σs (MPa)', 'σc displaced (MPa)',
    'F (kN)', 'Mx (kN·m)', 'My (kN·m)', isBlock ? 'Inside block' : 'Steel material'
  ])
  const blockBars = new Map((blockEvaluation?.bars ?? []).map((bar) => [bar.id, bar]))
  const compiledConcrete = compileConcreteMaterial(context.calculationMaterials.concrete)
  const compiledSteel = new Map(
    context.calculationMaterials.steel.map((steel) => [steel.id, compileSteelMaterial(steel)] as const)
  )
  context.rebarRows.forEach(({ bar, row: geometryRow }, index) => {
    const r = barFirst + index
    const cells = context.geometryCellsAt(geometryRow)
    const steel = context.steelForBar(bar)
    const blockBar = blockBars.get(String(bar.id))
    const x = bar.x - origin.x
    const y = bar.y - origin.y
    const area = (Math.PI * bar.dia ** 2) / 4
    sheet.getCell(r, 1).value = bar.id
    setFormula(sheet.getCell(r, 2), `=${cells.x}`, x, '#,##0.00')
    setFormula(sheet.getCell(r, 3), `=${cells.y}`, y, '#,##0.00')
    setFormula(sheet.getCell(r, 4), `=${cells.area}`, area, '#,##0.00')

    const strainExpression = context.barStrainExpression(geometryRow, names.e0, names.kx, names.ky)
    const planeStrain = state.e0 + state.kx * y + state.ky * x
    let steelStress: number
    let displacedStress: number
    if (isBlock) {
      const strain = blockBar?.strain ?? planeStrain
      steelStress = blockBar?.steelStress ?? 0
      displacedStress = blockBar?.displacedConcreteStress ?? 0
      for (const [column, value, format] of [
        [5, strain, '0.000000'],
        [6, steelStress, '#,##0.000'],
        [7, displacedStress, '#,##0.000']
      ] as const) {
        sheet.getCell(r, column).value = value
        sheet.getCell(r, column).numFmt = format
        styleGenerated(sheet.getCell(r, column))
      }
      sheet.getCell(r, 11).value = blockBar ? (blockBar.insideBlock ? 'yes' : 'no') : '—'
      styleGenerated(sheet.getCell(r, 11))
    } else {
      const law = steel ? compiledSteel.get(steel.id) : undefined
      steelStress = law ? law.stress(planeStrain) : 0
      displacedStress = compiledConcrete.stress(planeStrain)
      setFormula(sheet.getCell(r, 5), `=${strainExpression}`, planeStrain, '0.000000')
      setFormula(
        sheet.getCell(r, 6),
        `=${steel ? context.steelScalar(steel.id, strainExpression) : '0'}`,
        steelStress,
        '#,##0.000'
      )
      setFormula(
        sheet.getCell(r, 7),
        `=${context.concreteScalar(strainExpression)}`,
        displacedStress,
        '#,##0.000'
      )
      sheet.getCell(r, 11).value = steel?.name ?? '—'
      styleGenerated(sheet.getCell(r, 11))
    }
    const force = ((steelStress - displacedStress) * area) / KN
    setFormula(sheet.getCell(r, 8), `=(F${r}-G${r})*D${r}/1000`, force, '#,##0.000')
    setFormula(sheet.getCell(r, 9), `=H${r}*C${r}/1000`, (force * y) / KN, '#,##0.000')
    setFormula(sheet.getCell(r, 10), `=H${r}*B${r}/1000`, (force * x) / KN, '#,##0.000')
  })
  const barLast = barFirst + context.rebarRows.length - 1
  row = barLast + 1
  const barSumRow = row
  sheet.getCell(row, 1).value = 'Steel total'
  sheet.getCell(row, 1).font = { bold: true }
  // The summed row still occupies its table's last column, so the block keeps one straight edge.
  for (const column of [2, 3, 4, 5, 6, 7, 11]) sheet.getCell(row, column).value = '–'
  const steelTotals = isBlock
    ? {
        P: (blockEvaluation?.bars ?? []).reduce((sum, bar) => sum + bar.force, 0),
        Mx: (blockEvaluation?.bars ?? []).reduce((sum, bar) => sum + bar.Mx, 0),
        My: (blockEvaluation?.bars ?? []).reduce((sum, bar) => sum + bar.My, 0)
      }
    : { P: ledger?.steel.P ?? 0, Mx: ledger?.steel.Mx ?? 0, My: ledger?.steel.My ?? 0 }
  ;([
    [8, 'H', kn(steelTotals.P)],
    [9, 'I', knm(steelTotals.Mx)],
    [10, 'J', knm(steelTotals.My)]
  ] as const).forEach(([column, letter, value]) => {
    setFormula(sheet.getCell(row, column), `=SUM(${letter}${barFirst}:${letter}${barLast})`, value, '#,##0.000')
    sheet.getCell(row, column).font = { ...(sheet.getCell(row, column).font ?? {}), bold: true }
  })
  row += 2

  // ---- Concrete ------------------------------------------------------------
  const meshReady = context.meshFormulaReady && !isBlock
  sheetNote(
    sheet,
    row,
    INVERSE_SPAN,
    meshReady
      ? 'The concrete integral is a SUMPRODUCT over the Mesh sheet: the concrete law evaluated at every quadrature point, weighted by that point\'s own area. Change fck on Materials and this moves with it.'
      : isBlock
        ? 'Equivalent-block mechanics: the compression block is obtained by exact polygon clipping, so its area and centroid are engine values. Force and moments are formulas over them and the block stress.'
        : 'The concrete law is tabulated, so it cannot be evaluated elementwise inside SUMPRODUCT. The integral is imported from the engine and marked as such.'
  )
  row = keyValueBlock(sheet, row + 1, 'Concrete resultant at the converged plane')

  const blockConcrete = blockEvaluation?.concrete ?? null
  let concretePRow: number
  let concreteMxRow: number
  let concreteMyRow: number
  if (isBlock && blockConcrete) {
    const areaRow = row
    const centroidXRow = row + 1
    const centroidYRow = row + 2
    const stressRow = row + 3
    const engineValues: Array<[number, string, number, string, string]> = [
      [areaRow, 'Block area Ac,blk', blockConcrete.area, 'mm²', 'Exact polygon clip of the compression block'],
      [centroidXRow, 'Block centroid x', blockConcrete.centroid.x - origin.x, 'mm', 'Local to the analysis origin'],
      [centroidYRow, 'Block centroid y', blockConcrete.centroid.y - origin.y, 'mm', 'Local to the analysis origin'],
      [stressRow, 'Block stress σblock', blockConcrete.stress, 'MPa', 'Uniform stress over the block']
    ]
    for (const [r, label, value, unit, basis] of engineValues) {
      sheet.getCell(r, 1).value = label
      sheet.getCell(r, 2).value = value
      sheet.getCell(r, 2).numFmt = '#,##0.000'
      sheet.getCell(r, 3).value = unit
      keyValueNote(sheet, r, basis)
      styleGenerated(sheet.getCell(r, 2))
    }
    concretePRow = stressRow + 1
    concreteMxRow = stressRow + 2
    concreteMyRow = stressRow + 3
    sheet.getCell(concretePRow, 1).value = 'Concrete P'
    setFormula(sheet.getCell(concretePRow, 2), `=$B$${areaRow}*$B$${stressRow}/1000`, kn(blockConcrete.force), '#,##0.000')
    sheet.getCell(concretePRow, 3).value = 'kN'
    keyValueNote(sheet, concretePRow, 'Ac,blk · σblock')
    sheet.getCell(concreteMxRow, 1).value = 'Concrete Mx'
    setFormula(sheet.getCell(concreteMxRow, 2), `=$B$${concretePRow}*$B$${centroidYRow}/1000`, knm(blockConcrete.Mx), '#,##0.000')
    sheet.getCell(concreteMxRow, 3).value = 'kN·m'
    keyValueNote(sheet, concreteMxRow, 'Concrete P · block centroid y')
    sheet.getCell(concreteMyRow, 1).value = 'Concrete My'
    setFormula(sheet.getCell(concreteMyRow, 2), `=$B$${concretePRow}*$B$${centroidXRow}/1000`, knm(blockConcrete.My), '#,##0.000')
    sheet.getCell(concreteMyRow, 3).value = 'kN·m'
    keyValueNote(sheet, concreteMyRow, 'Concrete P · block centroid x')
    row = concreteMyRow + 1
  } else {
    const epsMesh = `(${names.e0}+${names.kx}*Mesh_Y+${names.ky}*Mesh_X)`
    const concreteArray = context.concreteArray(epsMesh)
    concretePRow = row
    concreteMxRow = row + 1
    concreteMyRow = row + 2
    const entries: Array<[number, string, string | null, number, string, string]> = [
      [concretePRow, 'Concrete P', concreteArray && meshReady ? `=SUMPRODUCT(${concreteArray},Mesh_A)/1000` : null,
        kn(ledger?.concrete.P ?? 0), 'kN', 'Concrete law integrated over the mesh'],
      [concreteMxRow, 'Concrete Mx', concreteArray && meshReady ? `=SUMPRODUCT(${concreteArray},Mesh_A,Mesh_Y)/1000000` : null,
        knm(ledger?.concrete.Mx ?? 0), 'kN·m', 'Concrete law integrated over the mesh, lever y'],
      [concreteMyRow, 'Concrete My', concreteArray && meshReady ? `=SUMPRODUCT(${concreteArray},Mesh_A,Mesh_X)/1000000` : null,
        knm(ledger?.concrete.My ?? 0), 'kN·m', 'Concrete law integrated over the mesh, lever x']
    ]
    for (const [r, label, formula, value, unit, basis] of entries) {
      sheet.getCell(r, 1).value = label
      if (formula) {
        setFormula(sheet.getCell(r, 2), formula, value, '#,##0.000')
      } else {
        sheet.getCell(r, 2).value = value
        sheet.getCell(r, 2).numFmt = '#,##0.000'
        styleGenerated(sheet.getCell(r, 2))
      }
      sheet.getCell(r, 3).value = unit
      keyValueNote(sheet, r, basis)
    }
    row = concreteMyRow + 1
  }
  row += 1

  // ---- Response and residual ----------------------------------------------
  row = keyValueBlock(
    sheet,
    row,
    isBlock
      ? 'Design capacity at this state and its alignment with the demand'
      : 'Section response and residual against the demand'
  )
  const factor = nominalToDesignFactor
  const ledgerFirst = row
  if (factor !== null) {
    const nominalRows: Array<[string, string, number, string, string]> = [
      ['Nominal Pn', `=$B$${concretePRow}+$H$${barSumRow}`, kn(result.response.P / factor), 'kN', 'Concrete block + net steel, characteristic'],
      ['Nominal Mnx', `=$B$${concreteMxRow}+$I$${barSumRow}`, knm(result.response.Mx / factor), 'kN·m', 'Concrete block + net steel, characteristic'],
      ['Nominal Mny', `=$B$${concreteMyRow}+$J$${barSumRow}`, knm(result.response.My / factor), 'kN·m', 'Concrete block + net steel, characteristic']
    ]
    nominalRows.forEach(([label, formula, value, unit, basis], index) => {
      const r = ledgerFirst + index
      sheet.getCell(r, 1).value = label
      setFormula(sheet.getCell(r, 2), formula, value, '#,##0.000')
      sheet.getCell(r, 3).value = unit
      keyValueNote(sheet, r, basis)
    })
    const phiRow = ledgerFirst + nominalRows.length
    sheet.getCell(phiRow, 1).value = 'φ'
    sheet.getCell(phiRow, 2).value = factor
    sheet.getCell(phiRow, 2).numFmt = '#,##0.0000'
    sheet.getCell(phiRow, 3).value = '–'
    keyValueNote(sheet, phiRow, 'Resistance factor at this state; the strain-dependent value the kernel resolved for the classification below')
    styleGenerated(sheet.getCell(phiRow, 2))
    row = phiRow + 1
  }
  const responseFirst = row
  const responseSource = factor === null
    ? [`=$B$${concretePRow}+$H$${barSumRow}`, `=$B$${concreteMxRow}+$I$${barSumRow}`, `=$B$${concreteMyRow}+$J$${barSumRow}`]
    : [`=$B$${ledgerFirst}*$B$${ledgerFirst + 3}`, `=$B$${ledgerFirst + 1}*$B$${ledgerFirst + 3}`, `=$B$${ledgerFirst + 2}*$B$${ledgerFirst + 3}`]
  const responseBasis = factor === null ? 'Concrete + net steel at this state' : 'Nominal resultant × φ'
  const responseLabel = isBlock ? 'Capacity' : 'Response'
  ;([
    [`${responseLabel} P`, responseSource[0], kn(result.response.P), 'kN'],
    [`${responseLabel} Mx`, responseSource[1], knm(result.response.Mx), 'kN·m'],
    [`${responseLabel} My`, responseSource[2], knm(result.response.My), 'kN·m']
  ] as const).forEach(([label, formula, value, unit], index) => {
    const r = responseFirst + index
    sheet.getCell(r, 1).value = label
    setFormula(sheet.getCell(r, 2), formula, value, '#,##0.000')
    sheet.getCell(r, 3).value = unit
    keyValueNote(sheet, r, responseBasis)
  })
  row = responseFirst + 3

  const target = adjusted ?? loadcase
  let residualFirst: number
  let closingLabel: string
  let closingOk: string
  let closingBad: string
  if (isBlock) {
    // The block inverse does not balance the demand: it walks the demand ray to the surface and
    // returns the capacity point there. What can be checked by formula is that the two are indeed
    // colinear — scale the capacity back by the utilization and the demand must reappear.
    const utilization = result.inverseProportionalUtilization
    const urRow = row
    sheet.getCell(urRow, 1).value = 'Utilization UR'
    sheet.getCell(urRow, 2).value = utilization ?? '—'
    if (typeof utilization === 'number') sheet.getCell(urRow, 2).numFmt = '#,##0.000000'
    sheet.getCell(urRow, 3).value = '–'
    keyValueNote(sheet, urRow, 'Scale from the capacity point back to the demand, |demand| / |capacity|')
    styleGenerated(sheet.getCell(urRow, 2))
    row += 1
    residualFirst = row
    ;([
      ['Residual ΔP', `=$B$${responseFirst}*$B$${urRow}-${targetRefs.p}`, kn(target.P), 'kN'],
      ['Residual ΔMx', `=$B$${responseFirst + 1}*$B$${urRow}-${targetRefs.mx}`, knm(target.Mx), 'kN·m'],
      ['Residual ΔMy', `=$B$${responseFirst + 2}*$B$${urRow}-${targetRefs.my}`, knm(target.My), 'kN·m']
    ] as const).forEach(([label, formula, , unit], index) => {
      const r = residualFirst + index
      sheet.getCell(r, 1).value = label
      setFormula(sheet.getCell(r, 2), formula, 0, '0.000000')
      sheet.getCell(r, 3).value = unit
      keyValueNote(sheet, r, 'Capacity scaled by UR, minus the demand the solver used')
    })
    row = residualFirst + 3
    closingLabel = 'Demand-ray verdict'
    closingOk = 'capacity lies on the demand ray'
    closingBad = 'CHECK - the capacity point is not on the demand ray'
  } else {
    residualFirst = row
    ;([
      ['Residual ΔP', `=$B$${responseFirst}-${targetRefs.p}`, kn(result.residual.P), 'kN'],
      ['Residual ΔMx', `=$B$${responseFirst + 1}-${targetRefs.mx}`, knm(result.residual.Mx), 'kN·m'],
      ['Residual ΔMy', `=$B$${responseFirst + 2}-${targetRefs.my}`, knm(result.residual.My), 'kN·m']
    ] as const).forEach(([label, formula, value, unit], index) => {
      const r = residualFirst + index
      sheet.getCell(r, 1).value = label
      setFormula(sheet.getCell(r, 2), formula, value, '0.000000')
      sheet.getCell(r, 3).value = unit
      keyValueNote(sheet, r, 'Response minus the demand the solver balanced')
    })
    row = residualFirst + 3
    closingLabel = 'Equilibrium verdict'
    closingOk = 'in equilibrium'
    closingBad = 'CHECK - the stored plane does not balance the demand'
  }

  const normRow = row
  sheet.getCell(row, 1).value = 'Relative residual'
  setFormula(
    sheet.getCell(row, 2),
    `=MAX(ABS($B$${residualFirst})/MAX(ABS(${targetRefs.p}),1),ABS($B$${residualFirst + 1})/MAX(ABS(${targetRefs.mx}),1),ABS($B$${residualFirst + 2})/MAX(ABS(${targetRefs.my}),1))`,
    isBlock
      ? 0
      : Math.max(
          Math.abs(kn(result.residual.P)) / Math.max(Math.abs(kn(target.P)), 1),
          Math.abs(knm(result.residual.Mx)) / Math.max(Math.abs(knm(target.Mx)), 1),
          Math.abs(knm(result.residual.My)) / Math.max(Math.abs(knm(target.My)), 1)
        ),
    '0.00E+00'
  )
  keyValueNote(sheet, row, 'Largest component residual, normalised on the demand')
  row += 1
  sheet.getCell(row, 1).value = closingLabel
  setFormula(
    sheet.getCell(row, 2),
    `=IF($B$${normRow}<=0.0001,"${closingOk}","${closingBad}")`,
    closingOk,
    '@'
  )
  sheet.getCell(row, 2).font = { ...(sheet.getCell(row, 2).font ?? {}), bold: true }
  keyValueNote(sheet, row, 'The verdict recomputes from the residual above, so an edited input that breaks it says so.')
  row += 2

  // ---- Adequacy ------------------------------------------------------------
  row = keyValueBlock(sheet, row, 'Adequacy against the Design surface')
  const capacity = result.designCapacityPoint ?? null
  const adequacy: Array<[string, string | number, string, string]> = [
    ['Utilization UR', result.utilization ?? '—', '–', 'Governing proportional 3D ray against the Design surface'],
    ['UR interval lower', result.designCheck.evaluated
      ? result.designCheck.utilizationInterval.lower ?? '—'
      : '—', '–', 'Lower bound carried by the kernel check'],
    ['UR interval upper', result.designCheck.evaluated
      ? result.designCheck.utilizationInterval.upper ?? '—'
      : '—', '–', 'Upper bound carried by the kernel check'],
    ['Relative uncertainty', result.designCheck.evaluated
      ? result.designCheck.utilizationInterval.relativeUncertainty ?? '—'
      : '—', '–', 'Sampling uncertainty carried by the kernel check'],
    ['Uncertainty evidence', result.designCheck.evaluated
      ? result.designCheck.utilizationInterval.evidence
      : 'not evaluated', '–', 'Evidence identifier carried by the kernel check'],
    ['Kernel adequacy', result.designCheck.evaluated
      ? result.designCheck.adequacy.toUpperCase()
      : 'NOT CHECKED', '–', 'Three-state decision produced by the kernel'],
    ['Fixed-P ratio', result.fixedPUtilization ?? '—', '–', 'Secondary diagnostic at constant axial force'],
    ['φ', result.resistance?.factor ?? '—', '–', 'Resistance factor at the capacity point'],
    ['Classification', result.resistance?.classification ?? '—', '–', 'Resistance state at the capacity point'],
    ['Capacity P', capacity ? kn(capacity.P) : '—', 'kN', 'Design surface point on the demand ray'],
    ['Capacity Mx', capacity ? knm(capacity.Mx) : '—', 'kN·m', 'Design surface point on the demand ray'],
    ['Capacity My', capacity ? knm(capacity.My) : '—', 'kN·m', 'Design surface point on the demand ray'],
    ['Strain admissibility', result.admissibility.evaluated === false
      ? 'not evaluated (cap face)'
      : result.admissibility.ok ? 'admissible' : 'INADMISSIBLE', '–', 'Whether the converged plane stays inside the material domain'],
    ['Solver message', result.message, '–', 'Reported by the kernel']
  ]
  const adequacyFirst = row
  adequacy.forEach(([label, value, unit, basis], index) => {
    const r = adequacyFirst + index
    sheet.getCell(r, 1).value = label
    sheet.getCell(r, 2).value = value
    if (typeof value === 'number') sheet.getCell(r, 2).numFmt = '#,##0.0000'
    sheet.getCell(r, 3).value = unit
    keyValueNote(sheet, r, basis)
    styleGenerated(sheet.getCell(r, 2))
  })
  row = adequacyFirst + adequacy.length
  sheet.getCell(row, 1).value = 'Verdict'
  sheet.getCell(row, 2).value = verdictOf(result)
  sheet.getCell(row, 2).font = { ...(sheet.getCell(row, 2).font ?? {}), bold: true }
  keyValueNote(sheet, row, 'Copied from the kernel three-state decision; the workbook does not reclassify UR.')
}

// ---------------------------------------------------------------------------
// Workbook
// ---------------------------------------------------------------------------

/**
 * The workbook and the charts to be written into its finished package.
 *
 * exceljs has no chart API, so the curve plots are injected after serialisation. Splitting the
 * build this way keeps that a byte-level step at the edge: everything here still produces an
 * ordinary exceljs workbook, and a caller that only reads cells can ignore the charts entirely.
 */
export const buildDemandCheckWorkbookParts = async (input: DemandCheckExcelInput) => {
  if (input.rebars.length === 0) {
    throw new ExcelExportError('The section has no reinforcement to report.')
  }
  const charts: SheetChart[] = []
  const workbook = await createWorkbook()
  const defineName = createDefineName(workbook)
  const profile = calculationProfile(input.calculationProfileId)

  const solved = solveLoadcases({
    calculationProfileId: input.calculationProfileId,
    section: input.section,
    rebars: input.rebars,
    materialStore: input.materialStore,
    designBasis: input.designBasis,
    analysisOptions: input.analysisOptions,
    surface: input.surface,
    loadcases: input.loadcases
  })
  const wanted = new Set(input.detailLoadcaseIds)
  const selected = solved.solutions.filter((solution) => wanted.has(solution.loadcase.id))

  // ---- Summary -------------------------------------------------------------
  const SUMMARY_SPAN = 12
  const summary = workbook.addWorksheet('Summary', {
    views: [{ showGridLines: false }],
    properties: { tabColor: { argb: 'FFEA580C' } }
  })
  summary.columns = [26, 30, 14, 14, 14, 12, 12, 22, 12, 14, 16, 26].map((width) => ({ width }))
  reportTitle(summary, 'DEMAND CHECK — ALL COMBINATIONS', SUMMARY_SPAN)
  sheetNote(
    summary,
    2,
    SUMMARY_SPAN,
    'Every combination on the project is listed. A combination marked "worked through" also has its own inverse, vertical-curve and fixed-P sheets in this workbook.'
  )

  const identity: Array<[string, string]> = [
    ['Project', input.projectName],
    ['Section', input.sectionName],
    ['Calculation profile', profile.label],
    ['Mechanics', profile.mechanics === 'equivalent-rectangular-block'
      ? 'Equivalent rectangular stress block'
      : 'Stress-strain integration'],
    ['Resistance profile', input.designBasis.identity.document],
    ['Profile edition', input.designBasis.identity.edition],
    ['Verification status', input.designBasis.verificationStatus],
    ['Sampling mode', input.surface.analysisOptions.samplingMode],
    ['Units', 'mm · N · MPa internally; forces reported in kN, moments in kN·m'],
    ['Sign convention', 'Compression positive; Mx = ΣF·(y−yc); My = ΣF·(x−xc)'],
    ['Client', input.projectInformation?.client ?? ''],
    ['Company', input.projectInformation?.company ?? ''],
    ['Designed by', input.projectInformation?.designedBy ?? ''],
    ['Checked by', input.projectInformation?.checkedBy ?? ''],
    ['Address', input.projectInformation?.address ?? ''],
    ['Date', input.projectInformation?.date ?? '']
  ]
  const identityFirst = tableBlock(summary, 3, 'Project and calculation identity', ['Item', 'Value'])
  identity.forEach(([label, value], index) => {
    const r = identityFirst + index
    summary.getCell(r, 1).value = label
    const cell = summary.getCell(r, 2)
    cell.value = value
    cell.alignment = { wrapText: true, vertical: 'middle' }
    styleGenerated(cell)
  })

  const checkFirst = tableBlock(summary, identityFirst + identity.length + 1, 'Combination check', [
    '#', 'Combination', 'Pu (kN)', 'Mux (kN·m)', 'Muy (kN·m)', 'θL (°)', 'φ',
    'Classification', 'UR', 'Fixed-P ratio', 'Verdict', 'In this workbook'
  ])
  const checkHeaderRow = checkFirst - 1
  solved.solutions.forEach(({ loadcase, result }, index) => {
    const r = checkFirst + index
    summary.getCell(r, 1).value = index + 1
    summary.getCell(r, 2).value = loadcase.name
    summary.getCell(r, 3).value = kn(loadcase.P)
    summary.getCell(r, 4).value = knm(loadcase.Mx)
    summary.getCell(r, 5).value = knm(loadcase.My)
    summary.getCell(r, 6).value = loadcaseAngleDeg(loadcase)
    summary.getCell(r, 7).value = result.resistance?.factor ?? '—'
    summary.getCell(r, 8).value = result.resistance?.classification ?? '—'
    summary.getCell(r, 9).value = result.utilization ?? '—'
    summary.getCell(r, 10).value = result.fixedPUtilization ?? '—'
    const verdict = verdictOf(result)
    summary.getCell(r, 11).value = verdict
    summary.getCell(r, 11).font = {
      bold: true,
      color: { argb: verdict === 'ADEQUATE' ? 'FF15803D' : verdict === 'INADEQUATE' ? 'FFB91C1C' : 'FFB45309' }
    }
    const position = selected.findIndex((item) => item.loadcase.id === loadcase.id)
    summary.getCell(r, 12).value = position >= 0 ? `worked through — LC${position + 1}` : 'summary only'
    for (const column of [3, 4, 5, 6]) summary.getCell(r, column).numFmt = '#,##0.000'
    for (const column of [7, 9, 10]) summary.getCell(r, column).numFmt = '#,##0.0000'
    for (const column of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12]) styleGenerated(summary.getCell(r, column))
  })
  if (solved.solutions.length > 0) {
    summary.autoFilter = `A${checkHeaderRow}:L${checkHeaderRow + solved.solutions.length}`
    zebraRows(summary, checkHeaderRow, solved.solutions.length, SUMMARY_SPAN)
  }
  const summaryRow = checkFirst + solved.solutions.length + 1
  sheetNote(
    summary,
    summaryRow,
    SUMMARY_SPAN,
    'UR is the governing proportional utilization: the factored demand vector scaled until it meets the Design surface. The fixed-P ratio holds the axial force constant instead and is a secondary diagnostic only.'
  )
  if (selected.length === 0) {
    sheetNote(
      summary,
      summaryRow + 2,
      SUMMARY_SPAN,
      'No combination was selected for a worked calculation. Select combinations in Demand Check before exporting to include the inverse, vertical-curve and fixed-P sheets.'
    )
  }
  freezeUnder(summary, checkHeaderRow)

  // ---- Shared project sheets ----------------------------------------------
  const context = prepareAuditContext(workbook, defineName, {
    projectName: input.projectName,
    projectInformation: input.projectInformation,
    sectionName: input.sectionName,
    section: input.section,
    rebars: input.rebars,
    materialStore: input.materialStore,
    designBasis: input.designBasis,
    surface: input.surface,
    resistanceStage: 'design',
    loadcases: input.loadcases
  })

  // ---- One sheet group per selected loadcase ------------------------------
  const blockEvaluationFor = (solution: SolvedLoadcase): NominalBlockEvaluation | null => {
    const prepared = solved.blockPrepared
    const trace = solution.result.equivalentBlock
    if (!prepared || !trace) return null
    return prepared.model.bindNominalEvaluator(prepared.section)({
      neutralAxisAngle: trace.neutralAxisAngle,
      neutralAxisDepth: trace.neutralAxisDepth
    }).source as NominalBlockEvaluation
  }

  selected.forEach((solution, index) => {
    const tag = `LC${index + 1}`
    const { loadcase } = solution
    const contextRows: Array<readonly [string, string | number]> = [
      ['Loadcase', loadcase.name],
      ['Pu (kN)', kn(loadcase.P)],
      ['Mux / Muy (kN·m)', `${knm(loadcase.Mx).toFixed(3)} / ${knm(loadcase.My).toFixed(3)}`]
    ]

    const inverse = workbook.addWorksheet(`${tag}_Inverse`, {
      views: [{ state: 'frozen', ySplit: 3, showGridLines: false }],
      properties: { tabColor: { argb: 'FF0F766E' } }
    })
    const blockEvaluation = blockEvaluationFor(solution)
    writeInverseSheet(
      inverse,
      context,
      solution,
      {
        e0: `${tag}_e0`,
        kx: `${tag}_kx`,
        ky: `${tag}_ky`,
        pu: `${tag}_Pu`,
        mux: `${tag}_Mux`,
        muy: `${tag}_Muy`
      },
      blockEvaluation,
      // Only the block route with a global resultant factor has a φ step between the ledger it
      // publishes and the response it is checked on.
      blockEvaluation && input.designBasis.format === 'globalResultantFactor'
        ? solution.result.resistance?.factor ?? 1
        : null
    )

    // The curve writers own the freeze pane: where the table starts depends on how many head rows
    // the sheet needs, so only the grid-line choice is made here.
    const vertical = workbook.addWorksheet(`${tag}_Vertical`, {
      views: [{ showGridLines: false }],
      properties: { tabColor: { argb: 'FF2563EB' } }
    })
    // The meridian a loadcase is checked on is the one its own equilibrium defines. Without a
    // converged state there is none, so the demand moment direction is used and labelled as such.
    const beta = solution.beta
    const meridianRad = beta ?? (loadcaseAngleDeg(loadcase) * Math.PI) / 180
    const verticalSheet = writeVerticalAuditSheet(context, {
      sheet: vertical,
      sliceAngleDeg: beta === null ? loadcaseAngleDeg(loadcase) : (beta * 180) / Math.PI,
      exactDirectionCurve: beta === null ? null : solved.exactDirectionCurve(beta),
      titleText: `VERTICAL CURVE — ${loadcase.name}`,
      contextRows: [
        ...contextRows,
        ['Meridian basis', beta === null
          ? 'demand moment direction (no converged state)'
          : 'equilibrium strain direction βeq']
      ],
      // The demand projected on the meridian: the same number the check compares against the curve.
      demand: {
        x: knm(loadcase.Mx * Math.cos(meridianRad) + loadcase.My * Math.sin(meridianRad)),
        y: kn(loadcase.P),
        xLabel: 'Demand M on β (kN·m)',
        yLabel: 'Demand P (kN)',
        label: 'Demand'
      }
    })
    if (verticalSheet.chart) charts.push(verticalSheet.chart)

    const lower = workbook.addWorksheet(`${tag}_FixedP_Lo`, {
      views: [{ showGridLines: false }],
      properties: { tabColor: { argb: 'FF7C3AED' } }
    })
    const upper = workbook.addWorksheet(`${tag}_FixedP_Up`, {
      views: [{ showGridLines: false }],
      properties: { tabColor: { argb: 'FF7C3AED' } }
    })
    const fixedResult = workbook.addWorksheet(`${tag}_FixedP`, {
      views: [{ showGridLines: false }],
      properties: { tabColor: { argb: 'FFEA580C' } }
    })
    const fixedSheets = writeFixedPAuditSheets(context, {
      lower,
      upper,
      result: fixedResult,
      fixedP: loadcase.P,
      selectedPName: `${tag}_Selected_P`,
      titleText: `FIXED-P CONTOUR — ${loadcase.name}`,
      lowerTitleText: `FIXED-P LOWER BRACKETING STATIONS — ${loadcase.name}`,
      upperTitleText: `FIXED-P UPPER BRACKETING STATIONS — ${loadcase.name}`,
      contextRows,
      demand: {
        x: knm(loadcase.Mx),
        y: knm(loadcase.My),
        xLabel: 'Demand Mux (kN·m)',
        yLabel: 'Demand Muy (kN·m)',
        label: 'Demand'
      }
    })
    if (fixedSheets.chart) charts.push(fixedSheets.chart)
  })

  workbook.calcProperties.fullCalcOnLoad = true
  return { workbook, charts }
}

export const buildDemandCheckWorkbook = async (input: DemandCheckExcelInput) =>
  (await buildDemandCheckWorkbookParts(input)).workbook

export const buildDemandCheckWorkbookBytes = async (input: DemandCheckExcelInput): Promise<Uint8Array> => {
  const { workbook, charts } = await buildDemandCheckWorkbookParts(input)
  const buffer = await workbook.xlsx.writeBuffer()
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer as ArrayBuffer)
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return injectSheetCharts(copy, charts)
}

export const exportDemandCheckWorkbook = async (input: DemandCheckExcelInput) => {
  const bytes = await buildDemandCheckWorkbookBytes(input)
  return new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  })
}
