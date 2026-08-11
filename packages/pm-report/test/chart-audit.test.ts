import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import ExcelJS from 'exceljs'
import { HyperFormula } from 'hyperformula'
import {
  activeDesignSurfaceDataset,
  buildDesignPreviewSurface,
  buildDirectMeridianSection,
  buildExactDirectionCurveFromPrepared,
  prepareAnalysis
} from '@pm/analysis'
import { buildEquivalentBlockPreviewSurface } from '@pm/analysis-equivalent-block'
import { geometryInputRebars, sectionGeometryFromGeometryInput } from '@pm/geometry'
import {
  analysisMeshKernelOptions,
  createAdaptiveAnalysisOptions,
  createDefaultAnalysisOptions,
  parseProjectDocument,
  type EquivalentBlockAnalysisOptions
} from '@pm/project'
import { referenceProjectDocument } from '../../pm-analysis/test/fixtures/reference-case'
import {
  buildChartAuditWorkbook,
  buildChartAuditWorkbookBytes,
  chartAuditWorkbookFileName,
  type ChartAuditWorkbookInput
} from '../src/excel/chart-audit'

const document = referenceProjectDocument()
const section = sectionGeometryFromGeometryInput(document.inputs.geometry)
const rebars = geometryInputRebars(document.inputs.geometry)
const analysisOptions = (() => {
  const options = createDefaultAnalysisOptions()
  options.mesh.sizing = { type: 'automatic', seedDivisions: 8 }
  options.stations.refinement = { type: 'fixed' }
  options.directions.refinement = { type: 'fixed', probe: 'all' }
  return options
})()
const surface = buildDesignPreviewSurface(
  section,
  rebars,
  document.inputs.materials,
  document.inputs.design,
  analysisMeshKernelOptions(analysisOptions),
  analysisOptions
)

const workbookInput = (
  source: ChartAuditWorkbookInput['source']
): ChartAuditWorkbookInput => ({
  projectName: document.meta.name,
  projectInformation: {
    ...document.meta.information,
    client: 'Engineering review client',
    company: 'Audit engineering'
  },
  sectionName: section.name,
  section,
  rebars,
  materialStore: document.inputs.materials,
  designBasis: document.inputs.design,
  surface,
  source,
  resistanceStage: 'design',
  sliceAngleDeg: 15,
  fixedP: 0,
  loadcases: document.inputs.loadings.combinations
})

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

