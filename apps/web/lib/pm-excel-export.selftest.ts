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
import { geometryInputRebars, netConcreteCentroid, sectionGeometryFromGeometryInput } from '@pm/geometry'
import { parseProjectDocument } from '@pm/project'
import {
  PREVIEW_STATIONS,
  buildPreviewSurface,
  intersectFixedPContourWithMomentRay,
  sliceFixedP,
  sliceFixedPContour,
  sliceMomentPlane,
  solveInversePreview,
  evaluatePreviewState,
  previewStationState
} from './pm-preview-analysis'
import { buildSectionWorkbook, invalidDefinedNameReason, sectionWorkbookFileName } from './pm-excel-export'
import {
  compileConcreteMaterial,
  compileSteelMaterial,
  type MaterialStore,
  type StressStrainPoint
} from '@pm/materials'

const REFERENCE_JSON = resolve(process.cwd(), 'docs/example case/PM-advanced (7) 2D.pm-project.json')
const OUT_DIR = resolve(process.cwd(), 'docs/example case')
const BETA_DEG = 15

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
  const seedSurface = buildPreviewSurface(section, rebars, materialStore, loadcase.P)
  const inverse = solveInversePreview(
    section,
    rebars,
    materialStore,
    loadcase,
    sliceFixedPContour(seedSurface.points, loadcase.P)
  )
  assert.ok(inverse.ok, 'the reference demand must reach equilibrium')
  const t0 = Date.now()
  const workbook = await buildSectionWorkbook({
    projectName: parsed.document.meta.name,
    sectionName: geometry.name,
    section,
    rebars,
    materialStore,
    betaDeg: BETA_DEG,
    fixedP: loadcase.P,
    loadcase,
    equilibrium: inverse.state
  })
  const buffer = await workbook.xlsx.writeBuffer()
  const fileName = sectionWorkbookFileName({ projectName: parsed.document.meta.name, betaDeg: BETA_DEG, loadcase })
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

  /** Evaluated text of a cell — ExcelJS would hand back the formula object instead. */
  const cellText = (sheet: string, address: string): string => {
    const id = engine.getSheetId(sheet)
    assert.ok(id !== undefined, `sheet ${sheet} exists`)
    const value = engine.getCellValue(engine.simpleCellAddressFromString(address, id as number)!)
    return typeof value === 'string' ? value : String(value ?? '')
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

  console.log('== 2b. Defined names are legal Excel names ==')
  // Excel drops a name it reads as a reference and then removes every formula that used it, which
  // appears only as a repair dialog. `C1_len` was rejected this way: R/C followed by a digit is the
  // start of an R1C1 reference, the same rule that famously rejects `R2D2`.
  const definedNameList = readBack.definedNames.model.map((entry) => entry.name)
  console.log(`      ${definedNameList.length} names: ${definedNameList.join(', ')}`)
  let nameProblems = 0
  for (const name of definedNameList) {
    const reason = invalidDefinedNameReason(name)
    if (reason) {
      nameProblems++
      failures.push(`FAIL  defined name "${name}" ${reason}`)
      console.log(`FAIL  defined name "${name}" ${reason}`)
    }
  }
  // The rule itself must stay honest, so pin the cases that motivated it.
  for (const bad of ['C1', 'C1_len', 'R2D2', 'A1', 'R', 'c', 'Print_Area', '1st']) {
    if (!invalidDefinedNameReason(bad)) {
      failures.push(`FAIL  "${bad}" should be rejected as a defined name`)
      console.log(`FAIL  "${bad}" should be rejected as a defined name`)
    }
  }
  for (const good of ['u_C1', 'Cnc_eps', 'Mesh_A', 'theta_L', 'n', 'beta', 'St_e0', 'Det']) {
    if (invalidDefinedNameReason(good)) {
      failures.push(`FAIL  "${good}" should be accepted as a defined name`)
      console.log(`FAIL  "${good}" should be accepted as a defined name`)
    }
  }
  // Every name a formula uses must actually exist, or Excel strips the formula.
  const declared = new Set(definedNameList.map((name) => name.toLowerCase()))
  const builtIn = new Set([
    'if','and','or','not','sum','sumproduct','index','match','max','min','abs','sqrt','cos','sin','radians','degrees',
    'atan2','round','int','sign','text','iferror','isnumber','count','choose','pi','n','offset','forecast'
  ])
  let missing = 0
  for (const sheet of readBack.worksheets) {
    for (let r = 1; r <= sheet.rowCount; r++) {
      for (let c = 1; c <= sheet.columnCount; c++) {
        const value = sheet.getCell(r, c).value
        if (!value || typeof value !== 'object' || !('formula' in value)) continue
        // Text literals carry prose, so blank them before looking for identifiers.
        const formula = String((value as { formula: string }).formula).replace(/"[^"]*"/g, '""')
        // Whole identifiers only: a lookahead would backtrack and split ATAN2 into ATAN.
        for (const match of formula.matchAll(/(?<![!$A-Za-z0-9_.])[A-Za-z_][A-Za-z0-9_.]*/g)) {
          const token = match[0]
          if (formula[(match.index ?? 0) + token.length] === '(') continue // function call
          const lower = token.toLowerCase()
          if (builtIn.has(lower) || declared.has(lower)) continue
          if (/^[A-Za-z]{1,3}[0-9]+$/.test(token)) continue // a cell reference
          if (readBack.worksheets.some((item) => item.name === token)) continue
          missing++
          if (missing <= 5) console.log(`FAIL  ${sheet.name}!${sheet.getCell(r, c).address} uses unknown name "${token}"`)
        }
      }
    }
  }
  if (missing > 0) failures.push(`FAIL  ${missing} formula reference(s) to an undeclared name`)
  if (nameProblems === 0 && missing === 0) console.log('PASS  all defined names are legal and every formula name resolves\n')

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
  const thetaRow = MM_FIRST + Math.round(BETA_DEG / 15)
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

  console.log('== 9. The two angles are kept apart ==')
  const inputSheet2 = readBack.getWorksheet('Input')!
  const betaCell = cellValue('Input', `C${findLabelRow(inputSheet2, 'beta (strain-plane angle)')}`)
  const thetaCell = cellValue('Input', `C${findLabelRow(inputSheet2, 'theta_L (demand direction)')}`)
  const thetaExpected = (Math.atan2(loadcase.My, loadcase.Mx) * 180) / Math.PI
  check('beta (strain-plane, deg)', betaCell, BETA_DEG, 1e-12)
  check('theta_L derived in Excel (deg)', thetaCell, thetaExpected, 1e-9)
  const separation = Math.abs(thetaCell - betaCell)
  console.log(`      theta_L - beta = ${separation.toFixed(4)} deg`)
  if (separation < 1e-6) {
    failures.push('FAIL  theta_L equals beta — the fixture no longer exercises the angle separation')
    console.log('FAIL  theta_L equals beta; this fixture cannot detect the old conflation')
  } else {
    console.log('PASS  the workbook derives theta_L from the demand, independently of beta\n')
  }

  console.log('== 10. Demand-ray capacity: workbook vs engine ==')
  const surfaceForDemand = buildPreviewSurface(section, rebars, materialStore, loadcase.P, { cellSize })
  const demandContour = sliceFixedPContour(surfaceForDemand.points, loadcase.P)
  const thetaLoad = Math.atan2(loadcase.My, loadcase.Mx)
  const engineHit = intersectFixedPContourWithMomentRay(demandContour, thetaLoad)
  assert.ok(engineHit, 'engine ray query must find a boundary point')
  const engineMb = engineHit!.M / 1e6
  const mmSheet2 = readBack.getWorksheet('MxMy_FixedP')!
  const mbRow = findLabelRow(mmSheet2, 'Mb (kN·m)', 2)
  const workbookMbRay = cellValue('MxMy_FixedP', `E${mbRow}`)
  const ptSheet = readBack.getWorksheet('PM_Theta')!
  const mbPlaneRow = findLabelRow(ptSheet, 'Mb from this section', 2)
  const workbookMbPlane = cellValue('PM_Theta', `C${mbPlaneRow}`)
  console.log(
    `      engine ${engineMb.toFixed(3)}   ray on the workbook contour ${workbookMbRay.toFixed(3)}   ` +
      `plane cut of the station rings ${workbookMbPlane.toFixed(3)} kN·m`
  )
  // The workbook slices a 24x19 grid, the engine slices its triangulation: agreement is expected
  // to the direction-sampling spread, not to machine precision.
  check('workbook ray Mb vs engine', workbookMbRay, engineMb, 5e-3)
  check('workbook plane Mb vs engine', workbookMbPlane, engineMb, 5e-3)
  const spreadRow = findLabelRow(ptSheet, 'spread over the three routes', 2)
  const spread = cellValue('PM_Theta', `C${spreadRow}`)
  console.log(`      workbook-reported spread: ${spread.toFixed(4)} %`)
  check('reported spread stays inside the stated 0.5 %', spread, 0, 1, 0.5)
  console.log()

  console.log('== 11. PM_Theta section is a true plane cut ==')
  const enginePlane = sliceMomentPlane(surfaceForDemand.points, thetaLoad)
  const enginePlus = enginePlane.filter((point) => point.M > 0)
  const PT_FIRST = 10
  let worstM = 0
  let worstP = 0
  let sectionCompared = 0
  for (let index = 0; index < PREVIEW_STATIONS.length; index++) {
    const r = PT_FIRST + index
    if (cellText('PM_Theta', `J${r}`) === 'pole') continue
    const excelP = cellValue('PM_Theta', `E${r}`)
    const excelM = cellValue('PM_Theta', `F${r}`)
    // Match by axial level: the engine plane cut carries no station index.
    let best: { P: number; M: number } | null = null
    for (const point of enginePlus) {
      const candidate = { P: point.P / 1e3, M: point.M / 1e6 }
      if (!best || Math.abs(candidate.P - excelP) < Math.abs(best.P - excelP)) best = candidate
    }
    if (!best) continue
    sectionCompared++
    worstP = Math.max(worstP, Math.abs(best.P - excelP))
    worstM = Math.max(worstM, Math.abs(best.M - excelM))
  }
  console.log(`      non-pole stations compared: ${sectionCompared}`)
  check('worst |ΔP| vs the engine plane cut (kN)', worstP, 0, 1e-6, Math.abs(loadcase.P) / 1e3)
  check('worst |ΔM| vs the engine plane cut (kN·m)', worstM, 0, 5e-3, momentScale)
  const poleRows = Array.from({ length: PREVIEW_STATIONS.length }, (_, index) => index).filter(
    (index) => cellText('PM_Theta', `J${PT_FIRST + index}`) === 'pole'
  )
  console.log(`      poles detected and given Mtheta = 0: ${poleRows.map((index) => `P${index}`).join(', ')}`)
  assert.ok(poleRows.includes(0) && poleRows.includes(PREVIEW_STATIONS.length - 1), 'P0 and P18 must be poles')
  for (const index of poleRows) {
    check(`P${index} pole Mtheta (kN·m)`, cellValue('PM_Theta', `F${PT_FIRST + index}`), 0, 1e-12, 1)
  }
  console.log()

  console.log('== 12. Fixed-axial moment ratio ==')
  const ratioRow = findLabelRow(ptSheet, 'Mu / Mb', 2)
  const ratio = cellValue('PM_Theta', `C${ratioRow}`)
  const engineRatio = Math.hypot(loadcase.Mx, loadcase.My) / engineHit!.M
  console.log(`      workbook ${ratio.toFixed(6)}   engine ${engineRatio.toFixed(6)}`)
  check('Mu / Mb vs engine', ratio, engineRatio, 5e-3)
  console.log()

  const previewStationStateFor = (stationIndex: number) =>
    previewStationState(
      section,
      rebars,
      (BETA_DEG * Math.PI) / 180,
      stationIndex,
      materialStore.concrete.limits.epsCu,
      materialStore.steel[0].fy / materialStore.steel[0].elasticModulus,
      netConcreteCentroid(section)
    )
  const evaluatePreviewStateFor = (store: MaterialStore, state: ReturnType<typeof previewStationStateFor>) =>
    evaluatePreviewState(section, rebars, store, state, { cellSize }, netConcreteCentroid(section))

  console.log('== 13. Equilibrium sheet verifies the converged plane ==')
  const eqSheet = readBack.getWorksheet('Equilibrium')!
  const relRow = findLabelRow(eqSheet, 'relative residual')
  const relResidual = cellValue('Equilibrium', `C${relRow}`)
  const naRow = findLabelRow(eqSheet, 'neutral-axis angle')
  console.log(
    `      neutral-axis angle in the workbook: ${cellValue('Equilibrium', `C${naRow}`).toFixed(4)} deg ` +
      `(engine ${((Math.atan2(inverse.state.ky, inverse.state.kx) * 180) / Math.PI).toFixed(4)} deg)`
  )
  check('workbook neutral-axis angle (deg)', cellValue('Equilibrium', `C${naRow}`), BETA_DEG, 5e-3)
  console.log(`      relative residual recomputed by formula: ${relResidual.toExponential(3)}`)
  check('equilibrium residual', relResidual, 0, 1, 1e-4)
  const verdict = cellText('Equilibrium', `C${relRow + 1}`)
  console.log(`      verdict: ${verdict}`)
  if (!verdict.startsWith('in equilibrium')) failures.push(`FAIL  equilibrium verdict: ${verdict}`)
  console.log()

  console.log('== 14. A tabulated material law exports and evaluates ==')
  // Same physics, expressed as points instead of algebra: the workbook must still work.
  const kdsConcrete = compileConcreteMaterial(materialStore.concrete)
  const kdsSteel = compileSteelMaterial(materialStore.steel[0])
  const curve = (stress: (strain: number) => number, min: number, max: number, count: number): StressStrainPoint[] =>
    Array.from({ length: count }, (_, index) => {
      const strain = min + ((max - min) * index) / (count - 1)
      return { strain, stress: stress(strain) }
    })
  const tabulatedStore: MaterialStore = {
    ...materialStore,
    concrete: {
      ...materialStore.concrete,
      name: 'User curve from KDS C30',
      standard: 'CUSTOM',
      stressStrain: {
        type: 'user-curve',
        points: curve((strain) => kdsConcrete.stress(strain), -0.001, 0.006, 141),
        interpolation: 'linear',
        zeroTension: true
      }
    },
    steel: [
      {
        ...materialStore.steel[0],
        name: 'User curve from SD400',
        standard: 'CUSTOM',
        stressStrain: {
          type: 'user-curve',
          points: curve((strain) => kdsSteel.stress(strain), -0.06, 0.06, 241),
          interpolation: 'linear'
        }
      }
    ]
  }

  const tabInverse = solveInversePreview(
    section,
    rebars,
    tabulatedStore,
    loadcase,
    sliceFixedPContour(buildPreviewSurface(section, rebars, tabulatedStore, loadcase.P).points, loadcase.P)
  )
  const tabWorkbook = await buildSectionWorkbook({
    projectName: `${parsed.document.meta.name} (tabulated law)`,
    sectionName: geometry.name,
    section,
    rebars,
    materialStore: tabulatedStore,
    betaDeg: BETA_DEG,
    fixedP: loadcase.P,
    loadcase,
    equilibrium: tabInverse.state
  })
  const tabBuffer = await tabWorkbook.xlsx.writeBuffer()
  const tabRead = new ExcelJS.Workbook()
  await tabRead.xlsx.load(tabBuffer as ArrayBuffer)
  console.log(
    `      sheets: ${tabRead.worksheets.map((sheet) => sheet.name).join(', ')}  ` +
      `${(tabBuffer.byteLength / 1024 / 1024).toFixed(2)} MB`
  )
  assert.ok(tabRead.getWorksheet('Materials'), 'a tabulated law must publish its sampled curve')

  const tabSheets: Record<string, Array<Array<string | number | boolean | null>>> = {}
  for (const sheet of tabRead.worksheets) {
    const grid: Array<Array<string | number | boolean | null>> = []
    for (let r = 1; r <= sheet.rowCount; r++) {
      const rowValues: Array<string | number | boolean | null> = []
      for (let c = 1; c <= sheet.columnCount; c++) rowValues.push(toHyperFormulaValue(sheet.getCell(r, c)))
      grid.push(rowValues)
    }
    tabSheets[sheet.name] = grid
  }
  const tabEngine = HyperFormula.buildFromSheets(tabSheets, {
    licenseKey: 'gpl-v3',
    useArrayArithmetic: true,
    smartRounding: false
  })
  for (const entry of tabRead.definedNames.model) {
    for (const ranges of entry.ranges) {
      try {
        tabEngine.addNamedExpression(entry.name, `=${ranges}`)
      } catch (error) {
        failures.push(`FAIL  tabulated named range ${entry.name}: ${(error as Error).message}`)
      }
    }
  }
  const tabErrors: string[] = []
  for (const sheet of tabRead.worksheets) {
    const id = tabEngine.getSheetId(sheet.name)
    if (id === undefined) continue
    tabEngine.getSheetValues(id).forEach((rowValues, rowIndex) => {
      rowValues.forEach((value, colIndex) => {
        if (value !== null && typeof value === 'object' && 'type' in (value as object)) {
          tabErrors.push(`${sheet.name}!R${rowIndex + 1}C${colIndex + 1} → ${(value as { type: string }).type}`)
        }
      })
    })
  }
  if (tabErrors.length > 0) {
    console.log(`FAIL  ${tabErrors.length} formula error(s) with a tabulated law; first 6:`)
    for (const cell of tabErrors.slice(0, 6)) console.log(`        ${cell}`)
    failures.push(`FAIL  ${tabErrors.length} tabulated formula errors`)
  } else {
    console.log('PASS  no formula error with a lookup-based material law')
  }

  const tabValue = (sheet: string, address: string) => {
    const id = tabEngine.getSheetId(sheet)!
    const value = tabEngine.getCellValue(tabEngine.simpleCellAddressFromString(address, id)!)
    return typeof value === 'number' ? value : Number.NaN
  }
  // The lookup formula must reproduce the engine's own evaluation of the same curve.
  const tabConcrete = tabValue('Concrete', 'G7') / 1000
  const tabDetailStation = Number(tabRead.getWorksheet('Concrete')!.getCell('C4').value)
  const tabState = previewStationStateFor(tabDetailStation)
  const tabLedger = evaluatePreviewStateFor(tabulatedStore, tabState)
  check('tabulated fibre ΣFc vs engine (kN)', tabConcrete, tabLedger.concrete.P / 1e3, 1e-6, 1)
  const tabEqRow = findLabelRow(tabRead.getWorksheet('Equilibrium')!, 'relative residual')
  const tabResidual = tabValue('Equilibrium', `C${tabEqRow}`)
  console.log(`      tabulated equilibrium residual: ${tabResidual.toExponential(3)}`)
  check('tabulated equilibrium residual', tabResidual, 0, 1, 1e-3)
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
