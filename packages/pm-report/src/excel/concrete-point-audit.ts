import {
  buildStressStrainPointCalculationAudit,
  prepareAnalysisFromMesh,
  type PointCalculationAudit,
  type PreviewSurfacePoint,
  type StationDefinition
} from '@pm/analysis'
import {
  buildEquivalentBlockPointCalculationAudit,
  prepareBlockAnalysis
} from '@pm/analysis-equivalent-block'
import { buildResistanceMaterialSets, type DesignBasis } from '@pm/design'
import {
  buildConcreteMesh,
  netConcreteCentroid,
  type GeometryInputRebarView,
  type SectionGeometry
} from '@pm/geometry'
import type { MaterialStore } from '@pm/materials'
import {
  analysisMeshKernelOptions,
  isEquivalentBlockAnalysisOptions,
  type CalculationAnalysisOptions,
  type CalculationProfileId
} from '@pm/project'
import {
  concreteLaw,
  concreteModelParameters,
  createDefineName,
  createWorkbook,
  ExcelExportError
} from './workbook-common'
import {
  freezeUnder,
  hideGridLines,
  reportTitle,
  setFormula,
  sheetNote,
  styleGenerated,
  styleHeader,
  styleInput,
  zebraRows
} from './sheet-layout'

type PhysicalPointCalculationAudit = Exclude<
  PointCalculationAudit,
  { kind: 'unavailable' } | { kind: 'axial-cap' }
>

export type ConcretePointAuditWorkbookInput = {
  projectName: string
  sectionName: string
  calculationProfileId: CalculationProfileId
  section: SectionGeometry
  rebars: GeometryInputRebarView[]
  materialStore: MaterialStore
  analysisOptions: CalculationAnalysisOptions
  designBasis: DesignBasis
  stage: 'design' | 'nominal'
  point: PreviewSurfacePoint
  stationDefinition: StationDefinition | null
  label: string
}

const safeStem = (value: string) =>
  (value || 'section-results')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'section-results'

export const concretePointAuditWorkbookFileName = (
  input: Pick<ConcretePointAuditWorkbookInput, 'projectName' | 'stage' | 'label'>
) => `${safeStem(input.projectName)}-${safeStem(input.label)}-${input.stage}-concrete.xlsx`

const assertPhysicalAudit = (
  audit: PointCalculationAudit
): PhysicalPointCalculationAudit => {
  if (audit.kind === 'stress-strain' || audit.kind === 'equivalent-block') return audit
  if (audit.kind === 'axial-cap') {
    throw new ExcelExportError('Concrete detail is unavailable for a geometric axial-cap point because it has no unique material state. Use the complete Calculation Trace workbook for the cap operation.')
  }
  throw new ExcelExportError(audit.message)
}

const resultScale = (audit: PhysicalPointCalculationAudit) =>
  audit.resistanceFactor ?? 1

const OPTIONAL_DECIMALS = '#,##0.######'
const OPTIONAL_COEFFICIENT = '0.############'
const SCIENTIFIC_ENGINEERING = '0.####E+00'
const CALCULATION_VALUE = '#,##0.00'

const writeStateRow = (
  sheet: import('exceljs').Worksheet,
  headers: readonly string[],
  values: readonly (string | number)[],
  numberFormats: readonly (string | null)[]
) => {
  styleHeader(sheet, 3, headers)
  values.forEach((value, index) => {
    const cell = sheet.getCell(4, index + 1)
    cell.value = value
    if (typeof value === 'number') cell.numFmt = numberFormats[index] ?? OPTIONAL_DECIMALS
    styleInput(cell)
  })
}

const sumFormula = (column: string, first: number, last: number) =>
  last >= first ? `SUM(${column}${first}:${column}${last})` : '0'

const setSummaryFormula = (
  sheet: import('exceljs').Worksheet,
  column: number,
  formula: string,
  result: number
) => {
  setFormula(sheet.getCell(7, column), formula, result, CALCULATION_VALUE)
  sheet.getCell(7, column).font = {
    ...sheet.getCell(7, column).font,
    bold: true,
    size: 11
  }
}

type AddConcretePointAuditSheetOptions = {
  workbook: import('exceljs').Workbook
  sheetName: string
  defineName: (location: string, name: string) => void
  defineMaterialNames: boolean
}

export type ConcretePointAuditSheetResult = {
  sheet: import('exceljs').Worksheet
  audit: PhysicalPointCalculationAudit
}