const recalculateWorkbook = async (workbook: ExcelJS.Workbook) => {
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
  return { readBack, engine }
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

/**
 * Row of the table header.
 *
 * The sheet head is a stacked identity block whose length depends on how much context the caller
 * supplied, so the table starts wherever that block ends. Finding it by its first header cell keeps
 * these checks about the calculation instead of about the layout.
 */
const headerRowOf = (sheet: ExcelJS.Worksheet) => {
  for (let row = 3; row <= 40; row++) {
    const first = String(sheet.getCell(row, 1).value ?? '')
    if (first === '#' || first === 'β (deg)') return row
  }
  throw new Error(`${sheet.name} has no table header`)
}

/**
 * Row carrying `label` in column A.
 *
 * Every block on every sheet starts at column A and labels its own rows there, so looking a row up
 * by what it says keeps these checks about the calculation rather than about which row a block
 * happens to land on.
 */
const rowOfLabel = (sheet: ExcelJS.Worksheet, label: string) => {
  for (let row = 1; row <= sheet.rowCount; row++) {
    if (sheet.getCell(row, 1).value === label) return row
  }
  throw new Error(`${sheet.name} has no row labelled ${label}`)
}

const assertNearEngine = (actual: number, expected: number, label: string) => {
  const tolerance = Math.max(1e-9, Math.abs(expected) * 1e-9)
  assert.ok(
    Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
    `${label}: formula=${actual}, engine=${expected}, tolerance=${tolerance}`
  )
}

const assertAllSourceRowsMatchEngine = (
  readBack: ExcelJS.Workbook,
  engine: HyperFormula,
  sheetName: string
) => {
  const sheet = readBack.getWorksheet(sheetName)
  assert.ok(sheet, `${sheetName} must exist`)
  const sheetId = engine.getSheetId(sheetName)
  assert.notEqual(sheetId, undefined)
  const headerRow = headerRowOf(sheet)
  const headerColumns = new Map<string, number>()
  for (let column = 1; column <= sheet.columnCount; column++) {
    const value = sheet.getCell(headerRow, column).value
    if (typeof value === 'string') headerColumns.set(value, column)
  }
  const required = ['Station / role', 'Final P', 'Final Mx', 'Final My', 'Engine P', 'Engine Mx', 'Engine My', 'ΔP', 'ΔM']
  for (const label of required) assert.ok(headerColumns.has(label), `${sheetName} must contain ${label}`)
  const valueAt = (row: number, label: string) => {
    const column = headerColumns.get(label)!
    const address = engine.simpleCellAddressFromString(`${sheet.getColumn(column).letter}${row}`, sheetId!)!
    const value = engine.getCellValue(address)
    assert.equal(typeof value, 'number', `${sheetName}!${sheet.getColumn(column).letter}${row} must recalculate`)
    return value as number
  }
  for (let row = headerRow + 1; row <= sheet.rowCount; row++) {
    if (!sheet.getCell(row, headerColumns.get('Station / role')!).value) continue
    const finalP = valueAt(row, 'Final P')
    const finalMx = valueAt(row, 'Final Mx')
    const finalMy = valueAt(row, 'Final My')
    const engineP = valueAt(row, 'Engine P')
    const engineMx = valueAt(row, 'Engine Mx')
    const engineMy = valueAt(row, 'Engine My')
    assertNearEngine(finalP, engineP, `${sheetName} row ${row} P`)
    assertNearEngine(finalMx, engineMx, `${sheetName} row ${row} Mx`)
    assertNearEngine(finalMy, engineMy, `${sheetName} row ${row} My`)
    assertNearEngine(valueAt(row, 'ΔP'), finalP - engineP, `${sheetName} row ${row} cached/recalc ΔP`)
    assertNearEngine(
      valueAt(row, 'ΔM'),
      Math.hypot(finalMx - engineMx, finalMy - engineMy),
      `${sheetName} row ${row} cached/recalc ΔM`
    )
  }
}

const hasSolidFill = (cell: ExcelJS.Cell) => {
  const fill = cell.fill as ExcelJS.Fill | undefined
  if (!fill) return false
  return fill.type === 'pattern' && fill.pattern === 'solid'
}

/** Columns a merge starting at column A covers, or 1 when the cell is not merged. */
const mergedWidth = (sheet: ExcelJS.Worksheet, row: number) => {
  const anchor = sheet.getCell(row, 1)
  let width = 0
  while (width < sheet.columnCount && sheet.getCell(row, width + 1).master === anchor) width++
  return width
}

/**
 * Printable columns a row occupies before its first empty cell.
 *
 * Merged cells count as occupied; hidden diagnostic columns do not, because a heading is sized to
 * what the sheet actually shows.
 */
const filledWidth = (sheet: ExcelJS.Worksheet, row: number) => {
  let width = 0
  for (let column = 1; column <= sheet.columnCount; column++) {
    const cell = sheet.getCell(row, column)
    const occupied = cell.master !== cell ||
      (cell.value !== null && cell.value !== undefined && cell.value !== '')
    if (!occupied) break
    if (!sheet.getColumn(column).hidden) width = column
  }
  return width
}

const GROUP_FILL_ARGB = 'FFD6E4F5'

/**
 * Every block heading stops exactly where its own header row stops.
 *
 * Blocks on one sheet may be different widths — a load-case table needs six columns and a
 * reinforcement table nine — but a heading that runs past its own header is what made these sheets
 * print badly, so it is asserted rather than eyeballed.
 */
const assertBlocksAligned = (sheet: ExcelJS.Worksheet) => {
  const blocks: Array<{ title: string; width: number }> = []
  for (let row = 2; row <= sheet.rowCount; row++) {
    const cell = sheet.getCell(row, 1)
    const fill = cell.fill as ExcelJS.FillPattern | undefined
    if (fill?.fgColor?.argb !== GROUP_FILL_ARGB) continue
    const title = String(cell.value ?? '')
    const heading = mergedWidth(sheet, row)
    const header = filledWidth(sheet, row + 1)
    assert.equal(
      heading,
      header,
      `${sheet.name}: "${title}" heading spans ${heading} columns but its header row spans ${header}`
    )
    blocks.push({ title, width: heading })
  }
  assert.ok(blocks.length > 0, `${sheet.name} must publish at least one titled block`)
  // Sheet-wide furniture — title and legend — reaches the widest block, so the page edge is straight.
  const widest = Math.max(...blocks.map((block) => block.width))
  assert.equal(mergedWidth(sheet, 1), widest, `${sheet.name}: the title must span the widest block`)
  return blocks
}

test('vertical chart audit has four traceable sheets and formula-driven result values', async () => {
  const input = workbookInput('vertical')
  const workbook = await buildChartAuditWorkbook(input)

  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), [
    'Geometry',
    'Materials',
    'Mesh',
    'Result'
  ])
  const geometrySheet = workbook.getWorksheet('Geometry')!
  assert.ok(geometrySheet.rowCount > rebars.length)
  assert.equal(geometrySheet.getCell(rowOfLabel(geometrySheet, 'Client'), 2).value, 'Engineering review client')
  assert.equal(geometrySheet.getCell(rowOfLabel(geometrySheet, 'Company'), 2).value, 'Audit engineering')
  assert.ok((workbook.getWorksheet('Materials')?.rowCount ?? 0) > 10)
  assert.ok((workbook.getWorksheet('Mesh')?.rowCount ?? 0) > 6)

  const result = workbook.getWorksheet('Result')
  assert.ok(result)
  const head = headerRowOf(result)
  const first = head + 1
  assert.match(result.getCell(first, 3).formula ?? '', /^\$AC\$/)
  assert.match(result.getCell(first, 4).formula ?? '', /COS\(RADIANS/)
  const meshFormulaRow = Array.from({ length: result.rowCount - head }, (_, index) => index + head + 1)
    .find((row) => String(result.getCell(row, 37).value).startsWith('strain-state Mesh/Material'))
  assert.ok(meshFormulaRow)
  assert.match(result.getCell(meshFormulaRow, 17).formula ?? '', /SUMPRODUCT/)
  assert.match(result.getCell(meshFormulaRow, 17).formula ?? '', /Mesh_A/)
  assert.equal(typeof result.getCell(first, 3).result, 'number')
  assert.equal(typeof result.getCell(first, 4).result, 'number')

  const resolvedRow = Array.from({ length: result.rowCount - head }, (_, index) => index + head + 1)
    .find((row) => result.getCell(row, 6).value === 'c/D')
  assert.ok(resolvedRow, 'at least one station must expose its resolved c/D criterion')
  const declaredRatio = Number(String(result.getCell(resolvedRow, 5).value).match(/c\/D = ([0-9.]+)/)?.[1])
  assert.ok(Number.isFinite(declaredRatio))
  assert.ok(Math.abs(Number(result.getCell(resolvedRow, 7).value) - declaredRatio) < 1e-9)
  assert.match(result.getCell(resolvedRow, 9).formula ?? '', /^H\d+-G\d+\*J\d+$/)
  assert.equal(result.getCell(resolvedRow, 12).formula, '0')
  assert.match(result.getCell(resolvedRow, 13).formula ?? '', /\(K\d+-L\d+\)\/\(H\d+-I\d+\)/)
  assert.match(result.getCell(resolvedRow, 14).formula ?? '', /^K\d+-M\d+\*H\d+$/)
  // κx and κy are built from the strain direction published in the identity block, wherever that
  // block's rows land.
  const strainDirectionCell = `$C$${rowOfLabel(result, 'Strain direction β — station formulas (deg)')}`
  const literal = strainDirectionCell.replace(/\$/g, '\\$')
  assert.match(result.getCell(resolvedRow, 15).formula ?? '', new RegExp(`COS\\(RADIANS\\(${literal}\\)\\)`))
  assert.match(result.getCell(resolvedRow, 16).formula ?? '', new RegExp(`SIN\\(RADIANS\\(${literal}\\)\\)`))

  const yieldRatioRow = Array.from({ length: result.rowCount - head }, (_, index) => index + head + 1)
    .find((row) => result.getCell(row, 6).value === 'εₛ/εy')
  assert.ok(yieldRatioRow, 'at least one station must use the steel-yield criterion')
  assert.match(result.getCell(yieldRatioRow, 12).formula ?? '', /S_\d+_fy\/S_\d+_Es/)
  assert.match(result.getCell(yieldRatioRow, 13).formula ?? '', /\(K\d+-L\d+\)\/\(H\d+-I\d+\)/)

  const geometry = geometrySheet
  for (const sheet of workbook.worksheets) assertBlocksAligned(sheet)
  assert.deepEqual(
    assertBlocksAligned(geometry).map((block) => [block.title, block.width]),
    [
      ['Project and calculation identity', 2],
      ['Section boundary', 7],
      ['Reinforcement', 9],
      ['Project load cases', 6]
    ]
  )
  const boundaryHeader = rowOfLabel(geometry, 'Section boundary') + 1
  assert.deepEqual(
    Array.from({ length: 7 }, (_, index) => geometry.getCell(boundaryHeader, index + 1).value),
    ['Ring ID', 'Boundary', 'Point order', 'X input (mm)', 'Y input (mm)', 'x local (mm)', 'y local (mm)']
  )
  const materials = workbook.getWorksheet('Materials')!
  assert.ok(materials.getColumn(1).values.includes('α'))
  assert.ok(materials.getColumn(1).values.includes('εcu'))
  assert.equal(materials.getColumn(1).values.some((value) => String(value).startsWith('project.materials.')), false)

  const rebarHeader = rowOfLabel(geometry, 'Reinforcement') + 1
  assert.equal(geometry.getCell(rebarHeader, 2).value, 'Rebar ID')
  const rebarDiameter = geometry.getCell(rebarHeader + 1, 3)
  assert.equal(rebarDiameter.font.color?.argb, 'FF0070C0')
  assert.equal(hasSolidFill(rebarDiameter), false)
  const projectValue = geometry.getCell(rowOfLabel(geometry, 'Project'), 2)
  assert.equal(projectValue.font.color?.argb, 'FF64748B')
  assert.equal(hasSolidFill(projectValue), false)
  const firstLoadcaseRow = rowOfLabel(geometry, 'Project load cases') + 2
  for (const column of [3, 4, 5]) {
    assert.equal(geometry.getCell(firstLoadcaseRow, column).font.color?.argb, 'FF0070C0')
    assert.equal(hasSolidFill(geometry.getCell(firstLoadcaseRow, column)), false)
  }

  const expectedStations = buildDirectMeridianSection(
    activeDesignSurfaceDataset(surface).points,
    input.sliceAngleDeg,
    false
  ).primary.filter((point) => point.sectionPointRole === 'surface-vertex' && point.stationId !== null)
  let exportedStations = 0
  while (typeof result.getCell(head + 1 + exportedStations, 1).value === 'number') exportedStations++
  assert.equal(exportedStations, expectedStations.length)
  assert.ok(expectedStations.filter((point) => point.surfaceRole === 'axial-cap').length > 1)
  for (const sheet of workbook.worksheets) {
    sheet.eachRow((row) => row.eachCell((cell) => {
      if (cell.formula) {
        assert.equal(cell.formula.startsWith('='), false)
        assert.doesNotMatch(cell.formula, /(?:MAX|MIN)\([^)]*(?:Boundary_[XY]|Geometry'!\$[FG]\$\d+:)/)
      }
    }))
  }

  const { readBack, engine } = await recalculateWorkbook(workbook)
  assert.deepEqual(formulaErrors(readBack, engine), [])
  assertAllSourceRowsMatchEngine(readBack, engine, 'Result')
  const resultSheetId = engine.getSheetId('Result')!
  const valueAt = (address: string) => {
    const value = engine.getCellValue(engine.simpleCellAddressFromString(address, resultSheetId)!)
    assert.equal(typeof value, 'number', `${address} must recalculate to a number`)
    return value as number
  }
  const nonUniformRow = Array.from({ length: result.rowCount - head }, (_, index) => index + head + 1)
    .find((row) => Math.hypot(Number(result.getCell(row, 15).result), Number(result.getCell(row, 16).result)) > 1e-12)
  assert.ok(nonUniformRow)
  const recalculatedCurvature = valueAt(`M${nonUniformRow}`)
  const recalculatedE0 = valueAt(`N${nonUniformRow}`)
  const recalculatedKx = valueAt(`O${nonUniformRow}`)
  const recalculatedKy = valueAt(`P${nonUniformRow}`)
  assert.ok(Math.hypot(recalculatedKx, recalculatedKy) > 1e-12)
  assert.ok(Math.abs(recalculatedCurvature - Number(result.getCell(nonUniformRow, 13).result)) < 1e-10)
  assert.ok(Math.abs(recalculatedE0 - Number(result.getCell(nonUniformRow, 14).result)) < 1e-10)
  assert.ok(Math.abs(recalculatedKx - Number(result.getCell(nonUniformRow, 15).result)) < 1e-10)
  assert.ok(Math.abs(recalculatedKy - Number(result.getCell(nonUniformRow, 16).result)) < 1e-10)

  const bytes = await buildChartAuditWorkbookBytes(input)
  assert.deepEqual([...bytes.slice(0, 2)], [0x50, 0x4b])
  assert.equal(
    chartAuditWorkbookFileName(input),
    'PM-advanced-(7)-2D-reference-case-vertical-design-beta15-audit.xlsx'
  )
})

test('Fixed-P chart audit exports one selected P and interpolates the displayed contour by formula', async () => {
  const input = workbookInput('fixedP')
  input.resistanceStage = 'nominal'
  const workbook = await buildChartAuditWorkbook(input)
  const result = workbook.getWorksheet('Result')
  const lower = workbook.getWorksheet('FixedP_Lower')
  const upper = workbook.getWorksheet('FixedP_Upper')

  assert.ok(result)
  assert.ok(lower)
  assert.ok(upper)
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), [
    'Geometry',
    'Materials',
    'Mesh',
    'FixedP_Lower',
    'FixedP_Upper',
    'Result'
  ])
  const head = headerRowOf(result)
  const first = head + 1
  const selectedPRow = rowOfLabel(result, 'Selected P (kN)')
  assert.equal(result.getCell(rowOfLabel(result, 'Resistance stage'), 3).value, 'nominal')
  assert.equal(result.getCell(selectedPRow, 3).value, 0)
  assert.equal(headerRowOf(lower), head, 'the three fixed-P sheets must share one header row')
  assert.equal(headerRowOf(upper), head)
  // Row identity is the contour direction and its branch; the bracket sheets carry the same pair,
  // and their source formulas read the angle out of column A rather than repeating it.
  assert.equal(result.getCell(head, 2).value, 'β (deg)')
  assert.equal(result.getCell(first, 2).value, lower.getCell(first, 1).value)
  assert.equal(result.getCell(first, 2).value, upper.getCell(first, 1).value)
  assert.equal(result.getCell(first, 3).value, 1)
  assert.equal(result.getCell(first, 3).value, lower.getCell(first, 2).value)
  assert.equal(lower.getCell(head, 1).value, 'β (deg)')
  assert.equal(lower.getCell(head, 4).value, 'Criterion basis')
  assert.equal(upper.getCell(head, 4).value, 'Criterion basis')
  for (const sheet of [result, lower, upper]) {
    const titles = Array.from({ length: sheet.columnCount }, (_, index) => sheet.getCell(head, index + 1).value)
    for (const title of ['Source key', 'Direction ID', 'Chart β (deg)']) {
      assert.equal(titles.includes(title), false, `${sheet.name} must not publish a ${title} column`)
    }
    // A column that holds nothing from the header down is a column that should have been removed.
    for (let column = 1; column <= sheet.columnCount; column++) {
      const used = Array.from({ length: sheet.rowCount - head + 1 }, (_, index) => head + index)
        .some((row) => sheet.getCell(row, column).value !== null && sheet.getCell(row, column).value !== undefined)
      assert.ok(used, `${sheet.name} column ${sheet.getColumn(column).letter} is empty`)
    }
  }
  assert.match(result.getCell(first, 4).formula ?? '', new RegExp(`'FixedP_Lower'!\\$D\\$${first}`))
  assert.match(result.getCell(first, 7).formula ?? '', new RegExp(`'FixedP_Upper'!\\$D\\$${first}`))
  assert.match(result.getCell(first, 6).formula ?? '', new RegExp(`'FixedP_Lower'!\\$AA\\$${first}`))
  assert.match(result.getCell(first, 9).formula ?? '', new RegExp(`'FixedP_Upper'!\\$AA\\$${first}`))
  assert.equal(result.getCell(first, 10).formula, 'Selected_P')
  assert.match(result.getCell(first, 11).formula ?? '', new RegExp(`\\(J${first}-F${first}\\)/\\(I${first}-F${first}\\)`))
  assert.match(result.getCell(first, 13).formula ?? '', new RegExp(`'FixedP_Lower'!\\$AB\\$${first}`))
  assert.match(result.getCell(first, 13).formula ?? '', new RegExp(`'FixedP_Upper'!\\$AB\\$${first}`))
  assert.match(result.getCell(first, 14).formula ?? '', new RegExp(`'FixedP_Lower'!\\$AC\\$${first}`))
  assert.match(result.getCell(first, 14).formula ?? '', new RegExp(`'FixedP_Upper'!\\$AC\\$${first}`))
  assert.equal(typeof result.getCell(first, 13).result, 'number')
  assert.equal(typeof result.getCell(first, 14).result, 'number')
  assert.ok(Number(result.getCell(first, 6).result) <= Number(result.getCell(first, 10).result))
  assert.ok(Number(result.getCell(first, 9).result) >= Number(result.getCell(first, 10).result))
  assert.match(lower.getCell(first, 11).formula ?? '', new RegExp(`\\(I${first}-J${first}\\)/\\(F${first}-G${first}\\)`))
  assert.equal(lower.getCell(first, 12).formula, `I${first}-K${first}*F${first}`)
  assert.match(lower.getCell(first, 13).formula ?? '', new RegExp(`COS\\(RADIANS\\(A${first}\\)\\)`))
  assert.match(lower.getCell(first, 14).formula ?? '', new RegExp(`SIN\\(RADIANS\\(A${first}\\)\\)`))

  const rows = Array.from({ length: result.rowCount - head }, (_, index) => index + head + 1)
    .filter((row) => typeof result.getCell(row, 1).value === 'number')
  assert.equal(
    rows.length,
    new Set(rows.map((row) => `${result.getCell(row, 2).value}#${result.getCell(row, 3).value}`)).size
  )
  assert.equal(rows.length, lower.rowCount - head)
  assert.equal(rows.length, upper.rowCount - head)

  const { readBack, engine } = await recalculateWorkbook(workbook)
  assert.deepEqual(formulaErrors(readBack, engine), [])
  assertAllSourceRowsMatchEngine(readBack, engine, 'FixedP_Lower')
  assertAllSourceRowsMatchEngine(readBack, engine, 'FixedP_Upper')
  const resultSheetId = engine.getSheetId('Result')!
  for (const row of rows.slice(0, 6)) {
    const mx = engine.getCellValue(engine.simpleCellAddressFromString(`M${row}`, resultSheetId)!)
    const my = engine.getCellValue(engine.simpleCellAddressFromString(`N${row}`, resultSheetId)!)
    assert.equal(typeof mx, 'number')
    assert.equal(typeof my, 'number')
    assert.ok(Math.abs(Number(mx) - Number(result.getCell(row, 15).value)) < 1e-8)
    assert.ok(Math.abs(Number(my) - Number(result.getCell(row, 16).value)) < 1e-8)
  }
})

