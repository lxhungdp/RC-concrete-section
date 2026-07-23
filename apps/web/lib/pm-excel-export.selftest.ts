/**
 * Verifies the exported workbook by *evaluating its formulas*, not by trusting them.
 *
 * The generated file is read back with ExcelJS, loaded into HyperFormula (an independent
 * Excel-semantics engine), recalculated, and every station result is compared with the engine that
 * produced the mesh. A broken reference, a mis-scaled unit or a wrong station formula fails here
 * instead of in the user's spreadsheet.
 *
 * Run: npm run test:excel-export
 */
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { HyperFormula } from 'hyperformula'
import ExcelJS from 'exceljs'
import { geometryInputRebars, sectionGeometryFromGeometryInput } from '@pm/geometry'
import { parseProjectDocument } from '@pm/project'
import { PREVIEW_STATIONS, buildPreviewSurface, sliceFixedP } from './pm-preview-analysis'
import { buildSectionWorkbook, sectionWorkbookFileName } from './pm-excel-export'

const REFERENCE_JSON = resolve(process.cwd(), 'docs/example case/PM-advanced (7) 2D.pm-project.json')
const OUT_DIR = resolve(process.cwd(), 'docs/example case')
const ANGLE_DEG = 15

const failures: string[] = []

const check = (label: string, actual: number, expected: number, relTol: number, absScale = 0) => {
  const denominator = Math.max(absScale, Math.abs(expected), 1e-12)
  const relative = Math.abs(actual - expected) / denominator
  const ok = Number.isFinite(actual) && relative <= relTol
  const line = `${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(34)} excel=${fmt(actual)} engine=${fmt(expected)}  rel=${(
    relative * 100
  ).toFixed(5)}%`
  console.log(line)
  if (!ok) failures.push(line)
}

const fmt = (value: number) => (Number.isFinite(value) ? value.toFixed(4).padStart(14) : String(value).padStart(14))

/** ExcelJS cell -> HyperFormula sheet cell (formula string, primitive, or null). */
const toHyperFormulaValue = (cell: ExcelJS.Cell): string | number | boolean | null => {
  const value = cell.value
  if (value === null || value === undefined) return null
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') return value
  if (typeof value === 'object' && 'formula' in value && typeof value.formula === 'string') {
    return `=${value.formula}`
  }
  if (typeof value === 'object' && 'result' in value) return (value as { result: number }).result ?? null
  if (typeof value === 'object' && 'richText' in value) return null
  return null
}

