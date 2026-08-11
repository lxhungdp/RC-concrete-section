import {
  activeDesignDirectionPoints,
  activeDesignSurfaceDataset,
  activeNominalDirectionPoints,
  activeNominalSurfaceDataset,
  buildDirectMeridianSection,
  contourStrainAngleSamples,
  evaluatePreparedState,
  prepareAnalysisFromMesh,
  sliceFixedPContour,
  stationDefinitionLabel,
  type ExactDirectionCurve,
  type PreviewContourPoint,
  type PreviewSurface,
  type PreviewSurfacePoint,
  type ResultantLedger,
  type StationDefinition
} from '@pm/analysis'
import {
  buildResistanceMaterialSets,
  type DesignBasis
} from '@pm/design'
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
  type LoadCombination,
  type ProjectInformation
} from '@pm/project'
import {
  HEADER_FILL,
  NOTE_COLOR,
  TITLE_FILL,
  col,
  concreteLaw,
  concreteModelParameters,
  createDefineName,
  createWorkbook,
  sectionHeading,
  steelDesignFy,
  steelLaw,
  type MaterialLaw
} from './workbook-common'
import { injectSheetCharts, type SheetChart } from './sheet-charts'

export type ChartAuditSource = 'vertical' | 'fixedP'
export type ChartAuditResistanceStage = 'design' | 'nominal'

/**
 * The part of a chart audit that is a property of the project rather than of one chart.
 *
 * Geometry, materials and the integration mesh are the same for every chart cut from one surface,
 * so a workbook that publishes several charts writes them once and points every chart sheet at the
 * same defined names. Splitting the input this way is what lets the demand-check workbook reuse
 * these sheets instead of repeating them per loadcase.
 */
export type AuditSharedInput = {
  projectName: string
  projectInformation?: ProjectInformation
  sectionName: string
  section: SectionGeometry
  rebars: GeometryInputRebarView[]
  materialStore: MaterialStore
  designBasis: DesignBasis
  surface: PreviewSurface
  resistanceStage: ChartAuditResistanceStage
  loadcases?: readonly LoadCombination[]
}

export type ChartAuditWorkbookInput = AuditSharedInput & {
  exactDirectionCurve?: ExactDirectionCurve | null
  source: ChartAuditSource
  sliceAngleDeg: number
  fixedP: number
}

type SourcePoint = {
  key: string
  label: string
  betaDeg: number
  point: PreviewSurfacePoint
  baseLedger: ResultantLedger
  pFactor: number
  mxFactor: number
  myFactor: number
  usesLedgerAnchor: boolean
  calculationMode: string
  criterion: ResolvedStrainCriterion
  definition: StationDefinition | null
  row: number
}

type ResolvedStrainCriterion = {
  kind: 'uniform-strain' | 'c-over-d' | 'steel-yield-ratio' | 'steel-strain'
  basisLabel: string
  value: number
  compressionProjection: number
  controlProjection: number
  minimumProjection: number
  sectionDepth: number
  compressionStrain: number
  controlStrain: number
  controllingSteelId: number | null
}

type VerticalResultRow = {
  kind: 'vertical'
  index: number
  criterion: string
  sourceKey: string
  engineP: number
  engineM: number
}

type FixedPResultRow = {
  kind: 'fixedP'
  index: number
  branch: number
  angleDeg: number
  lowerKey: string
  upperKey: string
  engineMx: number
  engineMy: number
}

const normalizeAngleDeg = (degrees: number) => ((degrees % 360) + 360) % 360
const angleDistanceDeg = (left: number, right: number) => {
  const distance = Math.abs(normalizeAngleDeg(left) - normalizeAngleDeg(right))
  return Math.min(distance, 360 - distance)
}
const kn = (value: number) => value / 1_000
const knm = (value: number) => value / 1_000_000
const componentFactor = (target: number, base: number, preferred: number) => {
  const tolerance = Math.max(1e-7, Math.abs(target) * 1e-11)
  if (Math.abs(base * preferred - target) <= tolerance) return preferred
  if (Math.abs(base) > 1e-9) return target / base
  return Math.abs(target) <= tolerance ? preferred : null
}

const safeStem = (value: string) =>
  (value || 'section-results')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'section-results'

export const chartAuditWorkbookFileName = (
  input: Pick<
    ChartAuditWorkbookInput,
    'projectName' | 'source' | 'resistanceStage' | 'sliceAngleDeg' | 'fixedP' | 'exactDirectionCurve'
  >
) => {
  const stage = safeStem(input.resistanceStage)
  if (input.source === 'vertical') {
    const betaDeg = input.exactDirectionCurve
      ? input.exactDirectionCurve.beta * 180 / Math.PI
      : input.sliceAngleDeg
    return `${safeStem(input.projectName)}-vertical-${stage}-beta${Number(betaDeg.toFixed(3))}-audit.xlsx`
  }
  return `${safeStem(input.projectName)}-fixed-P-${stage}-${Number(kn(input.fixedP).toFixed(3))}kN-audit.xlsx`
}

const formulaNames = (expression: string, names: Record<string, string>) =>
  Object.entries(names)
    .sort(([left], [right]) => right.length - left.length)
    .reduce(
      (current, [source, target]) => current.replace(new RegExp(`\\b${source}\\b`, 'g'), target),
      expression
    )

const styleHeader = (sheet: import('exceljs').Worksheet, row: number, labels: readonly string[], start = 1) => {
  labels.forEach((label, index) => {
    const cell = sheet.getCell(row, start + index)
    cell.value = label
    cell.font = { bold: true, size: 10, color: { argb: 'FF1F2937' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF94A3B8' } } }
  })
  sheet.getRow(row).height = 28
}

const reportTitle = (sheet: import('exceljs').Worksheet, text: string, span: number) => {
  sheet.mergeCells(1, 1, 1, span)
  const cell = sheet.getCell(1, 1)
  cell.value = text
  cell.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TITLE_FILL } }
  cell.alignment = { vertical: 'middle' }
  sheet.getRow(1).height = 22
}

const setFormula = (
  cell: import('exceljs').Cell,
  formula: string,
  result: number | string | boolean,
  numFmt = '#,##0.000'
) => {
  cell.value = { formula: formula.startsWith('=') ? formula.slice(1) : formula, result }
  cell.numFmt = numFmt
  styleFormula(cell)
}

const INPUT_TEXT = 'FF0070C0'
const FORMULA_TEXT = 'FF008000'
const GENERATED_TEXT = 'FF64748B'
const REGENERATE_TEXT = 'FFC65911'

const colorCellText = (cell: import('exceljs').Cell, argb: string) => {
  cell.font = { ...(cell.font ?? {}), color: { argb } }
}

const styleInput = (cell: import('exceljs').Cell) => colorCellText(cell, INPUT_TEXT)
const styleFormula = (cell: import('exceljs').Cell) => colorCellText(cell, FORMULA_TEXT)
const styleGenerated = (cell: import('exceljs').Cell) => colorCellText(cell, GENERATED_TEXT)
const styleRegenerate = (cell: import('exceljs').Cell) => colorCellText(cell, REGENERATE_TEXT)