test('Fixed-P Pmax rows keep distinct branch IDs for multiple points on one direction', async () => {
  const input = workbookInput('fixedP')
  const dataset = activeDesignSurfaceDataset(input.surface)
  input.fixedP = Math.max(...dataset.points.map((point) => point.P))
  const workbook = await buildChartAuditWorkbook(input)
  const result = workbook.getWorksheet('Result')!
  const head = headerRowOf(result)
  const rows = Array.from({ length: result.rowCount - head }, (_, index) => index + head + 1)
    .filter((row) => typeof result.getCell(row, 1).value === 'number')
  const betaGroups = new Map<string, number[]>()
  for (const row of rows) {
    const key = Number(result.getCell(row, 2).value).toFixed(6)
    betaGroups.set(key, [...(betaGroups.get(key) ?? []), row])
  }
  const repeated = [...betaGroups.values()].find((group) => group.length > 1)
  assert.ok(repeated)
  assert.deepEqual(
    repeated.map((row) => result.getCell(row, 3).value),
    repeated.map((_, index) => index + 1)
  )
  for (const row of repeated) assert.equal(result.getCell(row, 12).result, 'Exact station')

  const { readBack, engine } = await recalculateWorkbook(workbook)
  assert.deepEqual(formulaErrors(readBack, engine), [])
  assertAllSourceRowsMatchEngine(readBack, engine, 'FixedP_Lower')
  assertAllSourceRowsMatchEngine(readBack, engine, 'FixedP_Upper')
  const lower = readBack.getWorksheet('FixedP_Lower')!
  const lowerHead = headerRowOf(lower)
  const capRows = Array.from({ length: lower.rowCount - lowerHead }, (_, index) => index + lowerHead + 1)
    .filter((row) => String(lower.getCell(row, 35).value).startsWith('axial-cap projected-ledger anchor'))
  assert.ok(capRows.length > 1)
  for (const row of capRows) {
    assert.deepEqual(
      [lower.getCell(row, 24).value, lower.getCell(row, 25).value, lower.getCell(row, 26).value],
      [1, 1, 1]
    )
    assert.match(String(lower.getCell(row, 4).value), /^retained /)
  }
})

