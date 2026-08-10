/** TEMPORARY probe 2: other design formats + equivalent-block mechanics. */
import ExcelJS from 'exceljs'
import { HyperFormula } from 'hyperformula'
import {
  activeDesignSurfaceDataset,
  buildDesignPreviewSurface,
  buildDirectMeridianSection,
  evaluatePreparedState,
  prepareAnalysis,
  type PreviewSurface
} from '@pm/analysis'
import {
  buildResistanceMaterialSets,
  createAci318DesignBasis,
  createEn1992DesignBasis,
  createKdsAppendixDesignBasis,
  createKdsBasicDesignBasis,
  type DesignBasis
} from '@pm/design'
import { geometryInputRebars, sectionGeometryFromGeometryInput } from '@pm/geometry'
import { analysisMeshKernelOptions, createDefaultAnalysisOptions } from '@pm/project'
import { referenceProjectDocument } from './packages/pm-analysis/test/fixtures/reference-case'
import { buildChartAuditWorkbook, type ChartAuditWorkbookInput } from './packages/pm-report/src/excel/chart-audit'

const document = referenceProjectDocument()
const section = sectionGeometryFromGeometryInput(document.inputs.geometry)
const rebars = geometryInputRebars(document.inputs.geometry)
const options = (() => {
  const o = createDefaultAnalysisOptions()
  o.mesh.sizing = { type: 'automatic', seedDivisions: 8 }
  o.stations.refinement = { type: 'fixed' }
  o.directions.refinement = { type: 'fixed', probe: 'all' }
  return o
})()
const knm = (v: number) => v / 1e6

const probe = (label: string, basis: DesignBasis) => {
  let surface: PreviewSurface
  try {
    surface = buildDesignPreviewSurface(
      section, rebars, document.inputs.materials, basis,
      analysisMeshKernelOptions(options), options
    )
  } catch (error) {
    console.log(`  ${label}: surface failed (${(error as Error).message})`)
    return
  }
  const sets = buildResistanceMaterialSets(document.inputs.materials, basis)
  const calc = basis.format === 'globalResultantFactor' ? sets.referenceMaterials : sets.designMaterials
  const prepared = prepareAnalysis(section, rebars, calc, analysisMeshKernelOptions(options))
  const points = buildDirectMeridianSection(activeDesignSurfaceDataset(surface).points, 15, false).primary
    .filter((p) => p.sectionPointRole === 'surface-vertex' && p.stationId !== null)
  let broken = 0
  let worstPerp = 0
  let capCount = 0
  const roles = new Map<string, number>()
  for (const point of points) {
    roles.set(point.surfaceRole, (roles.get(point.surfaceRole) ?? 0) + 1)
    const base = evaluatePreparedState(prepared, point.state)
    const den = base.total.Mx ** 2 + base.total.My ** 2
    const mScale = den <= 1e-12
      ? (Math.hypot(point.Mx, point.My) <= 1e-9 ? 1 : 0)
      : (point.Mx * base.total.Mx + point.My * base.total.My) / den
    const perp = Math.hypot(point.Mx - base.total.Mx * mScale, point.My - base.total.My * mScale)
    const pScale = Math.abs(base.total.P) > 1e-9 ? point.P / base.total.P : 1
    if (point.surfaceRole === 'axial-cap') capCount++
    if (knm(perp) > 0.5 || Math.abs(pScale - mScale) > 1e-6) {
      broken++
      worstPerp = Math.max(worstPerp, knm(perp))
    }
  }
  console.log(
    `  ${label.padEnd(26)} ${basis.format.padEnd(28)} stations=${String(points.length).padStart(3)} ` +
    `axial-cap=${String(capCount).padStart(3)} misrepresented=${String(broken).padStart(3)} ` +
    `worst |M_perp|=${worstPerp.toFixed(1)} kN·m`
  )
}

console.log('=== scalar pScale/mScale fidelity by design format (beta=15, design stage) ===')
probe('KDS basic (phi)', createKdsBasicDesignBasis())
probe('ACI 318-19', createAci318DesignBasis())
probe('EN 1992-1-1', createEn1992DesignBasis())
probe('KDS appendix (gamma)', createKdsAppendixDesignBasis())

