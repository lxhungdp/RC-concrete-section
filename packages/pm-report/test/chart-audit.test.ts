import { strict as assert } from 'node:assert'
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
import { geometryInputRebars, sectionGeometryFromGeometryInput } from '@pm/geometry'
import {
  analysisMeshKernelOptions,
  createAdaptiveAnalysisOptions,
  createDefaultAnalysisOptions
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

const hasSolidFill = (cell: ExcelJS.Cell) => {
  const fill = cell.fill as ExcelJS.Fill | undefined
  if (!fill) return false
  return fill.type === 'pattern' && fill.pattern === 'solid'
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
  assert.ok((workbook.getWorksheet('Geometry')?.rowCount ?? 0) > rebars.length)
  assert.equal(workbook.getWorksheet('Geometry')?.getCell('G3').value, 'Engineering review client')
  assert.equal(workbook.getWorksheet('Geometry')?.getCell('G4').value, 'Audit engineering')
  assert.ok((workbook.getWorksheet('Materials')?.rowCount ?? 0) > 10)
  assert.ok((workbook.getWorksheet('Mesh')?.rowCount ?? 0) > 6)

  const result = workbook.getWorksheet('Result')
  assert.ok(result)
  assert.match(result.getCell('C8').formula ?? '', /^\$AF\$/)
  assert.match(result.getCell('D8').formula ?? '', /COS\(RADIANS/)
  assert.match(result.getCell('U8').formula ?? '', /SUMPRODUCT/)
  assert.match(result.getCell('U8').formula ?? '', /Mesh_A/)
  assert.equal(typeof result.getCell('C8').result, 'number')
  assert.equal(typeof result.getCell('D8').result, 'number')

  const resolvedRow = Array.from({ length: result.rowCount - 7 }, (_, index) => index + 8)
    .find((row) => result.getCell(row, 10).value === 'c/D')
  assert.ok(resolvedRow, 'at least one station must expose its resolved c/D criterion')
  const declaredRatio = Number(String(result.getCell(resolvedRow, 8).value).match(/c\/D = ([0-9.]+)/)?.[1])
  assert.ok(Number.isFinite(declaredRatio))
  assert.ok(Math.abs(Number(result.getCell(resolvedRow, 11).value) - declaredRatio) < 1e-9)
  assert.match(result.getCell(resolvedRow, 13).formula ?? '', /^L\d+-K\d+\*N\d+$/)
  assert.equal(result.getCell(resolvedRow, 16).formula, '0')
  assert.match(result.getCell(resolvedRow, 17).formula ?? '', /\(O\d+-P\d+\)\/\(L\d+-M\d+\)/)
  assert.match(result.getCell(resolvedRow, 18).formula ?? '', /^O\d+-Q\d+\*L\d+$/)
  assert.match(result.getCell(resolvedRow, 19).formula ?? '', /COS\(RADIANS/)
  assert.match(result.getCell(resolvedRow, 20).formula ?? '', /SIN\(RADIANS/)

  const yieldRatioRow = Array.from({ length: result.rowCount - 7 }, (_, index) => index + 8)
    .find((row) => result.getCell(row, 10).value === 'εₛ/εy')
  assert.ok(yieldRatioRow, 'at least one station must use the steel-yield criterion')
  assert.match(result.getCell(yieldRatioRow, 16).formula ?? '', /S_\d+_fy\/S_\d+_Es/)
  assert.match(result.getCell(yieldRatioRow, 17).formula ?? '', /\(O\d+-P\d+\)\/\(L\d+-M\d+\)/)

  const geometry = workbook.getWorksheet('Geometry')!
  assert.deepEqual(
    Array.from({ length: 7 }, (_, index) => geometry.getCell(12, index + 1).value),
    ['Ring ID', 'Boundary', 'Point order', 'X input (mm)', 'Y input (mm)', 'x local (mm)', 'y local (mm)']
  )
  const materials = workbook.getWorksheet('Materials')!
  assert.ok(materials.getColumn(1).values.includes('α'))
  assert.ok(materials.getColumn(1).values.includes('εcu'))
  assert.equal(materials.getColumn(1).values.some((value) => String(value).startsWith('project.materials.')), false)

  const rebarHeader = geometry.getColumn(2).values.findIndex((value) => value === 'Rebar ID')
  assert.ok(rebarHeader > 0)
  const rebarDiameter = geometry.getCell(rebarHeader + 1, 3)
  assert.equal(rebarDiameter.font.color?.argb, 'FF0070C0')
  assert.equal(hasSolidFill(rebarDiameter), false)
  assert.equal(geometry.getCell('C3').font.color?.argb, 'FF64748B')
  assert.equal(hasSolidFill(geometry.getCell('C3')), false)
  const loadcaseSection = geometry.getColumn(2).values.findIndex((value) => value === 'Project load cases')
  assert.ok(loadcaseSection > 0)
  const firstLoadcaseRow = loadcaseSection + 2
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
  while (typeof result.getCell(8 + exportedStations, 1).value === 'number') exportedStations++
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
  const resultSheetId = engine.getSheetId('Result')!
  const valueAt = (address: string) => {
    const value = engine.getCellValue(engine.simpleCellAddressFromString(address, resultSheetId)!)
    assert.equal(typeof value, 'number', `${address} must recalculate to a number`)
    return value as number
  }
  const nonUniformRow = Array.from({ length: result.rowCount - 7 }, (_, index) => index + 8)
    .find((row) => Math.hypot(Number(result.getCell(row, 19).result), Number(result.getCell(row, 20).result)) > 1e-12)
  assert.ok(nonUniformRow)
  const recalculatedCurvature = valueAt(`Q${nonUniformRow}`)
  const recalculatedE0 = valueAt(`R${nonUniformRow}`)
  const recalculatedKx = valueAt(`S${nonUniformRow}`)
  const recalculatedKy = valueAt(`T${nonUniformRow}`)
  assert.ok(Math.hypot(recalculatedKx, recalculatedKy) > 1e-12)
  assert.ok(Math.abs(recalculatedCurvature - Number(result.getCell(nonUniformRow, 17).result)) < 1e-10)
  assert.ok(Math.abs(recalculatedE0 - Number(result.getCell(nonUniformRow, 18).result)) < 1e-10)
  assert.ok(Math.abs(recalculatedKx - Number(result.getCell(nonUniformRow, 19).result)) < 1e-10)
  assert.ok(Math.abs(recalculatedKy - Number(result.getCell(nonUniformRow, 20).result)) < 1e-10)

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
  assert.equal(result.getCell('B5').value, 'Selected P (kN)')
  assert.equal(result.getCell('C4').value, 'nominal')
  assert.equal(result.getCell('C5').value, 0)
  assert.equal(result.getCell('B8').value, lower.getCell('A8').value)
  assert.equal(result.getCell('B8').value, upper.getCell('A8').value)
  assert.equal(result.getCell('C8').value, 1)
  assert.equal(result.getCell('D8').value, lower.getCell('C8').value)
  assert.equal(lower.getCell('G7').value, 'Criterion basis')
  assert.equal(upper.getCell('G7').value, 'Criterion basis')
  assert.match(result.getCell('E8').formula ?? '', /'FixedP_Lower'!\$G\$8/)
  assert.match(result.getCell('H8').formula ?? '', /'FixedP_Upper'!\$G\$8/)
  assert.match(result.getCell('G8').formula ?? '', /'FixedP_Lower'!\$AC\$8/)
  assert.match(result.getCell('J8').formula ?? '', /'FixedP_Upper'!\$AC\$8/)
  assert.equal(result.getCell('K8').formula, 'Selected_P')
  assert.match(result.getCell('L8').formula ?? '', /\(K8-G8\)\/\(J8-G8\)/)
  assert.match(result.getCell('N8').formula ?? '', /'FixedP_Lower'!\$AD\$8/)
  assert.match(result.getCell('N8').formula ?? '', /'FixedP_Upper'!\$AD\$8/)
  assert.match(result.getCell('O8').formula ?? '', /'FixedP_Lower'!\$AE\$8/)
  assert.match(result.getCell('O8').formula ?? '', /'FixedP_Upper'!\$AE\$8/)
  assert.equal(typeof result.getCell('N8').result, 'number')
  assert.equal(typeof result.getCell('O8').result, 'number')
  assert.ok(Number(result.getCell('G8').result) <= Number(result.getCell('K8').result))
  assert.ok(Number(result.getCell('J8').result) >= Number(result.getCell('K8').result))
  assert.match(lower.getCell('N8').formula ?? '', /\(L8-M8\)\/\(I8-J8\)/)
  assert.match(lower.getCell('O8').formula ?? '', /^L8-N8\*I8$/)
  assert.match(lower.getCell('P8').formula ?? '', /COS\(RADIANS\(F8\)\)/)
  assert.match(lower.getCell('Q8').formula ?? '', /SIN\(RADIANS\(F8\)\)/)

  const rows = Array.from({ length: result.rowCount - 7 }, (_, index) => index + 8)
    .filter((row) => typeof result.getCell(row, 1).value === 'number')
  assert.equal(rows.length, new Set(rows.map((row) => String(result.getCell(row, 2).value))).size)
  assert.equal(rows.length, lower.rowCount - 7)
  assert.equal(rows.length, upper.rowCount - 7)

  const { readBack, engine } = await recalculateWorkbook(workbook)
  assert.deepEqual(formulaErrors(readBack, engine), [])
  const resultSheetId = engine.getSheetId('Result')!
  for (const row of rows.slice(0, 6)) {
    const mx = engine.getCellValue(engine.simpleCellAddressFromString(`N${row}`, resultSheetId)!)
    const my = engine.getCellValue(engine.simpleCellAddressFromString(`O${row}`, resultSheetId)!)
    assert.equal(typeof mx, 'number')
    assert.equal(typeof my, 'number')
    assert.ok(Math.abs(Number(mx) - Number(result.getCell(row, 16).value)) < 1e-8)
    assert.ok(Math.abs(Number(my) - Number(result.getCell(row, 17).value)) < 1e-8)
  }
})

test('Fixed-P Pmax rows keep distinct branch IDs for multiple points on one direction', async () => {
  const input = workbookInput('fixedP')
  const dataset = activeDesignSurfaceDataset(input.surface)
  input.fixedP = Math.max(...dataset.points.map((point) => point.P))
  const workbook = await buildChartAuditWorkbook(input)
  const result = workbook.getWorksheet('Result')!
  const rows = Array.from({ length: result.rowCount - 7 }, (_, index) => index + 8)
    .filter((row) => typeof result.getCell(row, 1).value === 'number')
  const betaGroups = new Map<string, number[]>()
  for (const row of rows) {
    const key = Number(result.getCell(row, 4).value).toFixed(6)
    betaGroups.set(key, [...(betaGroups.get(key) ?? []), row])
  }
  const repeated = [...betaGroups.values()].find((group) => group.length > 1)
  assert.ok(repeated)
  assert.deepEqual(
    repeated.map((row) => result.getCell(row, 3).value),
    repeated.map((_, index) => index + 1)
  )
  assert.equal(
    new Set(repeated.map((row) => String(result.getCell(row, 2).value))).size,
    repeated.length
  )
  for (const row of repeated) assert.equal(result.getCell(row, 13).result, 'Exact station')
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
  const adaptiveRow = Array.from({ length: result.rowCount - 7 }, (_, index) => index + 8)
    .find((row) => String(result.getCell(row, 7).value).includes('adaptive-station-'))
  assert.ok(adaptiveRow)
  assert.ok(['c/D', 'εₛ/εy', 'resolved εₛ'].includes(String(result.getCell(adaptiveRow, 10).value)))
  assert.equal(typeof result.getCell(adaptiveRow, 11).value, 'number')
  assert.match(result.getCell(adaptiveRow, 17).formula ?? '', /\(O\d+-P\d+\)\/\(L\d+-M\d+\)/)
  assert.match(result.getCell(adaptiveRow, 18).formula ?? '', /^O\d+-Q\d+\*L\d+$/)
  assert.match(result.getCell(adaptiveRow, 19).formula ?? '', /COS\(RADIANS/)
  assert.match(result.getCell(adaptiveRow, 20).formula ?? '', /SIN\(RADIANS/)
})