const run = async () => {
  const parsed = parseProjectDocument(readFileSync(REFERENCE_JSON, 'utf8'))
  assert.ok(parsed.ok, 'reference project JSON must parse')
  if (!parsed.ok) return
  const geometry = parsed.document.inputs.geometry
  const section = sectionGeometryFromGeometryInput(geometry)
  const rebars = geometryInputRebars(geometry)
  const materialStore = parsed.document.inputs.materials
  const loadcase = parsed.document.inputs.loadings.combinations[0]

  console.log('== 1. Build the workbook ==')
  const t0 = Date.now()
  const workbook = await buildSectionWorkbook({
    projectName: parsed.document.meta.name,
    sectionName: geometry.name,
    section,
    rebars,
    materialStore,
    angleDeg: ANGLE_DEG,
    fixedP: loadcase.P,
    loadcase
  })
  const buffer = await workbook.xlsx.writeBuffer()
  const fileName = sectionWorkbookFileName({ projectName: parsed.document.meta.name, angleDeg: ANGLE_DEG, loadcase })
  const outPath = resolve(OUT_DIR, fileName)
  writeFileSync(outPath, Buffer.from(buffer))
  console.log(
    `      ${fileName}  ${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB  built in ${Date.now() - t0} ms\n`
  )

  console.log('== 2. Read back and load into HyperFormula ==')
  const readBack = new ExcelJS.Workbook()
  await readBack.xlsx.load(buffer as ArrayBuffer)
  const sheetNames = readBack.worksheets.map((sheet) => sheet.name)
  console.log(`      sheets: ${sheetNames.join(', ')}`)

  const sheets: Record<string, Array<Array<string | number | boolean | null>>> = {}
  for (const sheet of readBack.worksheets) {
    const grid: Array<Array<string | number | boolean | null>> = []
    for (let r = 1; r <= sheet.rowCount; r++) {
      const rowValues: Array<string | number | boolean | null> = []
      for (let c = 1; c <= sheet.columnCount; c++) rowValues.push(toHyperFormulaValue(sheet.getCell(r, c)))
      grid.push(rowValues)
    }
    sheets[sheet.name] = grid
  }

  const engine = HyperFormula.buildFromSheets(sheets, {
    licenseKey: 'gpl-v3',
    useArrayArithmetic: true,
    smartRounding: false
  })

  // Named ranges must be re-declared: ExcelJS keeps them on the workbook, not in the cell grid.
  const definedNames = readBack.definedNames.model
  let namedCount = 0
  for (const entry of definedNames) {
    for (const ranges of entry.ranges) {
      try {
        engine.addNamedExpression(entry.name, `=${ranges}`)
        namedCount++
      } catch (error) {
        failures.push(`FAIL  named range ${entry.name} -> ${ranges}: ${(error as Error).message}`)
      }
    }
  }
  console.log(`      named ranges wired: ${namedCount}`)

  const errorCells: string[] = []
  for (const name of sheetNames) {
    const id = engine.getSheetId(name)
    if (id === undefined) continue
    const values = engine.getSheetValues(id)
    values.forEach((rowValues, rowIndex) => {
      rowValues.forEach((value, colIndex) => {
        if (value !== null && typeof value === 'object' && 'type' in (value as object)) {
          const detail = value as { type: string; message?: string }
          errorCells.push(`${name}!R${rowIndex + 1}C${colIndex + 1} → ${detail.type} ${detail.message ?? ''}`)
        }
      })
    })
  }
  if (errorCells.length > 0) {
    console.log(`FAIL  ${errorCells.length} formula error cell(s); first 12:`)
    for (const cell of errorCells.slice(0, 12)) console.log(`        ${cell}`)
    failures.push(`FAIL  ${errorCells.length} formula error cells`)
  } else {
    console.log('PASS  no formula evaluated to an error\n')
  }

  const colName = (index: number) => {
    let name = ''
    let i = index
    while (i > 0) {
      const rest = (i - 1) % 26
      name = String.fromCharCode(65 + rest) + name
      i = Math.floor((i - 1) / 26)
    }
    return name
  }

  const cellValue = (sheet: string, address: string): number => {
    const id = engine.getSheetId(sheet)
    assert.ok(id !== undefined, `sheet ${sheet} exists`)
    const value = engine.getCellValue(engine.simpleCellAddressFromString(address, id as number)!)
    return typeof value === 'number' ? value : Number.NaN
  }

  const findLabelRow = (sheet: ExcelJS.Worksheet, label: string, column = 2) => {
    for (let r = 1; r <= sheet.rowCount; r++) {
      if (String(sheet.getCell(r, column).value ?? '').startsWith(label)) return r
    }
    throw new Error(`label "${label}" not found in column ${column} of ${sheet.name}`)
  }

  /** Resolve a column by its header text so the checks survive layout edits. */
  const headerColumn = (sheet: ExcelJS.Worksheet, headerRow: number, text: string, from = 1) => {
    for (let c = from; c <= sheet.columnCount; c++) {
      if (String(sheet.getCell(headerRow, c).value ?? '').trim() === text) return c
    }
    throw new Error(`header "${text}" not found on row ${headerRow} of ${sheet.name}`)
  }

  console.log('== 3. Geometry formulas ==')
  const geomSheet = readBack.getWorksheet('Geometry')!
  check('Geometry net area (mm2)', cellValue('Geometry', `D${findLabelRow(geomSheet, 'Net area')}`), 1120000, 1e-9)
  check('u_max at 15 deg (mm)', cellValue('Geometry', `D${findLabelRow(geomSheet, 'u_max')}`), 721.9059705798273, 1e-9)
  check('C1 at 15 deg (mm)', cellValue('Geometry', `D${findLabelRow(geomSheet, 'C1 =')}`), 1337.374276554042, 1e-9)
  check('mesh area = polygon area (mm2)', cellValue('Input', `C${findLabelRow(readBack.getWorksheet('Input')!, 'Net concrete area')}`), 1120000, 1e-9)
  console.log()

  console.log('== 4. PM_Angle: 19 stations reproduce the engine ==')
  const pmSheet = readBack.getWorksheet('PM_Angle')!
  const PM_HEAD = 5
  const PM_FIRST = 7
  const cCon = { P: headerColumn(pmSheet, PM_HEAD, 'P (kN)'), Mx: 0, My: 0 }
  cCon.Mx = cCon.P + 1
  cCon.My = cCon.P + 2
  const cSteelP = headerColumn(pmSheet, PM_HEAD, 'P (kN)', cCon.P + 1)
  const cTotP = headerColumn(pmSheet, PM_HEAD, 'P (kN)', cSteelP + 1)
  const cEng = headerColumn(pmSheet, PM_HEAD, 'P engine (kN)')
  const cE0 = headerColumn(pmSheet, PM_HEAD, 'eps_0')
  console.log(
    `      columns → concrete P ${colName(cCon.P)}, steel P ${colName(cSteelP)}, total P ${colName(cTotP)}, engine ${colName(cEng)}`
  )
  for (let index = 0; index < PREVIEW_STATIONS.length; index++) {
    const r = PM_FIRST + index
    check(`P${index} total P (kN)`, cellValue('PM_Angle', `${colName(cTotP)}${r}`), Number(pmSheet.getCell(r, cEng).value), 1e-9, 1)
  }
  console.log()

  console.log('== 5. Concrete + steel ledger closes at every station ==')
  let worstLedger = 0
  for (let index = 0; index < PREVIEW_STATIONS.length; index++) {
    const r = PM_FIRST + index
    const total = cellValue('PM_Angle', `${colName(cTotP)}${r}`)
    const parts = cellValue('PM_Angle', `${colName(cCon.P)}${r}`) + cellValue('PM_Angle', `${colName(cSteelP)}${r}`)
    worstLedger = Math.max(worstLedger, Math.abs(parts - total))
  }
  check('worst |conc + steel − total| (kN)', worstLedger, 0, 1e-9, 1)
  console.log()

  console.log('== 6. Anchors from the reference workbook ==')
  const stationRowOf = (index: number) => PM_FIRST + index
  check('P0 concrete P (kN)', cellValue('PM_Angle', `${colName(cCon.P)}${stationRowOf(0)}`), 28560, 1e-9)
  check('P0 steel P (kN)', cellValue('PM_Angle', `${colName(cSteelP)}${stationRowOf(0)}`), 5421.433875929294, 1e-9)
  check('P18 steel P (kN)', cellValue('PM_Angle', `${colName(cSteelP)}${stationRowOf(18)}`), -5790.583579096708, 1e-9)
  check('P5 steel P (kN)', cellValue('PM_Angle', `${colName(cSteelP)}${stationRowOf(5)}`), 3366.081802600885, 1e-9)
  check('P5 steel Mx (kN·m)', cellValue('PM_Angle', `${colName(cSteelP + 1)}${stationRowOf(5)}`), 814.449068175329, 1e-9)
  check('P5 steel My (kN·m)', cellValue('PM_Angle', `${colName(cSteelP + 2)}${stationRowOf(5)}`), 309.19068966766366, 1e-9)
  check('P5 eps_0', cellValue('PM_Angle', `${colName(cE0)}${stationRowOf(5)}`), 0.0015186813783709227, 1e-9)
  console.log()

  console.log('== 7. Fibre detail block equals its station total ==')
  const concSheet = readBack.getWorksheet('Concrete')!
  const detailStation = Number(concSheet.getCell('C4').value)
  const detailRow = stationRowOf(detailStation)
  check(
    `detail ΣFc → P${detailStation} concrete P`,
    cellValue('Concrete', 'G7') / 1000,
    cellValue('PM_Angle', `${colName(cCon.P)}${detailRow}`),
    1e-9,
    1
  )
  check(
    `detail ΣMcx → P${detailStation} concrete Mx`,
    cellValue('Concrete', 'H7') / 1e6,
    cellValue('PM_Angle', `${colName(cCon.Mx)}${detailRow}`),
    1e-9,
    1
  )
  check(
    `detail ΣMcy → P${detailStation} concrete My`,
    cellValue('Concrete', 'I7') / 1e6,
    cellValue('PM_Angle', `${colName(cCon.My)}${detailRow}`),
    1e-9,
    1
  )
  console.log()

  console.log('== 8. MxMy_FixedP: 24 directions vs the engine contour ==')
  const inputSheet = readBack.getWorksheet('Input')!
  const cellSize = Number(inputSheet.getCell(`C${findLabelRow(inputSheet, 'mesh cell size')}`).value)
  const surface = buildPreviewSurface(section, rebars, materialStore, loadcase.P, { cellSize })
  const engineContour = sliceFixedP(surface.points, loadcase.P)
  const stationCount = PREVIEW_STATIONS.length
  const MM_FIRST = 8
  const MM_P_COL = 2 + 4 + stationCount * 3
  const MM_RESULT_COL = MM_P_COL + stationCount * 3

  // The theta row here duplicates PM_Angle through an independent formula path.
  const thetaRow = MM_FIRST + Math.round(ANGLE_DEG / 15)
  for (const station of [0, 5, 9, 18]) {
    check(
      `MxMy theta row P${station} (kN)`,
      cellValue('MxMy_FixedP', `${colName(MM_P_COL + station)}${thetaRow}`),
      cellValue('PM_Angle', `${colName(cTotP)}${stationRowOf(station)}`),
      1e-9,
      1
    )
  }

  let worstMx = 0
  let worstMy = 0
  let compared = 0
  for (let angleIndex = 0; angleIndex < 24; angleIndex++) {
    const r = MM_FIRST + angleIndex
    const beta = (angleIndex * Math.PI) / 12
    const engineRow = engineContour.find((point) => Math.abs(point.beta - beta) < 1e-9)
    if (!engineRow) continue
    compared++
    worstMx = Math.max(worstMx, Math.abs(cellValue('MxMy_FixedP', `${colName(MM_RESULT_COL + 2)}${r}`) - engineRow.Mx / 1e6))
    worstMy = Math.max(worstMy, Math.abs(cellValue('MxMy_FixedP', `${colName(MM_RESULT_COL + 3)}${r}`) - engineRow.My / 1e6))
  }
  const momentScale = Math.max(...engineContour.map((point) => Math.hypot(point.Mx, point.My) / 1e6), 1)
  console.log(`      directions compared: ${compared} / 24, moment scale ${momentScale.toFixed(1)} kN·m`)
  check('worst |ΔMx| over the contour', worstMx, 0, 1e-9, momentScale)
  check('worst |ΔMy| over the contour', worstMy, 0, 1e-9, momentScale)
  console.log()

  console.log('== 9. Utilisation block ==')
  const utilRow = findLabelRow(pmSheet, 'Utilisation', 3)
  const utilisation = cellValue('PM_Angle', `B${utilRow}`)
  console.log(`      Mu / Mn at Pu = ${utilisation.toFixed(4)}`)
  check('utilisation of the on-surface demand', utilisation, 1, 5e-3)
  console.log()

  if (failures.length > 0) {
    console.log(`${failures.length} check(s) failed:`)
    for (const line of failures) console.log(`  ${line}`)
    process.exitCode = 1
    return
  }
  console.log(`All checks passed. Workbook written to ${outPath}`)
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
