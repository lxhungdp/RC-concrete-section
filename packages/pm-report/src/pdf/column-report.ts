/**
 * Renders a `ColumnReportModel` to PDF.
 *
 * The page order follows what commercial column-design reports settled on, because that order is
 * how a reviewer reads one: establish *what was analysed* before showing *what it can carry*,
 * before showing *what it was asked to carry*, before working any single case through.
 *
 *   1  Input          section drawing beside the section, material and resistance data
 *   2  Capacity       Nominal and Design interaction diagrams, one per published direction
 *   3  Demand         every combination with its utilization and verdict
 *   4+ Detail         one spread per selected combination: cross-section and elevation with the
 *                     load point on the diagram, the bar ledger, and the solver evidence
 *
 * Step 4 is optional and per-combination by design: a 60-combination model would otherwise produce
 * 120 pages nobody reads, and the combinations worth working through are a judgement the engineer
 * makes, not the software.
 */
import { HELVETICA_BOLD } from './font-metrics'
import { MARGIN, REPORT_COLORS, ReportDocument, type Frame } from './layout'
import { A4_PORTRAIT, hex } from './writer'
import type {
  BarState,
  ColumnReportModel,
  CombinationDetail,
  InteractionCurve,
  XY
} from '../model/report-model'

const AXIS_COLOR = REPORT_COLORS.rule
const num = (value: number, digits = 2) =>
  Number.isFinite(value) ? value.toFixed(digits) : '—'

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

/** Rounded, human-readable tick step for an axis span. */
const niceStep = (span: number, target = 5) => {
  if (!(span > 0)) return 1
  const raw = span / Math.max(1, target)
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const normalized = raw / magnitude
  const step = normalized >= 5 ? 10 : normalized >= 2 ? 5 : normalized >= 1 ? 2 : 1
  return step * magnitude
}

const drawAxes = (
  frame: Frame,
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
  labels: { x: string; y: string }
) => {
  const { page } = frame
  page.save()
  page.setStroke(AXIS_COLOR)
  page.setLineWidth(0.4)

  const stepX = niceStep(bounds.maxX - bounds.minX)
  const stepY = niceStep(bounds.maxY - bounds.minY)
  page.setDash([1.2, 1.6])
  for (let value = Math.ceil(bounds.minX / stepX) * stepX; value <= bounds.maxX; value += stepX) {
    const from = frame.map({ x: value, y: bounds.minY })
    const to = frame.map({ x: value, y: bounds.maxY })
    page.setStroke(REPORT_COLORS.hairline)
    page.line(from.x, from.y, to.x, to.y)
    page.text(from.x, frame.bottom - 9, num(value, Math.abs(stepX) < 1 ? 2 : 0), {
      size: 6.5,
      color: REPORT_COLORS.muted,
      align: 'center'
    })
  }
  for (let value = Math.ceil(bounds.minY / stepY) * stepY; value <= bounds.maxY; value += stepY) {
    const from = frame.map({ x: bounds.minX, y: value })
    const to = frame.map({ x: bounds.maxX, y: value })
    page.setStroke(REPORT_COLORS.hairline)
    page.line(from.x, from.y, to.x, to.y)
    page.text(frame.left - 4, from.y - 2, num(value, Math.abs(stepY) < 1 ? 2 : 0), {
      size: 6.5,
      color: REPORT_COLORS.muted,
      align: 'right'
    })
  }
  page.setDash([])

  // Zero lines carry meaning on a P-M diagram, so they are solid and darker than the grid.
  page.setStroke(AXIS_COLOR)
  page.setLineWidth(0.6)
  if (bounds.minX <= 0 && bounds.maxX >= 0) {
    const a = frame.map({ x: 0, y: bounds.minY })
    const b = frame.map({ x: 0, y: bounds.maxY })
    page.line(a.x, a.y, b.x, b.y)
  }
  if (bounds.minY <= 0 && bounds.maxY >= 0) {
    const a = frame.map({ x: bounds.minX, y: 0 })
    const b = frame.map({ x: bounds.maxX, y: 0 })
    page.line(a.x, a.y, b.x, b.y)
  }

  page.text(frame.left + frame.width / 2, frame.bottom - 16, labels.x, {
    size: 6,
    color: REPORT_COLORS.muted,
    align: 'center'
  })
  page.text(frame.left - 16, frame.bottom + frame.height / 2, labels.y, {
    size: 6,
    color: REPORT_COLORS.muted,
    align: 'center',
    rotate: 90
  })
  page.restore()
}