test('equivalent-block chart audit uses its total ledger, omits the unused Mesh sheet, and recalculates every row', async () => {
  for (const relativePath of [
    'docs/examples/equivalent-block/KDS-EB-01-rectangle-8-bars.pm-project.json',
    'docs/examples/equivalent-block/ACI-EB-01-rectangle-8-bars.pm-project.json'
  ]) {
    const parsed = parseProjectDocument(readFileSync(resolve(process.cwd(), relativePath), 'utf8'))
    assert.ok(parsed.ok, `${relativePath} must parse`)
    if (!parsed.ok) continue
    const blockDocument = parsed.document
    const blockSection = sectionGeometryFromGeometryInput(blockDocument.inputs.geometry)
    const blockRebars = geometryInputRebars(blockDocument.inputs.geometry)
    const blockOptions = blockDocument.inputs.analysis as EquivalentBlockAnalysisOptions
    const blockSurface = buildEquivalentBlockPreviewSurface(
      blockDocument.inputs.calculationProfileId,
      blockSection,
      blockRebars,
      blockDocument.inputs.materials,
      blockDocument.inputs.design,
      blockOptions
    )
    const blockInput: ChartAuditWorkbookInput = {
      projectName: blockDocument.meta.name,
      projectInformation: blockDocument.meta.information,
      sectionName: blockSection.name,
      section: blockSection,
      rebars: blockRebars,
      materialStore: blockDocument.inputs.materials,
      designBasis: blockDocument.inputs.design,
      surface: blockSurface,
      source: 'vertical',
      resistanceStage: 'design',
      sliceAngleDeg: 0,
      fixedP: 0,
      loadcases: blockDocument.inputs.loadings.combinations
    }
    const workbook = await buildChartAuditWorkbook(blockInput)
    assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ['Geometry', 'Materials', 'Result'])
    const result = workbook.getWorksheet('Result')!
    const first = headerRowOf(result) + 1
    assert.equal(result.getCell(first, 23).formula, `AL${first}`)
    assert.match(String(result.getCell(first, 37).value), /^equivalent-block total-ledger anchor/)
    assert.notEqual(Number(result.getCell(first, 29).result), 0)

    const { readBack, engine } = await recalculateWorkbook(workbook)
    assert.deepEqual(formulaErrors(readBack, engine), [])
    assertAllSourceRowsMatchEngine(readBack, engine, 'Result')
  }
})

