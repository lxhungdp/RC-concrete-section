/**
 * Verifies the equivalent-block workbook by *evaluating its formulas*, not by trusting them.
 *
 * Same discipline as `excel.selftest.ts`: the generated file is read back with ExcelJS, loaded into
 * HyperFormula, recalculated, and compared with the block kernel that produced it. The two checks
 * that matter most are structural rather than numerical —
 *
 *   the shoelace recomputation of the clipped compression polygon must reproduce the area the
 *   kernel integrated, otherwise the ledger is multiplying σblock by an unverified number;
 *
 *   the sheet's own φ interpolation must reproduce the adapter's design resultants, otherwise the
 *   workbook documents a transition rule the engine does not apply.
 *
 * Run: npm run test:excel-block
 */
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { HyperFormula } from 'hyperformula'
import ExcelJS from 'exceljs'
import { geometryInputRebars, sectionGeometryFromGeometryInput } from '@pm/geometry'
import {
  applyCalculationProfileToMaterials,
  createAnalysisOptionsForProfile,
  createDesignBasisForCalculationProfile,
  parseProjectDocument,
  type EquivalentBlockAnalysisOptions,
  type EquivalentBlockProfileId
} from '@pm/project'
import {
  buildEquivalentBlockDesignSurfaceFromPrepared,
  prepareBlockAnalysis
} from '@pm/analysis-equivalent-block'
import type { NominalBlockEvaluation } from '@pm/equivalent-block'
import { createKdsAppendixDesignBasis } from '@pm/design'
import { buildEquivalentBlockWorkbook, equivalentBlockWorkbookFileName } from '../../src/excel/equivalent-block'

const OUT_DIR = resolve(process.cwd(), 'docs/examples/reference-case/generated')

/**
 * The first case is deliberately the project the stress-strain workbook is generated from, rebound
 * to the KDS block profile. Same geometry, same characteristic strengths, same factored demand, one
 * workbook per mechanics — which is what makes the two files comparable at all. It is the only case
 * archived under `docs/examples/reference-case/generated`; the rest exercise topology and are not kept.
 */
const CASES = [
  {
    file: 'docs/examples/reference-case/projects/PM-advanced (7) 2D.pm-project.json',
    rebindTo: 'kds-142020-equivalent-block' as const,
    thetaDeg: 15,
    archive: true,
    appendix: false
  },
  { file: 'docs/examples/equivalent-block/KDS-EB-01-rectangle-8-bars.pm-project.json', rebindTo: null, thetaDeg: 0, archive: false, appendix: true },
  { file: 'docs/examples/equivalent-block/ACI-EB-01-rectangle-8-bars.pm-project.json', rebindTo: null, thetaDeg: 0, archive: false, appendix: false },
  { file: 'docs/examples/equivalent-block/ACI-EB-01-rectangle-8-bars.pm-project.json', rebindTo: 'as-3600-2018-amd2-equivalent-block' as const, thetaDeg: 0, archive: false, appendix: false },
  { file: 'docs/examples/equivalent-block/KDS-EB-02-hollow-8-bars.pm-project.json', rebindTo: null, thetaDeg: 30, archive: false, appendix: false },
  { file: 'docs/examples/equivalent-block/ACI-EB-03-l-shape-8-bars.pm-project.json', rebindTo: null, thetaDeg: 45, archive: false, appendix: false }
] as const

const failures: string[] = []

const fmt = (value: number) => (Number.isFinite(value) ? value.toFixed(5).padStart(15) : String(value).padStart(15))

const check = (label: string, actual: number, expected: number, relTol: number, absScale = 0) => {
  const denominator = Math.max(absScale, Math.abs(expected), 1e-12)
  const relative = Math.abs(actual - expected) / denominator
  const ok = Number.isFinite(actual) && relative <= relTol
  const line = `${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(40)} excel=${fmt(actual)} engine=${fmt(expected)}  rel=${(
    relative * 100
  ).toFixed(6)}%`
  console.log(line)
  if (!ok) failures.push(line)
}

const pass = (label: string, condition: boolean, detail = '') => {
  const line = `${condition ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`
  console.log(line)
  if (!condition) failures.push(line)
}

