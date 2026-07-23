/**
 * Excel export of the nominal section calculation, laid out after
 * `docs/example case/PM-advanced (7) 2D.xlsx`.
 *
 * Contract: the only numbers written as constants are the ones the engine owns — the clipped-cell
 * mesh (`No | X | Y | A`), the bar schedule, the polygon vertices, and the material/demand inputs.
 * Every strain, stress, force, moment, station parameter and interaction point is a live Excel
 * formula, so changing `fck`, `fy`, `theta` or `Pu` in the workbook recalculates the whole thing.
 *
 * Sheets
 *   Input         materials, reference origin, demand, named ranges
 *   Geometry      rings and bars about the analysis origin, area/centroid by shoelace formula
 *   Mesh          quadrature points from the engine — the only geometric constants
 *   Concrete      per-fibre strain + stress for all 19 stations, full ledger for a selected one
 *   Steel         per-bar strain, stress, displaced concrete and moments for all 19 stations
 *   PM_Angle      19-point envelope at theta, concrete/steel split, demand and utilisation
 *   MxMy_FixedP   24 directions solved at P = Pu, giving the Mx-My contour
 */
import {
  buildConcreteMesh,
  netConcreteCentroid,
  type GeometryInputRebarView,
  type SectionGeometry
} from '@pm/geometry'
import type { ConcreteMaterial, MaterialStore, SteelMaterial } from '@pm/materials'
import type { LoadCombination } from '@pm/project'
import {
  PREVIEW_STATIONS,
  evaluatePreviewState,
  previewStationState,
  stationDefinitionLabel,
  type StationDefinition
} from './pm-preview-analysis'

export type ExcelExportInput = {
  projectName: string
  sectionName: string
  section: SectionGeometry
  rebars: GeometryInputRebarView[]
  materialStore: MaterialStore
  /** Direction of the vertical slice, degrees. */
  angleDeg: number
  /** Axial level for the Mx-My contour sheet, N. */
  fixedP: number
  loadcase: LoadCombination | null
  /** Cap on exported quadrature rows; the mesh is coarsened until it fits. */
  maxMeshPoints?: number
}

export class ExcelExportError extends Error {}

const DEFAULT_MAX_MESH_POINTS = 1500
const DIRECTION_COUNT = 24

