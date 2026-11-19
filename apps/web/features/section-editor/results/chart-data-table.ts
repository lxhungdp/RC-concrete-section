import { fromCanonical, UNIT_PRESETS, type UnitSelection } from '@pm/units'
import {
  activeDesignSurfaceDataset,
  activeNominalSurfaceDataset,
  resultantMomentCoordinate,
  traceFixedPContourSamples,
  type FixedPInterpolationBracket,
  type LoadDirectionCurve,
  type LoadDirectionPoint,
  type PreviewContourPoint,
  type PointCalculationAudit,
  type PreviewSurface,
  type PreviewSurfacePoint,
  type Resultant,
  type SurfaceStation
} from '@pm/analysis'
import { loadDirectionSurfacePoints } from '@pm/results/load-direction'
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
export type ChartValueComponent = 'P' | 'M' | 'Mx' | 'My'

export type ChartTableForces = {
  /** Axial force, N. */
  P: number
  /** Resultant moment magnitude, N·mm; take the norm after assembling Mx and My. */
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
  /** Compact criterion for the table cell (a between-stations row is abbreviated). */
  criterion: string
  /** The full criterion, for the cell tooltip and exports. */
  criterionDetail: string
  /** Role of the curve point (station, between stations, pole or geometric). */
  pointRole: LoadDirectionPoint['role']
  /** Strain-gradient direction β of this point's own state, degrees [0, 360); null for geometric points. */
  betaDeg: number | null
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

const kn = (value: number) => fromCanonical('force', value, UNIT_PRESETS.metric)
const knm = (value: number) => fromCanonical('moment', value, UNIT_PRESETS.metric)

const normalizeAngleDeg = (degrees: number) => ((degrees % 360) + 360) % 360

/** Signed components remain unchanged. M selects the shared resultant-magnitude coordinate. */
export const chartResultantValue = (value: Resultant, component: ChartValueComponent, _angleDeg: number) =>
  component === 'M' ? resultantMomentCoordinate(value).M : value[component]

export const chartValueLabel = (component: ChartValueComponent, stage: ChartTableResistanceStage) => {
  if (component === 'Mx') return stage === 'design' ? 'Mrx' : 'Mnx'
  if (component === 'My') return stage === 'design' ? 'Mry' : 'Mny'
  return stage === 'design' ? component : `${component}n`
}

/** A mismatched source/component is unavailable rather than another value substituted by index. */
export const chartTableValue = (row: ChartTableRow, component: ChartValueComponent): number | null => {
  if (row.kind === 'vertical') {
    if (component !== 'P' && component !== 'M') return null
    return (row.evidence.stage === 'design' ? row.design : row.nominal)?.total[component] ?? null
  }
  if (component !== 'Mx' && component !== 'My') return null
  return (row.evidence.stage === 'design' ? row.design : row.nominal)?.[component] ?? null
}

/** Preview trace usability, never an engineering acceptance or release decision. */
export const isReconciledPointAudit = (audit: PointCalculationAudit | undefined): boolean => {
  if (!audit || audit.kind === 'unavailable' || !audit.reconciliation.ok) return false
  if (audit.kind === 'axial-cap') return !audit.preCap || isReconciledPointAudit(audit.preCap.audit)
  if (audit.resistanceFactor !== null && (audit.resistanceFactorCalculation?.factor !== audit.resistanceFactor)) return false
  return audit.nominalReferenceReconciliation.ok
}

const forcesFromPoint = (point: PreviewSurfacePoint): ChartTableStageForces => ({
  total: { P: point.P, M: resultantMomentCoordinate(point).M },
  concrete: { P: point.ledger.concrete.P, M: resultantMomentCoordinate(point.ledger.concrete).M },
  steel: { P: point.ledger.steel.P, M: resultantMomentCoordinate(point.ledger.steel).M }
})

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

/**
 * Compact label of a state between two stations that keeps its meaning in a narrow table cell:
 * one shared criterion symbol with the range of its values (`εₛ/εy 0.25→0.375`), or both labels when
 * the criteria differ (`c/D = 1 → εₛ/εy = 0`), followed by the fraction from the first station.
 */
export const betweenStationsShortLabel = (from: string, to: string, fraction: number) => {
  const split = (label: string) => /^(.+?)\s*=\s*(.+)$/u.exec(label)
  const a = split(from), b = split(to)
  const range = a && b && a[1] === b[1] ? `${a[1]} ${a[2]}→${b[2]}` : `${from} → ${to}`
  return `${range} · ${Number((100 * fraction).toFixed(1))}%`
}

export const buildChartTableRows = (input: {
  surface: PreviewSurface | null
  /** Capacity P–M at θ curve (engineering/05 §3); its points are the vertical rows. */
  capacityCurve?: LoadDirectionCurve | null
  source: ChartTableSource
  resistanceStage: ChartTableResistanceStage
  fixedP: number
}): ChartTableRow[] => {
  const { surface } = input
  if (!surface) return []
  const designDataset = activeDesignSurfaceDataset(surface)
  const nominalDataset = activeNominalSurfaceDataset(surface)
  const includeDesign = input.resistanceStage === 'design'
  const includeNominal = input.resistanceStage === 'nominal'

  if (input.source === 'vertical') {
    // One row per point of the curve, in curve order, each with its own β and station identity.
    const curve = input.capacityCurve
    if (!curve) return []
    const stage = input.resistanceStage
    const stations = (stage === 'design' ? designDataset : nominalDataset).stations
    const labelOf = (id: string) => stations.find((station) => station.id === id)?.label ?? id
    return loadDirectionSurfacePoints(curve, stage, stations, surface.mechanics).map((entry, index) => {
      const forces = forcesFromPoint(entry.point)
      const between = entry.source.between
      return {
        kind: 'vertical' as const,
        key: `vertical-${entry.source.stationId ?? entry.station?.id ?? entry.source.role}-${index}`,
        index: index + 1,
        criterion: between ? betweenStationsShortLabel(labelOf(between.from), labelOf(between.to), between.fraction) : entry.criterion,
        criterionDetail: entry.criterion,
        pointRole: entry.source.role,
        betaDeg: entry.beta === null ? null : normalizeAngleDeg(entry.beta * 180 / Math.PI),
        design: includeDesign ? forces : null,
        nominal: includeNominal ? forces : null,
        evidence: { stage, angleDeg: entry.beta === null ? curve.theta * 180 / Math.PI : entry.beta * 180 / Math.PI,
          point: entry.point, station: entry.station }
      }
    })
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

export const formatChartTableForce = (valueN: number, units: UnitSelection = UNIT_PRESETS.metric) => fromCanonical('force', valueN, units)
export const formatChartTableMoment = (valueNmm: number, units: UnitSelection = UNIT_PRESETS.metric) => fromCanonical('moment', valueNmm, units)

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
  const sheet = workbook.addWorksheet(input.source === 'vertical' ? 'P–M at θ' : 'Fixed-P')

  if (input.source === 'fixedP') {
    const headers = ['#', 'Direction ID', 'Branch', 'β (°)' ]
    if (input.includeDesign) headers.push('Mrx', 'Mry')
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
    const headers = ['#', 'Criterion', 'β (°)']
    if (input.includeDesign) headers.push('Mr P', 'Mr M')
    if (input.includeNominal) headers.push('Mn P', 'Mn M')
    sheet.addRow(headers)

    for (const row of input.rows) {
      if (row.kind !== 'vertical') continue
      const values: Array<string | number> = [row.index, row.criterionDetail, row.betaDeg === null ? '' : Number(row.betaDeg.toFixed(1))]
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