const curveBounds = (curves: ReadonlyArray<ReadonlyArray<{ m: number; p: number }>>, extra: XY[] = []) => {
  const points = [
    ...curves.flat().map((point) => ({ x: point.m, y: point.p })),
    ...extra
  ]
  if (points.length === 0) return { minX: -1, maxX: 1, minY: -1, maxY: 1 }
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const padX = Math.max(1, (Math.max(...xs) - Math.min(...xs)) * 0.08)
  const padY = Math.max(1, (Math.max(...ys) - Math.min(...ys)) * 0.08)
  return {
    minX: Math.min(...xs, 0) - padX,
    maxX: Math.max(...xs) + padX,
    minY: Math.min(...ys) - padY,
    maxY: Math.max(...ys) + padY
  }
}

const drawInteraction = (
  frame: Frame,
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
  curve: InteractionCurve,
  marks?: { demand: { m: number; p: number }; capacity: { m: number; p: number } | null }
) => {
  const { page } = frame
  drawAxes(frame, bounds, { x: 'Mθ (kN·m)', y: 'P (kN)' })
  page.save()
  page.clipRect(frame.left - 2, frame.bottom - 2, frame.width + 4, frame.height + 4)

  if (curve.nominal.length > 1) {
    page.setStroke(REPORT_COLORS.nominal)
    page.setLineWidth(0.7)
    page.setDash([2.4, 1.8])
    page.polyline(curve.nominal.map((point) => frame.map({ x: point.m, y: point.p })), true)
    page.setDash([])
  }
  if (curve.design.length > 1) {
    page.setStroke(REPORT_COLORS.design)
    page.setLineWidth(1.1)
    page.polyline(curve.design.map((point) => frame.map({ x: point.m, y: point.p })), true)
  }

  if (marks) {
    const origin = frame.map({ x: 0, y: marks.demand.p })
    const demand = frame.map({ x: marks.demand.m, y: marks.demand.p })
    if (marks.capacity) {
      // The proportional ray is the governing check, so it is drawn from the origin through the
      // demand point out to the surface — the geometry the utilization number comes from.
      const capacity = frame.map({ x: marks.capacity.m, y: marks.capacity.p })
      const zero = frame.map({ x: 0, y: 0 })
      page.setStroke(REPORT_COLORS.demand)
      page.setLineWidth(0.5)
      page.setDash([1.6, 1.6])
      page.line(zero.x, zero.y, capacity.x, capacity.y)
      page.setDash([])
      page.setFill(REPORT_COLORS.demand)
      page.circle(capacity.x, capacity.y, 2, 'fill')
      page.text(capacity.x + 4, capacity.y + 3, 'capacity', { size: 5.5, color: REPORT_COLORS.demand })
    }
    page.setStroke(REPORT_COLORS.demand)
    page.setLineWidth(0.5)
    page.setDash([1, 1.4])
    page.line(origin.x, origin.y, demand.x, demand.y)
    page.setDash([])
    page.setFill(REPORT_COLORS.demand)
    page.circle(demand.x, demand.y, 2.6, 'fill')
    page.setFill(hex('#ffffff'))
    page.circle(demand.x, demand.y, 1.1, 'fill')
    page.text(demand.x + 4.5, demand.y - 6, 'demand', { size: 5.5, color: REPORT_COLORS.demand })
  }
  page.restore()
}

