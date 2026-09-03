import {
  stationDefinitionLabel,
  type AxialCapPointCalculationAudit,
  type PointCalculationAudit,
  type PreviewSurfacePoint,
  type Resultant,
  type StationDefinition
} from '@pm/analysis'
import { buildResistanceMaterialSets } from '@pm/design'
import { isEquivalentBlockAnalysisOptions } from '@pm/project'
import {
  addConcretePointAuditSheet,
  buildPointCalculationAuditForWorkbook,
  type ConcretePointAuditWorkbookInput,
  type ConcretePointAuditSheetResult
} from './concrete-point-audit'
import {
  concreteLaw,
  concreteModelParameters,
  createDefineName,
  createWorkbook,
  steelLaw
} from './workbook-common'
import {
  blockHeading,
  freezeUnder,
  hideGridLines,
  reportTitle,
  setFormula,
  sheetNote,
  styleGenerated,
  styleHeader,
  styleInput,
  tableBlock,
  zebraRows
} from './sheet-layout'

type PhysicalPointCalculationAudit = Exclude<
  PointCalculationAudit,
  { kind: 'unavailable' } | { kind: 'axial-cap' }
>

export type CalculationTraceAuditState = {
  key: 'selected' | 'below' | 'above'
  label: string
  point: PreviewSurfacePoint
  stationDefinition: StationDefinition | null
}

export type CalculationTraceAuditSelection =
  | {
      kind: 'vertical'
      rowIndex: number
      criterion: string
      angleDeg: number
    }
  | {
      kind: 'fixedP'
      rowIndex: number
      angleDeg: number
      branch: number
      fixedP: number
      sample: Resultant
      exact: boolean
      ratio: number
    }

export type CalculationTraceAuditWorkbookInput = Omit<
  ConcretePointAuditWorkbookInput,
  'point' | 'stationDefinition' | 'label'
> & {
  selection: CalculationTraceAuditSelection
  states: CalculationTraceAuditState[]
}

const safeStem = (value: string) =>
  (value || 'section-results')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'section-results'

export const calculationTraceAuditWorkbookFileName = (
  input: Pick<CalculationTraceAuditWorkbookInput, 'projectName' | 'stage' | 'selection'>
) => `${safeStem(input.projectName)}-row-${input.selection.rowIndex}-${input.stage}-calculation-trace.xlsx`

const OPTIONAL_DECIMALS = '#,##0.######'
const OPTIONAL_COEFFICIENT = '0.############'
const SCIENTIFIC_ENGINEERING = '0.####E+00'
const SUMMARY_RESULT = '#,##0.###'
const CALCULATION_VALUE = '#,##0.00'

const quotedSheetName = (name: string) => `'${name.replace(/'/g, "''")}'`
const sheetCell = (sheetName: string, address: string) => `${quotedSheetName(sheetName)}!${address}`

const displayedResultant = (resultant: Resultant) => ({
  P: resultant.P / 1_000,
  Mx: resultant.Mx / 1_000_000,
  My: resultant.My / 1_000_000
})

const stateFactor = (audit: PhysicalPointCalculationAudit) =>
  audit.resistanceFactor ?? 1

const calculationMaterials = (input: CalculationTraceAuditWorkbookInput) => {
  const sets = buildResistanceMaterialSets(input.materialStore, input.designBasis)
  return input.stage === 'nominal'
    ? sets.referenceMaterials
    : input.designBasis.format === 'designMaterialReevaluation'
      ? sets.designMaterials
      : sets.referenceMaterials
}

const replaceFormulaNames = (
  formula: string,
  names: Readonly<Record<string, string>>
) => formula.replace(/\b(Es|fy|Stl_eps|Stl_sig|Stl_n)\b/g, (token) => names[token] ?? token)

