import {
  contourStrainAngleSamples,
  sliceFixedPContour,
  stationDefinitionLabel,
  type PreviewSurface,
  type PreviewSurfacePoint,
  type Resultant,
  type ResultantLedger
} from '@pm/analysis'

export type ChartTableSource = 'vertical' | 'fixedP'

export type ChartTableForces = {
  /** Axial force, N. */
  P: number
  /** In-plane moment on the vertical slice, N·mm. */
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
}

export type ChartTableFixedPRow = {
  kind: 'fixedP'
  key: string
  index: number
  /** Sampled strain-plane direction β, degrees [0, 360) — same markers as the Fixed-P chart. */
  angleDeg: number
  design: ChartTableMoments | null
  nominal: ChartTableMoments | null
}

export type ChartTableRow = ChartTableVerticalRow | ChartTableFixedPRow

const kn = (value: number) => value / 1000
const knm = (value: number) => value / 1_000_000

const normalizeAngleDeg = (degrees: number) => ((degrees % 360) + 360) % 360

const stationCriterion = (surface: PreviewSurface, station: number) => {
  if (!Number.isFinite(station) || station < 0) return '—'
  const index = Math.round(station)
  const descriptor = surface.stations[index]
  if (!descriptor) return `P${index}`
  return stationDefinitionLabel(descriptor.definition)
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
}

type FixedPDraft = {
  kind: 'fixedP'
  key: string
  sort: number
  angleDeg: number
  design: ChartTableMoments | null
  nominal: ChartTableMoments | null
}

const collectVertical = (
  surface: PreviewSurface,
  points: PreviewSurfacePoint[],
  angleDeg: number,
  includeOpposite: boolean,
  stage: 'design' | 'nominal',
  drafts: Map<string, VerticalDraft>
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
        kind: 'vertical',
        key,
        sort: curveIndex * 1000 + point.station,
        criterion: stationCriterion(surface, point.station),
        design: stage === 'design' ? forces : null,
        nominal: stage === 'nominal' ? forces : null
      })
    }
  }
}

const betaKey = (angleDeg: number) => `fixedP-b${angleDeg.toFixed(3)}`

/**
 * Fixed-P table rows follow the labelled sampled/adaptive meridian intersections. The drawn
 * triangle-cut contour may also contain unlabelled intermediate diagonal/cross-beta edge vertices.
 */
const collectFixedP = (
  points: PreviewSurfacePoint[],
  fixedP: number,
  triangles: PreviewSurface['triangles'] | PreviewSurface['nominalTriangles'],
  stage: 'design' | 'nominal',
  drafts: Map<string, FixedPDraft>
) => {
  const samples = contourStrainAngleSamples(sliceFixedPContour(points, fixedP, triangles))
  for (const [offset, point] of samples.entries()) {
    const angleDeg = normalizeAngleDeg((point.beta * 180) / Math.PI)
    const key = betaKey(angleDeg)
    const moments: ChartTableMoments = { Mx: point.Mx, My: point.My }
    const existing = drafts.get(key)
    if (existing) {
      if (stage === 'design') existing.design = moments
      else existing.nominal = moments
      continue
    }
    drafts.set(key, {
      kind: 'fixedP',
      key,
      sort: offset,
      angleDeg,
      design: stage === 'design' ? moments : null,
      nominal: stage === 'nominal' ? moments : null
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

  if (input.source === 'vertical') {
    const drafts = new Map<string, VerticalDraft>()
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
    return [...drafts.values()]
      .sort((a, b) => a.sort - b.sort)
      .map((row, index) => ({
        kind: 'vertical' as const,
        key: row.key,
        index: index + 1,
        criterion: row.criterion,
        design: input.includeDesign ? row.design : null,
        nominal: input.includeNominal ? row.nominal : null
      }))
  }

  const drafts = new Map<string, FixedPDraft>()
  if (input.includeDesign) {
    collectFixedP(surface.points, input.fixedP, surface.triangles, 'design', drafts)
  }
  if (input.includeNominal) {
    collectFixedP(
      surface.nominalPoints,
      input.fixedP,
      surface.nominalTriangles,
      'nominal',
      drafts
    )
  }
  return [...drafts.values()]
    .sort((a, b) => a.angleDeg - b.angleDeg)
    .map((row, index) => ({
      kind: 'fixedP' as const,
      key: row.key,
      index: index + 1,
      angleDeg: row.angleDeg,
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

  if (input.source === 'fixedP') {
    const headers = ['#', 'β (°)' ]
    if (input.includeDesign) headers.push('Mx', 'My')
    if (input.includeNominal) headers.push('Mnx', 'Mny')
    sheet.addRow(headers)

    for (const row of input.rows) {
      if (row.kind !== 'fixedP') continue
      const values: Array<string | number> = [row.index, Number(row.angleDeg.toFixed(3))]
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
