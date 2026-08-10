/**
 * TEMPORARY independent cross-check of the Result-menu Excel export (chart-audit workbook).
 * Deleted after the review. Recalculates every formula with HyperFormula and compares the
 * recalculated numbers against the engine surface and against the on-screen UI table.
 */
import ExcelJS from 'exceljs'
import { HyperFormula } from 'hyperformula'
import {
  activeDesignSurfaceDataset,
  activeNominalSurfaceDataset,
  buildDesignPreviewSurface,
  buildDirectMeridianSection,
  contourStrainAngleSamples,
  evaluatePreparedState,
  prepareAnalysis,
  sliceFixedPContour,
  type PreviewSurface,
  type PreviewSurfacePoint
} from '@pm/analysis'
import { buildResistanceMaterialSets } from '@pm/design'
import { geometryInputRebars, sectionGeometryFromGeometryInput } from '@pm/geometry'
import { analysisMeshKernelOptions, createDefaultAnalysisOptions } from '@pm/project'
import { referenceProjectDocument } from './packages/pm-analysis/test/fixtures/reference-case'
import {
  buildChartAuditWorkbook,
  type ChartAuditWorkbookInput
} from './packages/pm-report/src/excel/chart-audit'

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
const surface: PreviewSurface = buildDesignPreviewSurface(
  section,
  rebars,
  document.inputs.materials,
  document.inputs.design,
  analysisMeshKernelOptions(analysisOptions),
  analysisOptions
)

const baseInput = (source: 'vertical' | 'fixedP'): ChartAuditWorkbookInput => ({
  projectName: document.meta.name,
  projectInformation: document.meta.information,
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
    return typeof result === 'number' || typeof result === 'string' || typeof result === 'boolean' ? result : null
  }
  return null
}

