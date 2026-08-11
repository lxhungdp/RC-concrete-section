/**
 * Independent recalculation of the Demand Check workbook.
 *
 * The workbook claims that its displayed numbers are formulas over the project inputs. The only way
 * to test that claim is to throw the exported file at a spreadsheet engine that has never seen this
 * codebase and compare what it computes with what the kernel computed. HyperFormula does that here:
 *
 *   1  the file recalculates with no formula errors anywhere;
 *   2  every inverse sheet's formula ledger reproduces the kernel's own response for that loadcase,
 *      which is the whole point of publishing ε0, κx and κy as named inputs;
 *   3  every vertical and fixed-P source row reconstructs its engine point from its own criterion;
 *   4  the fixed-P interpolation lands on the engine's contour;
 *   5  the workbook and the PDF report agree combination for combination — one solve, two formats.
 *
 * Run: npm run test:demand-check
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ExcelJS from 'exceljs'
import { HyperFormula } from 'hyperformula'
import { buildDesignPreviewSurface, type PreviewSurface } from '@pm/analysis'
import { buildEquivalentBlockPreviewSurface } from '@pm/analysis-equivalent-block'
import { geometryInputRebars, sectionGeometryFromGeometryInput } from '@pm/geometry'
import {
  analysisMeshKernelOptions,
  isEquivalentBlockProfileId,
  parseProjectDocument,
  type AnalysisOptions,
  type EquivalentBlockAnalysisOptions
} from '@pm/project'
import { buildColumnReportModel } from '../../src/model/report-model'
import { solveLoadcases } from '../../src/model/loadcase-solutions'
import {
  buildDemandCheckWorkbook,
  demandCheckWorkbookFileName,
  type DemandCheckExcelInput
} from '../../src/excel/demand-check'

const failures: string[] = []

const pass = (label: string, condition: boolean, detail = '') => {
  const line = `${condition ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`
  console.log(line)
  if (!condition) failures.push(line)
}

const near = (actual: number, expected: number, relative: number, absolute: number) =>
  Number.isFinite(actual) &&
  Math.abs(actual - expected) <= Math.max(absolute, Math.abs(expected) * relative)

// ---------------------------------------------------------------------------
// Spreadsheet recalculation
// ---------------------------------------------------------------------------

const toHyperFormulaValue = (cell: ExcelJS.Cell): string | number | boolean | null => {
  const value = cell.value
  if (value === null || value === undefined) return null
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') return value
  if (typeof value === 'object' && 'formula' in value && typeof value.formula === 'string') {
    return `=${value.formula}`
  }
  if (typeof value === 'object' && 'result' in value) {
    const result = (value as { result?: number | string | boolean | null }).result
    return typeof result === 'number' || typeof result === 'string' || typeof result === 'boolean'
      ? result
      : null
  }
  return null
}

const recalculate = async (workbook: ExcelJS.Workbook) => {
  const buffer = await workbook.xlsx.writeBuffer()
  const readBack = new ExcelJS.Workbook()
  await readBack.xlsx.load(buffer as ArrayBuffer)
  const sheets: Record<string, Array<Array<string | number | boolean | null>>> = {}
  for (const sheet of readBack.worksheets) {
    const grid: Array<Array<string | number | boolean | null>> = []
    for (let row = 1; row <= sheet.rowCount; row++) {
      const values: Array<string | number | boolean | null> = []
      for (let column = 1; column <= sheet.columnCount; column++) {
        values.push(toHyperFormulaValue(sheet.getCell(row, column)))
      }
      grid.push(values)
    }
    sheets[sheet.name] = grid
  }
  const engine = HyperFormula.buildFromSheets(sheets, {
    licenseKey: 'gpl-v3',
    useArrayArithmetic: true,
    smartRounding: false
  })
  for (const entry of readBack.definedNames.model) {
    for (const range of entry.ranges) engine.addNamedExpression(entry.name, `=${range}`)
  }
  return { readBack, engine, bytes: buffer as ArrayBuffer }
}

const formulaErrors = (readBack: ExcelJS.Workbook, engine: HyperFormula) => {
  const errors: string[] = []
  for (const sheet of readBack.worksheets) {
    const sheetId = engine.getSheetId(sheet.name)
    if (sheetId === undefined) continue
    engine.getSheetValues(sheetId).forEach((row, rowIndex) => {
      row.forEach((value, columnIndex) => {
        if (value !== null && typeof value === 'object' && 'type' in value) {
          const error = value as { type: string; message?: string }
          errors.push(`${sheet.name}!R${rowIndex + 1}C${columnIndex + 1}: ${error.type} ${error.message ?? ''}`)
        }
      })
    })
  }
  return errors
}

const valueAt = (engine: HyperFormula, sheetName: string, address: string) => {
  const sheetId = engine.getSheetId(sheetName)
  if (sheetId === undefined) return null
  const cell = engine.simpleCellAddressFromString(address, sheetId)
  return cell ? engine.getCellValue(cell) : null
}

/**
 * Row of a curve sheet's table header.
 *
 * The head above it is a stacked identity block whose length follows how much context the sheet
 * carries, so the table starts wherever that ends; finding it by its first header cell keeps these
 * checks about the calculation rather than the layout.
 */
