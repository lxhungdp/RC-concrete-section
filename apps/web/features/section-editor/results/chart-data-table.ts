import {
  sliceFixedPContour,
  type PreviewSurface,
  type PreviewSurfacePoint,
  type Resultant,
  type ResultantLedger
} from '@pm/analysis'

export type ChartTableSource = 'vertical' | 'fixedP'

export type ChartTableForces = {
  /** Axial force, N. */
  P: number
  /** Moment used in the table, N·mm (in-plane M for Vertical; |M| for Fixed-P). */
  M: number
}

export type ChartTableStageForces = {
  total: ChartTableForces
  concrete: ChartTableForces
  steel: ChartTableForces
}

export type ChartTableRow = {
  key: string
  index: number
  criterion: string
  design: ChartTableStageForces | null
  nominal: ChartTableStageForces | null
}

const kn = (value: number) => value / 1000
const knm = (value: number) => value / 1_000_000

const normalizeAngleDeg = (degrees: number) => ((degrees % 360) + 360) % 360

const stationCriterion = (surface: PreviewSurface, station: number) => {
  if (!Number.isFinite(station) || station < 0) return '—'
  const index = Math.round(station)
  return surface.stations[index]?.label ?? `P${index}`
}

const groupByBeta = (points: PreviewSurfacePoint[]) => {
  const groups = new Map<number, PreviewSurfacePoint[]>()
  for (const point of points) {
    if (point.station < 0) continue
    groups.set(point.beta, [...(groups.get(point.beta) ?? []), point])
  }
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([beta, curve]) => ({
      beta,
      curve: curve.slice().sort((a, b) => a.station - b.station)
    }))
}

const nearestBetaCurve = (points: PreviewSurfacePoint[], angleDeg: number) => {
  const rows = groupByBeta(points)
  if (rows.length === 0) return null
  const target = (normalizeAngleDeg(angleDeg) * Math.PI) / 180
  let best = rows[0]!
  for (let i = 1; i < rows.length; i++) {
    const current = rows[i]!
    const delta = Math.abs(current.beta - target)
    const wrap = Math.min(delta, Math.abs(delta - 2 * Math.PI))
    const bestDelta = Math.abs(best.beta - target)
    const bestWrap = Math.min(bestDelta, Math.abs(bestDelta - 2 * Math.PI))
    if (wrap < bestWrap) best = current
  }
  return best
}

const momentAlong = (point: Pick<Resultant, 'Mx' | 'My'>, angleDeg: number) => {
  const theta = (normalizeAngleDeg(angleDeg) * Math.PI) / 180
  return point.Mx * Math.cos(theta) + point.My * Math.sin(theta)
}

const momentMagnitude = (point: Pick<Resultant, 'Mx' | 'My'>) => Math.hypot(point.Mx, point.My)

const forcesFromLedger = (
  ledger: ResultantLedger,
  momentOf: (part: Resultant) => number
): ChartTableStageForces => ({
  total: { P: ledger.total.P, M: momentOf(ledger.total) },
  concrete: { P: ledger.concrete.P, M: momentOf(ledger.concrete) },
  steel: { P: ledger.steel.P, M: momentOf(ledger.steel) }
})

const nearestVertex = (
  points: PreviewSurfacePoint[],
  beta: number,
  station: number | undefined,
  Mx: number,
  My: number
) => {
  if (points.length === 0) return null
  if (station != null && Number.isFinite(station) && station >= 0) {
    const rounded = Math.round(station)
    let best: PreviewSurfacePoint | null = null
    let bestDist = Number.POSITIVE_INFINITY
    for (const point of points) {
      if (point.station !== rounded) continue
      const dBeta = Math.abs(point.beta - beta)
      const wrap = Math.min(dBeta, Math.abs(dBeta - 2 * Math.PI))
      if (wrap < bestDist) {
        best = point
        bestDist = wrap
      }
    }
    if (best) return best
  }
  let best = points[0]!
  let bestDist = Number.POSITIVE_INFINITY
  for (const point of points) {
    const dist = Math.hypot(point.Mx - Mx, point.My - My) + 0.25 * Math.abs(point.P)
    if (dist < bestDist) {
      best = point
      bestDist = dist
    }
  }
  return best
}

type DraftRow = {
  key: string
  sort: number
  criterion: string
  design: ChartTableStageForces | null
  nominal: ChartTableStageForces | null
}

const collectVertical = (
  surface: PreviewSurface,
  points: PreviewSurfacePoint[],
  angleDeg: number,
  includeOpposite: boolean,
  stage: 'design' | 'nominal',
  drafts: Map<string, DraftRow>
) => {
  const primary = nearestBetaCurve(points, angleDeg)
  if (!primary) return
  const curves = [primary]
  if (includeOpposite) {
    const opposite = nearestBetaCurve(points, angleDeg + 180)
    if (opposite && Math.abs(opposite.beta - primary.beta) > 1e-9) curves.push(opposite)
  }
  const momentOf = (part: Resultant) => momentAlong(part, angleDeg)
  for (const [curveIndex, curve] of curves.entries()) {
    for (const point of curve.curve) {
      const key = `vertical-${curveIndex}-${point.station}`
      const forces = forcesFromLedger(point.ledger, momentOf)
      const existing = drafts.get(key)
      if (existing) {
        if (stage === 'design') existing.design = forces
        else existing.nominal = forces
        continue
      }
      drafts.set(key, {
        key,
        sort: curveIndex * 1000 + point.station,
        criterion: stationCriterion(surface, point.station),
        design: stage === 'design' ? forces : null,
        nominal: stage === 'nominal' ? forces : null
      })
    }
  }
}