const previewProvenance = (input: ConcretePointAuditWorkbookInput) =>
  `PREVIEW — not an accepted result or released report. Calculation profile ${input.calculationProfileId}; method ${input.designBasis.identity.methodId}; profile version ${input.designBasis.identity.profileVersion}; verification ${input.designBasis.verificationStatus}${input.designBasis.modified ? '; MODIFIED — independent review required' : ''}.`

const quotedSheetName = (name: string) => `'${name.replace(/'/g, "''")}'`

const buildStressStrainSheet = async (
  input: ConcretePointAuditWorkbookInput,
  options: AddConcretePointAuditSheetOptions
): Promise<ConcretePointAuditSheetResult> => {
  if (isEquivalentBlockAnalysisOptions(input.analysisOptions)) {
    throw new Error('Equivalent-block options cannot enter the stress-strain concrete workbook.')
  }
  const { workbook, defineName } = options
  const sheet = hideGridLines(workbook.addWorksheet(options.sheetName))
  const materialSets = buildResistanceMaterialSets(input.materialStore, input.designBasis)
  const calculationMaterials = input.stage === 'nominal'
    ? materialSets.referenceMaterials
    : input.designBasis.format === 'designMaterialReevaluation'
      ? materialSets.designMaterials
      : materialSets.referenceMaterials
  const mesh = buildConcreteMesh(input.section, analysisMeshKernelOptions(input.analysisOptions))
  const origin = netConcreteCentroid(input.section)
  const statePrepared = prepareAnalysisFromMesh(
    input.section,
    input.rebars,
    materialSets.stateMaterials,
    mesh,
    origin
  )
  const prepared = prepareAnalysisFromMesh(
    input.section,
    input.rebars,
    calculationMaterials,
    mesh,
    origin
  )
  const audit = assertPhysicalAudit(buildStressStrainPointCalculationAudit(
    statePrepared,
    input.materialStore,
    input.designBasis,
    input.stage,
    input.point,
    input.stationDefinition
  ))
  if (audit.kind !== 'stress-strain') throw new Error('The selected point is not a stress-strain integration state.')

  const params = concreteModelParameters(calculationMaterials.concrete)
  const law = concreteLaw(calculationMaterials.concrete)
  const factor = resultScale(audit)
  const headers = [
    'ε₀', 'κx (1/mm)', 'κy (1/mm)', 'Stage factor', 'fck (MPa)', 'αeff',
    'εco', 'εcu', 'n', 'Concrete law', 'Stage'
  ] as const
  writeStateRow(sheet, headers, [
    audit.state.e0,
    audit.state.kx,
    audit.state.ky,
    factor,
    calculationMaterials.concrete.fck,
    params.alpha,
    params.eps0,
    params.epsCu,
    params.n,
    law.description,
    input.stage
  ], [
    SCIENTIFIC_ENGINEERING,
    SCIENTIFIC_ENGINEERING,
    SCIENTIFIC_ENGINEERING,
    OPTIONAL_COEFFICIENT,
    OPTIONAL_DECIMALS,
    OPTIONAL_COEFFICIENT,
    SCIENTIFIC_ENGINEERING,
    SCIENTIFIC_ENGINEERING,
    OPTIONAL_COEFFICIENT,
    null,
    null
  ])
  sheet.getCell(4, 10).alignment = { wrapText: true, vertical: 'top' }
  sheet.getCell(4, 11).alignment = { vertical: 'top' }
  sheet.getRow(4).height = 36
  if (options.defineMaterialNames) {
    for (const [cell, name] of [
      ['E4', 'fck'], ['F4', 'alpha'], ['G4', 'eco'], ['H4', 'ecu'], ['I4', 'n']
    ] as const) {
      defineName(`${quotedSheetName(sheet.name)}!$${cell[0]}$${cell.slice(1)}`, name)
    }
  }

  if (law.kind === 'tabulated' && options.defineMaterialNames) {
    const samples = law.samples ?? []
    samples.forEach((sample, index) => {
      const row = index + 2
      sheet.getCell(row, 18).value = sample.strain
      sheet.getCell(row, 19).value = sample.stress
    })
    const last = samples.length + 1
    defineName(`${quotedSheetName(sheet.name)}!$R$2:$R$${last}`, 'Cnc_eps')
    defineName(`${quotedSheetName(sheet.name)}!$S$2:$S$${last}`, 'Cnc_sig')
    sheet.getCell(2, 20).value = samples.length
    defineName(`${quotedSheetName(sheet.name)}!$T$2`, 'Cnc_n')
    for (const column of [18, 19, 20]) sheet.getColumn(column).hidden = true
  }

  const tableHeaders = [
    'No.', 'Cell i', 'Cell j', 'Subdivision', 'Component', 'Triangle', 'Point',
    'x local (mm)', 'y local (mm)', 'A (mm²)', 'ε', 'σc (MPa)', 'Fc (N)',
    'Pc (kN)', 'Mcx (kN·m)', 'Mcy (kN·m)'
  ] as const
  const headerRow = 10
  const firstRow = headerRow + 1
  const lastRow = firstRow + prepared.concreteFibers.length - 1
  reportTitle(sheet, `CONCRETE INTEGRATION · ${input.label}`, tableHeaders.length)
  sheetNote(
    sheet,
    2,
    tableHeaders.length,
    `${previewProvenance(input)} ${input.projectName} · ${input.sectionName}. One row per concrete integration point; x and y are measured from the analysis origin (${origin.x.toFixed(6)}, ${origin.y.toFixed(6)}) mm.`
  )
  styleHeader(sheet, 6, ['Pc (kN)', 'Mcx (kN·m)', 'Mcy (kN·m)'])
  styleHeader(sheet, headerRow, tableHeaders)

  prepared.concreteFibers.forEach((fiber, index) => {
    const row = firstRow + index
    const meshPoint = mesh.points[index]
    const epsilon = audit.state.e0 + audit.state.kx * fiber.y + audit.state.ky * fiber.x
    const stress = prepared.materials.concrete.stress(epsilon)
    const force = stress * fiber.area
    const values = [
      index + 1,
      meshPoint.cellI,
      meshPoint.cellJ,
      meshPoint.depth,
      meshPoint.component,
      meshPoint.triangle,
      meshPoint.point,
      fiber.x,
      fiber.y,
      fiber.area
    ]
    values.forEach((value, column) => {
      const cell = sheet.getCell(row, column + 1)
      cell.value = value
      cell.numFmt = column < 7 ? '0' : OPTIONAL_DECIMALS
      styleGenerated(cell)
    })
    setFormula(sheet.getCell(row, 11), `$A$4+$B$4*I${row}+$C$4*H${row}`, epsilon, SCIENTIFIC_ENGINEERING)
    setFormula(sheet.getCell(row, 12), law.scalar(`K${row}`), stress, CALCULATION_VALUE)
    setFormula(sheet.getCell(row, 13), `L${row}*J${row}`, force, CALCULATION_VALUE)
    setFormula(sheet.getCell(row, 14), `M${row}*$D$4/1000`, factor * force / 1_000, CALCULATION_VALUE)
    setFormula(sheet.getCell(row, 15), `M${row}*I${row}*$D$4/1000000`, factor * force * fiber.y / 1_000_000, CALCULATION_VALUE)
    setFormula(sheet.getCell(row, 16), `M${row}*H${row}*$D$4/1000000`, factor * force * fiber.x / 1_000_000, CALCULATION_VALUE)
  })

  setSummaryFormula(sheet, 1, sumFormula('N', firstRow, lastRow), audit.displayedLedger.concrete.P / 1_000)
  setSummaryFormula(sheet, 2, sumFormula('O', firstRow, lastRow), audit.displayedLedger.concrete.Mx / 1_000_000)
  setSummaryFormula(sheet, 3, sumFormula('P', firstRow, lastRow), audit.displayedLedger.concrete.My / 1_000_000)
  sheet.getCell(8, 1).value = 'Formula totals from the detailed rows; the stage factor is 1.0 unless the selected route applies a global resultant factor.'
  sheet.mergeCells(8, 1, 8, tableHeaders.length)
  sheet.getCell(8, 1).font = { italic: true, size: 9, color: { argb: 'FF64748B' } }

  sheet.columns = [16, 16, 16, 14, 14, 12, 16, 16, 10, 36, 14, 15, 16, 16, 16, 16]
    .map((width) => ({ width }))
  if (lastRow >= firstRow) {
    sheet.autoFilter = `A${headerRow}:P${lastRow}`
    zebraRows(sheet, headerRow, prepared.concreteFibers.length, tableHeaders.length)
  }
  freezeUnder(sheet, headerRow, 7)
  return { sheet, audit }
}