const addInputSheet = (
  workbook: import('exceljs').Workbook,
  input: CalculationTraceAuditWorkbookInput,
  defineName: (location: string, name: string) => void
) => {
  const sheet = hideGridLines(workbook.addWorksheet('Input'))
  reportTitle(sheet, 'CALCULATION TRACE · INPUT', 8)
  sheetNote(
    sheet,
    2,
    8,
    'Preview calculation audit. Compression-positive P; Mx = ΣF·y and My = ΣF·x about the declared analysis origin. Full precision is stored; number formats control display only.'
  )

  const projectRow = tableBlock(sheet, 4, 'Project and calculation', ['Item', 'Value'])
  const selection = input.selection
  const projectRows: Array<[string, string | number]> = [
    ['Project', input.projectName || 'Untitled project'],
    ['Section', input.sectionName],
    ['Artifact status', 'PREVIEW — not an accepted result or released report'],
    ['Calculation profile', input.calculationProfileId],
    ['Mechanics', isEquivalentBlockAnalysisOptions(input.analysisOptions) ? 'Equivalent rectangular block' : 'Stress–strain integration'],
    ['Resistance stage', input.stage],
    ['Design basis', `${input.designBasis.identity.document} · ${input.designBasis.identity.edition}`],
    ['Method ID', input.designBasis.identity.methodId],
    ['Profile version', input.designBasis.identity.profileVersion],
    ['Verification status', input.designBasis.verificationStatus],
    ['Profile modified', input.designBasis.modified ? 'Yes — independent review required' : 'No'],
    ['Selected table row', selection.rowIndex],
    ['Trace type', selection.kind === 'vertical' ? 'Vertical meridian' : 'Fixed-P contour']
  ]
  if (selection.kind === 'vertical') {
    projectRows.push(['Criterion', selection.criterion], ['Meridian β (deg)', selection.angleDeg])
  } else {
    projectRows.push(
      ['Meridian β (deg)', selection.angleDeg],
      ['Branch', selection.branch],
      ['Selected P (N)', selection.fixedP],
      ['Interpolation', selection.exact ? 'Exact stored station' : `Two-state interpolation; t = ${selection.ratio}`]
    )
  }
  projectRows.forEach(([label, value], index) => {
    sheet.getCell(projectRow + index, 1).value = label
    sheet.getCell(projectRow + index, 2).value = value
    styleGenerated(sheet.getCell(projectRow + index, 1))
    styleInput(sheet.getCell(projectRow + index, 2))
    if (typeof value === 'number') sheet.getCell(projectRow + index, 2).numFmt = OPTIONAL_DECIMALS
    if (typeof value === 'string' && value.length > 48) {
      sheet.getCell(projectRow + index, 2).alignment = { wrapText: true, vertical: 'top' }
      sheet.getRow(projectRow + index).height = 30
    }
  })

  const stateHeadingRow = projectRow + projectRows.length + 2
  const stateRow = tableBlock(sheet, stateHeadingRow, 'Calculation state provenance', [
    'Role', 'Label', 'Point ID', 'Station criterion', 'ε₀', 'κx (1/mm)', 'κy (1/mm)', 'Stored factor'
  ])
  input.states.forEach((state, index) => {
    const row = stateRow + index
    const preCapPoint = state.point.axialCapTrace?.preCapPoint
    const geometricOnly = state.point.surfaceRole === 'axial-cap' && !preCapPoint
    const calculationPoint = preCapPoint ?? state.point
    const factor = calculationPoint.resistance?.factor ?? 1
    const values: Array<string | number> = [
      state.key,
      geometricOnly
        ? `${state.label} · geometric axial-cap endpoint`
        : state.point.surfaceRole === 'axial-cap'
          ? `${state.label} · retained pre-cap physical source`
          : state.label,
      calculationPoint.id,
      geometricOnly
        ? 'No unique physical state'
        : state.stationDefinition
          ? stationDefinitionLabel(state.stationDefinition)
          : calculationPoint.stationId ?? 'Resolved physical state',
      geometricOnly ? 'N/A' : calculationPoint.state.e0,
      geometricOnly ? 'N/A' : calculationPoint.state.kx,
      geometricOnly ? 'N/A' : calculationPoint.state.ky,
      geometricOnly ? 'N/A' : factor
    ]
    values.forEach((value, column) => {
      const cell = sheet.getCell(row, column + 1)
      cell.value = value
      styleGenerated(cell)
    })
    for (const column of [2, 3, 4]) {
      sheet.getCell(row, column).alignment = { wrapText: true, vertical: 'top' }
    }
    sheet.getRow(row).height = 30
    for (const column of [5, 6, 7]) {
      if (typeof sheet.getCell(row, column).value === 'number') {
        sheet.getCell(row, column).numFmt = SCIENTIFIC_ENGINEERING
      }
    }
    if (typeof sheet.getCell(row, 8).value === 'number') {
      sheet.getCell(row, 8).numFmt = OPTIONAL_COEFFICIENT
    }
  })
  if (input.states.length > 0) zebraRows(sheet, stateRow - 1, input.states.length, 8)

  const materials = calculationMaterials(input)
  const params = concreteModelParameters(materials.concrete)
  const concreteSheetRow = stateRow + input.states.length + 2
  const concreteRow = tableBlock(sheet, concreteSheetRow, 'Concrete calculation material', [
    'Material', 'fck (MPa)', 'αeff', 'εco', 'εcu', 'n', 'Law'
  ])
  const concreteValues: Array<string | number> = [
    materials.concrete.name,
    materials.concrete.fck,
    params.alpha,
    params.eps0,
    params.epsCu,
    params.n,
    concreteLaw(materials.concrete).description
  ]
  concreteValues.forEach((value, index) => {
    const cell = sheet.getCell(concreteRow, index + 1)
    cell.value = value
    styleInput(cell)
    if (typeof value === 'number') cell.numFmt = index === 2 || index === 5 ? OPTIONAL_COEFFICIENT : index === 3 || index === 4 ? SCIENTIFIC_ENGINEERING : OPTIONAL_DECIMALS
  })
  sheet.getCell(concreteRow, 7).alignment = { wrapText: true, vertical: 'top' }
  sheet.getRow(concreteRow).height = 30
  for (const [column, name] of [[2, 'fck'], [3, 'alpha'], [4, 'eco'], [5, 'ecu'], [6, 'n']] as const) {
    defineName(`${quotedSheetName(sheet.name)}!$${sheet.getColumn(column).letter}$${concreteRow}`, name)
  }
  let nextRow = concreteRow + 2
  const concreteMaterialLaw = concreteLaw(materials.concrete)
  if (concreteMaterialLaw.kind === 'tabulated') {
    const curveRow = tableBlock(sheet, nextRow, 'Concrete stress–strain points', ['ε', 'σc (MPa)', 'Sample count'])
    const samples = concreteMaterialLaw.samples ?? []
    samples.forEach((sample, index) => {
      sheet.getCell(curveRow + index, 1).value = sample.strain
      sheet.getCell(curveRow + index, 2).value = sample.stress
      styleInput(sheet.getCell(curveRow + index, 1))
      styleInput(sheet.getCell(curveRow + index, 2))
      sheet.getCell(curveRow + index, 1).numFmt = SCIENTIFIC_ENGINEERING
      sheet.getCell(curveRow + index, 2).numFmt = OPTIONAL_DECIMALS
    })
    const last = curveRow + samples.length - 1
    defineName(`${quotedSheetName(sheet.name)}!$A$${curveRow}:$A$${last}`, 'Cnc_eps')
    defineName(`${quotedSheetName(sheet.name)}!$B$${curveRow}:$B$${last}`, 'Cnc_sig')
    sheet.getCell(curveRow, 3).value = samples.length
    styleInput(sheet.getCell(curveRow, 3))
    sheet.getCell(curveRow, 3).numFmt = '0'
    defineName(`${quotedSheetName(sheet.name)}!$C$${curveRow}`, 'Cnc_n')
    nextRow = last + 2
  }

  const steelHeaderRow = nextRow
  const steelRow = tableBlock(sheet, steelHeaderRow, 'Steel calculation materials', [
    'Material ID', 'Material', 'Es (MPa)', 'fy (MPa)', 'Law'
  ])
  materials.steel.forEach((material, index) => {
    const row = steelRow + index
    const values: Array<string | number> = [material.id, material.name, material.elasticModulus, material.fy, steelLaw(material).description]
    values.forEach((value, column) => {
      const cell = sheet.getCell(row, column + 1)
      cell.value = value
      styleInput(cell)
      if (typeof value === 'number') cell.numFmt = column === 0 ? '0' : OPTIONAL_DECIMALS
    })
    sheet.getCell(row, 5).alignment = { wrapText: true, vertical: 'top' }
    sheet.getRow(row).height = 30
    const prefix = `stl_${material.id}_`
    defineName(`${quotedSheetName(sheet.name)}!$C$${row}`, `${prefix}Es`)
    defineName(`${quotedSheetName(sheet.name)}!$D$${row}`, `${prefix}fy`)
  })
  nextRow = steelRow + materials.steel.length + 2
  for (const material of materials.steel) {
    const law = steelLaw(material)
    if (law.kind !== 'tabulated') continue
    const curveRow = tableBlock(sheet, nextRow, `Steel ${material.id} stress–strain points`, ['ε', 'σs (MPa)', 'Sample count'])
    const samples = law.samples ?? []
    samples.forEach((sample, index) => {
      sheet.getCell(curveRow + index, 1).value = sample.strain
      sheet.getCell(curveRow + index, 2).value = sample.stress
      styleInput(sheet.getCell(curveRow + index, 1))
      styleInput(sheet.getCell(curveRow + index, 2))
      sheet.getCell(curveRow + index, 1).numFmt = SCIENTIFIC_ENGINEERING
      sheet.getCell(curveRow + index, 2).numFmt = OPTIONAL_DECIMALS
    })
    const last = curveRow + samples.length - 1
    const prefix = `stl_${material.id}_`
    defineName(`${quotedSheetName(sheet.name)}!$A$${curveRow}:$A$${last}`, `${prefix}Stl_eps`)
    defineName(`${quotedSheetName(sheet.name)}!$B$${curveRow}:$B$${last}`, `${prefix}Stl_sig`)
    sheet.getCell(curveRow, 3).value = samples.length
    styleInput(sheet.getCell(curveRow, 3))
    sheet.getCell(curveRow, 3).numFmt = '0'
    defineName(`${quotedSheetName(sheet.name)}!$C$${curveRow}`, `${prefix}Stl_n`)
    nextRow = last + 2
  }
  sheet.columns = [26, 34, 22, 28, 22, 18, 40, 15].map((width) => ({ width }))
  return sheet
}