const drawSection = (
  frame: Frame,
  model: ColumnReportModel,
  detail?: CombinationDetail
) => {
  const { page } = frame

  if (detail?.compressionZone) {
    page.save()
    page.setFill(REPORT_COLORS.compression)
    for (const polygon of detail.compressionZone.polygons) {
      page.polygonWithHoles(polygon.outer.map(frame.map), polygon.holes.map((hole) => hole.map(frame.map)))
    }
    page.restore()
  }

  page.save()
  page.setStroke(REPORT_COLORS.ink)
  page.setLineWidth(0.9)
  for (const solid of model.drawing.solids) {
    if (!detail?.compressionZone) {
      page.setFill(REPORT_COLORS.concrete)
      page.polygonWithHoles(solid.outer.map(frame.map), solid.holes.map((hole) => hole.map(frame.map)))
    }
    page.polyline(solid.outer.map(frame.map), true)
    for (const hole of solid.holes) page.polyline(hole.map(frame.map), true)
  }
  page.restore()

  if (detail?.neutralAxisLine) {
    page.save()
    page.clipRect(frame.left - 4, frame.bottom - 4, frame.width + 8, frame.height + 8)
    page.setStroke(REPORT_COLORS.demand)
    page.setLineWidth(0.8)
    page.setDash([3, 2])
    const [a, b] = detail.neutralAxisLine
    const from = frame.map(a)
    const to = frame.map(b)
    page.line(from.x, from.y, to.x, to.y)
    page.setDash([])
    page.restore()
  }

  const barStates = new Map(detail?.bars.map((bar) => [bar.id, bar]) ?? [])
  for (const bar of model.drawing.bars) {
    const point = frame.map(bar)
    const radius = Math.max(1.4, (bar.dia / 2) * frame.scale.x)
    const state = barStates.get(bar.id)
    page.save()
    // Fill carries the sign of the bar force, so a reader sees the tension/compression split
    // without cross-referencing the ledger table.
    page.setFill(
      state === undefined
        ? REPORT_COLORS.steel
        : state.stressMpa > 0
          ? hex('#1d4ed8')
          : state.stressMpa < 0
            ? hex('#b91c1c')
            : REPORT_COLORS.muted
    )
    page.circle(point.x, point.y, radius, 'fill')
    page.restore()
  }
}

/**
 * Elevation along the neutral-axis normal: strain diagram, stress diagram, bar depths.
 *
 * This is the view that makes a biaxial result checkable by hand — it is where `εcu`, `c`, `a` and
 * the bar strains become one picture instead of four table rows.
 */