const headerRowOf = (sheet: ExcelJS.Worksheet) => {
  for (let row = 3; row <= 40; row++) {
    const first = String(sheet.getCell(row, 1).value ?? '')
    if (first === '#' || first === 'β (deg)') return row
  }
  throw new Error(`${sheet.name} has no table header`)
}

/** Row index of a label in column A, or -1. */
const rowOfLabel = (sheet: ExcelJS.Worksheet, label: string) => {
  for (let row = 1; row <= sheet.rowCount; row++) {
    if (sheet.getCell(row, 1).value === label) return row
  }
  return -1
}

/**
 * Reuses the chart-audit contract: on every source block, the value reconstructed from the
 * station's own criterion must equal the engine point it was built from.
 */
const checkSourceRows = (
  readBack: ExcelJS.Workbook,
  engine: HyperFormula,
  sheetName: string,
  label: string
) => {
  const sheet = readBack.getWorksheet(sheetName)
  if (!sheet) {
    pass(`${label}: ${sheetName} exists`, false)
    return
  }
  const headerRow = headerRowOf(sheet)
  const headerColumns = new Map<string, number>()
  for (let column = 1; column <= sheet.columnCount; column++) {
    const value = sheet.getCell(headerRow, column).value
    if (typeof value === 'string') headerColumns.set(value, column)
  }
  const required = ['Station / role', 'Final P', 'Final Mx', 'Final My', 'Engine P', 'Engine Mx', 'Engine My']
  const missing = required.filter((title) => !headerColumns.has(title))
  if (missing.length > 0) {
    pass(`${label}: ${sheetName} publishes the source block`, false, missing.join(', '))
    return
  }
  let rows = 0
  let worst = 0
  for (let row = headerRow + 1; row <= sheet.rowCount; row++) {
    if (!sheet.getCell(row, headerColumns.get('Station / role')!).value) continue
    rows += 1
    const read = (title: string) => {
      const column = headerColumns.get(title)!
      const value = valueAt(engine, sheetName, `${sheet.getColumn(column).letter}${row}`)
      return typeof value === 'number' ? value : Number.NaN
    }
    for (const [computed, expected] of [
      [read('Final P'), read('Engine P')],
      [read('Final Mx'), read('Engine Mx')],
      [read('Final My'), read('Engine My')]
    ] as const) {
      const error = Math.abs(computed - expected) / Math.max(1e-6, Math.abs(expected))
      worst = Math.max(worst, Number.isFinite(error) ? error : 1)
    }
  }
  pass(
    `${label}: ${sheetName} rebuilds every engine point from its own criterion`,
    rows > 0 && worst < 1e-6,
    `${rows} rows, worst relative ${worst.toExponential(2)}`
  )
}

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