type SteelSheetResult = {
  sheet: import('exceljs').Worksheet
  summary: { P: string; Mx: string; My: string }
}

const steelMaterialNames = (input: CalculationTraceAuditWorkbookInput) => new Map(
  calculationMaterials(input).steel.map((material) => {
    const prefix = `stl_${material.id}_`
    return [material.id, {
      Es: `${prefix}Es`,
      fy: `${prefix}fy`,
      Stl_eps: `${prefix}Stl_eps`,
      Stl_sig: `${prefix}Stl_sig`,
      Stl_n: `${prefix}Stl_n`
    }] as const
  })
)

const addSteelSheet = (
  workbook: import('exceljs').Workbook,
  input: CalculationTraceAuditWorkbookInput,
  audit: PhysicalPointCalculationAudit,
  sheetName: string
): SteelSheetResult => {
  const sheet = hideGridLines(workbook.addWorksheet(sheetName))
  const materials = calculationMaterials(input)
  const materialNames = steelMaterialNames(input)
  const factor = stateFactor(audit)
  const stateHeaders = ['ε₀', 'κx (1/mm)', 'κy (1/mm)', 'Stage factor', 'Block σc (MPa)', 'Stage']
  styleHeader(sheet, 3, stateHeaders)
  const blockStress = audit.kind === 'equivalent-block' ? audit.block.compressionStress : 0
  const stateValues: Array<string | number> = [audit.state.e0, audit.state.kx, audit.state.ky, factor, blockStress, input.stage]
  stateValues.forEach((value, index) => {
    const cell = sheet.getCell(4, index + 1)
    cell.value = value
    styleInput(cell)
    if (typeof value === 'number') cell.numFmt = index < 3 ? SCIENTIFIC_ENGINEERING : index === 3 ? OPTIONAL_COEFFICIENT : OPTIONAL_DECIMALS
  })

  reportTitle(sheet, `REINFORCEMENT · ${audit.pointId}`, 16)
  sheetNote(
    sheet,
    2,
    16,
    `${input.projectName} · ${input.sectionName}. Each row evaluates one bar; displaced concrete is subtracted before the selected resistance-stage factor is applied.`
  )
  styleHeader(sheet, 6, ['Ps (kN)', 'Msx (kN·m)', 'Msy (kN·m)'], 14)
  const headers = [
    'No.', 'Bar', 'Steel material', 'd (mm)', 'x local (mm)', 'y local (mm)', 'As (mm²)',
    'εs', 'σs (MPa)', 'Displaced concrete active', '−σc,disp (MPa)', 'σnet (MPa)', 'Fnet (N)',
    'Ps (kN)', 'Msx (kN·m)', 'Msy (kN·m)'
  ]
  const headerRow = 10
  const firstRow = headerRow + 1
  const lastRow = firstRow + audit.rebars.length - 1
  styleHeader(sheet, headerRow, headers)
  audit.rebars.forEach((bar, index) => {
    const row = firstRow + index
    const material = materials.steel.find((candidate) => candidate.id === bar.steelMaterialId)
    const names = materialNames.get(bar.steelMaterialId)
    if (!material || !names) throw new Error(`Steel material ${bar.steelMaterialId} is unavailable for the calculation-trace workbook.`)
    const values: Array<string | number | boolean> = [
      index + 1,
      bar.id,
      material.name,
      bar.diameter,
      bar.x,
      bar.y
    ]
    values.forEach((value, column) => {
      const cell = sheet.getCell(row, column + 1)
      cell.value = value
      if (typeof value === 'number') cell.numFmt = column < 3 ? '0' : OPTIONAL_DECIMALS
      styleGenerated(cell)
    })
    setFormula(sheet.getCell(row, 7), `PI()*D${row}^2/4`, bar.area, CALCULATION_VALUE)
    setFormula(sheet.getCell(row, 8), `$A$4+$B$4*F${row}+$C$4*E${row}`, bar.strain, SCIENTIFIC_ENGINEERING)
    setFormula(
      sheet.getCell(row, 9),
      replaceFormulaNames(steelLaw(material).scalar(`H${row}`), names),
      bar.steelStress,
      CALCULATION_VALUE
    )
    const displacedActive = bar.displacedConcreteStress !== 0
    sheet.getCell(row, 10).value = audit.kind === 'equivalent-block' ? displacedActive ? 'Yes' : 'No' : 'N/A'
    styleGenerated(sheet.getCell(row, 10))
    if (audit.kind === 'stress-strain') {
      setFormula(sheet.getCell(row, 11), `-${concreteLaw(materials.concrete).scalar(`H${row}`)}`, bar.displacedConcreteStress, CALCULATION_VALUE)
    } else {
      setFormula(sheet.getCell(row, 11), `IF(J${row}="Yes",-$E$4,0)`, bar.displacedConcreteStress, CALCULATION_VALUE)
    }
    setFormula(sheet.getCell(row, 12), `I${row}+K${row}`, bar.netStress, CALCULATION_VALUE)
    setFormula(sheet.getCell(row, 13), `L${row}*G${row}`, bar.force, CALCULATION_VALUE)
    setFormula(sheet.getCell(row, 14), `M${row}*$D$4/1000`, factor * bar.force / 1_000, CALCULATION_VALUE)
    setFormula(sheet.getCell(row, 15), `M${row}*F${row}*$D$4/1000000`, factor * bar.Mx / 1_000_000, CALCULATION_VALUE)
    setFormula(sheet.getCell(row, 16), `M${row}*E${row}*$D$4/1000000`, factor * bar.My / 1_000_000, CALCULATION_VALUE)
  })
  const sum = (column: string) => lastRow >= firstRow ? `SUM(${column}${firstRow}:${column}${lastRow})` : '0'
  const displayed = displayedResultant(audit.displayedLedger.steel)
  setFormula(sheet.getCell(7, 14), sum('N'), displayed.P, CALCULATION_VALUE)
  setFormula(sheet.getCell(7, 15), sum('O'), displayed.Mx, CALCULATION_VALUE)
  setFormula(sheet.getCell(7, 16), sum('P'), displayed.My, CALCULATION_VALUE)
  for (const column of [14, 15, 16]) sheet.getCell(7, column).font = { ...sheet.getCell(7, column).font, bold: true, size: 11 }
  sheet.columns = [14, 14, 26, 12, 16, 16, 18, 18, 20, 22, 20, 20, 22, 20, 20, 20].map((width) => ({ width }))
  if (lastRow >= firstRow) {
    sheet.autoFilter = `A${headerRow}:P${lastRow}`
    zebraRows(sheet, headerRow, audit.rebars.length, headers.length)
  }
  freezeUnder(sheet, headerRow, 3)
  return {
    sheet,
    summary: {
      P: sheetCell(sheet.name, '$N$7'),
      Mx: sheetCell(sheet.name, '$O$7'),
      My: sheetCell(sheet.name, '$P$7')
    }
  }
}