const drawDepthProfile = (frame: Frame, detail: CombinationDetail) => {
  const profile = detail.depthProfile
  if (!profile) return
  const { page } = frame
  const depth = profile.projectedDepth
  const columnWidth = frame.width * 0.18
  const strainWidth = frame.width * 0.36
  const stressWidth = frame.width * 0.36
  const columnLeft = frame.left
  const strainLeft = columnLeft + columnWidth + frame.width * 0.05
  const stressLeft = strainLeft + strainWidth + frame.width * 0.05
  const top = frame.bottom + frame.height
  const yOf = (d: number) => top - (d / Math.max(1e-9, depth)) * frame.height

  // Section strip
  page.save()
  page.setFill(REPORT_COLORS.concrete)
  page.rect(columnLeft, frame.bottom, columnWidth, frame.height, 'fill')
  if (profile.blockDepth !== null) {
    page.setFill(REPORT_COLORS.compression)
    page.rect(columnLeft, yOf(profile.blockDepth), columnWidth, top - yOf(profile.blockDepth), 'fill')
  }
  page.setStroke(REPORT_COLORS.ink)
  page.setLineWidth(0.8)
  page.rect(columnLeft, frame.bottom, columnWidth, frame.height, 'stroke')
  page.restore()

  // Neutral axis across all three panels
  page.save()
  page.setStroke(REPORT_COLORS.demand)
  page.setLineWidth(0.7)
  page.setDash([3, 2])
  page.line(columnLeft, yOf(profile.neutralAxisDepth), stressLeft + stressWidth, yOf(profile.neutralAxisDepth))
  page.setDash([])
  page.text(stressLeft + stressWidth + 2, yOf(profile.neutralAxisDepth) - 2, `c = ${num(profile.neutralAxisDepth, 1)}`, {
    size: 5.5,
    color: REPORT_COLORS.demand
  })
  if (profile.blockDepth !== null) {
    page.setStroke(REPORT_COLORS.accent)
    page.setDash([1.6, 1.6])
    page.line(columnLeft, yOf(profile.blockDepth), stressLeft + stressWidth, yOf(profile.blockDepth))
    page.setDash([])
    page.text(stressLeft + stressWidth + 2, yOf(profile.blockDepth) - 2, `a = ${num(profile.blockDepth, 1)}`, {
      size: 5.5,
      color: REPORT_COLORS.accent
    })
  }
  page.restore()

  // Strain diagram: linear by definition of a plane section.
  const strainSpan = Math.max(
    Math.abs(profile.extremeCompressionStrain),
    Math.abs(profile.extremeTensionStrain),
    1e-9
  )
  const strainZero = strainLeft + strainWidth / 2
  const strainX = (value: number) => strainZero + (value / (2 * strainSpan)) * strainWidth
  page.save()
  page.setStroke(AXIS_COLOR)
  page.setLineWidth(0.4)
  page.line(strainZero, frame.bottom, strainZero, top)
  page.setStroke(REPORT_COLORS.design)
  page.setLineWidth(1)
  page.polyline([
    { x: strainX(profile.extremeCompressionStrain), y: top },
    { x: strainX(profile.extremeTensionStrain), y: frame.bottom }
  ])
  page.setFill(REPORT_COLORS.design)
  page.text(strainX(profile.extremeCompressionStrain), top + 3, `εcu ${num(profile.extremeCompressionStrain, 5)}`, {
    size: 5.5,
    color: REPORT_COLORS.design,
    align: 'center'
  })
  page.text(strainX(profile.extremeTensionStrain), frame.bottom - 7, `εt ${num(profile.extremeTensionStrain, 5)}`, {
    size: 5.5,
    color: REPORT_COLORS.design,
    align: 'center'
  })
  page.text(strainLeft + strainWidth / 2, frame.bottom - 15, 'strain ε', {
    size: 6,
    color: REPORT_COLORS.muted,
    align: 'center'
  })
  page.restore()

  // Stress diagram: the code block for the block route, the sampled law for the fibre route.
  page.save()
  page.setStroke(AXIS_COLOR)
  page.setLineWidth(0.4)
  page.line(stressLeft, frame.bottom, stressLeft, top)
  if (profile.blockStressMpa !== null && profile.blockDepth !== null) {
    const width = stressWidth * 0.72
    page.setFill(REPORT_COLORS.compression)
    page.rect(stressLeft, yOf(profile.blockDepth), width, top - yOf(profile.blockDepth), 'fill')
    page.setStroke(REPORT_COLORS.design)
    page.setLineWidth(0.9)
    page.rect(stressLeft, yOf(profile.blockDepth), width, top - yOf(profile.blockDepth), 'stroke')
    page.text(stressLeft + width + 3, top - 8, `σ = ${num(profile.blockStressMpa, 2)} MPa`, {
      size: 5.5,
      color: REPORT_COLORS.design
    })
  } else if (profile.stressSamples.length > 1) {
    const peak = Math.max(...profile.stressSamples.map((sample) => Math.abs(sample.stressMpa)), 1e-9)
    const scale = (stressWidth * 0.72) / peak
    page.setStroke(REPORT_COLORS.design)
    page.setLineWidth(0.9)
    page.polyline(
      profile.stressSamples.map((sample) => ({
        x: stressLeft + sample.stressMpa * scale,
        y: yOf(sample.depth)
      }))
    )
    page.text(stressLeft + stressWidth * 0.74, top - 8, `peak ${num(peak, 2)} MPa`, {
      size: 5.5,
      color: REPORT_COLORS.design
    })
  }
  page.text(stressLeft + stressWidth / 2, frame.bottom - 15, 'concrete stress σc', {
    size: 6,
    color: REPORT_COLORS.muted,
    align: 'center'
  })
  page.restore()

  // Bars at their own depth, on the section strip.
  for (const bar of detail.bars) {
    const y = yOf(Math.min(Math.max(bar.depth, 0), depth))
    page.save()
    page.setFill(bar.stressMpa > 0 ? hex('#1d4ed8') : bar.stressMpa < 0 ? hex('#b91c1c') : REPORT_COLORS.muted)
    page.circle(columnLeft + columnWidth / 2, y, 1.8, 'fill')
    page.restore()
    page.setStroke(REPORT_COLORS.hairline)
    page.setLineWidth(0.3)
    page.line(columnLeft + columnWidth / 2, y, strainX(bar.strain), y)
    page.setFill(REPORT_COLORS.steel)
    page.circle(strainX(bar.strain), y, 1.1, 'fill')
  }
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

const barLegend = (doc: ReportDocument, bars: readonly BarState[]) => {
  if (bars.length === 0) return
  doc.paragraph(
    'Bar fill: blue = compression, red = tension, grey = unstressed. The elevation links each bar to its own strain.',
    { size: 6.5 }
  )
}

export type ColumnReportRenderOptions = {
  /** Browser-loaded, OFL-licensed fallback used for user-entered Unicode outside WinAnsi/Symbol. */
  unicodeFontBytes?: Uint8Array
}

export const renderColumnReport = (
  model: ColumnReportModel,
  options: ColumnReportRenderOptions = {}
): Uint8Array => {
  const project = model.project
  const organization = project.information.company
  const doc = new ReportDocument(
    {
      title: 'COLUMN SECTION P-M-M DESIGN REPORT',
      project: project.name,
      section: project.sectionName,
      organization,
      client: project.information.client,
      author: organization || project.information.designedBy || 'P-M Column Designer',
      status: model.status,
      watermark: model.watermark,
      generated: model.generated
    },
    `${project.name || 'Column'} - P-M-M report`,
    options.unicodeFontBytes
  )

  // ---- 1. Input -----------------------------------------------------------
  doc.newPage(A4_PORTRAIT)
  doc.title('1. Input', 'Section, materials and resistance basis exactly as analysed.')
  doc.heading('Project information')
  const projectValues = Object.fromEntries(model.projectInformation) as Record<string, string>
  doc.keyValues([['Project Name', projectValues['Project Name'] ?? '-']], 1)
  doc.keyValues([['Client', projectValues.Client ?? '-']], 1)
  doc.keyValues([['Company', projectValues.Company ?? '-']], 1)
  doc.keyValues([
    ['Designed by', projectValues['Designed by'] ?? '-'],
    ['Checked by', projectValues['Checked by'] ?? '-']
  ], 2)
  doc.keyValues([
    ['Address', projectValues.Address ?? '-'],
    ['Date', projectValues.Date ?? '-']
  ], 2)

  doc.heading('Calculation identity')
  doc.keyValues(model.identity, 2)

  doc.heading('Section')
  const figureHeight = 190
  const drawingFrame = doc.figure({
    title: 'Cross-section (mm, about the net concrete centroid)',
    height: figureHeight,
    bounds: model.drawing.bounds,
    widthFraction: 0.48,
    caption: `${model.drawing.bars.length} bars`
  })
  drawSection(drawingFrame, model)
  doc.figure({
    title: 'Section properties',
    height: figureHeight,
    bounds: { minX: 0, maxX: 1, minY: 0, maxY: 1 },
    widthFraction: 0.48,
    offsetFraction: 0.52,
    preserveAspect: false
  })
  // The right-hand box is a text panel, so it is filled directly rather than through a frame.
  const state = doc.current
  let panelY = state.cursor - 22
  const panelLeft = MARGIN.left + doc.pageWidth * 0.52 + 8
  const panelWidth = doc.pageWidth * 0.48 - 16
  for (const [label, value] of model.sectionProperties) {
    state.page.text(panelLeft, panelY, label, { size: 7, color: REPORT_COLORS.muted })
    state.page.text(panelLeft + panelWidth, panelY, value, {
      size: 7,
      font: HELVETICA_BOLD,
      color: REPORT_COLORS.ink,
      align: 'right'
    })
    panelY -= 10.5
  }
  doc.endFigureRow(figureHeight)

  doc.heading('Materials')
  doc.keyValues([...model.concreteMaterial, ...model.steelMaterial], 2)

  doc.heading('Design resistance basis')
  doc.keyValues(model.resistanceBasis, 2)

  doc.heading('Sampling and numerical evidence')
  doc.keyValues(model.sampling, 2)

  doc.heading('Scope and limitations')
  for (const statement of model.scopeStatements) doc.paragraph(statement)
  for (const warning of model.warnings) {
    doc.paragraph(`Warning: ${warning}`, { color: REPORT_COLORS.warn })
  }

  doc.heading('Reinforcement schedule')
  doc.table({
    columns: [
      { title: '#', width: 5, align: 'right' },
      { title: 'Bar id', width: 10 },
      { title: 'Ø (mm)', width: 10, align: 'right' },
      { title: 'X (mm)', width: 14, align: 'right' },
      { title: 'Y (mm)', width: 14, align: 'right' },
      { title: 'As (mm²)', width: 14, align: 'right' },
      { title: 'Steel', width: 18 }
    ],
    rows: model.barSchedule
  })

  // ---- 2. Capacity --------------------------------------------------------
  doc.newPage(A4_PORTRAIT)
  doc.title('2. Section capacity', 'Nominal reference and Design resistance. Only Design is compared with factored demand.')
  if (model.axialCapKn !== null) {
    doc.paragraph(`Maximum design axial resistance applied at ${num(model.axialCapKn, 1)} kN; it appears as the flat top of each diagram.`)
  }
  const perRow = model.curves.length > 2 ? 2 : model.curves.length || 1
  const curveHeight = perRow > 1 ? 200 : 250
  model.curves.forEach((curve, index) => {
    const bounds = curveBounds([curve.design, curve.nominal])
    const column = index % perRow
    const frame = doc.figure({
      title: `Fixed-grid plane P–Mθ at θ = ${num(curve.thetaDeg, 2)}°`,
      height: curveHeight,
      bounds,
      widthFraction: perRow > 1 ? 0.48 : 1,
      offsetFraction: perRow > 1 ? column * 0.52 : 0,
      preserveAspect: false,
      caption: 'Design solid · Nominal dashed'
    })
    drawInteraction(frame, bounds, curve)
    if (perRow > 1 && column === perRow - 1) doc.endFigureRow(curveHeight)
  })
  if (perRow > 1 && model.curves.length % perRow === 1) doc.endFigureRow(curveHeight)

  // ---- 3. Demand ----------------------------------------------------------
  doc.newPage(A4_PORTRAIT)
  doc.title('3. Factored ULS demand', 'Governing check is the proportional 3D ray against the Design surface.')
  doc.table({
    columns: [
      { title: '#', width: 5, align: 'right' },
      { title: 'Combination', width: 26 },
      { title: 'Pu (kN)', width: 13, align: 'right' },
      { title: 'Mux (kN·m)', width: 14, align: 'right' },
      { title: 'Muy (kN·m)', width: 14, align: 'right' },
      { title: 'θL (°)', width: 10, align: 'right' },
      { title: 'φ', width: 9, align: 'right' },
      { title: 'Class', width: 16 },
      { title: 'UR', width: 9, align: 'right' },
      { title: 'Verdict', width: 13 }
    ],
    rows: model.combinations.map((row, index) => [
      String(index + 1),
      row.name,
      num(row.pKn, 1),
      num(row.mxKnm, 1),
      num(row.myKnm, 1),
      num(row.thetaDeg, 1),
      row.phi === null ? '—' : num(row.phi, 3),
      row.classification,
      row.utilization === null ? '—' : num(row.utilization, 3),
      row.verdict === 'adequate' ? 'ADEQUATE' : row.verdict === 'inadequate' ? 'INADEQUATE' : 'NOT CHECKED'
    ]),
    rowColor: (index) => {
      const row = model.combinations[index]
      if (row.verdict === 'inadequate') return REPORT_COLORS.bad
      if (row.verdict === 'not-checked') return REPORT_COLORS.warn
      return undefined
    }
  })
  doc.paragraph(
    'UR is the governing proportional utilization: the factored demand vector scaled until it meets the Design surface. A fixed-axial ratio is reported per combination in its detail section and is a secondary diagnostic only.'
  )
  const notChecked = model.combinations.filter((row) => row.verdict === 'not-checked')
  for (const row of notChecked) {
    doc.paragraph(`${row.name}: ${row.note}`, { color: REPORT_COLORS.warn, size: 7 })
  }

  // ---- 4. Detail per selected combination ---------------------------------
  model.details.forEach((detail, index) => {
    doc.newPage(A4_PORTRAIT)
    doc.title(
      `4.${index + 1}  ${detail.row.name}`,
      `Pu = ${num(detail.row.pKn, 1)} kN · Mux = ${num(detail.row.mxKnm, 1)} kN·m · Muy = ${num(detail.row.myKnm, 1)} kN·m · θL = ${num(detail.row.thetaDeg, 2)}°`
    )

    const verdictColor =
      detail.row.verdict === 'adequate'
        ? REPORT_COLORS.good
        : detail.row.verdict === 'inadequate'
          ? REPORT_COLORS.bad
          : REPORT_COLORS.warn
    doc.paragraph(
      `${detail.row.verdict === 'adequate' ? 'ADEQUATE' : detail.row.verdict === 'inadequate' ? 'INADEQUATE' : 'NOT CHECKED'}` +
        `   ·   utilization ${detail.row.utilization === null ? '—' : num(detail.row.utilization, 4)}` +
        `   ·   fixed-P diagnostic ${detail.row.fixedPUtilization === null ? '—' : num(detail.row.fixedPUtilization, 4)}`,
      { color: verdictColor, size: 9, font: HELVETICA_BOLD }
    )
    doc.paragraph(detail.message)

    doc.heading('Section state')
    const detailHeight = 200
    const sectionFrame = doc.figure({
      title: 'Transverse section — neutral axis and compression zone',
      height: detailHeight,
      bounds: model.drawing.bounds,
      widthFraction: 0.48,
      // Kept short: the half-width figure shares its title line with this caption.
      caption: detail.compressionZone
        ? detail.compressionZone.kind === 'block'
          ? `a=${num(detail.depthProfile?.blockDepth ?? 0, 0)}`
          : 'ε>0'
        : '—'
    })
    drawSection(sectionFrame, model, detail)
    const elevationFrame = doc.figure({
      title: 'Longitudinal section — strain and stress over the depth',
      height: detailHeight,
      bounds: { minX: 0, maxX: 1, minY: 0, maxY: 1 },
      widthFraction: 0.48,
      offsetFraction: 0.52,
      preserveAspect: false,
      caption: detail.depthProfile ? `Dθ=${num(detail.depthProfile.projectedDepth, 0)}` : ''
    })
    if (detail.depthProfile) drawDepthProfile(elevationFrame, detail)
    doc.endFigureRow(detailHeight)
    barLegend(doc, detail.bars)

    doc.heading(
      detail.interaction.kind === 'direct-beta'
        ? 'Exact direct meridian at the equilibrium strain direction'
        : 'Fixed-grid geometric plane diagnostic'
    )
    const detailBounds = curveBounds(
      [detail.interaction.design, detail.interaction.nominal],
      [
        { x: detail.interaction.demand.m, y: detail.interaction.demand.p },
        ...(detail.interaction.capacity
          ? [{ x: detail.interaction.capacity.m, y: detail.interaction.capacity.p }]
          : [])
      ]
    )
    const interactionFrame = doc.figure({
      title: detail.interaction.kind === 'direct-beta'
        ? `Direct P–Mβ at βeq = ${num(detail.interaction.thetaDeg, 3)}°, with the load point`
        : `Fixed-grid P–Mθ at θL = ${num(detail.interaction.thetaDeg, 2)}°, with the load point`,
      height: 210,
      bounds: detailBounds,
      preserveAspect: false,
      caption: detail.interaction.kind === 'direct-beta'
        ? 'solid = fixed Design · dashed = fixed Nominal · points are projected on βeq'
        : 'solid = fixed Design · dashed = fixed Nominal · dotted ray = governing proportional check'
    })
    drawInteraction(interactionFrame, detailBounds, detail.interaction, {
      demand: detail.interaction.demand,
      capacity: detail.interaction.capacity
    })

    doc.heading('Concrete and resultants')
    doc.keyValues([...detail.concrete, ...detail.resultants], 2)

    if (detail.bars.length > 0) {
      doc.heading('Reinforcement ledger at the solved state')
      doc.table({
        columns: [
          { title: 'Bar', width: 10 },
          { title: 'X (mm)', width: 13, align: 'right' },
          { title: 'Y (mm)', width: 13, align: 'right' },
          { title: 'As (mm²)', width: 13, align: 'right' },
          { title: 'depth (mm)', width: 14, align: 'right' },
          { title: 'ε', width: 15, align: 'right' },
          { title: 'σs (MPa)', width: 13, align: 'right' },
          { title: 'F (kN)', width: 13, align: 'right' },
          { title: 'in block', width: 10, align: 'center' }
        ],
        rows: detail.bars.map((bar) => [
          bar.id,
          num(bar.x, 1),
          num(bar.y, 1),
          num(bar.area, 1),
          num(bar.depth, 1),
          bar.strain.toExponential(3),
          num(bar.stressMpa, 2),
          num(bar.forceKn, 2),
          bar.insideBlock === null ? '—' : bar.insideBlock ? 'yes' : 'no'
        ])
      })
    }

    doc.heading('Solver and admissibility evidence')
    doc.keyValues(detail.evidence, 2)
  })

  if (model.details.length === 0) {
    doc.paragraph(
      'No combination was selected for a detailed calculation. Select combinations in Demand Check before exporting to include worked states.',
      { size: 7 }
    )
  }

  return doc.finish()
}

export const columnReportFileName = (model: ColumnReportModel) => {
  const stem = (model.project.name || 'column')
    .trim()
    .replace(/[^\w]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return `${stem || 'column'}-pm-report.pdf`
}
