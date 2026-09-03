import {
  activeDesignDirectionPoints,
  activeDesignSurfaceDataset,
  activeNominalDirectionPoints,
  activeNominalSurfaceDataset,
  buildDirectMeridianSection,
  stationDefinitionLabel,
  traceFixedPContourSamples,
  type ExactDirectionCurve,
  type FixedPInterpolationBracket,
  type PreviewContourPoint,
  type PreviewSurface,
  type PreviewSurfacePoint,
  type Resultant,
  type ResultantLedger,
  type SurfaceStation
} from '@pm/analysis'
import type {
  CalculationTraceAuditWorkbookInput,
  ChartAuditWorkbookInput,
  ConcretePointAuditWorkbookInput
} from '@pm/report'
import {
  exportCalculationTraceAuditWorkbookAsync,
  exportChartAuditWorkbookAsync,
  exportConcretePointAuditWorkbookAsync
} from '../../../application/analysis/client'

export type ChartTableSource = 'vertical' | 'fixedP'
export type ChartTableResistanceStage = 'design' | 'nominal'

export type ChartTableForces = {
  /** Axial force, N. */
  P: number
  /** Moment projected on the direct vertical meridian, N·mm. */
  M: number
}

export type ChartTableStageForces = {
  total: ChartTableForces
  concrete: ChartTableForces
  steel: ChartTableForces
}

export type ChartTableMoments = {
  /** N·mm */
  Mx: number
  /** N·mm */
  My: number
}

export type ChartTableVerticalRow = {
  kind: 'vertical'
  key: string
  index: number
  criterion: string
  design: ChartTableStageForces | null
  nominal: ChartTableStageForces | null
  evidence: {
    stage: ChartTableResistanceStage
    angleDeg: number
    point: PreviewSurfacePoint
    station: SurfaceStation | null
  }
}

export type ChartTableFixedPRow = {
  kind: 'fixedP'
  key: string
  index: number
  directionId: string
  branch: number
  /** Sampled strain-plane direction β, degrees [0, 360) — same markers as the Fixed-P chart. */
  angleDeg: number
  design: ChartTableMoments | null
  nominal: ChartTableMoments | null
  evidence: {
    stage: ChartTableResistanceStage
    fixedP: number
    sample: PreviewContourPoint
    bracket: FixedPInterpolationBracket | null
    belowStation: SurfaceStation | null
    aboveStation: SurfaceStation | null
  }
}

export type ChartTableRow = ChartTableVerticalRow | ChartTableFixedPRow

/**
 * Keep the calculation inspector open when its table source or resistance stage changes. Selection
 * identity is semantic: a Vertical station key, or a Fixed-P direction/branch. Ordinal row numbers
 * are presentation only and must never select a different calculation when cap clipping changes the
 * row count. A source change deliberately starts at the first row of the new source.
 */
export const resolveChartTableRowSelection = (
  rows: readonly ChartTableRow[],
  current: ChartTableRow | null
): ChartTableRow | null => {
  if (rows.length === 0) return null
  if (!current) return rows[0] ?? null
  if (rows[0]?.kind !== current.kind) return rows[0] ?? null
  if (current.kind === 'vertical') {
    return rows.find((row) => row.kind === 'vertical' && row.key === current.key) ?? null
  }
  return rows.find((row) =>
    row.kind === 'fixedP'
    && row.directionId === current.directionId
    && row.branch === current.branch
  ) ?? null
}

const kn = (value: number) => value / 1000
const knm = (value: number) => value / 1_000_000

const normalizeAngleDeg = (degrees: number) => ((degrees % 360) + 360) % 360

const momentAlong = (point: Pick<Resultant, 'Mx' | 'My'>, angleDeg: number) => {
  const theta = (normalizeAngleDeg(angleDeg) * Math.PI) / 180
  return point.Mx * Math.cos(theta) + point.My * Math.sin(theta)
}