const collectFixedP = (
  surface: PreviewSurface,
  points: PreviewSurfacePoint[],
  fixedP: number,
  triangles: PreviewSurface['triangles'] | PreviewSurface['nominalTriangles'],
  stage: 'design' | 'nominal',
  drafts: Map<string, DraftRow>
) => {
  const contour = sliceFixedPContour(points, fixedP, triangles)
  for (const [offset, point] of contour.entries()) {
    const vertex = nearestVertex(points, point.beta, point.station, point.Mx, point.My)
    const betaDeg = normalizeAngleDeg((point.beta * 180) / Math.PI)
    const key =
      point.station != null && point.station >= 0
        ? `fixedP-s${Math.round(point.station)}-b${betaDeg.toFixed(1)}`
        : `fixedP-${offset}`
    const forces = vertex
      ? forcesFromLedger(vertex.ledger, momentMagnitude)
      : {
          total: { P: point.P, M: Math.hypot(point.Mx, point.My) },
          concrete: { P: Number.NaN, M: Number.NaN },
          steel: { P: Number.NaN, M: Number.NaN }
        }
    const criterion =
      point.station != null && point.station >= 0
        ? stationCriterion(surface, point.station)
        : `β ${betaDeg.toFixed(0)}°`
    const existing = drafts.get(key)
    if (existing) {
      if (stage === 'design') existing.design = forces
      else existing.nominal = forces
      continue
    }
    drafts.set(key, {
      key,
      sort: offset,
      criterion,
      design: stage === 'design' ? forces : null,
      nominal: stage === 'nominal' ? forces : null
    })
  }
}

export const buildChartTableRows = (input: {
  surface: PreviewSurface | null
  source: ChartTableSource
  includeDesign: boolean
  includeNominal: boolean
  sliceAngleDeg: number
  includeOpposite: boolean
  fixedP: number
}): ChartTableRow[] => {
  const { surface } = input
  if (!surface) return []
  if (!input.includeDesign && !input.includeNominal) return []

  const drafts = new Map<string, DraftRow>()
  if (input.source === 'vertical') {
    if (input.includeDesign) {
      collectVertical(
        surface,
        surface.points,
        input.sliceAngleDeg,
        input.includeOpposite,
        'design',
        drafts
      )
    }
    if (input.includeNominal) {
      collectVertical(
        surface,
        surface.nominalPoints,
        input.sliceAngleDeg,
        input.includeOpposite,
        'nominal',
        drafts
      )
    }
  } else {
    if (input.includeDesign) {
      collectFixedP(surface, surface.points, input.fixedP, surface.triangles, 'design', drafts)
    }
    if (input.includeNominal) {
      collectFixedP(
        surface,
        surface.nominalPoints,
        input.fixedP,
        surface.nominalTriangles,
        'nominal',
        drafts
      )
    }
  }

  return [...drafts.values()]
    .sort((a, b) => a.sort - b.sort)
    .map((row, index) => ({
      key: row.key,
      index: index + 1,
      criterion: row.criterion,
      design: input.includeDesign ? row.design : null,
      nominal: input.includeNominal ? row.nominal : null
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
  const sheet = workbook.addWorksheet(input.source === 'vertical' ? 'Vertical slice' : 'Fixed-P')

  const headers = ['#', 'Criterion']
  const pushStage = (prefix: string) => {
    headers.push(
      `${prefix} P`,
      `${prefix} M`,
      `${prefix} Pc`,
      `${prefix} Mc`,
      `${prefix} Ps`,
      `${prefix} Ms`
    )
  }
  if (input.includeDesign) pushStage('Mr')
  if (input.includeNominal) pushStage('Mn')
  sheet.addRow(headers)

  for (const row of input.rows) {
    const values: Array<string | number> = [row.index, row.criterion]
    const pushForces = (stage: ChartTableStageForces | null) => {
      if (!stage) {
        values.push('', '', '', '', '', '')
        return
      }
      values.push(
        numOrBlank(formatChartTableForce(stage.total.P), 3),
        numOrBlank(formatChartTableMoment(stage.total.M), 3),
        numOrBlank(formatChartTableForce(stage.concrete.P), 3),
        numOrBlank(formatChartTableMoment(stage.concrete.M), 3),
        numOrBlank(formatChartTableForce(stage.steel.P), 3),
        numOrBlank(formatChartTableMoment(stage.steel.M), 3)
      )
    }
    if (input.includeDesign) pushForces(row.design)
    if (input.includeNominal) pushForces(row.nominal)
    sheet.addRow(values)
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