type AxialCapSheetResult = {
  sheet: import('exceljs').Worksheet
  audit: AxialCapPointCalculationAudit
  summary: { P: string; Mx: string; My: string }
}

const addAxialCapSheet = (
  workbook: import('exceljs').Workbook,
  audit: AxialCapPointCalculationAudit,
  sheetName: string,
  preCap: { concrete: ConcretePointAuditSheetResult; steel: SteelSheetResult } | null
): AxialCapSheetResult => {
  if (!audit.reconciliation.ok) {
    throw new Error(`Axial-cap trace ${audit.pointId} does not reconcile to the stored result.`)
  }
  const sheet = hideGridLines(workbook.addWorksheet(sheetName))
  reportTitle(sheet, `AXIAL CAP · ${audit.pointId}`, 4)
  sheetNote(
    sheet,
    2,
    4,
    'This is a geometric design-surface operation, not a compatible material state. The formulas below reproduce the stored cap point from its source edge and cap projection.'
  )
  styleHeader(sheet, 4, ['Uncapped maximum P (kN)', 'Cap ratio', 'Pmax (kN)', 'Construction'])
  const maximum = audit.trace.maximumAxialResistance / 1_000
  const cap = audit.trace.cap / 1_000
  sheet.getCell(5, 1).value = maximum
  sheet.getCell(5, 1).numFmt = CALCULATION_VALUE
  sheet.getCell(5, 2).value = audit.trace.capRatio ?? ''
  if (audit.trace.capRatio !== null) sheet.getCell(5, 2).numFmt = OPTIONAL_COEFFICIENT
  if (audit.trace.capRatio === null) {
    sheet.getCell(5, 3).value = cap
    sheet.getCell(5, 3).numFmt = CALCULATION_VALUE
  } else {
    setFormula(sheet.getCell(5, 3), 'A5*B5', cap, CALCULATION_VALUE)
  }
  sheet.getCell(5, 4).value = audit.trace.projection.kind === 'radial'
    ? 'Edge crossing + radial projection'
    : audit.trace.source.kind === 'edge-interpolation'
      ? 'Edge crossing'
      : 'Exact source vertex'
  for (let column = 1; column <= 4; column += 1) styleInput(sheet.getCell(5, column))

  let sourceHeaderRow = 8
  if (preCap && audit.preCap) {
    styleHeader(sheet, 8, ['Pre-cap criterion', 'Calculated P (kN)', 'Maximum P (kN)', 'Selected P (kN)'])
    sheet.getCell(9, 1).value = audit.preCap.comparison.capGoverns ? 'Pmax governs' : 'Calculated P retained'
    const concreteP = sheetCell(preCap.concrete.sheet.name, '$A$7')
    const steelP = preCap.steel.summary.P
    setFormula(
      sheet.getCell(9, 2),
      `${concreteP}+${steelP}`,
      audit.preCap.comparison.calculatedAxialResistance / 1_000,
      CALCULATION_VALUE
    )
    setFormula(sheet.getCell(9, 3), '$C$5', audit.preCap.comparison.maximumAxialResistance / 1_000, CALCULATION_VALUE)
    setFormula(sheet.getCell(9, 4), 'MIN(B9,C9)', audit.preCap.comparison.selectedAxialResistance / 1_000, CALCULATION_VALUE)
    for (let column = 1; column <= 4; column += 1) styleGenerated(sheet.getCell(9, column))
    sourceHeaderRow = 12
  }

  styleHeader(sheet, sourceHeaderRow, ['Source', 'P (kN)', 'Mx (kN·m)', 'My (kN·m)'])
  const writeSource = (row: number, label: string, value: Resultant) => {
    sheet.getCell(row, 1).value = label
    const displayed = displayedResultant(value)
    ;[displayed.P, displayed.Mx, displayed.My].forEach((entry, index) => {
      sheet.getCell(row, 2 + index).value = entry
      sheet.getCell(row, 2 + index).numFmt = CALCULATION_VALUE
    })
    for (let column = 1; column <= 4; column += 1) styleGenerated(sheet.getCell(row, column))
  }
  const source = audit.trace.source
  let crossingRow: number
  if (source.kind === 'edge-interpolation') {
    const compressionRow = sourceHeaderRow + 1
    const admissibleRow = sourceHeaderRow + 2
    const interpolationRow = sourceHeaderRow + 3
    writeSource(compressionRow, 'Compression-side endpoint', source.compressionSide)
    writeSource(admissibleRow, 'Admissible-side endpoint', source.admissibleSide)
    sheet.getCell(interpolationRow, 1).value = 'Interpolation t'
    setFormula(
      sheet.getCell(interpolationRow, 2),
      `($C$5-B${compressionRow})/(B${admissibleRow}-B${compressionRow})`,
      source.interpolationRatio,
      OPTIONAL_COEFFICIENT
    )
    crossingRow = sourceHeaderRow + 4
    sheet.getCell(crossingRow, 1).value = 'Crossing at Pcap'
    const crossing = displayedResultant(source.crossing)
    const crossingValues = [crossing.P, crossing.Mx, crossing.My]
    for (const [column, letter] of [[2, 'B'], [3, 'C'], [4, 'D']] as const) {
      const value = crossingValues[column - 2]!
      setFormula(
        sheet.getCell(crossingRow, column),
        `${letter}${compressionRow}+$B$${interpolationRow}*(${letter}${admissibleRow}-${letter}${compressionRow})`,
        value,
        CALCULATION_VALUE
      )
    }
  } else {
    const sourceRow = sourceHeaderRow + 1
    writeSource(sourceRow, 'Source vertex', source.point)
    crossingRow = sourceHeaderRow + 2
    sheet.getCell(crossingRow, 1).value = 'Crossing at Pcap'
    const crossing = displayedResultant(source.crossing)
    ;[crossing.P, crossing.Mx, crossing.My].forEach((value, index) =>
      setFormula(sheet.getCell(crossingRow, 2 + index), `${sheet.getColumn(2 + index).letter}${sourceRow}`, value, CALCULATION_VALUE)
    )
  }
  for (let column = 1; column <= 4; column += 1) styleGenerated(sheet.getCell(crossingRow, column))

  const factorRow = crossingRow + 2
  sheet.getCell(factorRow, 1).value = 'Projection factor q'
  sheet.getCell(factorRow, 2).value = audit.trace.projection.factor
  sheet.getCell(factorRow, 2).numFmt = OPTIONAL_COEFFICIENT
  const resultRow = factorRow + 1
  sheet.getCell(resultRow, 1).value = 'Stored cap point'
  const displayed = displayedResultant(audit.displayedLedger.total)
  setFormula(sheet.getCell(resultRow, 2), '$C$5', displayed.P, CALCULATION_VALUE)
  setFormula(sheet.getCell(resultRow, 3), `C${crossingRow}*$B$${factorRow}`, displayed.Mx, CALCULATION_VALUE)
  setFormula(sheet.getCell(resultRow, 4), `D${crossingRow}*$B$${factorRow}`, displayed.My, CALCULATION_VALUE)
  for (let column = 1; column <= 4; column += 1) {
    styleGenerated(sheet.getCell(factorRow, column))
    styleGenerated(sheet.getCell(resultRow, column))
    sheet.getCell(resultRow, column).font = { ...sheet.getCell(resultRow, column).font, bold: true }
  }
  sheet.columns = [31, 20, 20, 20].map((width) => ({ width }))
  freezeUnder(sheet, 2)
  return {
    sheet,
    audit,
    summary: {
      P: sheetCell(sheet.name, `$B$${resultRow}`),
      Mx: sheetCell(sheet.name, `$C$${resultRow}`),
      My: sheetCell(sheet.name, `$D$${resultRow}`)
    }
  }
}