/** 1-based column index to an Excel column name. */
const col = (index: number): string => {
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
// ---------------------------------------------------------------------------

type ConcreteLaw = {
  /** `eps` is any Excel expression; returns a scalar-safe stress expression. */
  scalar: (eps: string) => string
  /** Element-wise variant with no aggregating function, safe inside SUMPRODUCT. */
  array: (eps: string) => string
  description: string
}

type SteelLaw = {
  scalar: (eps: string) => string
  array: (eps: string) => string
  description: string
}

const concreteLaw = (material: ConcreteMaterial): ConcreteLaw => {
  const model = material.stressStrain

  if (model.type === 'kds-parabolic' || model.type === 'ec2-parabolic-rectangular') {
    // Both are the parabola-rectangle family: parabolic to eps0, then a plateau at alpha*fck.
    return {
      scalar: (e) => `IF(${e}>0,IF(${e}<=eco,alpha*fck*(1-(1-${e}/eco)^n),alpha*fck),0)`,
      // Clamp element-wise into (0, eco] so the power never sees a negative base.
      array: (e) =>
        `alpha*fck*(1-(1-((${e})*(${e}>0)*(${e}<eco)+eco*(${e}>=eco))/eco)^n)*((${e})>0)`,
      description:
        model.type === 'kds-parabolic'
          ? 'KDS parabola-rectangle, fc = alpha*fck*(1-(1-eps/eco)^n) up to eco, then alpha*fck'
          : 'EC2 parabola-rectangle, fc = alpha*fck*(1-(1-eps/epsC2)^n) up to epsC2, then alpha*fck'
    }
  }

  if (model.type === 'aci-whitney-block') {
    return {
      scalar: (e) => `IF(${e}>0,IF(${e}<=ecu,alpha*fck,0),0)`,
      array: (e) => `alpha*fck*((${e})>0)*((${e})<=ecu)`,
      description: 'ACI uniform block, fc = alpha*fck for 0 < eps <= ecu, else 0'
    }
  }

  throw new ExcelExportError(
    `Excel export supports parabola-rectangle and uniform-block concrete laws; "${model.type}" has no closed-form spreadsheet expression yet.`
  )
}

const steelLaw = (material: SteelMaterial): SteelLaw => {
  const model = material.stressStrain

  if (model.type === 'elastic-perfectly-plastic') {
    return {
      scalar: (e) => `MAX(MIN(Es*${e},fy),-fy)`,
      // MIN/MAX aggregate over arrays, so clamp with comparisons instead.
      array: (e) =>
        `Es*(${e})*(ABS(Es*(${e}))<=fy)+fy*(Es*(${e})>fy)-fy*(Es*(${e})<-fy)`,
      description: 'Elastic - perfectly plastic, fs = clamp(Es*eps, -fy, +fy)'
    }
  }

  if (model.type === 'bilinear') {
    const ratio = Math.max(0, model.hardeningRatio)
    const yieldStress = (e: string) => `(fy+Es*${ratio}*(ABS(${e})-fy/Es))`
    return {
      scalar: (e) => `IF(ABS(${e})<=fy/Es,Es*${e},SIGN(${e})*${yieldStress(e)})`,
      array: (e) =>
        `Es*(${e})*(ABS(${e})<=fy/Es)+SIGN(${e})*${yieldStress(`(${e})`)}*(ABS(${e})>fy/Es)`,
      description: `Bilinear with ${(ratio * 100).toFixed(1)}% strain hardening`
    }
  }

  throw new ExcelExportError(
    `Excel export supports elastic-perfectly-plastic and bilinear steel; "${model.type}" has no closed-form spreadsheet expression yet.`
  )
}

// ---------------------------------------------------------------------------
// Engine-side data collection
// ---------------------------------------------------------------------------

const concreteModelParameters = (material: ConcreteMaterial) => {
  const model = material.stressStrain
  if (model.type === 'kds-parabolic') {
    return { eps0: model.eps0, epsCu: model.epsCu, n: model.n, alpha: model.alpha }
  }
  if (model.type === 'ec2-parabolic-rectangular') {
    return { eps0: model.epsC2, epsCu: model.epsCu2, n: model.n, alpha: model.alpha }
  }
  if (model.type === 'aci-whitney-block') {
    return { eps0: material.limits.eps0 ?? 0.002, epsCu: model.epsCu, n: 2, alpha: model.alpha }
  }
  return { eps0: material.limits.eps0 ?? 0.002, epsCu: material.limits.epsCu, n: 2, alpha: 0.85 }
}

/** Coarsen the export mesh until it fits `maxPoints`, keeping the engine's seed rule otherwise. */
const exportMesh = (section: SectionGeometry, maxPoints: number) => {
  let mesh = buildConcreteMesh(section)
  let cellSize = mesh.report.cellSize
  let guard = 0
  while (mesh.points.length > maxPoints && guard++ < 12) {
    cellSize *= Math.max(1.25, Math.sqrt(mesh.points.length / maxPoints))
    mesh = buildConcreteMesh(section, { cellSize })
  }
  return mesh
}

const stationSchedule = (station: StationDefinition) => ({
  cOverC1: station.kind === 'neutral-axis-ratio' ? station.cOverC1 : null,
  fsRatio:
    station.kind === 'steel-yield-ratio'
      ? station.ratio
      : station.kind === 'steel-strain' && Math.abs(station.strain) < 1e-12
        ? 0
        : null,
  /** Tabulated as a positive tensile strain, as in the workbook `Summary` sheet. */
  epsS: station.kind === 'steel-strain' && Math.abs(station.strain) > 1e-12 ? Math.abs(station.strain) : null
})

// ---------------------------------------------------------------------------
// Workbook
// ---------------------------------------------------------------------------

const HEADER_FILL = 'FFE8EEF7'
const GROUP_FILL = 'FFD6E4F5'
const TITLE_FILL = 'FF1F3864'
const INPUT_FILL = 'FFFFF3CD'
const CONST_FILL = 'FFEFEFEF'

export const buildSectionWorkbook = async (input: ExcelExportInput) => {
  // exceljs ships CJS; the browser bundle and Node resolve the namespace differently.
  const imported = await import('exceljs')
  const ExcelJS = ((imported as unknown as { default?: typeof imported }).default ?? imported) as typeof imported
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'P-M Column Designer'
  workbook.created = new Date()
  // No cached results are written, so Excel must evaluate everything on open.
  workbook.calcProperties.fullCalcOnLoad = true

  const { section, rebars, materialStore } = input
  const concrete = materialStore.concrete
  const steel =
    materialStore.steel.find((item) => item.id === materialStore.defaults.steelMaterialId) ?? materialStore.steel[0]
  if (!steel) throw new ExcelExportError('No steel material is defined.')
  if (rebars.length === 0) throw new ExcelExportError('The section has no reinforcement to report.')

  const cLaw = concreteLaw(concrete)
  const sLaw = steelLaw(steel)
  const params = concreteModelParameters(concrete)
  const epsY = steel.fy / steel.elasticModulus
  const origin = netConcreteCentroid(section)
  const mesh = exportMesh(section, input.maxMeshPoints ?? DEFAULT_MAX_MESH_POINTS)
  const beta = (input.angleDeg * Math.PI) / 180

  // Geometry about the analysis origin — the frame every formula in the workbook uses.
  const outerVertices = section.solids.flatMap((solid, solidIndex) =>
    solid.outer.map((point) => ({ solid: solidIndex + 1, x: point.x - origin.x, y: point.y - origin.y }))
  )
  const holeVertices = section.solids.flatMap((solid, solidIndex) =>
    solid.holes.flatMap((hole, holeIndex) =>
      hole.map((point) => ({ solid: solidIndex + 1, hole: holeIndex + 1, x: point.x - origin.x, y: point.y - origin.y }))
    )
  )
  const bars = rebars.map((bar, index) => ({
    no: index + 1,
    dia: bar.dia,
    x: bar.x - origin.x,
    y: bar.y - origin.y,
    area: (Math.PI * bar.dia * bar.dia) / 4
  }))
  const fibers = mesh.points.map((point, index) => ({
    no: index + 1,
    x: point.x - origin.x,
    y: point.y - origin.y,
    area: point.area
  }))

  // Engine values for the verification columns, on the very mesh being exported.
  const engineStations = PREVIEW_STATIONS.map((_, stationIndex) => {
    const state = previewStationState(section, rebars, beta, stationIndex, params.epsCu, epsY, origin)
    const ledger = evaluatePreviewState(section, rebars, materialStore, state, { cellSize: mesh.report.cellSize }, origin)
    return { state, ledger }
  })

  const stationCount = PREVIEW_STATIONS.length

  // ==========================================================================
  // Input
  // ==========================================================================
  const inputSheet = workbook.addWorksheet('Input', { views: [{ showGridLines: false }] })
  inputSheet.columns = [
    { width: 4 },
    { width: 26 },
    { width: 18 },
    { width: 10 },
    { width: 62 }
  ]

  const title = (sheet: import('exceljs').Worksheet, row: number, text: string, span: number) => {
    const cell = sheet.getCell(row, 2)
    cell.value = text
    cell.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TITLE_FILL } }
    cell.alignment = { vertical: 'middle' }
    sheet.mergeCells(row, 2, row, 1 + span)
    sheet.getRow(row).height = 22
  }

  const sectionHeading = (sheet: import('exceljs').Worksheet, row: number, text: string, span: number) => {
    const cell = sheet.getCell(row, 2)
    cell.value = text
    cell.font = { bold: true, size: 11, color: { argb: 'FF1F3864' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GROUP_FILL } }
    sheet.mergeCells(row, 2, row, 1 + span)
  }

  title(inputSheet, 1, 'P–M SECTION CALCULATION — NOMINAL RESISTANCE', 4)
  inputSheet.getCell('B2').value = 'Project'
  inputSheet.getCell('C2').value = input.projectName
  inputSheet.getCell('B3').value = 'Section'
  inputSheet.getCell('C3').value = input.sectionName
  inputSheet.getCell('B4').value = 'Generated'
  inputSheet.getCell('C4').value = new Date().toISOString().slice(0, 19).replace('T', ' ')
  inputSheet.getCell('E2').value =
    'Every value on a shaded input cell drives live formulas on the other sheets. Only the Mesh, Geometry and bar tables hold engine-computed constants.'
  inputSheet.getCell('E2').alignment = { wrapText: true, vertical: 'top' }
  inputSheet.mergeCells('E2:E4')

  type NamedInput = { row: number; label: string; value: number | string; unit: string; name?: string; note?: string }

  let row = 6
  sectionHeading(inputSheet, row, 'Concrete', 4)
  row += 1
  const concreteInputs: NamedInput[] = [
    { row: row++, label: 'fck', value: concrete.fck, unit: 'MPa', name: 'fck', note: concrete.name },
    { row: row++, label: 'alpha', value: params.alpha, unit: '-', name: 'alpha', note: 'stress-block factor' },
    { row: row++, label: 'eps_co', value: params.eps0, unit: '-', name: 'eco' },
    { row: row++, label: 'eps_cu', value: params.epsCu, unit: '-', name: 'ecu' },
    { row: row++, label: 'n', value: params.n, unit: '-', name: 'n' },
    { row: row++, label: 'law', value: cLaw.description, unit: '', note: '' }
  ]

  row += 1
  sectionHeading(inputSheet, row, 'Reinforcement', 4)
  row += 1
  const steelInputs: NamedInput[] = [
    { row: row++, label: 'Es', value: steel.elasticModulus, unit: 'MPa', name: 'Es', note: steel.name },
    { row: row++, label: 'fy', value: steel.fy, unit: 'MPa', name: 'fy' },
    { row: row++, label: 'eps_y = fy/Es', value: epsY, unit: '-', note: 'used by the fs/fy stations' },
    { row: row++, label: 'law', value: sLaw.description, unit: '', note: '' }
  ]

  row += 1
  sectionHeading(inputSheet, row, 'Analysis', 4)
  row += 1
  const analysisInputs: NamedInput[] = [
    { row: row++, label: 'theta', value: input.angleDeg, unit: 'deg', name: 'theta', note: 'direction of the vertical slice' },
    { row: row++, label: 'eps_tu', value: -0.05, unit: '-', name: 'etu', note: 'uniform strain used for station P18' },
    { row: row++, label: 'xc', value: origin.x, unit: 'mm', name: 'xc', note: 'analysis origin = net concrete centroid' },
    { row: row++, label: 'yc', value: origin.y, unit: 'mm', name: 'yc', note: 'all X, Y below are measured from it' },
    { row: row++, label: 'mesh cell size', value: mesh.report.cellSize, unit: 'mm', note: 'clipped-cell grid, docs/02 §5' },
    { row: row++, label: 'mesh points', value: fibers.length, unit: '-', note: '3-point degree-2 rule per clipped triangle' }
  ]

  row += 1
  sectionHeading(inputSheet, row, 'Demand', 4)
  row += 1
  const demandInputs: NamedInput[] = [
    { row: row++, label: 'Pu', value: input.loadcase ? input.loadcase.P / 1e3 : input.fixedP / 1e3, unit: 'kN', name: 'Pu', note: input.loadcase?.name ?? 'fixed-P slider value' },
    { row: row++, label: 'Mux', value: input.loadcase ? input.loadcase.Mx / 1e6 : 0, unit: 'kN·m', name: 'Mux' },
    { row: row++, label: 'Muy', value: input.loadcase ? input.loadcase.My / 1e6 : 0, unit: 'kN·m', name: 'Muy' }
  ]

  for (const entry of [...concreteInputs, ...steelInputs, ...analysisInputs, ...demandInputs]) {
    inputSheet.getCell(entry.row, 2).value = entry.label
    const valueCell = inputSheet.getCell(entry.row, 3)
    valueCell.value = entry.value
    valueCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INPUT_FILL } }
    valueCell.border = { top: { style: 'hair' }, left: { style: 'hair' }, bottom: { style: 'hair' }, right: { style: 'hair' } }
    if (typeof entry.value === 'number') {
      valueCell.numFmt = Math.abs(entry.value) < 0.01 && entry.value !== 0 ? '0.000000' : '#,##0.000'
    } else {
      valueCell.alignment = { horizontal: 'left' }
    }
    inputSheet.getCell(entry.row, 4).value = entry.unit
    if (entry.note) {
      inputSheet.getCell(entry.row, 5).value = entry.note
      inputSheet.getCell(entry.row, 5).font = { italic: true, color: { argb: 'FF6B7280' } }
    }
    if (entry.name) workbook.definedNames.add(`Input!$C$${entry.row}`, entry.name)
  }

  const netAreaRow = row + 1
  inputSheet.getCell(netAreaRow, 2).value = 'Net concrete area (from mesh)'
  inputSheet.getCell(netAreaRow, 3).value = { formula: 'SUM(Mesh_A)' }
  inputSheet.getCell(netAreaRow, 3).numFmt = '#,##0.0'
  inputSheet.getCell(netAreaRow, 4).value = 'mm²'
  inputSheet.getCell(netAreaRow, 5).value = { formula: 'IF(ABS(C' + netAreaRow + '-Geom_Area)<=0.000001*Geom_Area,"OK — matches the exact polygon area","CHECK — mesh and polygon areas differ")' }
  inputSheet.getCell(netAreaRow, 5).font = { italic: true, color: { argb: 'FF6B7280' } }

  // ==========================================================================
  // Geometry
  // ==========================================================================
  const geomSheet = workbook.addWorksheet('Geometry', { views: [{ showGridLines: false }] })
  geomSheet.columns = [{ width: 4 }, { width: 10 }, { width: 8 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 16 }, { width: 16 }, { width: 46 }]

  title(geomSheet, 1, 'GEOMETRY ABOUT THE ANALYSIS ORIGIN', 7)
  geomSheet.getCell('B2').value = 'Coordinates are engine constants, already translated by (xc, yc). Everything else on this sheet is a formula.'
  geomSheet.getCell('B2').font = { italic: true, color: { argb: 'FF6B7280' } }

  const writeVertexTable = (
    startRow: number,
    heading: string,
    rows: Array<{ label: string; x: number; y: number }>
  ) => {
    sectionHeading(geomSheet, startRow, heading, 7)
    const head = startRow + 1
    const headers = ['No.', 'Ring', 'X (mm)', 'Y (mm)', 'D_i', 'u = Y·cosθ + X·sinθ']
    headers.forEach((text, index) => {
      const cell = geomSheet.getCell(head, 2 + index)
      cell.value = text
      cell.font = { bold: true, size: 10 }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
      cell.alignment = { horizontal: 'center', wrapText: true }
      cell.border = { bottom: { style: 'thin' } }
    })
    rows.forEach((entry, index) => {
      const r = head + 1 + index
      const next = head + 1 + ((index + 1) % rows.length)
      geomSheet.getCell(r, 2).value = index + 1
      geomSheet.getCell(r, 3).value = entry.label
      geomSheet.getCell(r, 4).value = entry.x
      geomSheet.getCell(r, 5).value = entry.y
      geomSheet.getCell(r, 4).numFmt = '#,##0.000'
      geomSheet.getCell(r, 5).numFmt = '#,##0.000'
      for (const c of [4, 5]) {
        geomSheet.getCell(r, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CONST_FILL } }
      }
      // Shoelace term, wrapping to the first vertex of the same ring is handled by grouping below.
      geomSheet.getCell(r, 6).value = { formula: `D${r}*E${next}-D${next}*E${r}` }
      geomSheet.getCell(r, 6).numFmt = '#,##0'
      geomSheet.getCell(r, 7).value = { formula: `E${r}*COS(RADIANS(theta))+D${r}*SIN(RADIANS(theta))` }
      geomSheet.getCell(r, 7).numFmt = '#,##0.000'
    })
    return { firstDataRow: head + 1, lastDataRow: head + rows.length }
  }

  // Rings are written per ring so the shoelace wrap stays inside its own ring.
  let geomRow = 4
  const ringBlocks: Array<{ first: number; last: number; sign: 1 | -1; label: string }> = []
  const ringSources: Array<{ label: string; sign: 1 | -1; points: Array<{ x: number; y: number }> }> = []
  section.solids.forEach((solid, solidIndex) => {
    ringSources.push({
      label: `Solid ${solidIndex + 1} outer`,
      sign: 1,
      points: solid.outer.map((p) => ({ x: p.x - origin.x, y: p.y - origin.y }))
    })
    solid.holes.forEach((hole, holeIndex) => {
      ringSources.push({
        label: `Solid ${solidIndex + 1} hole ${holeIndex + 1}`,
        sign: -1,
        points: hole.map((p) => ({ x: p.x - origin.x, y: p.y - origin.y }))
      })
    })
  })

  for (const ring of ringSources) {
    const block = writeVertexTable(
      geomRow,
      ring.label,
      ring.points.map((p) => ({ label: ring.label, x: p.x, y: p.y }))
    )
    ringBlocks.push({ first: block.firstDataRow, last: block.lastDataRow, sign: ring.sign, label: ring.label })
    const areaRow = block.lastDataRow + 1
    geomSheet.getCell(areaRow, 3).value = 'Area = ½·Σ D_i'
    geomSheet.getCell(areaRow, 6).value = { formula: `SUM(F${block.firstDataRow}:F${block.lastDataRow})/2` }
    geomSheet.getCell(areaRow, 6).numFmt = '#,##0.0'
    geomSheet.getCell(areaRow, 6).font = { bold: true }
    geomRow = areaRow + 2
  }

  const outerRingBlocks = ringBlocks.filter((block) => block.sign === 1)
  const areaFormula = ringBlocks
    .map((block) => `${block.sign === 1 ? '' : '-'}ABS(SUM(F${block.first}:F${block.last})/2)`)
    .join('+')

  sectionHeading(geomSheet, geomRow, 'Reinforcement', 7)
  const barHead = geomRow + 1
  ;['No.', 'Dia (mm)', 'X (mm)', 'Y (mm)', 'As (mm²)', 'u = Y·cosθ + X·sinθ'].forEach((text, index) => {
    const cell = geomSheet.getCell(barHead, 2 + index)
    cell.value = text
    cell.font = { bold: true, size: 10 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
    cell.alignment = { horizontal: 'center', wrapText: true }
    cell.border = { bottom: { style: 'thin' } }
  })
  bars.forEach((bar, index) => {
    const r = barHead + 1 + index
    geomSheet.getCell(r, 2).value = bar.no
    geomSheet.getCell(r, 3).value = bar.dia
    geomSheet.getCell(r, 4).value = bar.x
    geomSheet.getCell(r, 5).value = bar.y
    for (const c of [3, 4, 5]) {
      geomSheet.getCell(r, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CONST_FILL } }
      geomSheet.getCell(r, c).numFmt = '#,##0.000'
    }
    geomSheet.getCell(r, 6).value = { formula: `PI()*C${r}^2/4` }
    geomSheet.getCell(r, 6).numFmt = '#,##0.000'
    geomSheet.getCell(r, 7).value = { formula: `E${r}*COS(RADIANS(theta))+D${r}*SIN(RADIANS(theta))` }
    geomSheet.getCell(r, 7).numFmt = '#,##0.000'
  })
  const barFirst = barHead + 1
  const barLast = barHead + bars.length

  const propRow = barLast + 2
  sectionHeading(geomSheet, propRow, 'Derived properties (all formulas)', 7)
  const outerUnionX = outerRingBlocks.map((block) => `D${block.first}:D${block.last}`)
  const outerUnionY = outerRingBlocks.map((block) => `E${block.first}:E${block.last}`)
  // A single MAX over several ranges: take the max of each ring, then the max of those.
  const uMaxFormula = `MAX(${outerRingBlocks
    .map(
      (block, index) =>
        `SUMPRODUCT(MAX((${outerUnionY[index]})*COS(RADIANS(theta))+(${outerUnionX[index]})*SIN(RADIANS(theta))))`
    )
    .join(',')})`
  const uMinFormula = `MIN(${outerRingBlocks
    .map(
      (block, index) =>
        `SUMPRODUCT(MIN((${outerUnionY[index]})*COS(RADIANS(theta))+(${outerUnionX[index]})*SIN(RADIANS(theta))))`
    )
    .join(',')})`

  const props: Array<{ label: string; formula: string; unit: string; name?: string; fmt: string; note?: string }> = [
    { label: 'Net area A', formula: areaFormula, unit: 'mm²', name: 'Geom_Area', fmt: '#,##0.0', note: 'shoelace over every ring' },
    { label: 'u_max', formula: uMaxFormula, unit: 'mm', name: 'u_max', fmt: '#,##0.000', note: 'extreme compression fibre, outer rings only' },
    { label: 'u_min', formula: uMinFormula, unit: 'mm', name: 'u_min', fmt: '#,##0.000' },
    { label: 'u_s,tension', formula: `SUMPRODUCT(MIN(G${barFirst}:G${barLast}))`, unit: 'mm', name: 'u_bar', fmt: '#,##0.000', note: 'farthest tension bar' },
    { label: 'C1 = u_max − u_s,tension', formula: 'u_max-u_bar', unit: 'mm', name: 'C1_len', fmt: '#,##0.000' },
    { label: 'Depth h = u_max − u_min', formula: 'u_max-u_min', unit: 'mm', fmt: '#,##0.000' },
    { label: 'Total As', formula: `SUM(F${barFirst}:F${barLast})`, unit: 'mm²', name: 'As_tot', fmt: '#,##0.0' }
  ]
  props.forEach((prop, index) => {
    const r = propRow + 1 + index
    geomSheet.getCell(r, 2).value = prop.label
    geomSheet.getCell(r, 4).value = { formula: prop.formula }
    geomSheet.getCell(r, 4).numFmt = prop.fmt
    geomSheet.getCell(r, 4).font = { bold: true }
    geomSheet.getCell(r, 5).value = prop.unit
    if (prop.note) {
      geomSheet.getCell(r, 7).value = prop.note
      geomSheet.getCell(r, 7).font = { italic: true, color: { argb: 'FF6B7280' } }
    }
    if (prop.name) workbook.definedNames.add(`Geometry!$D$${r}`, prop.name)
  })

  // ==========================================================================
  // Mesh
  // ==========================================================================
  const meshSheet = workbook.addWorksheet('Mesh', { views: [{ state: 'frozen', ySplit: 4 }] })
  meshSheet.columns = [{ width: 10 }, { width: 14 }, { width: 14 }, { width: 14 }]
  meshSheet.getCell('A1').value = 'CONCRETE INTEGRATION MESH — ENGINE CONSTANTS'
  meshSheet.getCell('A1').font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } }
  meshSheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TITLE_FILL } }
  meshSheet.mergeCells('A1:D1')
  meshSheet.getCell('A2').value =
    'Quadrature points of the clipped-cell mesh (docs/02 §5). X, Y are measured from the analysis origin; A is the tributary area. These four columns are the only geometric constants the workbook needs.'
  meshSheet.getCell('A2').alignment = { wrapText: true, vertical: 'top' }
  meshSheet.mergeCells('A2:D2')
  meshSheet.getRow(2).height = 30
  ;['No.', 'X (mm)', 'Y (mm)', 'A (mm²)'].forEach((text, index) => {
    const cell = meshSheet.getCell(4, index + 1)
    cell.value = text
    cell.font = { bold: true, size: 10 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
    cell.alignment = { horizontal: 'center' }
    cell.border = { bottom: { style: 'thin' } }
  })
  const meshFirst = 5
  fibers.forEach((fiber, index) => {
    const r = meshFirst + index
    meshSheet.getCell(r, 1).value = fiber.no
    meshSheet.getCell(r, 2).value = fiber.x
    meshSheet.getCell(r, 3).value = fiber.y
    meshSheet.getCell(r, 4).value = fiber.area
    meshSheet.getCell(r, 2).numFmt = '#,##0.0000'
    meshSheet.getCell(r, 3).numFmt = '#,##0.0000'
    meshSheet.getCell(r, 4).numFmt = '#,##0.0000'
  })
  const meshLast = meshFirst + fibers.length - 1
  workbook.definedNames.add(`Mesh!$B$${meshFirst}:$B$${meshLast}`, 'Mesh_X')
  workbook.definedNames.add(`Mesh!$C$${meshFirst}:$C$${meshLast}`, 'Mesh_Y')
  workbook.definedNames.add(`Mesh!$D$${meshFirst}:$D$${meshLast}`, 'Mesh_A')

  // ==========================================================================
  // PM_Angle — station parameters and the 19-point envelope
  // ==========================================================================
  const pmSheet = workbook.addWorksheet('PM_Angle', { views: [{ state: 'frozen', ySplit: 7, xSplit: 2 }] })
  title(pmSheet, 1, 'P–M ENVELOPE AT THETA — 19 STATIONS, NOMINAL', 20)
  pmSheet.getCell('B2').value =
    `Direction theta = ${input.angleDeg.toFixed(1)} deg. Shaded cells are the station schedule; everything else is a formula driven by Input, Geometry, Concrete and Steel.`
  pmSheet.getCell('B2').font = { italic: true, color: { argb: 'FF6B7280' } }

  const PM_HEAD = 5
  const PM_FIRST = 7
  const pmGroups: Array<{ label: string; span: number }> = [
    { label: 'Station definition', span: 4 },
    { label: 'Strain plane (formula)', span: 7 },
    { label: 'Concrete', span: 3 },
    { label: 'Steel', span: 3 },
    { label: 'Total (nominal)', span: 4 },
    { label: 'Engine check', span: 2 }
  ]
  const pmHeaders = [
    'Point', 'C/C1', 'fs/fy', 'eps_s',
    'u_ctrl (mm)', 'eps_ctrl', 'c (mm)', 'kappa (1/mm)', 'eps_0', 'kx (1/mm)', 'ky (1/mm)',
    'P (kN)', 'Mx (kN·m)', 'My (kN·m)',
    'P (kN)', 'Mx (kN·m)', 'My (kN·m)',
    'P (kN)', 'Mx (kN·m)', 'My (kN·m)', '|M| (kN·m)',
    'P engine (kN)', 'Δ P (%)'
  ]
  let groupCol = 2
  for (const group of pmGroups) {
    const cell = pmSheet.getCell(PM_HEAD - 1, groupCol)
    cell.value = group.label
    cell.font = { bold: true, size: 10, color: { argb: 'FF1F3864' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GROUP_FILL } }
    cell.alignment = { horizontal: 'center' }
    pmSheet.mergeCells(PM_HEAD - 1, groupCol, PM_HEAD - 1, groupCol + group.span - 1)
    groupCol += group.span
  }
  pmHeaders.forEach((text, index) => {
    const cell = pmSheet.getCell(PM_HEAD, 2 + index)
    cell.value = text
    cell.font = { bold: true, size: 10 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
    cell.alignment = { horizontal: 'center', wrapText: true }
    cell.border = { bottom: { style: 'thin' } }
  })
  pmSheet.getRow(PM_HEAD).height = 30
  pmSheet.getColumn(2).width = 8

  // Column map on PM_Angle
  const PM = {
    point: 2, cRatio: 3, fsRatio: 4, epsS: 5,
    uCtrl: 6, epsCtrl: 7, c: 8, kappa: 9, e0: 10, kx: 11, ky: 12,
    concP: 13, concMx: 14, concMy: 15,
    steelP: 16, steelMx: 17, steelMy: 18,
    totP: 19, totMx: 20, totMy: 21, totM: 22,
    engP: 23, delta: 24
  }

  for (let c = 3; c <= PM.delta; c++) pmSheet.getColumn(c).width = 13

  // Per-station strain-plane formulas live here; the Concrete/Steel sheets read them.
  const stationRow = (index: number) => PM_FIRST + index
  const kxCol = PM.kx
  const kyCol = PM.ky

  PREVIEW_STATIONS.forEach((station, index) => {
    const r = stationRow(index)
    const schedule = stationSchedule(station)
    pmSheet.getCell(r, PM.point).value = `P${index}`
    pmSheet.getCell(r, PM.point).font = { bold: true }
    pmSheet.getCell(r, PM.cRatio).value = schedule.cOverC1
    pmSheet.getCell(r, PM.fsRatio).value = schedule.fsRatio
    pmSheet.getCell(r, PM.epsS).value = schedule.epsS
    for (const c of [PM.cRatio, PM.fsRatio, PM.epsS]) {
      pmSheet.getCell(r, c).numFmt = '0.####'
      pmSheet.getCell(r, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INPUT_FILL } }
      pmSheet.getCell(r, c).alignment = { horizontal: 'center' }
    }

    const uCtrl = `${col(PM.uCtrl)}${r}`
    const epsCtrl = `${col(PM.epsCtrl)}${r}`
    const kappa = `${col(PM.kappa)}${r}`
    const e0 = `${col(PM.e0)}${r}`

    if (station.kind === 'pure-compression') {
      pmSheet.getCell(r, PM.uCtrl).value = '—'
      pmSheet.getCell(r, PM.epsCtrl).value = { formula: 'ecu' }
      pmSheet.getCell(r, PM.c).value = 'n/a'
      pmSheet.getCell(r, PM.kappa).value = 0
      pmSheet.getCell(r, PM.e0).value = { formula: 'ecu' }
    } else if (station.kind === 'pure-tension') {
      pmSheet.getCell(r, PM.uCtrl).value = '—'
      pmSheet.getCell(r, PM.epsCtrl).value = { formula: 'etu' }
      pmSheet.getCell(r, PM.c).value = 'n/a'
      pmSheet.getCell(r, PM.kappa).value = 0
      pmSheet.getCell(r, PM.e0).value = { formula: 'etu' }
    } else {
      // Control point: neutral-axis stations sit at zero strain a fixed multiple of C1 below the
      // compression fibre; the remaining stations are driven by the farthest tension bar.
      pmSheet.getCell(r, PM.uCtrl).value = {
        formula: station.kind === 'neutral-axis-ratio' ? `u_max-${col(PM.cRatio)}${r}*C1_len` : 'u_bar'
      }
      pmSheet.getCell(r, PM.epsCtrl).value = {
        formula:
          station.kind === 'neutral-axis-ratio'
            ? '0'
            : station.kind === 'steel-yield-ratio'
              ? `-${col(PM.fsRatio)}${r}*fy/Es`
              : `-${col(PM.epsS)}${r}`
      }
      pmSheet.getCell(r, PM.kappa).value = { formula: `(ecu-${epsCtrl})/(u_max-${uCtrl})` }
      pmSheet.getCell(r, PM.c).value = { formula: `ecu/${kappa}` }
      pmSheet.getCell(r, PM.e0).value = { formula: `ecu-${kappa}*u_max` }
    }

    pmSheet.getCell(r, kxCol).value = { formula: `${kappa}*COS(RADIANS(theta))` }
    pmSheet.getCell(r, kyCol).value = { formula: `${kappa}*SIN(RADIANS(theta))` }

    pmSheet.getCell(r, PM.uCtrl).numFmt = '#,##0.000'
    pmSheet.getCell(r, PM.epsCtrl).numFmt = '0.000000'
    pmSheet.getCell(r, PM.c).numFmt = '#,##0.0'
    pmSheet.getCell(r, PM.kappa).numFmt = '0.000E+00'
    pmSheet.getCell(r, PM.e0).numFmt = '0.000000'
    pmSheet.getCell(r, kxCol).numFmt = '0.000E+00'
    pmSheet.getCell(r, kyCol).numFmt = '0.000E+00'
  })
  workbook.definedNames.add(`PM_Angle!$${col(PM.e0)}$${PM_FIRST}:$${col(PM.e0)}$${stationRow(stationCount - 1)}`, 'St_e0')
  workbook.definedNames.add(`PM_Angle!$${col(kxCol)}$${PM_FIRST}:$${col(kxCol)}$${stationRow(stationCount - 1)}`, 'St_kx')
  workbook.definedNames.add(`PM_Angle!$${col(kyCol)}$${PM_FIRST}:$${col(kyCol)}$${stationRow(stationCount - 1)}`, 'St_ky')

  // ==========================================================================
  // Concrete — per fibre strain and stress for every station
  // ==========================================================================
  const concSheet = workbook.addWorksheet('Concrete', { views: [{ state: 'frozen', ySplit: 8, xSplit: 4 }] })
  concSheet.getCell('A1').value = 'CONCRETE — FIBRE STRAIN AND STRESS PER STATION'
  concSheet.getCell('A1').font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } }
  concSheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TITLE_FILL } }
  concSheet.mergeCells('A1:I1')
  concSheet.getCell('A2').value = `eps = eps_0 + kx·Y + ky·X    |    fc = ${cLaw.description}`
  concSheet.getCell('A2').font = { italic: true, color: { argb: 'FF6B7280' } }
  concSheet.getCell('A3').value =
    'Columns A–D mirror the Mesh sheet. Columns E–I expand the full force/moment ledger for the station chosen in cell C4. Columns J onward hold eps and fc for all 19 stations, which the PM_Angle totals integrate.'
  concSheet.getCell('A3').alignment = { wrapText: true, vertical: 'top' }
  concSheet.mergeCells('A3:I3')
  concSheet.getRow(3).height = 28
  concSheet.getCell('A4').value = 'Detail station (0…18)'
  concSheet.getCell('C4').value = 5
  concSheet.getCell('C4').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INPUT_FILL } }
  concSheet.getCell('C4').font = { bold: true }
  concSheet.getCell('C4').alignment = { horizontal: 'center' }
  concSheet.getCell('D4').value = { formula: '"detail shown for station P"&C4' }
  concSheet.getCell('D4').font = { italic: true, color: { argb: 'FF6B7280' } }
  workbook.definedNames.add('Concrete!$C$4', 'Det')

  const CONC_HEAD = 6
  const CONC_SUM = 7
  const CONC_FIRST = 8
  const detailHeaders = ['No.', 'X (mm)', 'Y (mm)', 'A (mm²)', 'eps', 'fc (MPa)', 'Fc (N)', 'Mcx (N·mm)', 'Mcy (N·mm)']
  detailHeaders.forEach((text, index) => {
    const cell = concSheet.getCell(CONC_HEAD, index + 1)
    cell.value = text
    cell.font = { bold: true, size: 10 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
    cell.alignment = { horizontal: 'center', wrapText: true }
    cell.border = { bottom: { style: 'thin' } }
  })
  concSheet.getCell(CONC_SUM, 1).value = 'SUM'
  concSheet.getCell(CONC_SUM, 1).font = { bold: true }
  const concLastRow = CONC_FIRST + fibers.length - 1
  for (const c of [4, 7, 8, 9]) {
    concSheet.getCell(CONC_SUM, c).value = { formula: `SUM(${col(c)}${CONC_FIRST}:${col(c)}${concLastRow})` }
    concSheet.getCell(CONC_SUM, c).font = { bold: true }
    concSheet.getCell(CONC_SUM, c).numFmt = '#,##0'
  }
  for (let index = 0; index < 4; index++) concSheet.getColumn(index + 1).width = 12
  for (let index = 5; index <= 9; index++) concSheet.getColumn(index).width = 15

  const stationBlockCol = (stationIndex: number) => 10 + stationIndex * 2
  PREVIEW_STATIONS.forEach((_, index) => {
    const base = stationBlockCol(index)
    const cell = concSheet.getCell(CONC_HEAD - 1, base)
    cell.value = `P${index}`
    cell.font = { bold: true, size: 10, color: { argb: 'FF1F3864' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GROUP_FILL } }
    cell.alignment = { horizontal: 'center' }
    concSheet.mergeCells(CONC_HEAD - 1, base, CONC_HEAD - 1, base + 1)
    concSheet.getCell(CONC_HEAD, base).value = 'eps'
    concSheet.getCell(CONC_HEAD, base + 1).value = 'fc (MPa)'
    for (const c of [base, base + 1]) {
      concSheet.getCell(CONC_HEAD, c).font = { bold: true, size: 10 }
      concSheet.getCell(CONC_HEAD, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
      concSheet.getCell(CONC_HEAD, c).alignment = { horizontal: 'center' }
      concSheet.getColumn(c).width = 12
    }
  })

  fibers.forEach((fiber, index) => {
    const r = CONC_FIRST + index
    const meshRow = meshFirst + index
    concSheet.getCell(r, 1).value = { formula: `Mesh!A${meshRow}` }
    concSheet.getCell(r, 2).value = { formula: `Mesh!B${meshRow}` }
    concSheet.getCell(r, 3).value = { formula: `Mesh!C${meshRow}` }
    concSheet.getCell(r, 4).value = { formula: `Mesh!D${meshRow}` }
    concSheet.getCell(r, 2).numFmt = '#,##0.000'
    concSheet.getCell(r, 3).numFmt = '#,##0.000'
    concSheet.getCell(r, 4).numFmt = '#,##0.000'

    // Detail block for the selected station.
    concSheet.getCell(r, 5).value = {
      formula: `INDEX(St_e0,Det+1)+INDEX(St_kx,Det+1)*C${r}+INDEX(St_ky,Det+1)*B${r}`
    }
    concSheet.getCell(r, 6).value = { formula: cLaw.scalar(`E${r}`) }
    concSheet.getCell(r, 7).value = { formula: `F${r}*D${r}` }
    concSheet.getCell(r, 8).value = { formula: `G${r}*C${r}` }
    concSheet.getCell(r, 9).value = { formula: `G${r}*B${r}` }
    concSheet.getCell(r, 5).numFmt = '0.000000'
    concSheet.getCell(r, 6).numFmt = '#,##0.000'
    concSheet.getCell(r, 7).numFmt = '#,##0'
    concSheet.getCell(r, 8).numFmt = '#,##0'
    concSheet.getCell(r, 9).numFmt = '#,##0'

    PREVIEW_STATIONS.forEach((_, stationIndex) => {
      const base = stationBlockCol(stationIndex)
      const sRow = stationRow(stationIndex)
      const epsRef = `${col(base)}${r}`
      concSheet.getCell(r, base).value = {
        formula: `PM_Angle!$${col(PM.e0)}$${sRow}+PM_Angle!$${col(kxCol)}$${sRow}*$C${r}+PM_Angle!$${col(kyCol)}$${sRow}*$B${r}`
      }
      concSheet.getCell(r, base + 1).value = { formula: cLaw.scalar(epsRef) }
      concSheet.getCell(r, base).numFmt = '0.000000'
      concSheet.getCell(r, base + 1).numFmt = '#,##0.000'
    })
  })

  // ==========================================================================
  // Steel — per bar, every station
  // ==========================================================================
  const steelSheet = workbook.addWorksheet('Steel', { views: [{ state: 'frozen', ySplit: 6, xSplit: 5 }] })
  steelSheet.getCell('A1').value = 'REINFORCEMENT — PER BAR, ALL 19 STATIONS'
  steelSheet.getCell('A1').font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } }
  steelSheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TITLE_FILL } }
  steelSheet.mergeCells('A1:L1')
  steelSheet.getCell('A2').value =
    `fs = ${sLaw.description}. The bar force uses fs,eff = fs − fc so the concrete displaced by the bar is not counted twice (docs/11 §3.3).`
  steelSheet.getCell('A2').font = { italic: true, color: { argb: 'FF6B7280' } }
  steelSheet.mergeCells('A2:L2')

  const STEEL_HEAD = 5
  const STEEL_SUM = 6
  const STEEL_FIRST = 7
  ;['No.', 'Dia (mm)', 'X (mm)', 'Y (mm)', 'As (mm²)'].forEach((text, index) => {
    const cell = steelSheet.getCell(STEEL_HEAD, index + 1)
    cell.value = text
    cell.font = { bold: true, size: 10 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
    cell.alignment = { horizontal: 'center', wrapText: true }
    cell.border = { bottom: { style: 'thin' } }
    steelSheet.getColumn(index + 1).width = 11
  })
  const steelBlockCol = (stationIndex: number) => 6 + stationIndex * 7
  const steelSubHeaders = ['eps_s', 'fs (MPa)', 'fc (MPa)', 'fs,eff (MPa)', 'Fs (N)', 'Msx (N·mm)', 'Msy (N·mm)']
  PREVIEW_STATIONS.forEach((_, index) => {
    const base = steelBlockCol(index)
    const group = steelSheet.getCell(STEEL_HEAD - 1, base)
    group.value = `P${index}`
    group.font = { bold: true, size: 10, color: { argb: 'FF1F3864' } }
    group.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GROUP_FILL } }
    group.alignment = { horizontal: 'center' }
    steelSheet.mergeCells(STEEL_HEAD - 1, base, STEEL_HEAD - 1, base + 6)
    steelSubHeaders.forEach((text, offset) => {
      const cell = steelSheet.getCell(STEEL_HEAD, base + offset)
      cell.value = text
      cell.font = { bold: true, size: 10 }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
      cell.alignment = { horizontal: 'center', wrapText: true }
      cell.border = { bottom: { style: 'thin' } }
      steelSheet.getColumn(base + offset).width = 13
    })
  })
  steelSheet.getRow(STEEL_HEAD).height = 28
  steelSheet.getCell(STEEL_SUM, 1).value = 'SUM'
  steelSheet.getCell(STEEL_SUM, 1).font = { bold: true }
  const steelLastRow = STEEL_FIRST + bars.length - 1
  steelSheet.getCell(STEEL_SUM, 5).value = { formula: `SUM(E${STEEL_FIRST}:E${steelLastRow})` }
  steelSheet.getCell(STEEL_SUM, 5).numFmt = '#,##0.0'
  steelSheet.getCell(STEEL_SUM, 5).font = { bold: true }

  bars.forEach((bar, index) => {
    const r = STEEL_FIRST + index
    const geomRowForBar = barFirst + index
    steelSheet.getCell(r, 1).value = bar.no
    steelSheet.getCell(r, 2).value = { formula: `Geometry!C${geomRowForBar}` }
    steelSheet.getCell(r, 3).value = { formula: `Geometry!D${geomRowForBar}` }
    steelSheet.getCell(r, 4).value = { formula: `Geometry!E${geomRowForBar}` }
    steelSheet.getCell(r, 5).value = { formula: `Geometry!F${geomRowForBar}` }
    for (const c of [2, 3, 4, 5]) steelSheet.getCell(r, c).numFmt = '#,##0.000'

    PREVIEW_STATIONS.forEach((_, stationIndex) => {
      const base = steelBlockCol(stationIndex)
      const sRow = stationRow(stationIndex)
      const eps = `${col(base)}${r}`
      const fs = `${col(base + 1)}${r}`
      const fc = `${col(base + 2)}${r}`
      const fsEff = `${col(base + 3)}${r}`
      const force = `${col(base + 4)}${r}`
      steelSheet.getCell(r, base).value = {
        formula: `PM_Angle!$${col(PM.e0)}$${sRow}+PM_Angle!$${col(kxCol)}$${sRow}*$D${r}+PM_Angle!$${col(kyCol)}$${sRow}*$C${r}`
      }
      steelSheet.getCell(r, base + 1).value = { formula: sLaw.scalar(eps) }
      steelSheet.getCell(r, base + 2).value = { formula: cLaw.scalar(eps) }
      steelSheet.getCell(r, base + 3).value = { formula: `${fs}-${fc}` }
      steelSheet.getCell(r, base + 4).value = { formula: `${fsEff}*$E${r}` }
      steelSheet.getCell(r, base + 5).value = { formula: `${force}*$D${r}` }
      steelSheet.getCell(r, base + 6).value = { formula: `${force}*$C${r}` }
      steelSheet.getCell(r, base).numFmt = '0.000000'
      for (const offset of [1, 2, 3]) steelSheet.getCell(r, base + offset).numFmt = '#,##0.000'
      for (const offset of [4, 5, 6]) steelSheet.getCell(r, base + offset).numFmt = '#,##0'
    })
  })

  PREVIEW_STATIONS.forEach((_, stationIndex) => {
    const base = steelBlockCol(stationIndex)
    for (const offset of [4, 5, 6]) {
      const c = base + offset
      steelSheet.getCell(STEEL_SUM, c).value = { formula: `SUM(${col(c)}${STEEL_FIRST}:${col(c)}${steelLastRow})` }
      steelSheet.getCell(STEEL_SUM, c).font = { bold: true }
      steelSheet.getCell(STEEL_SUM, c).numFmt = '#,##0'
    }
  })

  // ==========================================================================
  // PM_Angle totals — integrate the Concrete/Steel sheets
  // ==========================================================================
  PREVIEW_STATIONS.forEach((station, index) => {
    const r = stationRow(index)
    const base = stationBlockCol(index)
    const fcRange = `Concrete!$${col(base + 1)}$${CONC_FIRST}:$${col(base + 1)}$${concLastRow}`
    const steelBase = steelBlockCol(index)

    pmSheet.getCell(r, PM.concP).value = { formula: `SUMPRODUCT(${fcRange},Mesh_A)/1000` }
    pmSheet.getCell(r, PM.concMx).value = { formula: `SUMPRODUCT(${fcRange},Mesh_A,Mesh_Y)/1000000` }
    pmSheet.getCell(r, PM.concMy).value = { formula: `SUMPRODUCT(${fcRange},Mesh_A,Mesh_X)/1000000` }
    pmSheet.getCell(r, PM.steelP).value = { formula: `Steel!${col(steelBase + 4)}${STEEL_SUM}/1000` }
    pmSheet.getCell(r, PM.steelMx).value = { formula: `Steel!${col(steelBase + 5)}${STEEL_SUM}/1000000` }
    pmSheet.getCell(r, PM.steelMy).value = { formula: `Steel!${col(steelBase + 6)}${STEEL_SUM}/1000000` }
    pmSheet.getCell(r, PM.totP).value = { formula: `${col(PM.concP)}${r}+${col(PM.steelP)}${r}` }
    pmSheet.getCell(r, PM.totMx).value = { formula: `${col(PM.concMx)}${r}+${col(PM.steelMx)}${r}` }
    pmSheet.getCell(r, PM.totMy).value = { formula: `${col(PM.concMy)}${r}+${col(PM.steelMy)}${r}` }
    pmSheet.getCell(r, PM.totM).value = { formula: `SQRT(${col(PM.totMx)}${r}^2+${col(PM.totMy)}${r}^2)` }
    pmSheet.getCell(r, PM.engP).value = engineStations[index].ledger.total.P / 1e3
    pmSheet.getCell(r, PM.delta).value = {
      formula: `IF(ABS(${col(PM.engP)}${r})<0.000000001,0,(${col(PM.totP)}${r}-${col(PM.engP)}${r})/${col(PM.engP)}${r}*100)`
    }
    for (const c of [PM.concP, PM.concMx, PM.concMy, PM.steelP, PM.steelMx, PM.steelMy, PM.totP, PM.totMx, PM.totMy, PM.totM, PM.engP]) {
      pmSheet.getCell(r, c).numFmt = '#,##0.00'
    }
    pmSheet.getCell(r, PM.delta).numFmt = '0.0000"%"'
    for (const c of [PM.totP, PM.totMx, PM.totMy]) pmSheet.getCell(r, c).font = { bold: true }
    if (station.kind === 'pure-compression' || station.kind === 'pure-tension') {
      for (let c = PM.point; c <= PM.delta; c++) {
        pmSheet.getCell(r, c).border = { top: { style: 'hair' }, bottom: { style: 'hair' } }
      }
    }
  })

  const pmLastRow = stationRow(stationCount - 1)
  workbook.definedNames.add(`PM_Angle!$${col(PM.totP)}$${PM_FIRST}:$${col(PM.totP)}$${pmLastRow}`, 'St_P')
  workbook.definedNames.add(`PM_Angle!$${col(PM.totMx)}$${PM_FIRST}:$${col(PM.totMx)}$${pmLastRow}`, 'St_Mx')
  workbook.definedNames.add(`PM_Angle!$${col(PM.totMy)}$${PM_FIRST}:$${col(PM.totMy)}$${pmLastRow}`, 'St_My')

  // Demand and utilisation block
  const demandRow = pmLastRow + 2
  sectionHeading(pmSheet, demandRow, 'Demand point and utilisation along the theta slice', 10)
  const V = col(PM.point)
  const kRow = demandRow + 5
  const tRow = demandRow + 6
  const mxRow = demandRow + 7
  const myRow = demandRow + 8
  const mnRow = demandRow + 9
  const muRow = demandRow + 4
  const pick = (name: string, offset = 0) => `INDEX(${name},${V}${kRow}${offset ? `+${offset}` : ''},1)`
  const lerp = (name: string) => `${pick(name)}+${V}${tRow}*(${pick(name, 1)}-${pick(name)})`
  const demandRows: Array<[string, string, string]> = [
    ['Pu', 'Pu', '#,##0.00'],
    ['Mux', 'Mux', '#,##0.00'],
    ['Muy', 'Muy', '#,##0.00'],
    ['Mu resultant', 'SQRT(Mux^2+Muy^2)', '#,##0.00'],
    ['Bracketing station k', `MAX(1,MIN(${stationCount - 1},SUMPRODUCT(--(St_P>=Pu))))`, '0'],
    ['t (interpolation)', `(Pu-${pick('St_P')})/(${pick('St_P', 1)}-${pick('St_P')})`, '0.0000'],
    ['Mx capacity at Pu', lerp('St_Mx'), '#,##0.00'],
    ['My capacity at Pu', lerp('St_My'), '#,##0.00'],
    ['M capacity resultant', `SQRT(${V}${mxRow}^2+${V}${myRow}^2)`, '#,##0.00'],
    ['Utilisation Mu / Mn', `IF(${V}${mnRow}<=0,"n/a",${V}${muRow}/${V}${mnRow})`, '0.000']
  ]
  demandRows.forEach(([label, formula, numberFormat], index) => {
    const r = demandRow + 1 + index
    pmSheet.getCell(r, PM.cRatio).value = label
    const cell = pmSheet.getCell(r, PM.point)
    cell.value = { formula }
    cell.numFmt = numberFormat
    cell.font = { bold: index === demandRows.length - 1 }
  })

  // ==========================================================================
  // MxMy_FixedP — every direction solved at P = Pu
  // ==========================================================================
  const mmSheet = workbook.addWorksheet('MxMy_FixedP', { views: [{ state: 'frozen', ySplit: 8, xSplit: 1 }] })
  title(mmSheet, 1, 'Mx–My INTERACTION CONTOUR AT P = Pu', 12)
  mmSheet.getCell('B2').value =
    `Each of the ${DIRECTION_COUNT} directions repeats the 19-station schedule, then interpolates the two stations that bracket Pu. Concrete integrals use the same Mesh table through SUMPRODUCT; nothing here is a pasted number.`
  mmSheet.getCell('B2').alignment = { wrapText: true, vertical: 'top' }
  mmSheet.mergeCells('B2:N3')
  mmSheet.getRow(2).height = 26

  const MM_HEAD = 7
  const MM_FIRST = 8
  const MM_PARAM_COL = 2 // beta, u_max, u_bar, C1
  const MM_PLANE_COL = MM_PARAM_COL + 4 // 19 x (eps0, kx, ky)
  const MM_P_COL = MM_PLANE_COL + stationCount * 3 // 19 contiguous P
  const MM_MX_COL = MM_P_COL + stationCount // 19 contiguous Mx
  const MM_MY_COL = MM_MX_COL + stationCount // 19 contiguous My
  const MM_RESULT_COL = MM_MY_COL + stationCount // k, t, Mx, My, |M|

  const mmHeaderCell = (rowIndex: number, colIndex: number, text: string, fill = HEADER_FILL) => {
    const cell = mmSheet.getCell(rowIndex, colIndex)
    cell.value = text
    cell.font = { bold: true, size: 10 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }
    cell.alignment = { horizontal: 'center', wrapText: true }
    cell.border = { bottom: { style: 'thin' } }
    mmSheet.getColumn(colIndex).width = 12
  }

  const mmGroup = (colIndex: number, span: number, text: string) => {
    const cell = mmSheet.getCell(MM_HEAD - 1, colIndex)
    cell.value = text
    cell.font = { bold: true, size: 10, color: { argb: 'FF1F3864' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GROUP_FILL } }
    cell.alignment = { horizontal: 'center' }
    if (span > 1) mmSheet.mergeCells(MM_HEAD - 1, colIndex, MM_HEAD - 1, colIndex + span - 1)
  }

  mmGroup(MM_PARAM_COL, 4, 'Direction')
  const mmParamHeaders = ['beta (deg)', 'u_max (mm)', 'u_bar (mm)', 'C1 (mm)']
  mmParamHeaders.forEach((text, index) => mmHeaderCell(MM_HEAD, MM_PARAM_COL + index, text))
  PREVIEW_STATIONS.forEach((_, index) => {
    const base = MM_PLANE_COL + index * 3
    mmGroup(base, 3, `P${index} plane`)
    const planeHeaders = ['eps_0', 'kx', 'ky']
    planeHeaders.forEach((text, offset) => mmHeaderCell(MM_HEAD, base + offset, text))
    mmHeaderCell(MM_HEAD, MM_P_COL + index, `P${index}`)
    mmHeaderCell(MM_HEAD, MM_MX_COL + index, `P${index}`)
    mmHeaderCell(MM_HEAD, MM_MY_COL + index, `P${index}`)
  })
  mmGroup(MM_P_COL, stationCount, 'Station P (kN)')
  mmGroup(MM_MX_COL, stationCount, 'Station Mx (kN·m)')
  mmGroup(MM_MY_COL, stationCount, 'Station My (kN·m)')
  mmGroup(MM_RESULT_COL, 5, 'Contour at P = Pu')
  const mmResultHeaders = ['k', 't', 'Mx (kN·m)', 'My (kN·m)', '|M| (kN·m)']
  mmResultHeaders.forEach((text, index) => mmHeaderCell(MM_HEAD, MM_RESULT_COL + index, text, GROUP_FILL))
  mmSheet.getRow(MM_HEAD).height = 26
  mmSheet.getColumn(1).width = 6

  const outerRangesX = outerRingBlocks.map((block) => `Geometry!$D$${block.first}:$D$${block.last}`)
  const outerRangesY = outerRingBlocks.map((block) => `Geometry!$E$${block.first}:$E$${block.last}`)
  const barRangeX = `Geometry!$D$${barFirst}:$D$${barLast}`
  const barRangeY = `Geometry!$E$${barFirst}:$E$${barLast}`
  const barRangeA = `Geometry!$F$${barFirst}:$F$${barLast}`

  for (let angleIndex = 0; angleIndex < DIRECTION_COUNT; angleIndex++) {
    const r = MM_FIRST + angleIndex
    mmSheet.getCell(r, 1).value = angleIndex + 1
    const betaCell = `$${col(MM_PARAM_COL)}${r}`
    mmSheet.getCell(r, MM_PARAM_COL).value = (angleIndex * 360) / DIRECTION_COUNT
    mmSheet.getCell(r, MM_PARAM_COL).numFmt = '0'
    mmSheet.getCell(r, MM_PARAM_COL).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INPUT_FILL } }

    mmSheet.getCell(r, MM_PARAM_COL + 1).value = {
      formula: `MAX(${outerRingBlocks
        .map(
          (_block, index) =>
            `SUMPRODUCT(MAX((${outerRangesY[index]})*COS(RADIANS(${betaCell}))+(${outerRangesX[index]})*SIN(RADIANS(${betaCell}))))`
        )
        .join(',')})`
    }
    mmSheet.getCell(r, MM_PARAM_COL + 2).value = {
      formula: `SUMPRODUCT(MIN((${barRangeY})*COS(RADIANS(${betaCell}))+(${barRangeX})*SIN(RADIANS(${betaCell}))))`
    }
    mmSheet.getCell(r, MM_PARAM_COL + 3).value = {
      formula: `${col(MM_PARAM_COL + 1)}${r}-${col(MM_PARAM_COL + 2)}${r}`
    }
    for (let c = MM_PARAM_COL + 1; c <= MM_PARAM_COL + 3; c++) mmSheet.getCell(r, c).numFmt = '#,##0.000'

    const uMaxRef = `$${col(MM_PARAM_COL + 1)}${r}`
    const uBarRef = `$${col(MM_PARAM_COL + 2)}${r}`
    const c1Ref = `$${col(MM_PARAM_COL + 3)}${r}`

    PREVIEW_STATIONS.forEach((station, stationIndex) => {
      const base = MM_PLANE_COL + stationIndex * 3
      const sRow = stationRow(stationIndex)
      const e0Cell = `$${col(base)}${r}`
      const kxCell = `$${col(base + 1)}${r}`
      const kyCell = `$${col(base + 2)}${r}`

      let kappaExpr: string
      if (station.kind === 'pure-compression') {
        kappaExpr = '0'
        mmSheet.getCell(r, base).value = { formula: 'ecu' }
      } else if (station.kind === 'pure-tension') {
        kappaExpr = '0'
        mmSheet.getCell(r, base).value = { formula: 'etu' }
      } else {
        const uCtrl =
          station.kind === 'neutral-axis-ratio'
            ? `(${uMaxRef}-PM_Angle!$${col(PM.cRatio)}$${sRow}*${c1Ref})`
            : uBarRef
        const epsCtrl =
          station.kind === 'neutral-axis-ratio'
            ? '0'
            : station.kind === 'steel-yield-ratio'
              ? `(-PM_Angle!$${col(PM.fsRatio)}$${sRow}*fy/Es)`
              : `(-PM_Angle!$${col(PM.epsS)}$${sRow})`
        kappaExpr = `((ecu-${epsCtrl})/(${uMaxRef}-${uCtrl}))`
        mmSheet.getCell(r, base).value = { formula: `ecu-${kappaExpr}*${uMaxRef}` }
      }
      mmSheet.getCell(r, base + 1).value = { formula: `${kappaExpr}*COS(RADIANS(${betaCell}))` }
      mmSheet.getCell(r, base + 2).value = { formula: `${kappaExpr}*SIN(RADIANS(${betaCell}))` }
      mmSheet.getCell(r, base).numFmt = '0.000000'
      mmSheet.getCell(r, base + 1).numFmt = '0.00E+00'
      mmSheet.getCell(r, base + 2).numFmt = '0.00E+00'

      const fibreEps = `(${e0Cell}+${kxCell}*Mesh_Y+${kyCell}*Mesh_X)`
      const fc = cLaw.array(fibreEps)
      const barEps = `(${e0Cell}+${kxCell}*${barRangeY}+${kyCell}*${barRangeX})`
      const fsEff = `(${sLaw.array(barEps)}-(${cLaw.array(barEps)}))`

      mmSheet.getCell(r, MM_P_COL + stationIndex).value = {
        formula: `(SUMPRODUCT(${fc},Mesh_A)+SUMPRODUCT(${fsEff},${barRangeA}))/1000`
      }
      mmSheet.getCell(r, MM_MX_COL + stationIndex).value = {
        formula: `(SUMPRODUCT(${fc},Mesh_A,Mesh_Y)+SUMPRODUCT(${fsEff},${barRangeA},${barRangeY}))/1000000`
      }
      mmSheet.getCell(r, MM_MY_COL + stationIndex).value = {
        formula: `(SUMPRODUCT(${fc},Mesh_A,Mesh_X)+SUMPRODUCT(${fsEff},${barRangeA},${barRangeX}))/1000000`
      }
      for (const c of [MM_P_COL, MM_MX_COL, MM_MY_COL]) {
        mmSheet.getCell(r, c + stationIndex).numFmt = '#,##0.00'
      }
    })

    // P falls with station index, so k counts the stations still at or above Pu.
    const pRange = `$${col(MM_P_COL)}${r}:$${col(MM_P_COL + stationCount - 1)}${r}`
    const mxRange = `$${col(MM_MX_COL)}${r}:$${col(MM_MX_COL + stationCount - 1)}${r}`
    const myRange = `$${col(MM_MY_COL)}${r}:$${col(MM_MY_COL + stationCount - 1)}${r}`
    const kCell = `$${col(MM_RESULT_COL)}${r}`
    const tCell = `$${col(MM_RESULT_COL + 1)}${r}`

    mmSheet.getCell(r, MM_RESULT_COL).value = {
      formula: `MAX(1,MIN(${stationCount - 1},SUMPRODUCT(--(${pRange}>=Pu))))`
    }
    mmSheet.getCell(r, MM_RESULT_COL + 1).value = {
      formula: `(Pu-INDEX(${pRange},1,${kCell}))/(INDEX(${pRange},1,${kCell}+1)-INDEX(${pRange},1,${kCell}))`
    }
    mmSheet.getCell(r, MM_RESULT_COL + 2).value = {
      formula: `INDEX(${mxRange},1,${kCell})+${tCell}*(INDEX(${mxRange},1,${kCell}+1)-INDEX(${mxRange},1,${kCell}))`
    }
    mmSheet.getCell(r, MM_RESULT_COL + 3).value = {
      formula: `INDEX(${myRange},1,${kCell})+${tCell}*(INDEX(${myRange},1,${kCell}+1)-INDEX(${myRange},1,${kCell}))`
    }
    mmSheet.getCell(r, MM_RESULT_COL + 4).value = {
      formula: `SQRT(${col(MM_RESULT_COL + 2)}${r}^2+${col(MM_RESULT_COL + 3)}${r}^2)`
    }
    mmSheet.getCell(r, MM_RESULT_COL).numFmt = '0'
    mmSheet.getCell(r, MM_RESULT_COL + 1).numFmt = '0.0000'
    for (const offset of [2, 3, 4]) {
      mmSheet.getCell(r, MM_RESULT_COL + offset).numFmt = '#,##0.00'
      mmSheet.getCell(r, MM_RESULT_COL + offset).font = { bold: true }
    }
  }

  const mmDemandRow = MM_FIRST + DIRECTION_COUNT + 1
  mmSheet.getCell(mmDemandRow, MM_RESULT_COL + 1).value = 'Demand'
  mmSheet.getCell(mmDemandRow, MM_RESULT_COL + 1).font = { bold: true }
  mmSheet.getCell(mmDemandRow, MM_RESULT_COL + 2).value = { formula: 'Mux' }
  mmSheet.getCell(mmDemandRow, MM_RESULT_COL + 3).value = { formula: 'Muy' }
  mmSheet.getCell(mmDemandRow, MM_RESULT_COL + 4).value = { formula: 'SQRT(Mux^2+Muy^2)' }
  for (const offset of [2, 3, 4]) {
    mmSheet.getCell(mmDemandRow, MM_RESULT_COL + offset).numFmt = '#,##0.00'
    mmSheet.getCell(mmDemandRow, MM_RESULT_COL + offset).font = { bold: true, color: { argb: 'FFB91C1C' } }
  }

  return workbook
}

export const exportSectionWorkbook = async (input: ExcelExportInput) => {
  const workbook = await buildSectionWorkbook(input)
  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  })
}

export const sectionWorkbookFileName = (input: Pick<ExcelExportInput, 'projectName' | 'angleDeg' | 'loadcase'>) => {
  const stem =
    (input.projectName || 'pm-section')
      .trim()
      .replace(/[^\w]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'pm-section'
  const loadcase = input.loadcase ? `-LC${input.loadcase.id}` : ''
  return `${stem}${loadcase}-${Math.round(input.angleDeg)}deg.xlsx`
}