/** ExcelJS cell -> HyperFormula sheet cell (formula string, primitive, or null). */
const toHyperFormulaValue = (cell: ExcelJS.Cell): string | number | boolean | null => {
  const value = cell.value
  if (value === null || value === undefined) return null
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') return value
  if (typeof value === 'object' && 'formula' in value && typeof value.formula === 'string') return `=${value.formula}`
  if (typeof value === 'object' && 'result' in value) return (value as { result: number }).result ?? null
  if (typeof value === 'object' && 'richText' in value) return null
  return null
}

const TAU = 2 * Math.PI
const wrap = (angle: number) => ((angle % TAU) + TAU) % TAU
const angularDistance = (a: number, b: number) => {
  const raw = wrap(a - b)
  return Math.min(raw, TAU - raw)
}

const runCase = async (
  relativePath: string,
  thetaDeg: number,
  rebindTo: EquivalentBlockProfileId | null,
  archive: boolean,
  appendix: boolean
) => {
  console.log(`\n================ ${relativePath} @ θ = ${thetaDeg}° ================`)
  const parsed = parseProjectDocument(readFileSync(resolve(process.cwd(), relativePath), 'utf8'))
  assert.ok(parsed.ok, `${relativePath} must parse`)
  if (!parsed.ok) return
  const document = parsed.document
  const geometry = document.inputs.geometry
  const section = sectionGeometryFromGeometryInput(geometry)
  const rebars = geometryInputRebars(geometry)
  const profileId = (rebindTo ?? document.inputs.calculationProfileId) as EquivalentBlockProfileId
  const materials = rebindTo
    ? applyCalculationProfileToMaterials(document.inputs.materials, rebindTo)
    : document.inputs.materials
  const designBasis = appendix
    ? createKdsAppendixDesignBasis()
    : rebindTo
    ? createDesignBasisForCalculationProfile(rebindTo)
    : document.inputs.design
  const options = (rebindTo
    ? createAnalysisOptionsForProfile(rebindTo)
    : document.inputs.analysis) as EquivalentBlockAnalysisOptions
  const loadcase = document.inputs.loadings.combinations[0]
  if (rebindTo) console.log(`      rebound from ${document.inputs.calculationProfileId} to ${rebindTo}`)
  if (appendix) console.log('      KDS Appendix material-factor resistance route')

  console.log('== 1. Build the workbook ==')
  const started = Date.now()
  const workbook = await buildEquivalentBlockWorkbook({
    projectName: document.meta.name,
    sectionName: geometry.name,
    calculationProfileId: profileId,
    section,
    rebars,
    materialStore: materials,
    designBasis,
    analysisOptions: options,
    thetaDeg,
    fixedP: loadcase.P,
    loadcase
  })
  const buffer = await workbook.xlsx.writeBuffer()
  const fileName = equivalentBlockWorkbookFileName({ projectName: document.meta.name, thetaDeg, loadcase })
  if (archive) writeFileSync(resolve(OUT_DIR, fileName), Buffer.from(buffer))
  console.log(
    `      ${fileName}  ${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB  built in ${Date.now() - started} ms${
      archive ? '  (archived)' : ''
    }`
  )

  console.log('== 2. Read back and recalculate ==')
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
  let namedCount = 0
  for (const entry of readBack.definedNames.model) {
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
    engine.getSheetValues(id).forEach((rowValues, rowIndex) => {
      rowValues.forEach((value, colIndex) => {
        if (value !== null && typeof value === 'object' && 'type' in (value as object)) {
          const detail = value as { type: string; message?: string }
          errorCells.push(`${name}!R${rowIndex + 1}C${colIndex + 1} → ${detail.type} ${detail.message ?? ''}`)
        }
      })
    })
  }
  pass('no formula evaluated to an error', errorCells.length === 0, errorCells.slice(0, 6).join(' | '))

  const cellValue = (sheet: string, address: string): number => {
    const id = engine.getSheetId(sheet)
    assert.ok(id !== undefined, `sheet ${sheet} exists`)
    const value = engine.getCellValue(engine.simpleCellAddressFromString(address, id as number)!)
    return typeof value === 'number' ? value : Number.NaN
  }
  const cellText = (sheet: string, address: string): string => {
    const id = engine.getSheetId(sheet)
    assert.ok(id !== undefined, `sheet ${sheet} exists`)
    const value = engine.getCellValue(engine.simpleCellAddressFromString(address, id as number)!)
    return typeof value === 'string' ? value : String(value ?? '')
  }
  const findLabelRow = (sheetName: string, label: string) => {
    const sheet = readBack.getWorksheet(sheetName)
    assert.ok(sheet, `sheet ${sheetName} exists`)
    let found = 0
    sheet.eachRow((row, rowNumber) => {
      if (row.getCell(2).text === label) found = rowNumber
    })
    assert.ok(found > 0, `${sheetName} contains label ${label}`)
    return found
  }

  console.log('== 3. Rebuild the same states in the engine ==')
  const prepared = prepareBlockAnalysis(profileId, section, rebars, materials, designBasis)
  const core = buildEquivalentBlockDesignSurfaceFromPrepared(prepared, options)
  const sampled = [...new Set(core.directions.map(wrap))].sort((a, b) => a - b)
  const requested = wrap((thetaDeg * Math.PI) / 180)
  const theta = sampled.reduce((best, candidate) =>
    angularDistance(candidate, requested) < angularDistance(best, requested) ? candidate : best
  )
  const depths = [...new Set(
    core.points
      .filter((point) => point.kind === 'state' && point.state && angularDistance(wrap(point.state.neutralAxisAngle), theta) <= 1e-9)
      .map((point) => point.state!.neutralAxisDepth)
  )].sort((a, b) => b - a)
  const nominalEvaluator = prepared.model.bindNominalEvaluator(prepared.section)
  const designEvaluator = prepared.model.bindDesignEvaluator(prepared.section)
  console.log(`      audited θ = ${((theta * 180) / Math.PI).toFixed(4)}°, ${depths.length} active mesh layers`)

  console.log('== 4. Clipped polygon: shoelace vs exact clipping ==')
  let worstAreaError = 0
  let worstAreaScale = 0
  depths.forEach((c, index) => {
    const nominal = nominalEvaluator({ neutralAxisAngle: theta, neutralAxisDepth: c }).source as NominalBlockEvaluation
    const sheetArea = cellValue('Block', `E${6 + index}`)
    worstAreaError = Math.max(worstAreaError, Math.abs(sheetArea - nominal.concrete.area))
    worstAreaScale = Math.max(worstAreaScale, Math.abs(nominal.concrete.area))
  })
  check('worst clipped-area error (mm²)', worstAreaError, 0, 1e-9, Math.max(1, worstAreaScale))

  console.log('== 5. Ledger: concrete, steel and totals ==')
  let worstP = 0
  let worstMx = 0
  let worstMy = 0
  let worstDesignP = 0
  let scaleP = 0
  let scaleM = 0
  depths.forEach((c, index) => {
    const state = { neutralAxisAngle: theta, neutralAxisDepth: c }
    const nominal = nominalEvaluator(state).source as NominalBlockEvaluation
    const design = designEvaluator(state)
    const r = 7 + index
    worstP = Math.max(worstP, Math.abs(cellValue('PM_Angle', `F${r}`) - nominal.resultants.P / 1e3))
    worstMx = Math.max(worstMx, Math.abs(cellValue('PM_Angle', `G${r}`) - nominal.resultants.Mx / 1e6))
    worstMy = Math.max(worstMy, Math.abs(cellValue('PM_Angle', `H${r}`) - nominal.resultants.My / 1e6))
    worstDesignP = Math.max(worstDesignP, Math.abs(cellValue('PM_Angle', `L${r}`) - design.resultants.P / 1e3))
    scaleP = Math.max(scaleP, Math.abs(nominal.resultants.P) / 1e3)
    scaleM = Math.max(scaleM, Math.abs(nominal.resultants.Mx) / 1e6, Math.abs(nominal.resultants.My) / 1e6)
  })
  check('worst |ΔPn| (kN)', worstP, 0, 1e-9, Math.max(1, scaleP))
  check('worst |ΔMnx| (kN·m)', worstMx, 0, 1e-9, Math.max(1, scaleM))
  check('worst |ΔMny| (kN·m)', worstMy, 0, 1e-9, Math.max(1, scaleM))
  check('worst |ΔφPn| (kN) — the sheet reproduces φ', worstDesignP, 0, 1e-9, Math.max(1, scaleP))

  console.log('== 6. My uses the shared project convention ==')
  const signIndex = depths.findIndex((c) => {
    const nominal = nominalEvaluator({ neutralAxisAngle: theta, neutralAxisDepth: c }).source as NominalBlockEvaluation
    return Math.abs(nominal.resultants.My) > 1e6
  })
  if (signIndex >= 0) {
    const nominal = nominalEvaluator({ neutralAxisAngle: theta, neutralAxisDepth: depths[signIndex] })
      .source as NominalBlockEvaluation
    const sheetMy = cellValue('PM_Angle', `H${7 + signIndex}`)
    pass(
      'Mny uses the shared sign (+ΣF·x)',
      Math.sign(sheetMy) === Math.sign(nominal.resultants.My),
      `sheet ${sheetMy.toFixed(3)} engine ${(nominal.resultants.My / 1e6).toFixed(3)} kN·m`
    )
  } else {
    console.log('      every audited station has My ≈ 0 at this direction; sign check skipped')
  }

  console.log('== 7. Named inputs stay live ==')
  const namedValue = (name: string) => {
    const value = engine.getNamedExpressionValue(name)
    return typeof value === 'number' ? value : Number.NaN
  }
  check('σblock = α·fck (MPa)', namedValue('sig_blk'), prepared.model.blockLaw.compressionStress, 1e-9)
  check('β1', namedValue('beta_1'), prepared.model.blockLaw.depthFactor, 1e-12)
  check('εcu', namedValue('ecu'), prepared.model.blockLaw.extremeCompressionStrain, 1e-12)

  console.log('== 8. Capacity-ray residual and fail-closed verdict ==')
  const residualRow = findLabelRow('Equilibrium', 'relative residual')
  const capacityResidual = cellValue('Equilibrium', `C${residualRow}`)
  pass(
    'capacity state balances lambda x demand with dimensionless component scaling',
    Number.isFinite(capacityResidual) && capacityResidual <= 1e-4,
    `relative residual ${capacityResidual.toExponential(3)}`
  )
  pass(
    'equilibrium sheet labels the state as a capacity-ray reconciliation',
    cellText('Equilibrium', `E${residualRow}`).startsWith('capacity state reconciled')
  )

  const designSheetId = engine.getSheetId('Design_Check')
  assert.ok(designSheetId !== undefined)
  const convergenceRow = findLabelRow('Design_Check', 'solver converged')
  const admissibilityRow = findLabelRow('Design_Check', 'strain admissible')
  const verdictRow = findLabelRow('Design_Check', 'verdict')
  engine.setCellContents({ sheet: designSheetId, row: convergenceRow - 1, col: 2 }, [['no']])
  pass(
    'verdict refuses a non-converged solve even when utilization is numeric',
    cellText('Design_Check', `C${verdictRow}`).startsWith('NOT CHECKED - solver did not converge')
  )
  engine.setCellContents({ sheet: designSheetId, row: convergenceRow - 1, col: 2 }, [['yes']])
  engine.setCellContents({ sheet: designSheetId, row: admissibilityRow - 1, col: 2 }, [['no']])
  pass(
    'verdict refuses a strain-inadmissible state even when utilization is below one',
    cellText('Design_Check', `C${verdictRow}`).startsWith('NOT CHECKED - strain state is not admissible')
  )
}

const run = async () => {
  for (const testCase of CASES) {
    await runCase(testCase.file, testCase.thetaDeg, testCase.rebindTo, testCase.archive, testCase.appendix)
  }
  if (failures.length > 0) {
    console.error(`\n${failures.length} check(s) failed:`)
    for (const line of failures) console.error(`  ${line}`)
    process.exitCode = 1
    return
  }
  console.log('\nAll equivalent-block workbook checks passed.')
}

void run()