type StateSheetResult =
  | {
      kind: 'physical'
      state: CalculationTraceAuditState
      concrete: ConcretePointAuditSheetResult
      steel: SteelSheetResult
      totalRow: number
    }
  | {
      kind: 'axial-cap'
      state: CalculationTraceAuditState
      cap: AxialCapSheetResult
      preCap: { concrete: ConcretePointAuditSheetResult; steel: SteelSheetResult } | null
      totalRow: number
    }

const writeResultant = (
  sheet: import('exceljs').Worksheet,
  row: number,
  startColumn: number,
  value: Resultant
) => {
  const displayed = displayedResultant(value)
  ;[displayed.P, displayed.Mx, displayed.My].forEach((entry, index) => {
    const cell = sheet.getCell(row, startColumn + index)
    cell.value = entry
    cell.numFmt = SUMMARY_RESULT
    styleGenerated(cell)
  })
}

const addSummarySheet = (
  workbook: import('exceljs').Workbook,
  input: CalculationTraceAuditWorkbookInput,
  results: StateSheetResult[]
) => {
  const sheet = hideGridLines(workbook.addWorksheet('Summary'))
  reportTitle(sheet, 'CALCULATION TRACE · SUMMARY', 7)
  sheetNote(
    sheet,
    2,
    7,
    'Physical states link concrete and reinforcement detail. A capped state first links the retained pre-cap physical calculation, then the maximum-P comparison and geometric cap projection. The selected table value is calculated from those linked totals.'
  )
  let row = 4
  results.forEach((result) => {
    if (result.kind === 'axial-cap') {
      blockHeading(sheet, row, result.state.label, 7)
      styleHeader(sheet, row + 1, [
        'Contribution', 'Nominal P (kN)', 'Nominal Mx (kN·m)', 'Nominal My (kN·m)',
        `${input.stage} P (kN)`, `${input.stage} Mx (kN·m)`, `${input.stage} My (kN·m)`
      ])
      let totalRow: number
      if (result.preCap) {
        const preCap = result.preCap
        const audit = preCap.concrete.audit
        const concreteRow = row + 2
        const steelRow = row + 3
        const preCapRow = row + 4
        totalRow = row + 5
        sheet.getCell(concreteRow, 1).value = 'Concrete before Pmax'
        sheet.getCell(steelRow, 1).value = 'Reinforcement, net before Pmax'
        sheet.getCell(preCapRow, 1).value = 'Calculated resistance before Pmax'
        sheet.getCell(totalRow, 1).value = 'Selected resistance after Pmax'
        writeResultant(sheet, concreteRow, 2, audit.nominalReferenceLedger.concrete)
        writeResultant(sheet, steelRow, 2, audit.nominalReferenceLedger.steel)
        writeResultant(sheet, preCapRow, 2, audit.nominalReferenceLedger.total)
        const concreteDisplayed = displayedResultant(audit.displayedLedger.concrete)
        const steelDisplayed = displayedResultant(audit.displayedLedger.steel)
        const preCapDisplayed = displayedResultant(audit.displayedLedger.total)
        const concreteRefs = ['$A$7', '$B$7', '$C$7'].map((address) =>
          sheetCell(preCap.concrete.sheet.name, address)
        )
        const steelRefs = [
          preCap.steel.summary.P,
          preCap.steel.summary.Mx,
          preCap.steel.summary.My
        ]
        ;[concreteDisplayed.P, concreteDisplayed.Mx, concreteDisplayed.My].forEach((value, index) =>
          setFormula(sheet.getCell(concreteRow, 5 + index), concreteRefs[index]!, value, SUMMARY_RESULT)
        )
        ;[steelDisplayed.P, steelDisplayed.Mx, steelDisplayed.My].forEach((value, index) =>
          setFormula(sheet.getCell(steelRow, 5 + index), steelRefs[index]!, value, SUMMARY_RESULT)
        )
        ;[preCapDisplayed.P, preCapDisplayed.Mx, preCapDisplayed.My].forEach((value, index) => {
          const column = sheet.getColumn(5 + index).letter
          setFormula(
            sheet.getCell(preCapRow, 5 + index),
            `SUM(${column}${concreteRow}:${column}${steelRow})`,
            value,
            SUMMARY_RESULT
          )
        })
        for (let column = 1; column <= 7; column += 1) {
          sheet.getCell(preCapRow, column).font = { ...sheet.getCell(preCapRow, column).font, bold: true }
          sheet.getCell(preCapRow, column).border = { top: { style: 'thin', color: { argb: 'FF94A3B8' } } }
        }
      } else {
        totalRow = row + 2
        sheet.getCell(totalRow, 1).value = 'Axial-cap result'
        for (let column = 2; column <= 4; column += 1) sheet.getCell(totalRow, column).value = '—'
      }
      result.totalRow = totalRow
      const displayed = displayedResultant(result.cap.audit.displayedLedger.total)
      const refs = [result.cap.summary.P, result.cap.summary.Mx, result.cap.summary.My]
      ;[displayed.P, displayed.Mx, displayed.My].forEach((value, index) =>
        setFormula(sheet.getCell(totalRow, 5 + index), refs[index]!, value, SUMMARY_RESULT)
      )
      for (let column = 1; column <= 7; column += 1) {
        sheet.getCell(totalRow, column).font = { ...sheet.getCell(totalRow, column).font, bold: true }
        sheet.getCell(totalRow, column).border = { top: { style: 'thin', color: { argb: 'FF94A3B8' } } }
      }
      row += result.preCap ? 8 : 5
      return
    }
    const audit = result.concrete.audit
    blockHeading(sheet, row, result.state.label, 7)
    styleHeader(sheet, row + 1, [
      'Contribution', 'Nominal P (kN)', 'Nominal Mx (kN·m)', 'Nominal My (kN·m)',
      `${input.stage} P (kN)`, `${input.stage} Mx (kN·m)`, `${input.stage} My (kN·m)`
    ])
    const concreteRow = row + 2
    const steelRow = row + 3
    const totalRow = row + 4
    result.totalRow = totalRow
    sheet.getCell(concreteRow, 1).value = 'Concrete'
    sheet.getCell(steelRow, 1).value = 'Reinforcement, net'
    sheet.getCell(totalRow, 1).value = 'Total resistance'
    writeResultant(sheet, concreteRow, 2, audit.nominalReferenceLedger.concrete)
    writeResultant(sheet, steelRow, 2, audit.nominalReferenceLedger.steel)
    writeResultant(sheet, totalRow, 2, audit.nominalReferenceLedger.total)
    const concreteDisplayed = displayedResultant(audit.displayedLedger.concrete)
    const steelDisplayed = displayedResultant(audit.displayedLedger.steel)
    const totalDisplayed = displayedResultant(audit.displayedLedger.total)
    const concreteRefs = ['$A$7', '$B$7', '$C$7'].map((address) => sheetCell(result.concrete.sheet.name, address))
    const steelRefs = [result.steel.summary.P, result.steel.summary.Mx, result.steel.summary.My]
    ;[concreteDisplayed.P, concreteDisplayed.Mx, concreteDisplayed.My].forEach((value, index) =>
      setFormula(sheet.getCell(concreteRow, 5 + index), concreteRefs[index]!, value, SUMMARY_RESULT)
    )
    ;[steelDisplayed.P, steelDisplayed.Mx, steelDisplayed.My].forEach((value, index) =>
      setFormula(sheet.getCell(steelRow, 5 + index), steelRefs[index]!, value, SUMMARY_RESULT)
    )
    ;[totalDisplayed.P, totalDisplayed.Mx, totalDisplayed.My].forEach((value, index) => {
      const column = sheet.getColumn(5 + index).letter
      setFormula(sheet.getCell(totalRow, 5 + index), `SUM(${column}${concreteRow}:${column}${steelRow})`, value, SUMMARY_RESULT)
    })
    for (let column = 1; column <= 7; column++) {
      sheet.getCell(totalRow, column).font = { ...sheet.getCell(totalRow, column).font, bold: true }
      sheet.getCell(totalRow, column).border = { top: { style: 'thin', color: { argb: 'FF94A3B8' } } }
    }
    row += 7
  })

  blockHeading(sheet, row, 'Selected table value', 7)
  styleHeader(sheet, row + 1, ['Quantity', 'Workbook result'])
  const first = results[0]
  if (!first) throw new Error('The calculation-trace workbook needs at least one auditable state.')
  const selection = input.selection
  if (selection.kind === 'vertical') {
    const point = first.state.point
    const storedM = point.Mx * Math.cos(selection.angleDeg * Math.PI / 180) + point.My * Math.sin(selection.angleDeg * Math.PI / 180)
    const values = [
      { label: 'P (kN)', formula: `E${first.totalRow}`, stored: point.P / 1_000 },
      {
        label: 'Mβ (kN·m)',
        formula: `F${first.totalRow}*COS(RADIANS(${selection.angleDeg}))+G${first.totalRow}*SIN(RADIANS(${selection.angleDeg}))`,
        stored: storedM / 1_000_000
      }
    ]
    values.forEach((entry, index) => {
      const targetRow = row + 2 + index
      sheet.getCell(targetRow, 1).value = entry.label
      setFormula(sheet.getCell(targetRow, 2), entry.formula, entry.stored, SUMMARY_RESULT)
    })
  } else {
    const below = results.find((result) => result.state.key === 'below') ?? first
    const above = results.find((result) => result.state.key === 'above')
    const tRow = row + 2
    sheet.getCell(tRow, 1).value = 'Interpolation t'
    const tFormula = selection.exact || !above
      ? '0'
      : `(${selection.fixedP / 1_000}-E${below.totalRow})/(E${above.totalRow}-E${below.totalRow})`
    setFormula(sheet.getCell(tRow, 2), tFormula, selection.ratio, OPTIONAL_DECIMALS)
    const selected = displayedResultant(selection.sample)
    const quantities = [
      { label: 'P (kN)', column: 'E', stored: selected.P },
      { label: 'Mx (kN·m)', column: 'F', stored: selected.Mx },
      { label: 'My (kN·m)', column: 'G', stored: selected.My }
    ]
    quantities.forEach((entry, index) => {
      const targetRow = row + 3 + index
      sheet.getCell(targetRow, 1).value = entry.label
      const formula = selection.exact || !above
        ? `${entry.column}${below.totalRow}`
        : `${entry.column}${below.totalRow}+$B$${tRow}*(${entry.column}${above.totalRow}-${entry.column}${below.totalRow})`
      setFormula(sheet.getCell(targetRow, 2), formula, entry.stored, SUMMARY_RESULT)
    })
  }
  sheet.columns = [24, 24, 24, 24, 24, 24, 24].map((width) => ({ width }))
  freezeUnder(sheet, 2)
  return sheet
}