const buildEquivalentBlockSheet = async (
  input: ConcretePointAuditWorkbookInput,
  options: AddConcretePointAuditSheetOptions
): Promise<ConcretePointAuditSheetResult> => {
  const { workbook } = options
  const sheet = hideGridLines(workbook.addWorksheet(options.sheetName))
  const prepared = prepareBlockAnalysis(
    input.calculationProfileId,
    input.section,
    input.rebars,
    input.materialStore,
    input.designBasis
  )
  const audit = assertPhysicalAudit(buildEquivalentBlockPointCalculationAudit(
    prepared,
    input.stage,
    input.point,
    input.stationDefinition
  ))
  if (audit.kind !== 'equivalent-block') throw new Error('The selected point is not an equivalent-block state.')
  const factor = resultScale(audit)
  const headers = [
    'c (mm)', 'β1', 'a = β1c (mm)', 'σblock (MPa)', 'Stage factor',
    'Origin x (mm)', 'Origin y (mm)', 'Stage'
  ] as const
  writeStateRow(sheet, headers, [
    audit.block.neutralAxisDepth,
    audit.block.beta1,
    audit.block.blockDepth,
    audit.block.compressionStress,
    factor,
    audit.origin.x,
    audit.origin.y,
    input.stage
  ], [
    OPTIONAL_DECIMALS,
    OPTIONAL_COEFFICIENT,
    OPTIONAL_DECIMALS,
    OPTIONAL_DECIMALS,
    OPTIONAL_COEFFICIENT,
    OPTIONAL_DECIMALS,
    OPTIONAL_DECIMALS,
    null
  ])

  const rows = audit.block.geometry.flatMap((solid, solidIndex) => [
    { solid: solidIndex + 1, boundary: 'outer', points: solid.outer },
    ...solid.holes.map((points, holeIndex) => ({
      solid: solidIndex + 1,
      boundary: `hole ${holeIndex + 1}`,
      points
    }))
  ]).flatMap((ring) => ring.points.map((point, index) => ({
    solid: ring.solid,
    boundary: ring.boundary,
    vertex: index + 1,
    point: { x: point.x - audit.origin.x, y: point.y - audit.origin.y },
    next: {
      x: ring.points[(index + 1) % ring.points.length].x - audit.origin.x,
      y: ring.points[(index + 1) % ring.points.length].y - audit.origin.y
    }
  })))
  const tableHeaders = [
    'No.', 'Solid', 'Boundary', 'Vertex', 'x (mm)', 'y (mm)', 'x next (mm)', 'y next (mm)',
    'cross', 'ΔA (mm²)', 'ΔQx = ∫x dA (mm³)', 'ΔQy = ∫y dA (mm³)',
    'Pc (kN)', 'Mcx (kN·m)', 'Mcy (kN·m)'
  ] as const
  const headerRow = 10
  const firstRow = headerRow + 1
  const lastRow = firstRow + rows.length - 1
  reportTitle(sheet, `CONCRETE BLOCK · ${input.label}`, tableHeaders.length)
  sheetNote(
    sheet,
    2,
    tableHeaders.length,
    `${previewProvenance(input)} ${input.projectName} · ${input.sectionName}. This mechanics route has no concrete mesh; each row is one directed edge of the exact clipped compression polygon.`
  )
  styleHeader(sheet, 6, ['Pc (kN)', 'Mcx (kN·m)', 'Mcy (kN·m)'])
  styleHeader(sheet, headerRow, tableHeaders)

  rows.forEach((item, index) => {
    const row = firstRow + index
    const cross = item.point.x * item.next.y - item.next.x * item.point.y
    const area = cross / 2
    const qx = (item.point.x + item.next.x) * cross / 6
    const qy = (item.point.y + item.next.y) * cross / 6
    const values: Array<string | number> = [
      index + 1,
      item.solid,
      item.boundary,
      item.vertex,
      item.point.x,
      item.point.y,
      item.next.x,
      item.next.y
    ]
    values.forEach((value, column) => {
      const cell = sheet.getCell(row, column + 1)
      cell.value = value
      if (typeof value === 'number') cell.numFmt = column < 4 ? '0' : OPTIONAL_DECIMALS
      styleGenerated(cell)
    })
    setFormula(sheet.getCell(row, 9), `E${row}*H${row}-G${row}*F${row}`, cross, OPTIONAL_DECIMALS)
    setFormula(sheet.getCell(row, 10), `I${row}/2`, area, OPTIONAL_DECIMALS)
    setFormula(sheet.getCell(row, 11), `(E${row}+G${row})*I${row}/6`, qx, OPTIONAL_DECIMALS)
    setFormula(sheet.getCell(row, 12), `(F${row}+H${row})*I${row}/6`, qy, OPTIONAL_DECIMALS)
    setFormula(sheet.getCell(row, 13), `$D$4*J${row}*$E$4/1000`, audit.block.compressionStress * area * factor / 1_000, CALCULATION_VALUE)
    setFormula(sheet.getCell(row, 14), `$D$4*L${row}*$E$4/1000000`, audit.block.compressionStress * qy * factor / 1_000_000, CALCULATION_VALUE)
    setFormula(sheet.getCell(row, 15), `$D$4*K${row}*$E$4/1000000`, audit.block.compressionStress * qx * factor / 1_000_000, CALCULATION_VALUE)
  })

  setSummaryFormula(sheet, 1, sumFormula('M', firstRow, lastRow), audit.displayedLedger.concrete.P / 1_000)
  setSummaryFormula(sheet, 2, sumFormula('N', firstRow, lastRow), audit.displayedLedger.concrete.Mx / 1_000_000)
  setSummaryFormula(sheet, 3, sumFormula('O', firstRow, lastRow), audit.displayedLedger.concrete.My / 1_000_000)
  sheet.getCell(8, 1).value = 'Formula totals from signed polygon edges; outer rings are counter-clockwise and holes are clockwise.'
  sheet.mergeCells(8, 1, 8, tableHeaders.length)
  sheet.getCell(8, 1).font = { italic: true, size: 9, color: { argb: 'FF64748B' } }
  sheet.columns = [13, 13, 14, 9, 14, 14, 14, 14, 15, 15, 20, 20, 16, 16, 16]
    .map((width) => ({ width }))
  if (lastRow >= firstRow) {
    sheet.autoFilter = `A${headerRow}:O${lastRow}`
    zebraRows(sheet, headerRow, rows.length, tableHeaders.length)
  }
  freezeUnder(sheet, headerRow, 4)
  return { sheet, audit }
}