const forcesFromLedger = (
  ledger: ResultantLedger,
  momentOf: (part: Resultant) => number
): ChartTableStageForces => ({
  total: { P: ledger.total.P, M: momentOf(ledger.total) },
  concrete: { P: ledger.concrete.P, M: momentOf(ledger.concrete) },
  steel: { P: ledger.steel.P, M: momentOf(ledger.steel) }
})

type VerticalDraft = {
  kind: 'vertical'
  key: string
  sort: number
  criterion: string
  design: ChartTableStageForces | null
  nominal: ChartTableStageForces | null
  evidence: ChartTableVerticalRow['evidence']
}

type FixedPDraft = {
  kind: 'fixedP'
  key: string
  sort: number
  directionId: string
  branch: number
  angleDeg: number
  design: ChartTableMoments | null
  nominal: ChartTableMoments | null
  evidence: ChartTableFixedPRow['evidence']
}

const collectVertical = (
  points: PreviewSurfacePoint[],
  angleDeg: number,
  descriptors: SurfaceStation[],
  stage: ChartTableResistanceStage,
  drafts: Map<string, VerticalDraft>
) => {
  const primary = buildDirectMeridianSection(points, angleDeg, false).primary.filter((point) =>
    point.sectionPointRole === 'surface-vertex' && point.stationId !== null
  )
  const momentOf = (part: Resultant) => momentAlong(part, angleDeg)
  for (const point of primary) {
    const key = `vertical-${point.stationId}`
    const forces = forcesFromLedger(point.ledger, momentOf)
    const station = descriptors.find((descriptor) => descriptor.id === point.stationId) ?? null
    const evidence: ChartTableVerticalRow['evidence'] = { stage, angleDeg, point, station }
    const existing = drafts.get(key)
    if (existing) {
      if (stage === 'design') existing.design = forces
      else existing.nominal = forces
      existing.evidence = evidence
      continue
    }
    const stationLabel = stationDefinitionLabel(
      station?.definition ??
      { kind: 'block-adaptive', label: 'Adaptive midpoint' }
    )
    drafts.set(key, {
      kind: 'vertical',
      key,
      sort: point.station,
      criterion: stationLabel,
      design: stage === 'design' ? forces : null,
      nominal: stage === 'nominal' ? forces : null,
      evidence
    })
  }
}

const betaKey = (angleDeg: number) => `fixedP-b${angleDeg.toFixed(3)}`

/**
 * Fixed-P table rows follow the labelled fixed-meridian intersections. The drawn triangle-cut
 * contour may also contain unlabelled intermediate diagonal/cross-beta edge vertices, but no
 * adaptive station or direction enters this dataset.
 */
const collectFixedP = (
  points: PreviewSurfacePoint[],
  fixedP: number,
  triangles: PreviewSurface['triangles'] | PreviewSurface['nominalTriangles'],
  descriptors: SurfaceStation[],
  stage: ChartTableResistanceStage,
  drafts: Map<string, FixedPDraft>
) => {
  const samples = traceFixedPContourSamples(points, fixedP, triangles)
  const descriptorsById = new Map(descriptors.map((descriptor) => [descriptor.id, descriptor] as const))
  const branchesByAngle = new Map<string, number>()
  for (const [offset, trace] of samples.entries()) {
    const point = trace.point
    const angleDeg = normalizeAngleDeg((point.beta * 180) / Math.PI)
    const angleKey = angleDeg.toFixed(6)
    const branch = (branchesByAngle.get(angleKey) ?? 0) + 1
    branchesByAngle.set(angleKey, branch)
    const directionId = `${betaKey(angleDeg)}-branch${branch}`
    const key = `${stage}-${directionId}`
    const moments: ChartTableMoments = { Mx: point.Mx, My: point.My }
    const belowStation = trace.bracket?.below.stationId
      ? descriptorsById.get(trace.bracket.below.stationId) ?? null
      : null
    const aboveStation = trace.bracket?.above.stationId
      ? descriptorsById.get(trace.bracket.above.stationId) ?? null
      : null
    drafts.set(key, {
      kind: 'fixedP',
      key,
      sort: offset,
      directionId,
      branch,
      angleDeg,
      design: stage === 'design' ? moments : null,
      nominal: stage === 'nominal' ? moments : null,
      evidence: {
        stage,
        fixedP,
        sample: point,
        bracket: trace.bracket,
        belowStation,
        aboveStation
      }
    })
  }
}