const detailSheetNames = (input: CalculationTraceAuditWorkbookInput, state: CalculationTraceAuditState) => {
  if (input.states.length === 1) return { concrete: 'Concrete', steel: 'Steel' }
  const suffix = state.key === 'below' ? 'Below' : state.key === 'above' ? 'Above' : 'Selected'
  return { concrete: `Concrete ${suffix}`, steel: `Steel ${suffix}` }
}

const capSheetName = (input: CalculationTraceAuditWorkbookInput, state: CalculationTraceAuditState) => {
  if (input.states.length === 1) return 'Axial Cap'
  const suffix = state.key === 'below' ? 'Below' : state.key === 'above' ? 'Above' : 'Selected'
  return `Axial Cap ${suffix}`
}

export const buildCalculationTraceAuditWorkbook = async (input: CalculationTraceAuditWorkbookInput) => {
  if (input.states.length === 0) throw new Error('The calculation trace has no physical state to export.')
  const workbook = await createWorkbook()
  const defineName = createDefineName(workbook)
  addInputSheet(workbook, input, defineName)
  const results: StateSheetResult[] = []
  for (const state of input.states) {
    if (state.point.surfaceRole === 'axial-cap') {
      const audit = buildPointCalculationAuditForWorkbook({
        ...input,
        point: state.point,
        stationDefinition: state.stationDefinition,
        label: state.label
      })
      if (audit.kind === 'unavailable') throw new Error(audit.message)
      if (audit.kind !== 'axial-cap') throw new Error('The selected cap point did not return an axial-cap calculation trace.')
      let preCap: { concrete: ConcretePointAuditSheetResult; steel: SteelSheetResult } | null = null
      if (audit.preCap) {
        const names = detailSheetNames(input, state)
        const concrete = await addConcretePointAuditSheet({
          ...input,
          point: audit.preCap.point,
          stationDefinition: state.stationDefinition,
          label: `${state.label} · before maximum-P limit`
        }, {
          workbook,
          defineName,
          defineMaterialNames: false,
          sheetName: names.concrete
        })
        const steel = addSteelSheet(workbook, input, concrete.audit, names.steel)
        preCap = { concrete, steel }
      }
      const cap = addAxialCapSheet(workbook, audit, capSheetName(input, state), preCap)
      results.push({ kind: 'axial-cap', state, cap, preCap, totalRow: 0 })
      continue
    }
    const names = detailSheetNames(input, state)
    const concrete = await addConcretePointAuditSheet({
      ...input,
      point: state.point,
      stationDefinition: state.stationDefinition,
      label: state.label
    }, {
      workbook,
      defineName,
      defineMaterialNames: false,
      sheetName: names.concrete
    })
    const steel = addSteelSheet(workbook, input, concrete.audit, names.steel)
    results.push({ kind: 'physical', state, concrete, steel, totalRow: 0 })
  }
  addSummarySheet(workbook, input, results)
  workbook.calcProperties.fullCalcOnLoad = true
  return workbook
}

export const buildCalculationTraceAuditWorkbookBytes = async (
  input: CalculationTraceAuditWorkbookInput
): Promise<Uint8Array> => {
  const workbook = await buildCalculationTraceAuditWorkbook(input)
  const buffer = await workbook.xlsx.writeBuffer()
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer as ArrayBuffer)
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy
}