export const addConcretePointAuditSheet = async (
  input: ConcretePointAuditWorkbookInput,
  options: AddConcretePointAuditSheetOptions
): Promise<ConcretePointAuditSheetResult> =>
  isEquivalentBlockAnalysisOptions(input.analysisOptions)
    ? buildEquivalentBlockSheet(input, options)
    : buildStressStrainSheet(input, options)

/** Build the owning mechanics audit without assuming the selected point has a physical state. */
export const buildPointCalculationAuditForWorkbook = (
  input: ConcretePointAuditWorkbookInput
): PointCalculationAudit => {
  if (isEquivalentBlockAnalysisOptions(input.analysisOptions)) {
    const prepared = prepareBlockAnalysis(
      input.calculationProfileId,
      input.section,
      input.rebars,
      input.materialStore,
      input.designBasis
    )
    return buildEquivalentBlockPointCalculationAudit(
      prepared,
      input.stage,
      input.point,
      input.stationDefinition
    )
  }
  const materialSets = buildResistanceMaterialSets(input.materialStore, input.designBasis)
  const mesh = buildConcreteMesh(input.section, analysisMeshKernelOptions(input.analysisOptions))
  const statePrepared = prepareAnalysisFromMesh(
    input.section,
    input.rebars,
    materialSets.stateMaterials,
    mesh,
    netConcreteCentroid(input.section)
  )
  return buildStressStrainPointCalculationAudit(
    statePrepared,
    input.materialStore,
    input.designBasis,
    input.stage,
    input.point,
    input.stationDefinition
  )
}

export const buildConcretePointAuditWorkbook = async (input: ConcretePointAuditWorkbookInput) => {
  const workbook = await createWorkbook()
  const defineName = createDefineName(workbook)
  await addConcretePointAuditSheet(input, {
    workbook,
    defineName,
    defineMaterialNames: true,
    sheetName: isEquivalentBlockAnalysisOptions(input.analysisOptions) ? 'Concrete_Block' : 'Concrete'
  })
  workbook.calcProperties.fullCalcOnLoad = true
  return workbook
}

export const buildConcretePointAuditWorkbookBytes = async (
  input: ConcretePointAuditWorkbookInput
): Promise<Uint8Array> => {
  const workbook = await buildConcretePointAuditWorkbook(input)
  const buffer = await workbook.xlsx.writeBuffer()
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer as ArrayBuffer)
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy
}