const recalc = async (workbook: ExcelJS.Workbook) => {
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

const numberAt = (engine: HyperFormula, sheet: string, column: number, row: number): number | string => {
  const sheetId = engine.getSheetId(sheet)!
  const value = engine.getCellValue({ sheet: sheetId, col: column - 1, row: row - 1 })
  if (typeof value === 'number') return value
  if (value !== null && typeof value === 'object' && 'type' in value) {
    return `ERR:${(value as { type: string }).type}`
  }
  return typeof value === 'string' ? value : 'NON-NUMBER'
}

const sourceCells = (start: number) => ({
  key: start, label: start + 1, beta: start + 2, criterionBasis: start + 3, criterionValue: start + 4,
  compressionProjection: start + 5, controlProjection: start + 6, sectionDepth: start + 7,
  compressionStrain: start + 8, controlStrain: start + 9, curvature: start + 10,
  e0: start + 11, kx: start + 12, ky: start + 13,
  cP: start + 14, cMx: start + 15, cMy: start + 16,
  sP: start + 17, sMx: start + 18, sMy: start + 19,
  bP: start + 20, bMx: start + 21, bMy: start + 22,
  pScale: start + 23, mScale: start + 24,
  fP: start + 25, fMx: start + 26, fMy: start + 27,
  eP: start + 28, eMx: start + 29, eMy: start + 30,
  dP: start + 31, dM: start + 32, mode: start + 33
})

const kn = (v: number) => v / 1000
const knm = (v: number) => v / 1e6
const normalizeAngleDeg = (d: number) => ((d % 360) + 360) % 360

type Row = Record<string, string | number>
const table = (title: string, rows: Row[]) => {
  console.log(`\n### ${title}`)
  console.table(rows)
}

// ---------------------------------------------------------------------------
// 1. VERTICAL — does the Excel formula chain reproduce the engine point?
// ---------------------------------------------------------------------------
const checkVertical = async (stage: 'design' | 'nominal') => {
  const input = baseInput('vertical')
  input.resistanceStage = stage
  const workbook = await buildChartAuditWorkbook(input)
  const { engine } = await recalc(workbook)
  const cells = sourceCells(7)
  const result = workbook.getWorksheet('Result')!

  const dataset = stage === 'design'
    ? activeDesignSurfaceDataset(surface)
    : activeNominalSurfaceDataset(surface)
  const enginePoints = buildDirectMeridianSection(dataset.points, input.sliceAngleDeg, false).primary
    .filter((p) => p.sectionPointRole === 'surface-vertex' && p.stationId !== null)
    .sort((a, b) => a.station - b.station)

  const rows: Row[] = []
  let worstP = 0
  let worstM = 0
  let worstBaseP = 0
  for (let index = 0; index < enginePoints.length; index++) {
    const row = 8 + index
    const point = enginePoints[index]
    const fP = numberAt(engine, 'Result', cells.fP, row)
    const fMx = numberAt(engine, 'Result', cells.fMx, row)
    const fMy = numberAt(engine, 'Result', cells.fMy, row)
    const bP = numberAt(engine, 'Result', cells.bP, row)
    const dP = typeof fP === 'number' ? fP - kn(point.P) : NaN
    const dM = typeof fMx === 'number' && typeof fMy === 'number'
      ? Math.hypot(fMx - knm(point.Mx), fMy - knm(point.My))
      : NaN
    const relP = Math.abs(kn(point.P)) > 1 ? Math.abs(dP / kn(point.P)) : Math.abs(dP)
    const mMag = Math.hypot(knm(point.Mx), knm(point.My))
    const relM = mMag > 1 ? dM / mMag : dM
    worstP = Math.max(worstP, Number.isFinite(relP) ? relP : 1e9)
    worstM = Math.max(worstM, Number.isFinite(relM) ? relM : 1e9)
    if (typeof bP === 'number') worstBaseP = Math.max(worstBaseP, Math.abs(bP))
    rows.push({
      '#': index + 1,
      station: String(point.stationId).slice(0, 26),
      role: point.surfaceRole,
      'engine P': Number(kn(point.P).toFixed(2)),
      'excel P': typeof fP === 'number' ? Number(fP.toFixed(2)) : fP,
      'engine M': Number(Math.hypot(knm(point.Mx), knm(point.My)).toFixed(2)),
      'excel M': typeof fMx === 'number' && typeof fMy === 'number'
        ? Number(Math.hypot(fMx, fMy).toFixed(2))
        : 'ERR',
      'rel dP': Number(relP.toExponential(2)),
      'rel dM': Number(relM.toExponential(2))
    })
  }
  table(`VERTICAL / ${stage} — recalculated Excel vs engine (${enginePoints.length} stations)`, rows)
  console.log(`worst relative dP = ${worstP.toExponential(3)}   worst relative dM = ${worstM.toExponential(3)}`)
  console.log(`calculation mode  = ${result.getCell(8, cells.mode).value}`)
  return { worstP, worstM }
}

// ---------------------------------------------------------------------------
// 2. Exported main table vs the UI table the user sees
// ---------------------------------------------------------------------------
const checkAgainstUiTable = async () => {
  const input = baseInput('fixedP')
  input.fixedP = 0
  const dataset = activeDesignSurfaceDataset(surface)
  const samples = contourStrainAngleSamples(sliceFixedPContour(dataset.points, input.fixedP, dataset.triangles))
  // UI dedupe: chart-data-table keys rows by beta rounded to 3 decimals.
  const uiKeys = new Map<string, number>()
  for (const s of samples) {
    const key = normalizeAngleDeg((s.beta * 180) / Math.PI).toFixed(3)
    uiKeys.set(key, (uiKeys.get(key) ?? 0) + 1)
  }
  const collapsed = [...uiKeys.entries()].filter(([, n]) => n > 1)
  console.log(`\n### FIXED-P row identity (P = ${kn(input.fixedP)} kN)`)
  console.log(`contour samples on sampled directions : ${samples.length}`)
  console.log(`distinct beta keys the UI table shows  : ${uiKeys.size}`)
  console.log(`beta keys carrying >1 sample (UI drops): ${collapsed.length}`,
    collapsed.slice(0, 6).map(([k, n]) => `${k}deg x${n}`).join(', '))

  // Now at Pmax, where multiple branches share one beta.
  const pmax = Math.max(...dataset.points.map((p) => p.P))
  const capSamples = contourStrainAngleSamples(sliceFixedPContour(dataset.points, pmax, dataset.triangles))
  const capKeys = new Map<string, number>()
  for (const s of capSamples) {
    const key = normalizeAngleDeg((s.beta * 180) / Math.PI).toFixed(3)
    capKeys.set(key, (capKeys.get(key) ?? 0) + 1)
  }
  const capCollapsed = [...capKeys.entries()].filter(([, n]) => n > 1)
  console.log(`\nAt Pmax = ${kn(pmax).toFixed(1)} kN:`)
  console.log(`contour samples                        : ${capSamples.length}`)
  console.log(`rows the UI table shows                : ${capKeys.size}`)
  console.log(`rows the audit workbook exports        : ${capSamples.length}`)
  console.log(`beta keys the UI collapses             : ${capCollapsed.length}`,
    capCollapsed.slice(0, 6).map(([k, n]) => `${k}deg x${n}`).join(', '))
}

// ---------------------------------------------------------------------------
// 3. FIXED-P — recalculated interpolation vs engine contour
// ---------------------------------------------------------------------------
const checkFixedP = async (fixedPkN: number, stage: 'design' | 'nominal') => {
  const input = baseInput('fixedP')
  input.resistanceStage = stage
  input.fixedP = fixedPkN * 1000
  const workbook = await buildChartAuditWorkbook(input)
  const { engine } = await recalc(workbook)
  const result = workbook.getWorksheet('Result')!
  const rows = Array.from({ length: result.rowCount - 7 }, (_, i) => i + 8)
    .filter((r) => typeof result.getCell(r, 1).value === 'number')
  const out: Row[] = []
  let worst = 0
  for (const row of rows.slice(0, 40)) {
    const mx = numberAt(engine, 'Result', 14, row)
    const my = numberAt(engine, 'Result', 15, row)
    const engMx = Number(result.getCell(row, 16).value)
    const engMy = Number(result.getCell(row, 17).value)
    const d = typeof mx === 'number' && typeof my === 'number'
      ? Math.hypot(mx - engMx, my - engMy)
      : NaN
    const mag = Math.hypot(engMx, engMy)
    const rel = mag > 1 ? d / mag : d
    worst = Math.max(worst, Number.isFinite(rel) ? rel : 1e9)
    out.push({
      '#': Number(result.getCell(row, 1).value),
      'beta': Number(result.getCell(row, 4).value),
      'status': String(numberAt(engine, 'Result', 13, row)),
      't': typeof numberAt(engine, 'Result', 12, row) === 'number'
        ? Number((numberAt(engine, 'Result', 12, row) as number).toFixed(4)) : 'ERR',
      'engine |M|': Number(mag.toFixed(2)),
      'excel |M|': typeof mx === 'number' && typeof my === 'number' ? Number(Math.hypot(mx, my).toFixed(2)) : 'ERR',
      'rel dM': Number(rel.toExponential(2))
    })
  }
  table(`FIXED-P / ${stage} at P = ${fixedPkN} kN — recalculated vs engine (${rows.length} rows)`, out)
  console.log(`worst relative dM = ${worst.toExponential(3)}`)
  return worst
}

// ---------------------------------------------------------------------------
// 4. Does the resistance stage reduction survive an edit? (pScale / mScale probe)
// ---------------------------------------------------------------------------
const checkScaleFidelity = () => {
  const materialSets = buildResistanceMaterialSets(document.inputs.materials, document.inputs.design)
  const calcMaterials = document.inputs.design.format === 'globalResultantFactor'
    ? materialSets.referenceMaterials
    : materialSets.designMaterials
  const prepared = prepareAnalysis(section, rebars, calcMaterials, analysisMeshKernelOptions(analysisOptions))
  const dataset = activeDesignSurfaceDataset(surface)
  const points = buildDirectMeridianSection(dataset.points, 15, false).primary
    .filter((p) => p.sectionPointRole === 'surface-vertex' && p.stationId !== null)
  const out: Row[] = []
  for (const point of points.slice(0, 60) as PreviewSurfacePoint[]) {
    const base = evaluatePreparedState(prepared, point.state)
    const pScale = Math.abs(base.total.P) > 1e-9 ? point.P / base.total.P : (Math.abs(point.P) <= 1e-9 ? 1 : 0)
    const den = base.total.Mx ** 2 + base.total.My ** 2
    const mScale = den <= 1e-12
      ? (Math.hypot(point.Mx, point.My) <= 1e-9 ? 1 : 0)
      : (point.Mx * base.total.Mx + point.My * base.total.My) / den
    // Residual moment perpendicular to the base direction — a scalar scale cannot represent it.
    const projMx = base.total.Mx * mScale
    const projMy = base.total.My * mScale
    const perp = Math.hypot(point.Mx - projMx, point.My - projMy)
    if (Math.abs(pScale - 1) > 1e-9 || Math.abs(mScale - 1) > 1e-9 || perp > 1) {
      out.push({
        station: String(point.stationId).slice(0, 28),
        role: point.surfaceRole,
        pScale: Number(pScale.toFixed(6)),
        mScale: Number(mScale.toFixed(6)),
        'perp resid (kN·m)': Number(knm(perp).toFixed(4))
      })
    }
  }
  table('Stations where Final = Base x scale is NOT the identity (design stage)', out.slice(0, 25))
  console.log(`rows with a non-unit scale: ${out.length} of ${points.length}`)
}

const main = async () => {
  console.log(`design basis format = ${document.inputs.design.format}`)
  console.log(`profile             = ${document.inputs.design.profileId}`)
  console.log(`surface mechanics   = ${surface.mechanics}`)
  await checkVertical('design')
  await checkVertical('nominal')
  await checkAgainstUiTable()
  await checkFixedP(0, 'design')
  const dataset = activeDesignSurfaceDataset(surface)
  await checkFixedP(Number(kn(Math.max(...dataset.points.map((p) => p.P))).toFixed(0)) - 1, 'design')
  checkScaleFidelity()
}

void main()