const addLegend = (sheet: import('exceljs').Worksheet, row: number) => {
  const entries = [
    ['Legend', null],
    ['Editable calculation input', INPUT_TEXT],
    ['Formula', FORMULA_TEXT],
    ['Generated / check', GENERATED_TEXT],
    ['Requires re-export / remesh', REGENERATE_TEXT]
  ] as const
  entries.forEach(([label, color], index) => {
    const cell = sheet.getCell(row, 1 + index)
    cell.value = label
    cell.font = { size: 9, bold: index === 0, color: { argb: color ?? 'FF475569' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
  })
  sheet.getRow(row).height = 24
}

const resolvedStrainCriterion = (
  section: SectionGeometry,
  origin: { x: number; y: number },
  rebars: readonly GeometryInputRebarView[],
  materials: MaterialStore,
  betaDeg: number,
  point: PreviewSurfacePoint,
  definition: StationDefinition | null
): ResolvedStrainCriterion => {
  const beta = betaDeg * Math.PI / 180
  const c = Math.cos(beta)
  const s = Math.sin(beta)
  const project = (item: { x: number; y: number }) =>
    (item.y - origin.y) * c + (item.x - origin.x) * s
  // Match the engine: exterior concrete support comes from outer rings only; holes are not supports.
  const projections = section.solids.flatMap((solid) => solid.outer.map(project))
  const maximum = Math.max(...projections)
  const minimum = Math.min(...projections)
  const sectionDepth = Math.max(1e-12, maximum - minimum)
  const curvature = Math.hypot(point.state.kx, point.state.ky)
  const controllingRebar = rebars
    .map((bar, index) => ({ bar, index, projection: project(bar) }))
    .sort((left, right) => left.projection - right.projection)[0] ?? null
  const controlProjection = controllingRebar?.projection ?? minimum
  const controllingSteelId = controllingRebar
    ? controllingRebar.bar.steelMaterialId ?? materials.defaults.steelMaterialId
    : null
  const controlStrain = point.state.e0 + curvature * controlProjection
  if (curvature <= 1e-14) {
    return {
      kind: 'uniform-strain',
      basisLabel: 'ε = constant',
      value: point.state.e0,
      compressionProjection: maximum,
      controlProjection,
      minimumProjection: minimum,
      sectionDepth,
      compressionStrain: point.state.e0,
      controlStrain: point.state.e0,
      controllingSteelId
    }
  }
  const compressionStrain = point.state.e0 + curvature * maximum
  if (definition?.kind === 'bar-tension-yield-ratio' && controllingSteelId !== null) {
    const steel = materials.steel.find((item) => item.id === controllingSteelId)
    const epsY = steel ? steelDesignFy(steel) / steel.elasticModulus : 0
    return {
      kind: 'steel-yield-ratio',
      basisLabel: 'εₛ/εy',
      value: epsY > 1e-14 ? -controlStrain / epsY : definition.ratio,
      compressionProjection: maximum,
      controlProjection,
      minimumProjection: minimum,
      sectionDepth,
      compressionStrain,
      controlStrain,
      controllingSteelId
    }
  }
  const steelControlled = definition !== null && [
    'steel-strain',
    'steel-stress-ratio',
    'strength-reduction-transition-ratio',
    'strength-reduction-post-transition',
    'extreme-tension-strain',
    'bar-tension-strain',
    'tension-pole-transition-ratio',
    'adaptive-state-interpolation'
  ].includes(definition.kind)
  if (steelControlled) {
    return {
      kind: 'steel-strain',
      basisLabel: 'resolved εₛ',
      value: controlStrain,
      compressionProjection: maximum,
      controlProjection,
      minimumProjection: minimum,
      sectionDepth,
      compressionStrain,
      controlStrain,
      controllingSteelId
    }
  }
  return {
    kind: 'c-over-d',
    basisLabel: 'c/D',
    value: (maximum + point.state.e0 / curvature) / sectionDepth,
    compressionProjection: maximum,
    controlProjection: -point.state.e0 / curvature,
    minimumProjection: minimum,
    sectionDepth,
    compressionStrain,
    controlStrain: 0,
    controllingSteelId
  }
}

const selectedDataset = (surface: PreviewSurface, stage: ChartAuditResistanceStage) =>
  stage === 'design' ? activeDesignSurfaceDataset(surface) : activeNominalSurfaceDataset(surface)

const selectedDirection = (
  surface: PreviewSurface,
  stage: ChartAuditResistanceStage,
  sliceAngleDeg: number,
  exactDirectionCurve?: ExactDirectionCurve | null
) => {
  if (exactDirectionCurve) {
    return stage === 'design'
      ? {
          betaDeg: normalizeAngleDeg(exactDirectionCurve.beta * 180 / Math.PI),
          points: activeDesignDirectionPoints(exactDirectionCurve),
          stations: exactDirectionCurve.stations
        }
      : {
          betaDeg: normalizeAngleDeg(exactDirectionCurve.beta * 180 / Math.PI),
          points: activeNominalDirectionPoints(exactDirectionCurve),
          stations: exactDirectionCurve.nominalStations ?? activeNominalSurfaceDataset(surface).stations
        }
  }
  const dataset = selectedDataset(surface, stage)
  return {
    betaDeg: normalizeAngleDeg(sliceAngleDeg),
    points: dataset.points,
    stations: dataset.stations
  }
}

const sourceKey = (point: PreviewSurfacePoint) => `${point.id}|${point.beta}|${point.station}`

const collectVerticalPoints = (selected: ReturnType<typeof selectedDirection>) => {
  const descriptors = new Map(selected.stations.map((station) => [station.id, station] as const))
  return buildDirectMeridianSection(selected.points, selected.betaDeg, false).primary
    .filter((point) => point.sectionPointRole === 'surface-vertex' && point.stationId !== null)
    .map((point) => {
      const definition = descriptors.get(point.stationId!)?.definition ??
        ({ kind: 'block-adaptive', label: 'Adaptive midpoint' } as const)
      return { point, definition, criterion: stationDefinitionLabel(definition) }
    })
    .sort((left, right) => left.point.station - right.point.station)
}

const directionPoints = (
  surface: PreviewSurface,
  stage: ChartAuditResistanceStage,
  angleDeg: number
): PreviewSurfacePoint[] => {
  const dataset = selectedDataset(surface, stage)
  return buildDirectMeridianSection(dataset.points, angleDeg, false).primary
    .filter((point) => point.sectionPointRole === 'surface-vertex')
    .filter((point) => angleDistanceDeg(point.beta * 180 / Math.PI, angleDeg) < 1e-5 || Math.hypot(point.Mx, point.My) < 1e-8)
    .sort((left, right) => left.station - right.station)
}

const bracketForContourPoint = (
  surface: PreviewSurface,
  stage: ChartAuditResistanceStage,
  fixedP: number,
  sample: PreviewContourPoint
): { below: PreviewSurfacePoint; above: PreviewSurfacePoint } | null => {
  const angleDeg = normalizeAngleDeg(sample.beta * 180 / Math.PI)
  const points = directionPoints(surface, stage, angleDeg)
  const exact = points
    .filter((point) => Math.abs(point.P - fixedP) <= Math.max(1e-7, Math.abs(fixedP) * 1e-12))
    .sort((left, right) =>
      (left.Mx - sample.Mx) ** 2 + (left.My - sample.My) ** 2 -
      ((right.Mx - sample.Mx) ** 2 + (right.My - sample.My) ** 2)
    )[0]
  if (exact) return { below: exact, above: exact }

  const candidates: Array<{ below: PreviewSurfacePoint; above: PreviewSurfacePoint; error: number }> = []
  for (let index = 1; index < points.length; index++) {
    const first = points[index - 1]
    const second = points[index]
    if ((fixedP - first.P) * (fixedP - second.P) > 0 || Math.abs(second.P - first.P) < 1e-12) continue
    const ratio = (fixedP - first.P) / (second.P - first.P)
    const mx = first.Mx + ratio * (second.Mx - first.Mx)
    const my = first.My + ratio * (second.My - first.My)
    const below = first.P <= second.P ? first : second
    const above = first.P <= second.P ? second : first
    candidates.push({ below, above, error: (mx - sample.Mx) ** 2 + (my - sample.My) ** 2 })
  }
  return candidates.sort((left, right) => left.error - right.error)[0] ?? null
}

const addMaterialCurve = (
  sheet: import('exceljs').Worksheet,
  defineName: ReturnType<typeof createDefineName>,
  startRow: number,
  startColumn: number,
  prefix: string,
  titleText: string,
  law: MaterialLaw,
  sheetName = 'Materials'
) => {
  if (!law.samples?.length) return startRow
  sheet.getCell(startRow, startColumn).value = titleText
  sheet.getCell(startRow, startColumn).font = { bold: true, color: { argb: 'FF1F3864' } }
  sheet.getCell(startRow + 1, startColumn).value = 'Strain'
  sheet.getCell(startRow + 1, startColumn + 1).value = 'Stress (MPa)'
  for (let index = 0; index < law.samples.length; index++) {
    sheet.getCell(startRow + 2 + index, startColumn).value = law.samples[index].strain
    sheet.getCell(startRow + 2 + index, startColumn + 1).value = law.samples[index].stress
    styleInput(sheet.getCell(startRow + 2 + index, startColumn))
    styleInput(sheet.getCell(startRow + 2 + index, startColumn + 1))
  }
  const first = startRow + 2
  const last = first + law.samples.length - 1
  defineName(`'${sheetName}'!$${col(startColumn)}$${first}:$${col(startColumn)}$${last}`, `${prefix}_eps`)
  defineName(`'${sheetName}'!$${col(startColumn + 1)}$${first}:$${col(startColumn + 1)}$${last}`, `${prefix}_sig`)
  sheet.getCell(startRow + 1, startColumn + 2).value = law.samples.length
  defineName(`'${sheetName}'!$${col(startColumn + 2)}$${startRow + 1}`, `${prefix}_n`)
  return last + 2
}

/**
 * Column block that reconstructs one surface vertex from its strain criterion.
 *
 * Every chart sheet publishes the same block so a reviewer who has read it once can read it on any
 * sheet; only its first column moves, which is what `start` is for.
 *
 * Two fields are conditional rather than fixed, because both were program bookkeeping showing
 * through into an engineer's sheet:
 *
 *   `key`   the internal `id|beta|station` triple. It identified a point for the writer and told a
 *           reader nothing, so it is gone; the station/role column is the identity a reviewer uses.
 *   `beta`  the strain direction. It varies row to row on a fixed-P contour, where it *is* the row
 *           identity — but a vertical meridian has exactly one, and repeating it down the sheet is
 *           noise. `sourceBlock` therefore takes an external reference for the constant case and
 *           drops the column, so the formulas below point at the one cell that publishes it.
 */
const SOURCE_FIELDS = [
  { key: 'label', title: 'Station / role', width: 30 },
  { key: 'beta', title: 'β strain (deg)', width: 12 },
  { key: 'criterionBasis', title: 'Criterion basis', width: 30 },
  { key: 'criterionValue', title: 'Criterion value', width: 16 },
  { key: 'compressionProjection', title: 'zc (mm)', width: 14 },
  { key: 'controlProjection', title: 'z control (mm)', width: 15 },
  { key: 'sectionDepth', title: 'D (mm)', width: 14 },
  { key: 'compressionStrain', title: 'εc', width: 14 },
  { key: 'controlStrain', title: 'ε control', width: 14 },
  { key: 'curvature', title: 'κ (1/mm)', width: 14 },
  { key: 'e0', title: 'ε₀', width: 14 },
  { key: 'kx', title: 'κx (1/mm)', width: 15 },
  { key: 'ky', title: 'κy (1/mm)', width: 15 },
  { key: 'cP', title: 'Concrete P', width: 14 },
  { key: 'cMx', title: 'Concrete Mx', width: 14 },
  { key: 'cMy', title: 'Concrete My', width: 14 },
  { key: 'sP', title: 'Steel P', width: 14 },
  { key: 'sMx', title: 'Steel Mx', width: 14 },
  { key: 'sMy', title: 'Steel My', width: 14 },
  { key: 'bP', title: 'Base P', width: 14 },
  { key: 'bMx', title: 'Base Mx', width: 14 },
  { key: 'bMy', title: 'Base My', width: 14 },
  { key: 'pFactor', title: 'P factor', width: 14 },
  { key: 'mxFactor', title: 'Mx factor', width: 14 },
  { key: 'myFactor', title: 'My factor', width: 14 },
  { key: 'fP', title: 'Final P', width: 14 },
  { key: 'fMx', title: 'Final Mx', width: 14 },
  { key: 'fMy', title: 'Final My', width: 14 },
  { key: 'eP', title: 'Engine P', width: 16 },
  { key: 'eMx', title: 'Engine Mx', width: 16 },
  { key: 'eMy', title: 'Engine My', width: 16 },
  { key: 'dP', title: 'ΔP', width: 16 },
  { key: 'dM', title: 'ΔM', width: 16 },
  { key: 'mode', title: 'Calculation mode', width: 16 },
  { key: 'baseEP', title: 'Base engine P', width: 16 },
  { key: 'baseEMx', title: 'Base engine Mx', width: 16 },
  { key: 'baseEMy', title: 'Base engine My', width: 16 },
  { key: 'concEP', title: 'Concrete engine P', width: 16 },
  { key: 'concEMx', title: 'Concrete engine Mx', width: 16 },
  { key: 'concEMy', title: 'Concrete engine My', width: 16 },
  { key: 'steelEP', title: 'Steel engine P', width: 16 },
  { key: 'steelEMx', title: 'Steel engine Mx', width: 16 },
  { key: 'steelEMy', title: 'Steel engine My', width: 16 }
] as const

type SourceField = (typeof SOURCE_FIELDS)[number]['key']

/**
 * @param start first column the block occupies
 * @param constantBetaRef absolute reference publishing the one strain direction of the whole sheet;
 *                        supplying it removes the per-row β column
 */
const sourceBlock = (start: number, externalBetaRef?: (row: number) => string) => {
  const fields = SOURCE_FIELDS.filter((field) => field.key !== 'beta' || externalBetaRef === undefined)
  const columns = new Map<SourceField, number>(fields.map((field, index) => [field.key, start + index]))
  const at = (key: SourceField) => columns.get(key)!
  return {
    at,
    labels: fields.map((field) => field.title),
    widths: fields.map((field) => field.width),
    hasBetaColumn: externalBetaRef === undefined,
    /** Where a row's strain direction lives: its own cell, or the column already publishing it. */
    betaRef: (row: number) => externalBetaRef?.(row) ?? `${col(at('beta'))}${row}`,
    /** Provenance columns: written for traceability, hidden because nobody reads them by choice. */
    hiddenFirst: at('eP'),
    hiddenLast: at('steelEMy')
  }
}

type SourceBlock = ReturnType<typeof sourceBlock>

/** Sheet names for the shared project sheets; overridable so a workbook can host several audits. */
export type AuditSharedSheetNames = { geometry: string; materials: string; mesh: string }

const DEFAULT_SHARED_SHEET_NAMES: AuditSharedSheetNames = {
  geometry: 'Geometry',
  materials: 'Materials',
  mesh: 'Mesh'
}

const hideGridLines = (sheet: import('exceljs').Worksheet) => {
  sheet.views = [{ ...sheet.views[0], showGridLines: false }]
  return sheet
}

export const prepareAuditContext = (
  workbook: import('exceljs').Workbook,
  defineName: ReturnType<typeof createDefineName>,
  input: AuditSharedInput,
  sheetNames: AuditSharedSheetNames = DEFAULT_SHARED_SHEET_NAMES
) => {
  const origin = netConcreteCentroid(input.section)
  const mechanicsSupportsMeshFormula = input.surface.mechanics !== 'equivalent-rectangular-block'
  const meshOptions = isEquivalentBlockAnalysisOptions(input.surface.analysisOptions)
    ? {}
    : analysisMeshKernelOptions(input.surface.analysisOptions)
  const mesh = mechanicsSupportsMeshFormula ? buildConcreteMesh(input.section, meshOptions) : null
  const materialSets = buildResistanceMaterialSets(input.materialStore, input.designBasis)
  const calculationMaterials = input.resistanceStage === 'nominal'
    ? materialSets.referenceMaterials
    : input.designBasis.format === 'globalResultantFactor'
      ? materialSets.referenceMaterials
      : materialSets.designMaterials
  const prepared = mechanicsSupportsMeshFormula
    ? prepareAnalysisFromMesh(input.section, input.rebars, calculationMaterials, mesh!, origin)
    : null
  const concrete = calculationMaterials.concrete
  const cLaw = concreteLaw(concrete)
  const cParams = concreteModelParameters(concrete)
  const steelLaws = new Map(calculationMaterials.steel.map((steel) => [steel.id, steelLaw(steel)] as const))

  const geometry = hideGridLines(workbook.addWorksheet(sheetNames.geometry, { views: [{ state: 'frozen', ySplit: 8 }], properties: { tabColor: { argb: 'FF2563EB' } } }))
  const materials = hideGridLines(workbook.addWorksheet(sheetNames.materials, { views: [{ state: 'frozen', ySplit: 4 }], properties: { tabColor: { argb: 'FF7C3AED' } } }))
  const meshSheet = mechanicsSupportsMeshFormula
    ? hideGridLines(workbook.addWorksheet(sheetNames.mesh, { views: [{ state: 'frozen', ySplit: 6 }], properties: { tabColor: { argb: 'FF0F766E' } } }))
    : null
  const geometryRef = (column: string, row: number) => `'${sheetNames.geometry}'!$${column}$${row}`

  // -----------------------------------------------------------------------
  // Geometry
  // -----------------------------------------------------------------------
  reportTitle(geometry, 'PROJECT GEOMETRY AND LOAD INPUTS', 9)
  addLegend(geometry, 2)
  geometry.getCell('B3').value = 'Project'
  geometry.getCell('C3').value = input.projectName
  geometry.getCell('B4').value = 'Section'
  geometry.getCell('C4').value = input.sectionName
  geometry.getCell('B5').value = 'Calculation profile'
  geometry.getCell('C5').value = input.surface.calculationProfileId ?? input.surface.analysisOptions.methodId
  for (const row of [3, 4, 5]) geometry.mergeCells(row, 3, row, 5)
  geometry.getCell('C4').alignment = { wrapText: true, vertical: 'middle' }
  geometry.getRow(4).height = 30
  geometry.getCell('B6').value = 'Analysis origin X'
  geometry.getCell('C6').value = origin.x
  geometry.getCell('D6').value = 'mm'
  geometry.getCell('B7').value = 'Analysis origin Y'
  geometry.getCell('C7').value = origin.y
  geometry.getCell('D7').value = 'mm'
  for (const address of ['C3', 'C4', 'C5', 'C6', 'C7']) styleGenerated(geometry.getCell(address))
  defineName(geometryRef('C', 6), 'Origin_X')
  defineName(geometryRef('C', 7), 'Origin_Y')

  const projectInformation = input.projectInformation
  const identityRows: Array<[string, string]> = [
    ['Client', projectInformation?.client ?? ''],
    ['Company', projectInformation?.company ?? ''],
    ['Designed by', projectInformation?.designedBy ?? ''],
    ['Checked by', projectInformation?.checkedBy ?? ''],
    ['Address', projectInformation?.address ?? ''],
    ['Date', projectInformation?.date ?? '']
  ]
  identityRows.forEach(([label, value], index) => {
    geometry.getCell(3 + index, 6).value = label
    geometry.getCell(3 + index, 7).value = value
    styleGenerated(geometry.getCell(3 + index, 7))
  })

  const boundaryHeader = 12
  styleHeader(
    geometry,
    boundaryHeader,
    ['Ring ID', 'Boundary', 'Point order', 'X input (mm)', 'Y input (mm)', 'x local (mm)', 'y local (mm)'],
    1
  )
  let geometryRow = boundaryHeader + 1
  const boundaryFirst = geometryRow
  const boundaryGeometryRows: Array<{ row: number; exterior: boolean }> = []
  input.section.solids.forEach((solid, solidIndex) => {
    ;[solid.outer, ...solid.holes].forEach((ring, ringIndex) => {
      ring.forEach((point, pointIndex) => {
        boundaryGeometryRows.push({ row: geometryRow, exterior: ringIndex === 0 })
        geometry.getCell(geometryRow, 1).value = ringIndex === 0
          ? `R${solidIndex + 1}-OUTER`
          : `R${solidIndex + 1}-H${ringIndex}`
        geometry.getCell(geometryRow, 2).value = ringIndex === 0 ? 'Outer' : 'Hole'
        geometry.getCell(geometryRow, 3).value = pointIndex + 1
        geometry.getCell(geometryRow, 4).value = point.x
        geometry.getCell(geometryRow, 5).value = point.y
        styleRegenerate(geometry.getCell(geometryRow, 4))
        styleRegenerate(geometry.getCell(geometryRow, 5))
        setFormula(geometry.getCell(geometryRow, 6), `=D${geometryRow}-Origin_X`, point.x - origin.x)
        setFormula(geometry.getCell(geometryRow, 7), `=E${geometryRow}-Origin_Y`, point.y - origin.y)
        geometryRow++
      })
    })
  })
  const boundaryLast = geometryRow - 1
  defineName(`${geometryRef('F', boundaryFirst)}:$F$${boundaryLast}`, 'Boundary_X')
  defineName(`${geometryRef('G', boundaryFirst)}:$G$${boundaryLast}`, 'Boundary_Y')

  const rebarHeader = geometryRow + 2
  sectionHeading(geometry, rebarHeader - 1, 'Reinforcement', 9)
  styleHeader(geometry, rebarHeader, ['No.', 'Rebar ID', 'Diameter (mm)', 'X world (mm)', 'Y world (mm)', 'X local (mm)', 'Y local (mm)', 'Area (mm²)', 'Steel material ID'], 1)
  const rebarRows: Array<{ bar: GeometryInputRebarView; row: number }> = []
  input.rebars.forEach((bar, index) => {
    const row = rebarHeader + 1 + index
    rebarRows.push({ bar, row })
    geometry.getCell(row, 1).value = index + 1
    geometry.getCell(row, 2).value = bar.id
    geometry.getCell(row, 3).value = bar.dia
    geometry.getCell(row, 4).value = bar.x
    geometry.getCell(row, 5).value = bar.y
    for (const column of [3, 4, 5]) styleInput(geometry.getCell(row, column))
    styleRegenerate(geometry.getCell(row, 9))
    styleGenerated(geometry.getCell(row, 2))
    setFormula(geometry.getCell(row, 6), `=D${row}-Origin_X`, bar.x - origin.x)
    setFormula(geometry.getCell(row, 7), `=E${row}-Origin_Y`, bar.y - origin.y)
    setFormula(geometry.getCell(row, 8), `=PI()*C${row}^2/4`, Math.PI * bar.dia ** 2 / 4)
    geometry.getCell(row, 9).value = bar.steelMaterialId ?? calculationMaterials.defaults.steelMaterialId
  })

  let loadRow = rebarHeader + input.rebars.length + 4
  sectionHeading(geometry, loadRow, 'Project load cases', 7)
  loadRow++
  styleHeader(geometry, loadRow, ['ID', 'Name', 'P (kN)', 'Mx (kN·m)', 'My (kN·m)', 'Action basis'], 1)
  for (const loadcase of input.loadcases ?? []) {
    loadRow++
    geometry.getCell(loadRow, 1).value = loadcase.id
    geometry.getCell(loadRow, 2).value = loadcase.name
    geometry.getCell(loadRow, 3).value = kn(loadcase.P)
    geometry.getCell(loadRow, 4).value = knm(loadcase.Mx)
    geometry.getCell(loadRow, 5).value = knm(loadcase.My)
    geometry.getCell(loadRow, 6).value = loadcase.actionBasis
    for (const column of [3, 4, 5]) styleInput(geometry.getCell(loadRow, column))
    geometry.getCell(loadRow, 2).alignment = { wrapText: true, vertical: 'top' }
    geometry.getRow(loadRow).height = 28
  }
  geometry.columns = [18, 24, 14, 16, 16, 16, 16, 15, 18].map((width) => ({ width }))

  // -----------------------------------------------------------------------
  // Materials
  // -----------------------------------------------------------------------
  reportTitle(materials, 'MATERIALS AND RESISTANCE BASIS', 8)
  addLegend(materials, 2)
  materials.getCell('A3').value = 'Active result stage'
  materials.getCell('B3').value = input.resistanceStage === 'design' ? 'Design resistance' : 'Nominal resistance'
  materials.getCell('D3').value = 'Calculation profile'
  materials.getCell('E3').value = input.designBasis.identity.document
  for (const address of ['B3', 'E3']) styleGenerated(materials.getCell(address))

  sectionHeading(materials, 5, 'Concrete', 5)
  styleHeader(materials, 6, ['Symbol', 'Parameter', 'Value', 'Unit', 'Basis / use in calculation'], 1)
  let concreteRow = 7
  const addConcreteMetadata = (label: string, value: string) => {
    materials.getCell(concreteRow, 2).value = label
    materials.getCell(concreteRow, 3).value = value
    styleGenerated(materials.getCell(concreteRow, 3))
    concreteRow++
  }
  const addConcreteParameter = (
    symbol: string,
    label: string,
    value: number,
    unit: string,
    definedName: string | null,
    description: string
  ) => {
    materials.getCell(concreteRow, 1).value = symbol
    materials.getCell(concreteRow, 2).value = label
    materials.getCell(concreteRow, 3).value = value
    materials.getCell(concreteRow, 4).value = unit
    materials.getCell(concreteRow, 5).value = description
    materials.getCell(concreteRow, 5).alignment = { wrapText: true, vertical: 'top' }
    if (definedName) styleInput(materials.getCell(concreteRow, 3))
    else styleRegenerate(materials.getCell(concreteRow, 3))
    if (definedName) defineName(`'${sheetNames.materials}'!$C$${concreteRow}`, definedName)
    concreteRow++
  }
  addConcreteMetadata('Material', concrete.name)
  addConcreteMetadata('Standard', concrete.standard)
  addConcreteMetadata('Stress–strain law', concrete.stressStrain.type)
  addConcreteParameter('f′c / fck', 'Specified concrete compressive strength', concrete.fck, 'MPa', 'C_fck', 'Strength used by the active material law')
  if (concrete.elasticModulus !== undefined) {
    addConcreteParameter('Eᴄ', 'Elastic modulus', concrete.elasticModulus, 'MPa', null, 'Concrete elastic modulus reported by the selected standard')
  }
  if ('alpha' in concrete.stressStrain) {
    addConcreteParameter('α', 'Concrete stress coefficient', cParams.alpha, '–', 'C_alpha', 'Multiplier applied to the concrete compression stress')
  }
  if (concrete.stressStrain.type === 'kds-parabolic' || concrete.stressStrain.type === 'ec2-parabolic-rectangular') {
    addConcreteParameter('εc0', 'Peak / plateau strain', cParams.eps0, '–', 'C_eco', 'End of the parabolic branch')
    addConcreteParameter('n', 'Parabola exponent', cParams.n, '–', 'C_n', 'Exponent of the concrete stress–strain curve')
  }
  addConcreteParameter('εcu', 'Ultimate compression strain', cParams.epsCu, '–', 'C_ecu', 'Compression strain used at the neutral-axis boundary state')
  if (concrete.stressStrain.type === 'aci-whitney-block' || concrete.stressStrain.type === 'user-block') {
    addConcreteParameter('β1', 'Equivalent block depth factor', concrete.stressStrain.beta1, '–', null, 'Equivalent rectangular stress-block parameter')
  }
  if (concrete.stressStrain.type === 'as3600-equivalent-block') {
    addConcreteParameter('α2', 'Equivalent block stress factor', concrete.stressStrain.alpha2, '–', null, 'AS 3600 equivalent stress-block parameter')
    addConcreteParameter('γ', 'Equivalent block depth factor', concrete.stressStrain.gamma, '–', null, 'AS 3600 equivalent stress-block parameter')
  }
  materials.getCell(concreteRow, 2).value = 'Calculation law'
  materials.getCell(concreteRow, 3).value = cLaw.description
  materials.getCell(concreteRow, 3).alignment = { wrapText: true, vertical: 'top' }
  materials.mergeCells(concreteRow, 3, concreteRow, 5)
  styleGenerated(materials.getCell(concreteRow, 3))
  concreteRow++

  const steelHeader = concreteRow + 2
  sectionHeading(materials, steelHeader - 1, 'Reinforcing steel', 8)
  styleHeader(materials, steelHeader, ['ID', 'Material', 'Standard', 'fy (MPa)', 'Eₛ (MPa)', 'εy', 'εu', 'Stress–strain law'], 1)
  const steelNames = new Map<number, { fy: string; Es: string; curvePrefix: string }>()
  calculationMaterials.steel.forEach((steel, index) => {
    const row = steelHeader + 1 + index
    const prefix = `S_${steel.id}`
    const names = { fy: `${prefix}_fy`, Es: `${prefix}_Es`, curvePrefix: `${prefix}_curve` }
    steelNames.set(steel.id, names)
    materials.getCell(row, 1).value = steel.id
    materials.getCell(row, 2).value = steel.name
    materials.getCell(row, 3).value = steel.standard
    materials.getCell(row, 4).value = steelDesignFy(steel)
    materials.getCell(row, 5).value = steel.elasticModulus
    setFormula(materials.getCell(row, 6), `=D${row}/E${row}`, steel.limits?.epsY ?? steelDesignFy(steel) / steel.elasticModulus, '0.000000')
    materials.getCell(row, 7).value = steel.limits?.epsU ?? null
    materials.getCell(row, 8).value = steel.stressStrain.type
    for (const column of [4, 5]) styleInput(materials.getCell(row, column))
    styleRegenerate(materials.getCell(row, 7))
    for (const column of [1, 2, 3, 8]) styleGenerated(materials.getCell(row, column))
    defineName(`'${sheetNames.materials}'!$D$${row}`, names.fy)
    defineName(`'${sheetNames.materials}'!$E$${row}`, names.Es)
  })

  let curveRow = steelHeader + calculationMaterials.steel.length + 3
  curveRow = addMaterialCurve(materials, defineName, curveRow, 1, 'C_curve', 'Concrete tabulated law', cLaw, sheetNames.materials)
  for (const steel of calculationMaterials.steel) {
    curveRow = addMaterialCurve(
      materials,
      defineName,
      curveRow,
      1,
      steelNames.get(steel.id)!.curvePrefix,
      `Steel ${steel.id} tabulated law`,
      steelLaws.get(steel.id)!,
      sheetNames.materials
    )
  }

  const basisRow = curveRow + 1
  sectionHeading(materials, basisRow, 'Resistance basis', 5)
  styleHeader(materials, basisRow + 1, ['Symbol / setting', 'Parameter', 'Value', 'Unit', 'Code basis / note'], 1)
  let resistanceRow = basisRow + 2
  const addResistanceRow = (symbol: string, label: string, value: string | number | boolean, unit = '–', note = '') => {
    materials.getCell(resistanceRow, 1).value = symbol || null
    materials.getCell(resistanceRow, 2).value = label
    materials.getCell(resistanceRow, 3).value = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : value
    materials.getCell(resistanceRow, 4).value = unit
    materials.getCell(resistanceRow, 5).value = note || null
    materials.getCell(resistanceRow, 5).alignment = { wrapText: true, vertical: 'top' }
    styleRegenerate(materials.getCell(resistanceRow, 3))
    resistanceRow++
  }
  addResistanceRow('', 'Resistance format', input.designBasis.format)
  addResistanceRow('', 'Active result stage', input.resistanceStage)
  addResistanceRow('', 'Profile', input.designBasis.profileId, '–', input.designBasis.identity.document)
  if (input.designBasis.format === 'globalResultantFactor') {
    const isSpiral = input.designBasis.transverseReinforcement === 'qualifying-spiral'
    addResistanceRow('', 'Transverse reinforcement', input.designBasis.transverseReinforcement)
    addResistanceRow('φc', 'Compression-controlled strength factor', isSpiral
      ? input.designBasis.factors.phiCompressionSpiral
      : input.designBasis.factors.phiCompressionOther)
    addResistanceRow('φt', 'Tension-controlled strength factor', input.designBasis.factors.phiTension)
    addResistanceRow('Pmax', 'Axial compression limit enabled', input.designBasis.axialCapEnabled)
    addResistanceRow('Pmax/P0', 'Axial compression limit ratio', isSpiral
      ? input.designBasis.factors.axialCapSpiral
      : input.designBasis.factors.axialCapOther)
    const transition = input.designBasis.transition.type === 'yield-plus-strain'
      ? `εt = εy + ${input.designBasis.transition.extraStrain}`
      : `fixed ${input.designBasis.transition.fixedStrainLimit}; high-strength ${input.designBasis.transition.highStrengthYieldMultiple}·εy`
    addResistanceRow('εt', 'Tension-controlled transition rule', transition)
  } else {
    for (const component of input.designBasis.factors.concrete.components) {
      addResistanceRow(component.symbol, component.label, component.value, '–', component.clauseRef)
    }
    for (const component of input.designBasis.factors.reinforcement.components) {
      addResistanceRow(component.symbol, component.label, component.value, '–', component.clauseRef)
    }
    addResistanceRow('', 'Compression endpoint', input.designBasis.compressionEndpoint)
    if (input.designBasis.minimumEccentricity) {
      addResistanceRow('emin', 'Minimum eccentricity constant', input.designBasis.minimumEccentricity.constantMm, 'mm', input.designBasis.minimumEccentricity.clauseRef)
      addResistanceRow('emin/D', 'Minimum eccentricity depth factor', input.designBasis.minimumEccentricity.depthFactor, '–', input.designBasis.minimumEccentricity.clauseRef)
    }
  }
  materials.getCell(resistanceRow + 1, 1).value =
    'Blue text marks editable values that drive formulas. Orange text marks settings that require re-export because they change the generated surface or mesh.'
  materials.getCell(resistanceRow + 1, 1).font = { italic: true, color: { argb: NOTE_COLOR } }
  materials.mergeCells(resistanceRow + 1, 1, resistanceRow + 1, 5)
  materials.columns = [18, 32, 26, 16, 54, 14, 14, 24].map((width) => ({ width }))

  // -----------------------------------------------------------------------
  // Mesh
  // -----------------------------------------------------------------------
  if (meshSheet && mesh) {
    reportTitle(meshSheet, 'CONCRETE INTEGRATION MESH', 7)
    meshSheet.getCell('B2').value =
      'X and Y are measured from the analysis origin. Area is the quadrature weight used directly by Result SUMPRODUCT formulas.'
    meshSheet.getCell('B2').font = { italic: true, color: { argb: NOTE_COLOR } }
    meshSheet.mergeCells('B2:G2')
    meshSheet.getCell('B3').value = 'Cell size (mm)'
    meshSheet.getCell('C3').value = mesh.report.cellSize
    meshSheet.getCell('D3').value = 'Points'
    meshSheet.getCell('E3').value = mesh.points.length
    meshSheet.getCell('F3').value = 'Area error'
    meshSheet.getCell('G3').value = mesh.report.areaError
    styleRegenerate(meshSheet.getCell('C3'))
    styleGenerated(meshSheet.getCell('E3'))
    styleGenerated(meshSheet.getCell('G3'))
    addLegend(meshSheet, 4)
    styleHeader(meshSheet, 5, ['No.', 'X local (mm)', 'Y local (mm)', 'Area (mm²)', 'Component', 'X world (mm)', 'Y world (mm)'], 1)
    const meshFirst = 6
    mesh.points.forEach((point, index) => {
      const row = meshFirst + index
      meshSheet.getCell(row, 1).value = index + 1
      meshSheet.getCell(row, 2).value = point.x - origin.x
      meshSheet.getCell(row, 3).value = point.y - origin.y
      meshSheet.getCell(row, 4).value = point.area
      meshSheet.getCell(row, 5).value = point.component
      for (let column = 1; column <= 5; column++) styleGenerated(meshSheet.getCell(row, column))
      setFormula(meshSheet.getCell(row, 6), `=B${row}+Origin_X`, point.x)
      setFormula(meshSheet.getCell(row, 7), `=C${row}+Origin_Y`, point.y)
    })
    const meshLast = meshFirst + mesh.points.length - 1
    defineName(`'${sheetNames.mesh}'!$B$${meshFirst}:$B$${meshLast}`, 'Mesh_X')
    defineName(`'${sheetNames.mesh}'!$C$${meshFirst}:$C$${meshLast}`, 'Mesh_Y')
    defineName(`'${sheetNames.mesh}'!$D$${meshFirst}:$D$${meshLast}`, 'Mesh_A')
    meshSheet.columns = [10, 16, 16, 16, 14, 16, 16].map((width) => ({ width }))
  }

  // -----------------------------------------------------------------------
  // Source-point resolution, shared by every chart sheet in this workbook
  // -----------------------------------------------------------------------
  const createSourceCollector = () => {
  const sources = new Map<string, SourcePoint>()
  const sourceFor = (
    point: PreviewSurfacePoint,
    label: string,
    betaDeg: number,
    definition: StationDefinition | null
  ) => {
    const key = sourceKey(point)
    const existing = sources.get(key)
    if (existing) return existing
    const isAxialCap = point.surfaceRole === 'axial-cap'
    let usesLedgerAnchor = isAxialCap || !prepared
    let baseLedger = usesLedgerAnchor ? point.ledger : evaluatePreparedState(prepared!, point.state)
    const preferredFactor = point.resistance?.factor ?? 1
    let pFactor = usesLedgerAnchor
      ? 1
      : componentFactor(point.P, baseLedger.total.P, preferredFactor)
    let mxFactor = usesLedgerAnchor
      ? 1
      : componentFactor(point.Mx, baseLedger.total.Mx, preferredFactor)
    let myFactor = usesLedgerAnchor
      ? 1
      : componentFactor(point.My, baseLedger.total.My, preferredFactor)
    if (pFactor === null || mxFactor === null || myFactor === null) {
      usesLedgerAnchor = true
      baseLedger = point.ledger
      pFactor = 1
      mxFactor = 1
      myFactor = 1
    }
    const curvature = Math.hypot(point.state.kx, point.state.ky)
    const strainBetaDeg = curvature > 1e-14
      ? normalizeAngleDeg(Math.atan2(point.state.ky, point.state.kx) * 180 / Math.PI)
      : normalizeAngleDeg(betaDeg)
    const resolvedCriterion = resolvedStrainCriterion(
      input.section,
      origin,
      input.rebars,
      calculationMaterials,
      strainBetaDeg,
      point,
      definition
    )
    const calculationMode = isAxialCap
      ? 'axial-cap projected-ledger anchor (geometric Pmax face)'
      : !prepared
        ? 'equivalent-block total-ledger anchor (no integration mesh)'
        : usesLedgerAnchor
          ? 'engine total-ledger anchor (strain state cannot reproduce point)'
          : 'strain-state Mesh/Material formula'
    const source: SourcePoint = {
      key,
      label: isAxialCap ? `${label} (geometric axial-cap point)` : label,
      betaDeg: strainBetaDeg,
      point,
      baseLedger,
      pFactor,
      mxFactor,
      myFactor,
      usesLedgerAnchor,
      calculationMode,
      criterion: isAxialCap
        ? { ...resolvedCriterion, basisLabel: `retained ${resolvedCriterion.basisLabel} (not the cap rule)` }
        : resolvedCriterion,
      definition,
      row: 0
    }
    sources.set(key, source)
      return source
    }
    return { sources, sourceFor }
  }

  // -----------------------------------------------------------------------
  // Formula-driven source calculations
  // -----------------------------------------------------------------------
  const concreteNames: Record<string, string> = {
    fck: 'C_fck', alpha: 'C_alpha', eco: 'C_eco', ecu: 'C_ecu', n: 'C_n',
    Cnc_eps: 'C_curve_eps', Cnc_sig: 'C_curve_sig', Cnc_n: 'C_curve_n'
  }
  const meshFormulaReady = mechanicsSupportsMeshFormula && cLaw.array !== null
  const concreteArray = (eps: string) => cLaw.array
    ? formulaNames(cLaw.array(eps), concreteNames)
    : null
  const concreteScalar = (eps: string) => formulaNames(cLaw.scalar(eps), concreteNames)
  const address = (column: number, row: number) => `${col(column)}${row}`
  /**
   * Local coordinates on the shared Geometry sheet. Columns F/G are the origin-relative x and y of
   * a boundary vertex or a bar; column H is the bar area and exists on reinforcement rows only.
   */
  const geometryCellsAt = (row: number) => ({
    x: `'${sheetNames.geometry}'!$F$${row}`,
    y: `'${sheetNames.geometry}'!$G$${row}`,
    area: `'${sheetNames.geometry}'!$H$${row}`
  })
  const steelForBar = (bar: GeometryInputRebarView) => {
    const materialId = bar.steelMaterialId ?? calculationMaterials.defaults.steelMaterialId
    return calculationMaterials.steel.find((candidate) => candidate.id === materialId) ?? calculationMaterials.steel[0]
  }
  const steelScalar = (steelId: number, eps: string) => {
    const names = steelNames.get(steelId)
    const law = steelLaws.get(steelId)
    if (!names || !law) return '0'
    return formulaNames(law.scalar(eps), {
      Es: names.Es,
      fy: names.fy,
      Stl_eps: `${names.curvePrefix}_eps`,
      Stl_sig: `${names.curvePrefix}_sig`,
      Stl_n: `${names.curvePrefix}_n`
    })
  }
  /** Strain at a bar for a strain plane held in three cells; the workbook's ε(x, y). */
  const barStrainExpression = (row: number, e0Ref: string, kxRef: string, kyRef: string) => {
    const bar = geometryCellsAt(row)
    return `(${e0Ref}+${kxRef}*${bar.y}+${kyRef}*${bar.x})`
  }

  const steelContributionFormula = (
    sourceRow: number,
    block: SourceBlock,
    axis: 'P' | 'Mx' | 'My'
  ) => {
    if (rebarRows.length === 0) return '=0'
    const e0 = address(block.at('e0'), sourceRow)
    const kx = address(block.at('kx'), sourceRow)
    const ky = address(block.at('ky'), sourceRow)
    const terms = rebarRows.map(({ bar, row }) => {
      const steel = steelForBar(bar)
      if (!steel) return '0'
      const geometryCells = geometryCellsAt(row)
      const eps = barStrainExpression(row, e0, kx, ky)
      const fs = steelScalar(steel.id, eps)
      const fc = concreteScalar(eps)
      const lever = axis === 'P' ? '' : axis === 'Mx' ? `*${geometryCells.y}` : `*${geometryCells.x}`
      return `((${fs})-(${fc}))*${geometryCells.area}${lever}`
    })
    return `=(${terms.join('+')})/${axis === 'P' ? 1_000 : 1_000_000}`
  }

  const projectionTerm = (geometryRow: number, betaRef: string) => {
    const vertex = geometryCellsAt(geometryRow)
    return `(${vertex.y}*COS(RADIANS(${betaRef}))+${vertex.x}*SIN(RADIANS(${betaRef})))`
  }
  const scalarExtreme = (
    functionName: 'MAX' | 'MIN',
    geometryRows: readonly number[],
    betaRef: string
  ) => {
    const terms = geometryRows.map((geometryRow) => projectionTerm(geometryRow, betaRef))
    if (terms.length === 0) return '0'
    const groups: string[] = []
    for (let index = 0; index < terms.length; index += 200) {
      groups.push(`${functionName}(${terms.slice(index, index + 200).join(',')})`)
    }
    return groups.length === 1 ? groups[0] : `${functionName}(${groups.join(',')})`
  }
  const exteriorGeometryRows = boundaryGeometryRows
    .filter((item) => item.exterior)
    .map((item) => item.row)
  const rebarGeometryRows = rebarRows.map((item) => item.row)

  const writeSourceCalculationRow = (
    sheet: import('exceljs').Worksheet,
    row: number,
    source: SourcePoint,
    block: SourceBlock,
    label = source.label
  ) => {
    const point = source.point
    const base = source.baseLedger
    const ref = (column: number) => address(column, row)
    const betaRef = block.betaRef(row)
    const zcRef = ref(block.at('compressionProjection'))
    const zControlRef = ref(block.at('controlProjection'))
    const depthRef = ref(block.at('sectionDepth'))
    const epsCRef = ref(block.at('compressionStrain'))
    const epsControlRef = ref(block.at('controlStrain'))
    const curvatureRef = ref(block.at('curvature'))
    const e0Ref = ref(block.at('e0'))
    const kxRef = ref(block.at('kx'))
    const kyRef = ref(block.at('ky'))

    sheet.getCell(row, block.at('label')).value = label
    if (block.hasBetaColumn) {
      sheet.getCell(row, block.at('beta')).value = source.betaDeg
      sheet.getCell(row, block.at('beta')).numFmt = '0.000'
      styleInput(sheet.getCell(row, block.at('beta')))
    }
    sheet.getCell(row, block.at('criterionBasis')).value = source.criterion.basisLabel
    sheet.getCell(row, block.at('criterionValue')).value = source.criterion.value
    sheet.getCell(row, block.at('criterionValue')).numFmt = '0.000000'
    setFormula(
      sheet.getCell(row, block.at('compressionProjection')),
      `=${scalarExtreme('MAX', exteriorGeometryRows, betaRef)}`,
      source.criterion.compressionProjection
    )
    setFormula(
      sheet.getCell(row, block.at('sectionDepth')),
      `=${zcRef}-${scalarExtreme('MIN', exteriorGeometryRows, betaRef)}`,
      source.criterion.sectionDepth
    )
    const rebarControlFormula = rebarGeometryRows.length > 0
      ? scalarExtreme('MIN', rebarGeometryRows, betaRef)
      : `${zcRef}-${depthRef}`
    if (source.criterion.kind === 'c-over-d') {
      setFormula(
        sheet.getCell(row, block.at('controlProjection')),
        `=${zcRef}-${ref(block.at('criterionValue'))}*${depthRef}`,
        source.criterion.controlProjection
      )
    } else if (source.criterion.kind === 'uniform-strain') {
      setFormula(sheet.getCell(row, block.at('controlProjection')), `=${zcRef}`, source.criterion.controlProjection)
    } else {
      setFormula(sheet.getCell(row, block.at('controlProjection')), `=${rebarControlFormula}`, source.criterion.controlProjection)
    }

    if (source.criterion.kind === 'uniform-strain') {
      setFormula(sheet.getCell(row, block.at('compressionStrain')), `=${ref(block.at('criterionValue'))}`, source.criterion.compressionStrain, '0.000000')
      setFormula(sheet.getCell(row, block.at('controlStrain')), `=${ref(block.at('criterionValue'))}`, source.criterion.controlStrain, '0.000000')
      setFormula(sheet.getCell(row, block.at('curvature')), '=0', 0, '0.000000000')
      setFormula(sheet.getCell(row, block.at('e0')), `=${ref(block.at('criterionValue'))}`, point.state.e0, '0.000000')
    } else {
      const ultimateTolerance = Math.max(1e-10, Math.abs(cParams.epsCu) * 1e-8)
      if (Math.abs(source.criterion.compressionStrain - cParams.epsCu) <= ultimateTolerance) {
        setFormula(sheet.getCell(row, block.at('compressionStrain')), '=C_ecu', source.criterion.compressionStrain, '0.000000')
      } else {
        sheet.getCell(row, block.at('compressionStrain')).value = source.criterion.compressionStrain
        sheet.getCell(row, block.at('compressionStrain')).numFmt = '0.000000'
        styleInput(sheet.getCell(row, block.at('compressionStrain')))
      }
      if (source.criterion.kind === 'c-over-d') {
        setFormula(sheet.getCell(row, block.at('controlStrain')), '=0', 0, '0.000000')
      } else if (source.criterion.kind === 'steel-yield-ratio') {
        const names = source.criterion.controllingSteelId === null
          ? null
          : steelNames.get(source.criterion.controllingSteelId)
        const yieldStrain = names ? `${names.fy}/${names.Es}` : '0'
        setFormula(
          sheet.getCell(row, block.at('controlStrain')),
          `=-${ref(block.at('criterionValue'))}*${yieldStrain}`,
          source.criterion.controlStrain,
          '0.000000'
        )
      } else {
        setFormula(
          sheet.getCell(row, block.at('controlStrain')),
          `=${ref(block.at('criterionValue'))}`,
          source.criterion.controlStrain,
          '0.000000'
        )
      }
      setFormula(
        sheet.getCell(row, block.at('curvature')),
        `=IF(ABS(${zcRef}-${zControlRef})<0.000000000001,0,(${epsCRef}-${epsControlRef})/(${zcRef}-${zControlRef}))`,
        Math.hypot(point.state.kx, point.state.ky),
        '0.000000000'
      )
      setFormula(
        sheet.getCell(row, block.at('e0')),
        `=${epsCRef}-${curvatureRef}*${zcRef}`,
        point.state.e0,
        '0.000000'
      )
    }
    setFormula(sheet.getCell(row, block.at('kx')), `=${curvatureRef}*COS(RADIANS(${betaRef}))`, point.state.kx, '0.000000000')
    setFormula(sheet.getCell(row, block.at('ky')), `=${curvatureRef}*SIN(RADIANS(${betaRef}))`, point.state.ky, '0.000000000')
    sheet.getCell(row, block.at('pFactor')).value = source.pFactor
    sheet.getCell(row, block.at('mxFactor')).value = source.mxFactor
    sheet.getCell(row, block.at('myFactor')).value = source.myFactor
    sheet.getCell(row, block.at('mode')).value = source.calculationMode
    for (const column of [
      block.at('label'),
      block.at('criterionBasis'),
      block.at('pFactor'),
      block.at('mxFactor'),
      block.at('myFactor'),
      block.at('mode')
    ]) {
      styleGenerated(sheet.getCell(row, column))
    }
    styleInput(sheet.getCell(row, block.at('criterionValue')))

    const eps = `(${e0Ref}+${kxRef}*Mesh_Y+${kyRef}*Mesh_X)`
    const fc = concreteArray(eps)
    if (!source.usesLedgerAnchor && meshFormulaReady && fc) {
      setFormula(sheet.getCell(row, block.at('cP')), `=SUMPRODUCT(${fc},Mesh_A)/1000`, kn(base.concrete.P))
      setFormula(sheet.getCell(row, block.at('cMx')), `=SUMPRODUCT(${fc},Mesh_A,Mesh_Y)/1000000`, knm(base.concrete.Mx))
      setFormula(sheet.getCell(row, block.at('cMy')), `=SUMPRODUCT(${fc},Mesh_A,Mesh_X)/1000000`, knm(base.concrete.My))
    } else {
      setFormula(sheet.getCell(row, block.at('cP')), `=${ref(block.at('concEP'))}`, kn(base.concrete.P))
      setFormula(sheet.getCell(row, block.at('cMx')), `=${ref(block.at('concEMx'))}`, knm(base.concrete.Mx))
      setFormula(sheet.getCell(row, block.at('cMy')), `=${ref(block.at('concEMy'))}`, knm(base.concrete.My))
    }
    if (!source.usesLedgerAnchor && mechanicsSupportsMeshFormula) {
      setFormula(sheet.getCell(row, block.at('sP')), steelContributionFormula(row, block, 'P'), kn(base.steel.P))
      setFormula(sheet.getCell(row, block.at('sMx')), steelContributionFormula(row, block, 'Mx'), knm(base.steel.Mx))
      setFormula(sheet.getCell(row, block.at('sMy')), steelContributionFormula(row, block, 'My'), knm(base.steel.My))
    } else {
      setFormula(sheet.getCell(row, block.at('sP')), `=${ref(block.at('steelEP'))}`, kn(base.steel.P))
      setFormula(sheet.getCell(row, block.at('sMx')), `=${ref(block.at('steelEMx'))}`, knm(base.steel.Mx))
      setFormula(sheet.getCell(row, block.at('sMy')), `=${ref(block.at('steelEMy'))}`, knm(base.steel.My))
    }
    setFormula(
      sheet.getCell(row, block.at('bP')),
      source.usesLedgerAnchor ? `=${ref(block.at('baseEP'))}` : `=${ref(block.at('cP'))}+${ref(block.at('sP'))}`,
      kn(base.total.P)
    )
    setFormula(
      sheet.getCell(row, block.at('bMx')),
      source.usesLedgerAnchor ? `=${ref(block.at('baseEMx'))}` : `=${ref(block.at('cMx'))}+${ref(block.at('sMx'))}`,
      knm(base.total.Mx)
    )
    setFormula(
      sheet.getCell(row, block.at('bMy')),
      source.usesLedgerAnchor ? `=${ref(block.at('baseEMy'))}` : `=${ref(block.at('cMy'))}+${ref(block.at('sMy'))}`,
      knm(base.total.My)
    )
    const finalP = kn(base.total.P) * source.pFactor
    const finalMx = knm(base.total.Mx) * source.mxFactor
    const finalMy = knm(base.total.My) * source.myFactor
    setFormula(sheet.getCell(row, block.at('fP')), `=${ref(block.at('bP'))}*${ref(block.at('pFactor'))}`, finalP)
    setFormula(sheet.getCell(row, block.at('fMx')), `=${ref(block.at('bMx'))}*${ref(block.at('mxFactor'))}`, finalMx)
    setFormula(sheet.getCell(row, block.at('fMy')), `=${ref(block.at('bMy'))}*${ref(block.at('myFactor'))}`, finalMy)
    sheet.getCell(row, block.at('eP')).value = kn(point.P)
    sheet.getCell(row, block.at('eMx')).value = knm(point.Mx)
    sheet.getCell(row, block.at('eMy')).value = knm(point.My)
    setFormula(
      sheet.getCell(row, block.at('dP')),
      `=${ref(block.at('fP'))}-${ref(block.at('eP'))}`,
      finalP - kn(point.P),
      '0.000000'
    )
    setFormula(
      sheet.getCell(row, block.at('dM')),
      `=SQRT((${ref(block.at('fMx'))}-${ref(block.at('eMx'))})^2+(${ref(block.at('fMy'))}-${ref(block.at('eMy'))})^2)`,
      Math.hypot(finalMx - knm(point.Mx), finalMy - knm(point.My)),
      '0.000000'
    )
    sheet.getCell(row, block.at('baseEP')).value = kn(base.total.P)
    sheet.getCell(row, block.at('baseEMx')).value = knm(base.total.Mx)
    sheet.getCell(row, block.at('baseEMy')).value = knm(base.total.My)
    sheet.getCell(row, block.at('concEP')).value = kn(base.concrete.P)
    sheet.getCell(row, block.at('concEMx')).value = knm(base.concrete.Mx)
    sheet.getCell(row, block.at('concEMy')).value = knm(base.concrete.My)
    sheet.getCell(row, block.at('steelEP')).value = kn(base.steel.P)
    sheet.getCell(row, block.at('steelEMx')).value = knm(base.steel.Mx)
    sheet.getCell(row, block.at('steelEMy')).value = knm(base.steel.My)
    for (let column = block.at('eP'); column <= block.at('steelEMy'); column++) {
      if ([block.at('dP'), block.at('dM')].includes(column)) continue
      styleGenerated(sheet.getCell(row, column))
    }
  }

  return {
    workbook,
    defineName,
    sheetNames,
    origin,
    section: input.section,
    rebars: input.rebars,
    surface: input.surface,
    resistanceStage: input.resistanceStage,
    mesh,
    prepared,
    calculationMaterials,
    concreteLaw: cLaw,
    concreteParameters: cParams,
    steelLaws,
    steelNames,
    rebarRows,
    exteriorGeometryRows,
    rebarGeometryRows,
    mechanicsSupportsMeshFormula,
    meshFormulaReady,
    createSourceCollector,
    writeSourceCalculationRow,
    concreteArray,
    concreteScalar,
    steelScalar,
    steelForBar,
    geometryCellsAt,
    barStrainExpression,
    scalarExtreme
  }
}

export type AuditContext = ReturnType<typeof prepareAuditContext>

/**
 * Sheet head: one stacked label/value block, then the legend, then the table.
 *
 * It used to be three blocks side by side — identity at B/C, caller context at E/F, sheet values at
 * H/I — which put loose numbers above the middle of the table and left the columns under them
 * unusable. Stacking everything at the left and pushing the table down instead means the head reads
 * top to bottom, and no column exists only to hold a header value.
 */
const IDENTITY_FIRST_ROW = 3
const IDENTITY_LABEL_SPAN = 2
const IDENTITY_VALUE_COLUMN = IDENTITY_LABEL_SPAN + 1
const IDENTITY_VALUE_SPAN = 2

type IdentityEntry = {
  label: string
  value: string | number
  /** Legend colour; `generated` when omitted. */
  role?: 'generated' | 'input' | 'regenerate'
  numFmt?: string
}

/** Row of the table header when `count` identity rows are reserved, legend row included. */
const headerRowFor = (count: number) => IDENTITY_FIRST_ROW + count + 1

const writeIdentityBlock = (
  sheet: import('exceljs').Worksheet,
  entries: readonly IdentityEntry[]
) => {
  entries.forEach((entry, index) => {
    const row = IDENTITY_FIRST_ROW + index
    sheet.mergeCells(row, 1, row, IDENTITY_LABEL_SPAN)
    sheet.getCell(row, 1).value = entry.label
    sheet.mergeCells(row, IDENTITY_VALUE_COLUMN, row, IDENTITY_VALUE_COLUMN + IDENTITY_VALUE_SPAN - 1)
    const cell = sheet.getCell(row, IDENTITY_VALUE_COLUMN)
    cell.value = entry.value
    if (entry.numFmt) cell.numFmt = entry.numFmt
    cell.alignment = { vertical: 'middle' }
    if (entry.role === 'input') styleInput(cell)
    else if (entry.role === 'regenerate') styleRegenerate(cell)
    else styleGenerated(cell)
  })
  return entries.map((_entry, index) => `$${col(IDENTITY_VALUE_COLUMN)}$${IDENTITY_FIRST_ROW + index}`)
}

const zebraResultRows = (
  sheet: import('exceljs').Worksheet,
  headerRow: number,
  rowCount: number,
  visibleColumns: number
) => {
  for (let row = headerRow + 1; row <= headerRow + rowCount; row++) {
    if ((row - headerRow) % 2 !== 0) continue
    for (let column = 1; column <= visibleColumns; column++) {
      sheet.getCell(row, column).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
    }
  }
}

/** Freeze under the table header, keeping the grid-line choice the caller already made. */
const freezeUnder = (sheet: import('exceljs').Worksheet, headerRow: number, xSplit = 0) => {
  sheet.views = [{
    state: 'frozen',
    xSplit,
    ySplit: headerRow,
    showGridLines: sheet.views[0]?.showGridLines ?? true
  }]
}

/**
 * The checked load point in the chart's own axes, so a curve sheet can plot the demand on its curve.
 * `x`/`y` rather than named actions because the two sheets plot different pairs: (Mθ, P) on the
 * meridian, (Mux, Muy) on the contour.
 */
export type DemandMarker = { x: number; y: number; xLabel: string; yLabel: string; label: string }

export type VerticalAuditSheetOptions = {
  sheet: import('exceljs').Worksheet
  /** Meridian direction to publish, degrees; ignored when an exact curve is supplied. */
  sliceAngleDeg: number
  exactDirectionCurve?: ExactDirectionCurve | null
  titleText?: string
  contextRows?: ReadonlyArray<readonly [string, string | number]>
  /** Load point on this meridian; plotted on the chart and published above the table. */
  demand?: DemandMarker | null
}

/**
 * The vertical P-M meridian, one row per strain-domain station.
 *
 * Every displayed P and M is a formula over the station's own criterion, so a reviewer can change
 * a criterion or a material value and watch the whole curve move.
 */
export const writeVerticalAuditSheet = (context: AuditContext, options: VerticalAuditSheetOptions) => {
  const { sheet } = options
  const selected = selectedDirection(
    context.surface,
    context.resistanceStage,
    options.sliceAngleDeg,
    options.exactDirectionCurve
  )
  const { sources, sourceFor } = context.createSourceCollector()
  const mainRows: VerticalResultRow[] = []
  collectVerticalPoints(selected).forEach(({ point, criterion, definition }, index) => {
    const source = sourceFor(point, criterion, selected.betaDeg, definition)
    const beta = selected.betaDeg * Math.PI / 180
    const displayedCriterion = criterion.toLowerCase().includes('adaptive') && source.criterion.kind === 'c-over-d'
      ? `c/D = ${source.criterion.value.toFixed(6)} (adaptive)`
      : criterion
    mainRows.push({
      kind: 'vertical',
      index: index + 1,
      criterion: displayedCriterion,
      sourceKey: source.key,
      engineP: point.P,
      engineM: point.Mx * Math.cos(beta) + point.My * Math.sin(beta)
    })
  })

  /**
   * The direction the stations on this sheet were actually solved in.
   *
   * It is not always the selected angle: without an exact direction curve the meridian snaps to the
   * nearest sampled direction, and it is that direction the strain planes below belong to. One
   * meridian has exactly one of them, so it is published once in the head and every row's formulas
   * read it, instead of a column repeating the same number down the sheet. States with no curvature
   * — the two poles — carry no direction at all, and their resultants do not depend on which is used.
   */
  const strainBetaDeg = [...sources.values()]
    .filter((source) => Math.hypot(source.point.state.kx, source.point.state.ky) > 1e-14)
    .map((source) => source.betaDeg)[0] ?? selected.betaDeg
  const identity: IdentityEntry[] = [
    { label: 'Chart source', value: 'Vertical' },
    { label: 'Resistance stage', value: context.resistanceStage },
    {
      label: 'Selected β — M projection (deg)',
      value: (options.exactDirectionCurve?.beta ?? options.sliceAngleDeg * Math.PI / 180) * 180 / Math.PI,
      role: 'regenerate',
      numFmt: '#,##0.0000'
    },
    {
      label: 'Strain direction β — station formulas (deg)',
      value: strainBetaDeg,
      role: 'input',
      numFmt: '#,##0.0000'
    },
    ...(options.contextRows ?? []).map(([label, value]) => ({ label, value })),
    ...(options.demand
      ? [
          { label: options.demand.xLabel, value: options.demand.x, role: 'input' as const, numFmt: '#,##0.000' },
          { label: options.demand.yLabel, value: options.demand.y, role: 'input' as const, numFmt: '#,##0.000' }
        ]
      : [])
  ]
  const headerRow = headerRowFor(identity.length)
  const firstDataRow = headerRow + 1
  const identityRef = (index: number) => `$${col(IDENTITY_VALUE_COLUMN)}$${IDENTITY_FIRST_ROW + index}`
  // Index 2 is the selected β the M column is projected on; index 3 is the strain direction the
  // station formulas are built in. They coincide for a requested meridian and differ for a snapped one.
  const projectionRef = identityRef(2)
  const block = sourceBlock(5, () => identityRef(3))

  reportTitle(sheet, options.titleText ?? 'FORMULA-DRIVEN CHART AUDIT', block.at('fMy'))
  sheet.getCell('A2').value = (context.mechanicsSupportsMeshFormula
    ? 'Displayed values are formulas. Each physical station criterion determines ε₀, κx and κy; resistance is integrated from Materials and Mesh. Geometric axial-cap rows are explicitly anchored to their projected engine ledger.'
    : 'Equivalent-block resultants use the engine total-ledger anchor because this mechanics has no concrete integration mesh. Use the calculation-mode column to identify the provenance.') +
    ' Two angles are published above: the selected β the M column is projected on, and the strain direction the stations were solved in — the same for a requested meridian, and the nearest sampled direction when the surface has no meridian at the selected angle.'
  sheet.getCell('A2').font = { italic: true, color: { argb: NOTE_COLOR } }
  sheet.mergeCells(2, 1, 2, block.at('fMy'))
  sheet.getRow(2).height = 24
  const identityCells = writeIdentityBlock(sheet, identity)
  const demandCells = options.demand
    ? { x: identityCells[identityCells.length - 2], y: identityCells[identityCells.length - 1] }
    : null
  addLegend(sheet, headerRow - 1)

  styleHeader(sheet, headerRow, ['#', 'Resolved criterion', 'P (kN)', 'M (kN·m)'], 1)
  styleHeader(sheet, headerRow, block.labels, 5)
  ;[...sources.values()].forEach((source, index) => {
    source.row = firstDataRow + index
    context.writeSourceCalculationRow(sheet, source.row, source, block)
  })
  mainRows.forEach((row, index) => {
    const excelRow = firstDataRow + index
    const source = sources.get(row.sourceKey)!
    sheet.getCell(excelRow, 1).value = row.index
    sheet.getCell(excelRow, 2).value = row.criterion
    setFormula(sheet.getCell(excelRow, 3), `=$${col(block.at('fP'))}$${source.row}`, kn(row.engineP), '#,##0.0')
    setFormula(
      sheet.getCell(excelRow, 4),
      `=$${col(block.at('fMx'))}$${source.row}*COS(RADIANS(${projectionRef}))+$${col(block.at('fMy'))}$${source.row}*SIN(RADIANS(${projectionRef}))`,
      knm(row.engineM),
      '#,##0.00'
    )
  })
  sheet.columns = [8, 32, 16, 16, ...block.widths].map((width) => ({ width }))
  for (let column = block.hiddenFirst; column <= block.hiddenLast; column++) {
    sheet.getColumn(column).hidden = true
  }
  sheet.autoFilter = `A${headerRow}:D${headerRow + mainRows.length}`
  zebraResultRows(sheet, headerRow, mainRows.length, 4)
  freezeUnder(sheet, headerRow)

  const lastRow = firstDataRow + Math.max(mainRows.length, sources.size) - 1
  const chart: SheetChart | null = mainRows.length < 2 ? null : {
    sheet: sheet.name,
    title: `P–M meridian at β = ${selected.betaDeg.toFixed(2)}°`,
    xTitle: 'M (kN·m)',
    yTitle: 'P (kN)',
    anchor: { column: 0, row: lastRow + 2 },
    widthPx: 620,
    heightPx: 420,
    series: [
      {
        x: {
          name: context.resistanceStage === 'design' ? 'Design' : 'Nominal',
          ref: `$D$${firstDataRow}:$D$${firstDataRow + mainRows.length - 1}`,
          values: mainRows.map((row) => knm(row.engineM))
        },
        y: {
          name: 'P',
          ref: `$C$${firstDataRow}:$C$${firstDataRow + mainRows.length - 1}`,
          values: mainRows.map((row) => kn(row.engineP))
        },
        color: '1D4ED8',
        line: 'solid',
        marker: 'circle'
      },
      ...(demandCells && options.demand
        ? [{
            x: { name: options.demand.label, ref: demandCells.x, values: [options.demand.x] },
            y: { name: options.demand.yLabel, ref: demandCells.y, values: [options.demand.y] },
            color: 'B91C1C',
            line: 'none' as const,
            marker: 'diamond' as const,
            markerSize: 8
          }]
        : [])
    ]
  }
  return { rows: mainRows.length, betaDeg: selected.betaDeg, chart }
}

export type FixedPAuditSheetOptions = {
  lower: import('exceljs').Worksheet
  upper: import('exceljs').Worksheet
  result: import('exceljs').Worksheet
  /** Axial level of the cut, N. */
  fixedP: number
  /** Workbook-unique defined name for the selected axial level. */
  selectedPName: string
  titleText?: string
  lowerTitleText?: string
  upperTitleText?: string
  contextRows?: ReadonlyArray<readonly [string, string | number]>
  /** Load point (Mux, Muy) at this axial force; plotted on the contour chart. */
  demand?: DemandMarker | null
}

/**
 * Result-sheet columns.
 *
 * The direction ID is gone: it was `fixedP-b23.400-branch1`, a string the program used to key its
 * own rows, and every part of it that means anything to a reader is already in the β and Branch
 * columns beside it. The bracket sheets lost it for the same reason, and lost their duplicate
 * strain-β column too — the contour direction that identifies the row is the angle the source
 * formulas now read.
 */
const FIXED_P_COLUMNS = {
  index: 1,
  angle: 2,
  branch: 3,
  lowerCriterion: 4,
  lowerValue: 5,
  lowerP: 6,
  upperCriterion: 7,
  upperValue: 8,
  upperP: 9,
  selectedP: 10,
  ratio: 11,
  status: 12,
  mx: 13,
  my: 14,
  engineMx: 15,
  engineMy: 16,
  deltaM: 17
} as const

/** Column 1 is the contour direction on a bracket sheet, and the source block reads it. */
const BRACKET_ANGLE_COLUMN = 1
const BRACKET_BRANCH_COLUMN = 2
const BRACKET_BLOCK_START = 3

/**
 * The fixed-P Mx-My contour: the station bracketing P from below, the one from above, and the
 * interpolation between them. Three sheets rather than one because the interpolation is only
 * checkable when both ends of it are published as full calculations.
 */
export const writeFixedPAuditSheets = (context: AuditContext, options: FixedPAuditSheetOptions) => {
  const { lower: fixedPLower, upper: fixedPUpper, result } = options
  const dataset = selectedDataset(context.surface, context.resistanceStage)
  const descriptors = new Map(dataset.stations.map((station) => [station.id, station.definition] as const))
  const { sources, sourceFor } = context.createSourceCollector()
  const mainRows: FixedPResultRow[] = []
  const samples = contourStrainAngleSamples(
    sliceFixedPContour(dataset.points, options.fixedP, dataset.triangles)
  )
  const branchesByAngle = new Map<string, number>()
  samples.forEach((sample, index) => {
    const angleDeg = normalizeAngleDeg(sample.beta * 180 / Math.PI)
    const bracket = bracketForContourPoint(context.surface, context.resistanceStage, options.fixedP, sample)
    if (!bracket) {
      throw new Error(`Fixed-P audit could not bracket P at β=${angleDeg.toFixed(6)}°.`)
    }
    const angleKey = angleDeg.toFixed(6)
    const branch = (branchesByAngle.get(angleKey) ?? 0) + 1
    branchesByAngle.set(angleKey, branch)
    const lower = sourceFor(
      bracket.below,
      `P below — ${bracket.below.stationId ?? 'resolved station'}`,
      angleDeg,
      bracket.below.stationId ? descriptors.get(bracket.below.stationId) ?? null : null
    )
    const upper = sourceFor(
      bracket.above,
      `P above — ${bracket.above.stationId ?? 'resolved station'}`,
      angleDeg,
      bracket.above.stationId ? descriptors.get(bracket.above.stationId) ?? null : null
    )
    mainRows.push({
      kind: 'fixedP',
      index: index + 1,
      branch,
      angleDeg,
      lowerKey: lower.key,
      upperKey: upper.key,
      engineMx: sample.Mx,
      engineMy: sample.My
    })
  })

  const lastResultColumn = FIXED_P_COLUMNS.deltaM
  reportTitle(result, options.titleText ?? 'FORMULA-DRIVEN CHART AUDIT', lastResultColumn)
  result.getCell('B2').value =
    'One result row is interpolated from the matching P-below and P-above rows. β and Branch identify the row and preserve every distinct Pmax point; calculation mode on the bracket sheets distinguishes strain formulas from geometric or block ledger anchors.'
  result.getCell('A2').font = { italic: true, color: { argb: NOTE_COLOR } }
  result.mergeCells(2, 1, 2, lastResultColumn)
  result.getRow(2).height = 24

  const block = sourceBlock(
    BRACKET_BLOCK_START,
    (row) => `${col(BRACKET_ANGLE_COLUMN)}${row}`
  )
  const callerContext = options.contextRows ?? []
  const resultIdentity: IdentityEntry[] = [
    { label: 'Chart source', value: 'Fixed-P' },
    { label: 'Resistance stage', value: context.resistanceStage },
    { label: 'Selected P (kN)', value: kn(options.fixedP), role: 'input', numFmt: '#,##0.000' },
    ...callerContext.map(([label, value]) => ({ label, value })),
    ...(options.demand
      ? [
          { label: options.demand.xLabel, value: options.demand.x, role: 'input' as const, numFmt: '#,##0.000' },
          { label: options.demand.yLabel, value: options.demand.y, role: 'input' as const, numFmt: '#,##0.000' }
        ]
      : [])
  ]
  const bracketIdentity = (role: string): IdentityEntry[] => [
    { label: 'Chart source', value: 'Fixed-P bracket' },
    { label: 'Resistance stage', value: context.resistanceStage },
    { label: 'Selected P (kN)', value: kn(options.fixedP), numFmt: '#,##0.000' },
    { label: 'Bracket role', value: role },
    ...callerContext.map(([label, value]) => ({ label, value }))
  ]
  /**
   * One header row for all three sheets.
   *
   * The result sheet reads each bracket station out of the same row number on its own sheet, so the
   * three tables have to start together however many head rows any one of them needs.
   */
  const identityRows = Math.max(resultIdentity.length, bracketIdentity('').length)
  const headerRow = headerRowFor(identityRows)
  const firstDataRow = headerRow + 1
  const identityRef = (index: number) => `$${col(IDENTITY_VALUE_COLUMN)}$${IDENTITY_FIRST_ROW + index}`

  result.getCell('A2').value =
    'One result row is interpolated from the matching P-below and P-above rows. β and Branch identify the row and preserve every distinct Pmax point; calculation mode on the bracket sheets distinguishes strain formulas from geometric or block ledger anchors.'
  const resultCells = writeIdentityBlock(result, resultIdentity)
  context.defineName(`'${result.name}'!${identityRef(2)}`, options.selectedPName)
  const demandCells = options.demand
    ? { x: resultCells[resultCells.length - 2], y: resultCells[resultCells.length - 1] }
    : null
  addLegend(result, headerRow - 1)

  const setupBracketSheet = (
    sheet: import('exceljs').Worksheet,
    title: string,
    role: string
  ) => {
    reportTitle(sheet, title, block.at('fMy'))
    sheet.getCell('A2').value =
      'Each row is one direction-specific bracket station, identified by the contour direction β in column A — the same angle the strain formulas on this row read. Physical stress-strain rows use Materials/Mesh formulas; geometric axial-cap and equivalent-block rows are explicitly labelled ledger anchors.'
    sheet.getCell('A2').font = { italic: true, color: { argb: NOTE_COLOR } }
    sheet.mergeCells(2, 1, 2, block.at('fMy'))
    sheet.getRow(2).height = 24
    writeIdentityBlock(sheet, bracketIdentity(role))
    // The selected P is the result sheet's own cell, so editing it there moves both brackets.
    setFormula(sheet.getCell(IDENTITY_FIRST_ROW + 2, IDENTITY_VALUE_COLUMN), `=${options.selectedPName}`, kn(options.fixedP), '#,##0.000')
    addLegend(sheet, headerRow - 1)
    styleHeader(sheet, headerRow, ['β (deg)', 'Branch', ...block.labels], 1)
    sheet.columns = [14, 10, ...block.widths].map((width) => ({ width }))
    for (let column = block.hiddenFirst; column <= block.hiddenLast; column++) {
      sheet.getColumn(column).hidden = true
    }
    sheet.autoFilter = `A${headerRow}:${col(block.at('fMy'))}${headerRow + mainRows.length}`
    freezeUnder(sheet, headerRow, BRACKET_BRANCH_COLUMN)
  }
  setupBracketSheet(fixedPLower, options.lowerTitleText ?? 'FIXED-P LOWER BRACKETING STATIONS', 'P below or exact')
  setupBracketSheet(fixedPUpper, options.upperTitleText ?? 'FIXED-P UPPER BRACKETING STATIONS', 'P above or exact')

  const resultHeaders = [
    '#', 'β (deg)', 'Branch',
    'Lower criterion', 'Lower value', 'P lower (kN)',
    'Upper criterion', 'Upper value', 'P upper (kN)',
    'Selected P (kN)', 'Ratio t', 'Status', 'Mx (kN·m)', 'My (kN·m)',
    'Engine Mx', 'Engine My', 'ΔM'
  ]
  styleHeader(result, headerRow, resultHeaders, 1)
  const lowerName = fixedPLower.name
  const upperName = fixedPUpper.name
  const sheetFormula = (sheetName: string, column: number, row: number) =>
    `='${sheetName}'!$${col(column)}$${row}`
  const at = (column: number, row: number) => `${col(column)}${row}`

  mainRows.forEach((row, index) => {
    const excelRow = firstDataRow + index
    const lower = sources.get(row.lowerKey)!
    const upper = sources.get(row.upperKey)!
    for (const [sheet, source, label] of [
      [fixedPLower, lower, `P below — ${lower.point.stationId ?? 'resolved station'}`],
      [fixedPUpper, upper, `P above — ${upper.point.stationId ?? 'resolved station'}`]
    ] as const) {
      sheet.getCell(excelRow, BRACKET_ANGLE_COLUMN).value = row.angleDeg
      sheet.getCell(excelRow, BRACKET_ANGLE_COLUMN).numFmt = '0.000'
      sheet.getCell(excelRow, BRACKET_BRANCH_COLUMN).value = row.branch
      styleInput(sheet.getCell(excelRow, BRACKET_ANGLE_COLUMN))
      styleGenerated(sheet.getCell(excelRow, BRACKET_BRANCH_COLUMN))
      context.writeSourceCalculationRow(sheet, excelRow, source, block, label)
    }

    const lowerP = kn(lower.point.P)
    const upperP = kn(upper.point.P)
    const selectedP = kn(options.fixedP)
    const exact = Math.abs(upperP - lowerP) < 1e-12
    const ratio = exact ? 0 : (selectedP - lowerP) / (upperP - lowerP)
    const status = exact ? 'Exact station' : 'Interpolated'
    const lowerPRef = at(FIXED_P_COLUMNS.lowerP, excelRow)
    const upperPRef = at(FIXED_P_COLUMNS.upperP, excelRow)
    const selectedPRef = at(FIXED_P_COLUMNS.selectedP, excelRow)
    const ratioRef = at(FIXED_P_COLUMNS.ratio, excelRow)
    result.getCell(excelRow, FIXED_P_COLUMNS.index).value = row.index
    result.getCell(excelRow, FIXED_P_COLUMNS.angle).value = row.angleDeg
    result.getCell(excelRow, FIXED_P_COLUMNS.angle).numFmt = '0.000'
    result.getCell(excelRow, FIXED_P_COLUMNS.branch).value = row.branch
    for (const column of [FIXED_P_COLUMNS.index, FIXED_P_COLUMNS.angle, FIXED_P_COLUMNS.branch]) {
      styleGenerated(result.getCell(excelRow, column))
    }
    setFormula(result.getCell(excelRow, FIXED_P_COLUMNS.lowerCriterion), sheetFormula(lowerName, block.at('criterionBasis'), excelRow), lower.criterion.basisLabel, '@')
    setFormula(result.getCell(excelRow, FIXED_P_COLUMNS.lowerValue), sheetFormula(lowerName, block.at('criterionValue'), excelRow), lower.criterion.value, '0.000000')
    setFormula(result.getCell(excelRow, FIXED_P_COLUMNS.lowerP), sheetFormula(lowerName, block.at('fP'), excelRow), lowerP, '#,##0.0')
    setFormula(result.getCell(excelRow, FIXED_P_COLUMNS.upperCriterion), sheetFormula(upperName, block.at('criterionBasis'), excelRow), upper.criterion.basisLabel, '@')
    setFormula(result.getCell(excelRow, FIXED_P_COLUMNS.upperValue), sheetFormula(upperName, block.at('criterionValue'), excelRow), upper.criterion.value, '0.000000')
    setFormula(result.getCell(excelRow, FIXED_P_COLUMNS.upperP), sheetFormula(upperName, block.at('fP'), excelRow), upperP, '#,##0.0')
    setFormula(result.getCell(excelRow, FIXED_P_COLUMNS.selectedP), `=${options.selectedPName}`, selectedP, '#,##0.0')
    setFormula(
      result.getCell(excelRow, FIXED_P_COLUMNS.ratio),
      `=IF(ABS(${upperPRef}-${lowerPRef})<0.000000001,0,(${selectedPRef}-${lowerPRef})/(${upperPRef}-${lowerPRef}))`,
      ratio,
      '0.000000'
    )
    setFormula(
      result.getCell(excelRow, FIXED_P_COLUMNS.status),
      `=IF(ABS(${upperPRef}-${lowerPRef})<0.000000001,"Exact station",IF(AND(${selectedPRef}>=${lowerPRef}-0.000001,${selectedPRef}<=${upperPRef}+0.000001),"Interpolated","Outside range"))`,
      status,
      '@'
    )
    for (const [column, field, value] of [
      [FIXED_P_COLUMNS.mx, block.at('fMx'), row.engineMx],
      [FIXED_P_COLUMNS.my, block.at('fMy'), row.engineMy]
    ] as const) {
      setFormula(
        result.getCell(excelRow, column),
        `='${lowerName}'!$${col(field)}$${excelRow}+${ratioRef}*('${upperName}'!$${col(field)}$${excelRow}-'${lowerName}'!$${col(field)}$${excelRow})`,
        knm(value),
        '#,##0.00'
      )
    }
    result.getCell(excelRow, FIXED_P_COLUMNS.engineMx).value = knm(row.engineMx)
    result.getCell(excelRow, FIXED_P_COLUMNS.engineMy).value = knm(row.engineMy)
    styleGenerated(result.getCell(excelRow, FIXED_P_COLUMNS.engineMx))
    styleGenerated(result.getCell(excelRow, FIXED_P_COLUMNS.engineMy))
    setFormula(
      result.getCell(excelRow, FIXED_P_COLUMNS.deltaM),
      `=SQRT((${at(FIXED_P_COLUMNS.mx, excelRow)}-${at(FIXED_P_COLUMNS.engineMx, excelRow)})^2+` +
        `(${at(FIXED_P_COLUMNS.my, excelRow)}-${at(FIXED_P_COLUMNS.engineMy, excelRow)})^2)`,
      0,
      '0.000000'
    )
  })
  result.columns = [8, 12, 10, 30, 14, 16, 30, 14, 16, 16, 13, 18, 16, 16, 16, 16, 14]
    .map((width) => ({ width }))
  for (let column = FIXED_P_COLUMNS.engineMx; column <= FIXED_P_COLUMNS.deltaM; column++) {
    result.getColumn(column).hidden = true
  }
  if (mainRows.length > 0) {
    result.autoFilter = `A${headerRow}:${col(FIXED_P_COLUMNS.my)}${headerRow + mainRows.length}`
  } else {
    // An empty cut is a result: the selected axial force is outside what this surface reaches.
    // Saying so beats three sheets of bare headers that read like a failed export.
    const message = result.getCell(firstDataRow, 1)
    message.value = `The ${context.resistanceStage} surface has no intersection at P = ${kn(options.fixedP).toFixed(1)} kN, so this contour has no points. Compare the selected P with the axial bounds of the surface.`
    message.font = { italic: true, color: { argb: NOTE_COLOR } }
    message.alignment = { wrapText: true, vertical: 'top' }
    result.mergeCells(firstDataRow, 1, firstDataRow, FIXED_P_COLUMNS.my)
    result.getRow(firstDataRow).height = 28
  }
  zebraResultRows(result, headerRow, mainRows.length, FIXED_P_COLUMNS.my)
  freezeUnder(result, headerRow)

  const chart: SheetChart | null = mainRows.length < 3 ? null : {
    sheet: result.name,
    title: `Mx–My contour at P = ${kn(options.fixedP).toFixed(1)} kN`,
    xTitle: 'Mx (kN·m)',
    yTitle: 'My (kN·m)',
    anchor: { column: 0, row: firstDataRow + mainRows.length + 1 },
    widthPx: 560,
    heightPx: 520,
    series: [
      {
        x: {
          name: context.resistanceStage === 'design' ? 'Design contour' : 'Nominal contour',
          ref: `$${col(FIXED_P_COLUMNS.mx)}$${firstDataRow}:$${col(FIXED_P_COLUMNS.mx)}$${firstDataRow + mainRows.length - 1}`,
          values: mainRows.map((row) => knm(row.engineMx))
        },
        y: {
          name: 'My',
          ref: `$${col(FIXED_P_COLUMNS.my)}$${firstDataRow}:$${col(FIXED_P_COLUMNS.my)}$${firstDataRow + mainRows.length - 1}`,
          values: mainRows.map((row) => knm(row.engineMy))
        },
        color: '1D4ED8',
        line: 'solid',
        marker: 'none'
      },
      ...(demandCells && options.demand
        ? [{
            x: { name: options.demand.label, ref: demandCells.x, values: [options.demand.x] },
            y: { name: options.demand.yLabel, ref: demandCells.y, values: [options.demand.y] },
            color: 'B91C1C',
            line: 'none' as const,
            marker: 'diamond' as const,
            markerSize: 8
          }]
        : [])
    ]
  }
  return { rows: mainRows.length, chart }
}

/**
 * Sheets plus the charts that belong on them.
 *
 * Charts are not part of the exceljs workbook — they are written into the finished package — so a
 * caller that wants them has to carry the specs alongside. `buildChartAuditWorkbook` keeps the
 * plain-workbook shape for callers that only inspect cells.
 */
export const buildChartAuditWorkbookParts = async (input: ChartAuditWorkbookInput) => {
  const workbook = await createWorkbook()
  const defineName = createDefineName(workbook)
  const context = prepareAuditContext(workbook, defineName, input)
  const charts: SheetChart[] = []

  if (input.source === 'vertical') {
    const result = hideGridLines(workbook.addWorksheet('Result', { properties: { tabColor: { argb: 'FFEA580C' } } }))
    const written = writeVerticalAuditSheet(context, {
      sheet: result,
      sliceAngleDeg: input.sliceAngleDeg,
      exactDirectionCurve: input.exactDirectionCurve
    })
    if (written.chart) charts.push(written.chart)
  } else {
    const lower = hideGridLines(workbook.addWorksheet('FixedP_Lower', { properties: { tabColor: { argb: 'FF2563EB' } } }))
    const upper = hideGridLines(workbook.addWorksheet('FixedP_Upper', { properties: { tabColor: { argb: 'FF7C3AED' } } }))
    const result = hideGridLines(workbook.addWorksheet('Result', { properties: { tabColor: { argb: 'FFEA580C' } } }))
    const written = writeFixedPAuditSheets(context, {
      lower,
      upper,
      result,
      fixedP: input.fixedP,
      selectedPName: 'Selected_P'
    })
    if (written.chart) charts.push(written.chart)
  }

  workbook.calcProperties.fullCalcOnLoad = true
  return { workbook, charts }
}

export const buildChartAuditWorkbook = async (input: ChartAuditWorkbookInput) =>
  (await buildChartAuditWorkbookParts(input)).workbook

export const buildChartAuditWorkbookBytes = async (input: ChartAuditWorkbookInput): Promise<Uint8Array> => {
  const { workbook, charts } = await buildChartAuditWorkbookParts(input)
  const buffer = await workbook.xlsx.writeBuffer()
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer as ArrayBuffer)
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return injectSheetCharts(copy, charts)
}