export const buildChartTableRows = (input: {
  surface: PreviewSurface | null
  exactDirectionCurve?: ExactDirectionCurve | null
  source: ChartTableSource
  resistanceStage: ChartTableResistanceStage
  sliceAngleDeg: number
  fixedP: number
}): ChartTableRow[] => {
  const { surface } = input
  if (!surface) return []
  const designDataset = activeDesignSurfaceDataset(surface)
  const nominalDataset = activeNominalSurfaceDataset(surface)
  const includeDesign = input.resistanceStage === 'design'
  const includeNominal = input.resistanceStage === 'nominal'

  if (input.source === 'vertical') {
    const drafts = new Map<string, VerticalDraft>()
    if (input.exactDirectionCurve) {
      const angleDeg = input.exactDirectionCurve.beta * 180 / Math.PI
      if (includeDesign) {
        collectVertical(
          activeDesignDirectionPoints(input.exactDirectionCurve),
          angleDeg,
          input.exactDirectionCurve.stations,
          'design',
          drafts
        )
      }
      if (includeNominal) {
        collectVertical(
          activeNominalDirectionPoints(input.exactDirectionCurve),
          angleDeg,
          input.exactDirectionCurve.nominalStations ?? nominalDataset.stations,
          'nominal',
          drafts
        )
      }
      return [...drafts.values()]
        .sort((a, b) => a.sort - b.sort)
        .map((row, index) => ({
          kind: 'vertical' as const,
          key: row.key,
          index: index + 1,
          criterion: row.criterion,
          design: includeDesign ? row.design : null,
          nominal: includeNominal ? row.nominal : null,
          evidence: row.evidence
        }))
    }
    if (includeDesign) {
      collectVertical(
        designDataset.points,
        input.sliceAngleDeg,
        designDataset.stations,
        'design',
        drafts
      )
    }
    if (includeNominal) {
      collectVertical(
        nominalDataset.points,
        input.sliceAngleDeg,
        nominalDataset.stations,
        'nominal',
        drafts
      )
    }
    return [...drafts.values()]
      .sort((a, b) => a.sort - b.sort)
      .map((row, index) => ({
        kind: 'vertical' as const,
        key: row.key,
        index: index + 1,
        criterion: row.criterion,
        design: includeDesign ? row.design : null,
        nominal: includeNominal ? row.nominal : null,
        evidence: row.evidence
      }))
  }

  const drafts = new Map<string, FixedPDraft>()
  if (includeDesign) {
    collectFixedP(
      designDataset.points,
      input.fixedP,
      designDataset.triangles,
      designDataset.stations,
      'design',
      drafts
    )
  }
  if (includeNominal) {
    collectFixedP(
      nominalDataset.points,
      input.fixedP,
      nominalDataset.triangles,
      nominalDataset.stations,
      'nominal',
      drafts
    )
  }
  return [...drafts.values()]
    .sort((a, b) => a.sort - b.sort)
    .map((row, index) => ({
      kind: 'fixedP' as const,
      key: row.key,
      index: index + 1,
      directionId: row.directionId,
      branch: row.branch,
      angleDeg: row.angleDeg,
      design: includeDesign ? row.design : null,
      nominal: includeNominal ? row.nominal : null,
      evidence: row.evidence
    }))
}

export const formatChartTableForce = (valueN: number) => kn(valueN)
export const formatChartTableMoment = (valueNmm: number) => knm(valueNmm)