const toHF = (cell: ExcelJS.Cell): string | number | boolean | null => {
  const v = cell.value
  if (v === null || v === undefined) return null
  if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') return v
  if (typeof v === 'object' && 'formula' in v && typeof v.formula === 'string') return `=${v.formula}`
  if (typeof v === 'object' && 'result' in v) {
    const r = (v as { result?: number | string | boolean | null }).result
    return typeof r === 'number' || typeof r === 'string' || typeof r === 'boolean' ? r : null
  }
  return null
}

const main = async () => {
  const { createDefaultEquivalentBlockAnalysisOptions } = await import('@pm/project')
  const { buildEquivalentBlockPreviewSurface } = await import('@pm/analysis-equivalent-block')
  const basis = createAci318DesignBasis()
  const blockOptions = createDefaultEquivalentBlockAnalysisOptions()
  let blockSurface: PreviewSurface
  try {
    blockSurface = buildEquivalentBlockPreviewSurface(
      'aci-318-19-22-equivalent-block',
      section, rebars, document.inputs.materials, basis, blockOptions
    ) as unknown as PreviewSurface
  } catch (error) {
    console.log(`\nequivalent-block surface failed: ${(error as Error).message}`)
    return
  }
  console.log(`\n=== equivalent-block mechanics = "${blockSurface.mechanics}" ===`)
  const input: ChartAuditWorkbookInput = {
    projectName: document.meta.name,
    sectionName: section.name,
    section, rebars,
    materialStore: document.inputs.materials,
    designBasis: basis,
    surface: blockSurface,
    source: 'vertical',
    resistanceStage: 'design',
    sliceAngleDeg: 15,
    fixedP: 0
  }
  let workbook: ExcelJS.Workbook
  try {
    workbook = await buildChartAuditWorkbook(input) as unknown as ExcelJS.Workbook
  } catch (error) {
    console.log(`buildChartAuditWorkbook threw: ${(error as Error).message}`)
    return
  }
  const result = workbook.getWorksheet('Result')!
  console.log(`sheets             : ${workbook.worksheets.map((s) => s.name).join(', ')}`)
  console.log(`Mesh sheet rows    : ${workbook.getWorksheet('Mesh')!.rowCount}  (titled "CONCRETE INTEGRATION MESH")`)
  console.log(`calculation mode   : ${result.getCell(8, 40).value}`)
  console.log(`Concrete P formula : ${result.getCell(8, 21).formula}`)
  console.log(`Steel P formula    : ${result.getCell(8, 24).formula}`)
  console.log(`Final P formula    : ${result.getCell(8, 32).formula}`)

  const buffer = await workbook.xlsx.writeBuffer()
  const readBack = new ExcelJS.Workbook()
  await readBack.xlsx.load(buffer as ArrayBuffer)
  const sheets: Record<string, Array<Array<string | number | boolean | null>>> = {}
  for (const sheet of readBack.worksheets) {
    const grid: Array<Array<string | number | boolean | null>> = []
    for (let r = 1; r <= sheet.rowCount; r++) {
      const vals: Array<string | number | boolean | null> = []
      for (let c = 1; c <= sheet.columnCount; c++) vals.push(toHF(sheet.getCell(r, c)))
      grid.push(vals)
    }
    sheets[sheet.name] = grid
  }
  const engine = HyperFormula.buildFromSheets(sheets, { licenseKey: 'gpl-v3', useArrayArithmetic: true, smartRounding: false })
  for (const entry of readBack.definedNames.model) {
    for (const range of entry.ranges) engine.addNamedExpression(entry.name, `=${range}`)
  }
  const id = engine.getSheetId('Result')!
  const points = buildDirectMeridianSection(activeDesignSurfaceDataset(blockSurface).points, 15, false).primary
    .filter((p) => p.sectionPointRole === 'surface-vertex' && p.stationId !== null)
    .sort((a, b) => a.station - b.station)
  let worst = 0
  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    const mx = engine.getCellValue({ sheet: id, col: 32, row: 7 + i })
    const my = engine.getCellValue({ sheet: id, col: 33, row: 7 + i })
    if (typeof mx !== 'number' || typeof my !== 'number') { console.log(`  row ${8 + i}: non-numeric`); continue }
    const d = Math.hypot(mx - knm(p.Mx), my - knm(p.My))
    const mag = Math.hypot(knm(p.Mx), knm(p.My))
    worst = Math.max(worst, mag > 1 ? d / mag : d)
  }
  console.log(`worst relative dM (recalculated vs engine): ${worst.toExponential(3)}  over ${points.length} stations`)
}

void main()