const CASES = [
  {
    file: 'docs/examples/reference-case/projects/PM-advanced (7) 2D.pm-project.json',
    label: 'stress-strain'
  },
  {
    file: 'docs/examples/equivalent-block/ACI-EB-01-rectangle-8-bars.pm-project.json',
    label: 'equivalent-block'
  }
] as const

const runCase = async (relativePath: string, label: string) => {
  console.log(`\n================ ${label}: ${relativePath} ================`)
  const parsed = parseProjectDocument(readFileSync(resolve(process.cwd(), relativePath), 'utf8'))
  assert.ok(parsed.ok, `${relativePath} must parse`)
  if (!parsed.ok) return
  const document = parsed.document
  const geometry = document.inputs.geometry
  const section = sectionGeometryFromGeometryInput(geometry)
  const rebars = geometryInputRebars(geometry)
  const profileId = document.inputs.calculationProfileId
  const materialStore = document.inputs.materials
  const designBasis = document.inputs.design
  const analysisOptions = document.inputs.analysis
  const loadcases = document.inputs.loadings.combinations

  const surface: PreviewSurface = isEquivalentBlockProfileId(profileId)
    ? buildEquivalentBlockPreviewSurface(
        profileId,
        section,
        rebars,
        materialStore,
        designBasis,
        analysisOptions as EquivalentBlockAnalysisOptions
      )
    : (() => {
        const options = analysisOptions as AnalysisOptions
        return buildDesignPreviewSurface(
          section,
          rebars,
          materialStore,
          designBasis,
          analysisMeshKernelOptions(options),
          options
        )
      })()

  const input: DemandCheckExcelInput = {
    projectName: document.meta.name,
    projectInformation: document.meta.information,
    sectionName: geometry.name,
    calculationProfileId: profileId,
    section,
    rebars,
    materialStore,
    designBasis,
    analysisOptions,
    surface,
    loadcases,
    detailLoadcaseIds: loadcases.map((loadcase) => loadcase.id)
  }

  console.log('== 1. Sheet structure ==')
  const workbook = await buildDemandCheckWorkbook(input)
  const names = workbook.worksheets.map((sheet) => sheet.name)
  const isBlock = isEquivalentBlockProfileId(profileId)
  const expected = [
    'Summary',
    'Geometry',
    'Materials',
    ...(isBlock ? [] : ['Mesh']),
    ...loadcases.flatMap((_, index) => {
      const tag = `LC${index + 1}`
      return [`${tag}_Inverse`, `${tag}_Vertical`, `${tag}_FixedP_Lo`, `${tag}_FixedP_Up`, `${tag}_FixedP`]
    })
  ]
  pass('sheet list is inputs, mesh, then one group per selected loadcase',
    JSON.stringify(names) === JSON.stringify(expected),
    names.join(', '))
  pass('every sheet name fits the Excel 31-character limit',
    names.every((name) => name.length <= 31))

  console.log('== 2. The exported file recalculates ==')
  const { readBack, engine } = await recalculate(workbook)
  const errors = formulaErrors(readBack, engine)
  pass('no formula evaluates to an error', errors.length === 0, errors.slice(0, 4).join(' | '))

  console.log('== 3. Each inverse sheet reproduces the kernel response ==')
  const solved = solveLoadcases({
    calculationProfileId: profileId,
    section,
    rebars,
    materialStore,
    designBasis,
    analysisOptions,
    surface,
    loadcases
  })
  solved.solutions.forEach((solution, index) => {
    const sheetName = `LC${index + 1}_Inverse`
    const sheet = readBack.getWorksheet(sheetName)
    if (!sheet) {
      pass(`${sheetName} exists`, false)
      return
    }
    // The block inverse returns the capacity point on the demand ray; the stress-strain inverse
    // returns the section response in equilibrium with the demand. Both are published, under the
    // name that says which one it is.
    const responseRow = rowOfLabel(sheet, isBlock ? 'Capacity P' : 'Response P')
    pass(`${sheetName}: publishes its ${isBlock ? 'capacity' : 'response'} block`, responseRow > 0)
    if (responseRow < 0) return
    const read = (offset: number) => {
      const value = valueAt(engine, sheetName, `B${responseRow + offset}`)
      return typeof value === 'number' ? value : Number.NaN
    }
    const { result } = solution
    const checks: Array<[string, number, number]> = [
      ['P', read(0), result.response.P / 1_000],
      ['Mx', read(1), result.response.Mx / 1_000_000],
      ['My', read(2), result.response.My / 1_000_000]
    ]
    for (const [component, computed, expectedValue] of checks) {
      pass(
        `${sheetName}: the formula ledger reproduces the kernel ${component}`,
        near(computed, expectedValue, 1e-6, 1e-6),
        `sheet ${computed} vs kernel ${expectedValue}`
      )
    }
    // The closing verdict is the sheet checking itself: for stress-strain that the plane balances
    // the demand, for the block route that the capacity point is colinear with it.
    const verdictLabel = isBlock ? 'Demand-ray verdict' : 'Equilibrium verdict'
    const verdictRow = rowOfLabel(sheet, verdictLabel)
    if (verdictRow > 0 && result.converged) {
      const verdict = valueAt(engine, sheetName, `B${verdictRow}`)
      pass(
        `${sheetName}: recomputed ${verdictLabel.toLowerCase()} holds`,
        typeof verdict === 'string' && !verdict.startsWith('CHECK'),
        String(verdict)
      )
    }
    const residualRow = rowOfLabel(sheet, 'Residual ΔP')
    if (residualRow > 0 && !isBlock) {
      const residual = valueAt(engine, sheetName, `B${residualRow}`)
      pass(
        `${sheetName}: recalculated ΔP matches the solver residual`,
        typeof residual === 'number' && near(residual, result.residual.P / 1_000, 1e-5, 1e-6),
        `${residual} vs ${result.residual.P / 1_000}`
      )
    }
  })

  console.log('== 4. Curve sheets rebuild their engine points ==')
  loadcases.forEach((_, index) => {
    const tag = `LC${index + 1}`
    checkSourceRows(readBack, engine, `${tag}_Vertical`, tag)
    const fixedResult = readBack.getWorksheet(`${tag}_FixedP`)
    const rows = fixedResult
      ? Array.from(
          { length: Math.max(0, fixedResult.rowCount - headerRowOf(fixedResult)) },
          (_unused, offset) => offset + headerRowOf(fixedResult) + 1
        ).filter((row) => typeof fixedResult.getCell(row, 1).value === 'number')
      : []
    if (rows.length === 0) {
      pass(`${tag}: fixed-P cut has no points and says so`,
        Boolean(fixedResult && String(fixedResult.getCell(headerRowOf(fixedResult) + 1, 1).value ?? '').includes('no intersection')),
        'axial force outside the Design surface')
      return
    }
    checkSourceRows(readBack, engine, `${tag}_FixedP_Lo`, tag)
    checkSourceRows(readBack, engine, `${tag}_FixedP_Up`, tag)
    // Columns are found by header rather than letter: the sheet drops program-only columns, and a
    // test that hard-codes positions fails on layout rather than on the calculation it is checking.
    const columnOf = (title: string) => {
      for (let column = 1; column <= fixedResult!.columnCount; column++) {
        if (fixedResult!.getCell(headerRowOf(fixedResult!), column).value === title) return column
      }
      throw new Error(`${tag}_FixedP has no ${title} column`)
    }
    const mxColumn = columnOf('Mx (kN·m)')
    const myColumn = columnOf('My (kN·m)')
    const engineMxColumn = columnOf('Engine Mx')
    const engineMyColumn = columnOf('Engine My')
    let worst = 0
    for (const row of rows) {
      const mx = valueAt(engine, `${tag}_FixedP`, `${fixedResult!.getColumn(mxColumn).letter}${row}`)
      const my = valueAt(engine, `${tag}_FixedP`, `${fixedResult!.getColumn(myColumn).letter}${row}`)
      const engineMx = Number(fixedResult!.getCell(row, engineMxColumn).value)
      const engineMy = Number(fixedResult!.getCell(row, engineMyColumn).value)
      const scale = Math.max(1e-6, Math.hypot(engineMx, engineMy))
      worst = Math.max(worst, Math.hypot(Number(mx) - engineMx, Number(my) - engineMy) / scale)
    }
    pass(`${tag}: fixed-P interpolation lands on the engine contour`, worst < 1e-6,
      `${rows.length} rows, worst relative ${worst.toExponential(2)}`)
  })

  console.log('== 5. Workbook and PDF report agree ==')
  const model = buildColumnReportModel({
    projectName: document.meta.name,
    projectInformation: document.meta.information,
    sectionName: geometry.name,
    calculationProfileId: profileId,
    section,
    rebars,
    materialStore,
    designBasis,
    analysisOptions,
    surface,
    loadcases,
    detailLoadcaseIds: loadcases.map((loadcase) => loadcase.id)
  })
  const summary = readBack.getWorksheet('Summary')!
  const summaryHeader = rowOfLabel(summary, '#')
  let mismatches = 0
  model.combinations.forEach((combination, index) => {
    const row = summaryHeader + 1 + index
    const sheetUr = summary.getCell(row, 9).value
    const reportUr = combination.utilization
    const agrees =
      reportUr === null
        ? sheetUr === '—'
        : typeof sheetUr === 'number' && near(sheetUr, reportUr, 1e-12, 1e-12)
    if (!agrees) mismatches += 1
    if (summary.getCell(row, 2).value !== combination.name) mismatches += 1
  })
  pass('every combination has the same name and utilization in both formats', mismatches === 0,
    `${mismatches} mismatch(es) over ${model.combinations.length} combinations`)

  console.log('== 6. Partial selection ==')
  const firstOnly = await buildDemandCheckWorkbook({ ...input, detailLoadcaseIds: [loadcases[0].id] })
  const firstNames = firstOnly.worksheets.map((sheet) => sheet.name)
  pass('selecting one combination produces exactly one sheet group',
    firstNames.filter((name) => name.startsWith('LC')).length === 5 &&
      firstNames.includes('LC1_Inverse') && !firstNames.includes('LC2_Inverse'),
    firstNames.join(', '))
  const firstSummary = firstOnly.getWorksheet('Summary')!
  const header = rowOfLabel(firstSummary, '#')
  const workedThrough = Array.from({ length: loadcases.length }, (_unused, index) =>
    String(firstSummary.getCell(header + 1 + index, 12).value)
  )
  pass('the summary still lists every combination and marks which were worked through',
    workedThrough.length === loadcases.length &&
      workedThrough.filter((value) => value.startsWith('worked through')).length === 1,
    workedThrough.join(' | '))

  const none = await buildDemandCheckWorkbook({ ...input, detailLoadcaseIds: [] })
  pass('selecting nothing still exports the summary and inputs, with no loadcase group',
    none.worksheets.every((sheet) => !sheet.name.startsWith('LC')) &&
      none.worksheets.some((sheet) => sheet.name === 'Summary'),
    none.worksheets.map((sheet) => sheet.name).join(', '))

  console.log(`      file name: ${demandCheckWorkbookFileName(input)}`)
}

const run = async () => {
  for (const testCase of CASES) await runCase(testCase.file, testCase.label)
  if (failures.length > 0) {
    console.error(`\n${failures.length} check(s) failed:`)
    for (const line of failures) console.error(`  ${line}`)
    process.exitCode = 1
    return
  }
  console.log('\nAll Demand Check workbook checks passed.')
}

void run()