const numOrBlank = (value: number, digits: number) =>
  Number.isFinite(value) ? Number(value.toFixed(digits)) : ''

export const downloadChartTableExcel = async (input: {
  rows: ChartTableRow[]
  source: ChartTableSource
  includeDesign: boolean
  includeNominal: boolean
  fileName: string
}) => {
  const imported = await import('exceljs')
  const ExcelJS = ((imported as unknown as { default?: typeof imported }).default ?? imported) as typeof imported
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet(input.source === 'vertical' ? 'Vertical meridian' : 'Fixed-P')

  if (input.source === 'fixedP') {
    const headers = ['#', 'Direction ID', 'Branch', 'β (°)' ]
    if (input.includeDesign) headers.push('Mx', 'My')
    if (input.includeNominal) headers.push('Mnx', 'Mny')
    sheet.addRow(headers)

    for (const row of input.rows) {
      if (row.kind !== 'fixedP') continue
      const values: Array<string | number> = [
        row.index,
        row.directionId,
        row.branch,
        Number(row.angleDeg.toFixed(3))
      ]
      const pushMoments = (stage: ChartTableMoments | null) => {
        if (!stage) {
          values.push('', '')
          return
        }
        values.push(
          numOrBlank(formatChartTableMoment(stage.Mx), 3),
          numOrBlank(formatChartTableMoment(stage.My), 3)
        )
      }
      if (input.includeDesign) pushMoments(row.design)
      if (input.includeNominal) pushMoments(row.nominal)
      sheet.addRow(values)
    }
  } else {
    const headers = ['#', 'Criterion']
    if (input.includeDesign) headers.push('Mr P', 'Mr M')
    if (input.includeNominal) headers.push('Mn P', 'Mn M')
    sheet.addRow(headers)

    for (const row of input.rows) {
      if (row.kind !== 'vertical') continue
      const values: Array<string | number> = [row.index, row.criterion]
      const pushForces = (stage: ChartTableStageForces | null) => {
        if (!stage) {
          values.push('', '')
          return
        }
        values.push(
          numOrBlank(formatChartTableForce(stage.total.P), 3),
          numOrBlank(formatChartTableMoment(stage.total.M), 3)
        )
      }
      if (input.includeDesign) pushForces(row.design)
      if (input.includeNominal) pushForces(row.nominal)
      sheet.addRow(values)
    }
  }

  sheet.getRow(1).font = { bold: true }
  sheet.columns.forEach((column) => {
    column.width = 12
  })
  const buffer = await workbook.xlsx.writeBuffer()
  const bytes = buffer instanceof Uint8Array ? new Uint8Array(buffer) : new Uint8Array(buffer as ArrayBuffer)
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const blob = new Blob([copy.buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = input.fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

export const downloadChartAuditExcel = async (
  input: ChartAuditWorkbookInput & { fileName?: string }
) => {
  const blob = await exportChartAuditWorkbookAsync(input)
  const { chartAuditWorkbookFileName } = await import('@pm/report')
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = input.fileName ?? chartAuditWorkbookFileName(input)
  anchor.click()
  URL.revokeObjectURL(url)
}

export const downloadConcretePointAuditExcel = async (
  input: ConcretePointAuditWorkbookInput & { fileName?: string }
) => {
  const blob = await exportConcretePointAuditWorkbookAsync(input)
  const { concretePointAuditWorkbookFileName } = await import('@pm/report')
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = input.fileName ?? concretePointAuditWorkbookFileName(input)
  anchor.click()
  URL.revokeObjectURL(url)
}

export const downloadCalculationTraceAuditExcel = async (
  input: CalculationTraceAuditWorkbookInput & { fileName?: string }
) => {
  const blob = await exportCalculationTraceAuditWorkbookAsync(input)
  const { calculationTraceAuditWorkbookFileName } = await import('@pm/report')
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = input.fileName ?? calculationTraceAuditWorkbookFileName(input)
  anchor.click()
  URL.revokeObjectURL(url)
}