test('adaptive stations export a resolved physical criterion and derive the strain plane by formula', async () => {
  const options = createAdaptiveAnalysisOptions()
  if (options.stations.refinement.type !== 'adaptive' || options.directions.refinement.type !== 'adaptive') {
    throw new Error('Adaptive preset is invalid.')
  }
  options.mesh.sizing = { type: 'automatic', seedDivisions: 8 }
  options.stations.refinement.maxPasses = 2
  options.stations.refinement.maxStations = 32
  options.directions.refinement.maxPasses = 1
  options.directions.refinement.maxDirections = 24
  const adaptiveSurface = buildDesignPreviewSurface(
    section,
    rebars,
    document.inputs.materials,
    document.inputs.design,
    analysisMeshKernelOptions(options),
    options
  )
  const exactDirectionCurve = buildExactDirectionCurveFromPrepared(
    prepareAnalysis(
      section,
      rebars,
      document.inputs.materials,
      analysisMeshKernelOptions(options)
    ),
    document.inputs.materials,
    document.inputs.design,
    options,
    17.35 * Math.PI / 180
  )
  const adaptivePoint = exactDirectionCurve.designAdaptive.find((point) =>
    point.stationId?.startsWith('adaptive-station-') && point.onSampledDirection !== false
  )
  assert.ok(adaptivePoint)

  const input = workbookInput('vertical')
  input.surface = adaptiveSurface
  input.exactDirectionCurve = exactDirectionCurve
  input.sliceAngleDeg = exactDirectionCurve.beta * 180 / Math.PI
  const result = (await buildChartAuditWorkbook(input)).getWorksheet('Result')
  assert.ok(result)
  // Every station on this sheet came from the adaptive surface, so the claim is checked on all of
  // them rather than on one row picked out by an internal station id the sheet no longer publishes.
  const head = headerRowOf(result)
  const rows = Array.from({ length: result.rowCount - head }, (_, index) => index + head + 1)
    .filter((row) => typeof result.getCell(row, 1).value === 'number')
  const resolved = rows.filter((row) => !String(result.getCell(row, 6).value).startsWith('retained '))
  assert.ok(resolved.length > 0)
  for (const row of resolved) {
    const basis: string = String(result.getCell(row, 6).value)
    assert.ok(
      ['c/D', 'εₛ/εy', 'resolved εₛ', 'ε = constant'].includes(basis),
      `row ${row} must resolve to a physical criterion, got ${basis}`
    )
    assert.equal(typeof result.getCell(row, 7).value, 'number')
    if (basis === 'ε = constant') continue
    assert.match(result.getCell(row, 13).formula ?? '', /\(K\d+-L\d+\)\/\(H\d+-I\d+\)/)
    assert.match(result.getCell(row, 14).formula ?? '', /^K\d+-M\d+\*H\d+$/)
    assert.match(result.getCell(row, 15).formula ?? '', /COS\(RADIANS/)
    assert.match(result.getCell(row, 16).formula ?? '', /SIN\(RADIANS/)
  }
})
