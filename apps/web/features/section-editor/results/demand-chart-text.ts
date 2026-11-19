export type PlottedTrace2D = {
  name?: string
  mode?: string
  visible?: boolean | 'legendonly'
  x?: ArrayLike<number | null>
  y?: ArrayLike<number | null>
  text?: string | readonly unknown[]
  customdata?: readonly unknown[]
  meta?: unknown
}

export type PointUnits = { moment: string; force: string }
type PlottedGraph = HTMLElement & { data?: readonly PlottedTrace2D[] }

/** Use returned criterion labels; geometric intersections never acquire a material criterion. */
export const curvePointCriteria = (stationId: string | null, role: string | undefined,
  stations: readonly { id: string; label: string }[], between?: { from: string; to: string; fraction: number }): string => {
  if (role === 'axial-center') return 'Axial center'
  if (role === 'cap-edge' || role === 'axial-cap') return 'Pmax intersection'
  if (role === 'axis') return 'Zero-moment crossing'
  if (role === 'interpolated') return 'Geometric cut (no physical state)'
  const label = (id: string) => stations.find(station => station.id === id)?.label ?? id
  if (role === 'between-stations') {
    return between ? `Between ${label(between.from)} and ${label(between.to)} (${(100 * between.fraction).toFixed(1)}%)` : 'Between stations'
  }
  if (stationId !== null) return stations.find(station => station.id === stationId)?.label ?? '—'
  return 'Surface intersection'
}

/** `beta`: the point's own strain direction β in degrees, null where its state has none. */
export type PlottedPointRow = { n: number; criteria: string; beta: number | null; values: [number, number, number, number] }
/**
 * One resistance stage of a plotted chart: rows in plot order, `null` marking a path break.
 * `hasBeta` when the traces declare a β column (the P–M at θ curve: every point has its own β).
 */
export type PlottedPointTable = { stage: 'nominal' | 'design'; heading: string; hasBeta: boolean; rows: Array<PlottedPointRow | null> }

/**
 * Point identity and four engineering values (Mx, My, M_R, P) in display units, read from the plotted
 * traces' declared resultant columns; internal bindings never become user-facing text.
 */
export const plottedPointTables = (series: readonly PlottedTrace2D[] | undefined): PlottedPointTable[] => {
  const tables: PlottedPointTable[] = []
  if (!series) return tables
  for (const stage of ['nominal', 'design'] as const) for (const trace of series) {
    if (trace.visible === false || trace.visible === 'legendonly' || !trace.x || !trace.y || !trace.meta || typeof trace.meta !== 'object') continue
    const meta = trace.meta as Record<string, unknown>
    if (meta.resistanceStage !== stage || !meta.resultantColumns || typeof meta.resultantColumns !== 'object') continue
    const columns = meta.resultantColumns as Record<string, unknown>
    const read = (key: string, index: number) => {
      const source = columns[key], custom = trace.customdata?.[index]
      return source === 'x' ? trace.x?.[index] : source === 'y' ? trace.y?.[index]
        : typeof source === 'number' && Number.isInteger(source) && source >= 0 && Array.isArray(custom) ? custom[source] : undefined
    }
    const rows: Array<PlottedPointRow | null> = []
    for (let i = 0; i < Math.min(trace.x.length, trace.y.length); i++) {
      const values: unknown[] = [read('Mx', i), read('My', i), read('MR', i), read('P', i)]
      if (![trace.x[i], trace.y[i], ...values].every(value => typeof value === 'number' && Number.isFinite(value))) {
        if (rows.length && rows[rows.length - 1] !== null) rows.push(null)
        continue
      }
      const criterion = read('Criteria', i) ?? meta.criteriaLabel
      const beta = read('Beta', i)
      rows.push({ n: i + 1, criteria: typeof criterion === 'string' ? criterion.replace(/\s+/gu, ' ').trim() : '—',
        beta: typeof beta === 'number' && Number.isFinite(beta) ? beta : null,
        values: values as [number, number, number, number] })
    }
    while (rows[rows.length - 1] === null) rows.pop()
    if (!rows.length) continue
    tables.push({ stage, rows, hasBeta: columns.Beta !== undefined,
      heading: `${stage === 'nominal' ? 'Nominal' : 'Design'}${typeof meta.dataLabel === 'string' && meta.dataLabel ? ` — ${meta.dataLabel}` : ''}` })
  }
  return tables
}

export const plottedPointSymbols = (stage: PlottedPointTable['stage']) => stage === 'nominal' ? ['Mnx', 'Mny', 'Mn'] : ['Mrx', 'Mry', 'Mr']

/** Tab-separated text of `plottedPointTables` for the Capacity Data dialog. */
export const plottedPointsText = (series: readonly PlottedTrace2D[] | undefined, units: PointUnits): string => {
  if (!series) return 'Point data is loading.\n'
  const tables = plottedPointTables(series).map((table) => {
    const header = ['N#', 'Criteria', ...(table.hasBeta ? ['β (°)'] : []),
      ...plottedPointSymbols(table.stage).map(symbol => `${symbol} (${units.moment})`), `P (${units.force})`]
    const records = [header, ...table.rows.map(row => row ? [String(row.n), row.criteria,
      ...(table.hasBeta ? [row.beta === null ? '—' : String(row.beta)] : []),
      ...row.values.map(value => Object.is(value, -0) ? '-0' : String(value))] : [])]
    const widths = header.map(value => value.length)
    for (const cells of records) cells.forEach((value, column) => { widths[column] = Math.max(widths[column], value.length) })
    const padded = table.hasBeta ? 6 : 5
    return [table.heading, ...records.map(cells => cells.map((value, column) => column < padded ? value.padEnd(widths[column]) : value).join('\t'))].join('\n')
  })
  return tables.length ? `PREVIEW\n\n${tables.join('\n\n')}\n` : 'No resistance-curve points are displayed.\n'
}

/**
 * Capacity P–M Data: the frame status when it is not current, then the plotted resistance points.
 * The Demand Check detail pane Data text appends the same point tables (`detailPaneText`).
 */
export const chartText = (chart: HTMLElement, frame: string, pointUnits: PointUnits): string => {
  const warning = /previous|updating|rebuilding/i.test(frame) ? `${frame}\n\n` : ''
  return warning + plottedPointsText(chart.querySelector<PlottedGraph>('.js-plotly-plot')?.data, pointUnits)
}

/** One titled block of label/value readouts in the Demand Check detail pane. */
export type DetailPaneGroup = { section: string; title: string; rows: Array<readonly [string, string]> }

/**
 * Text of the whole Demand Check detail pane for its Data dialog: the identifying head, every readout
 * group in pane order, then any full tables (bars, plotted points) as tab-separated blocks.
 */
export const detailPaneText = (head: readonly string[], groups: readonly DetailPaneGroup[], tables: readonly string[]): string => {
  const lines: string[] = ['PREVIEW', ...head, '']
  let section = ''
  for (const group of groups) {
    if (group.section !== section) {
      section = group.section
      lines.push(section.toUpperCase(), '')
    }
    lines.push(group.title)
    const width = Math.max(0, ...group.rows.map(([label]) => label.length))
    for (const [label, value] of group.rows) lines.push(`  ${label.padEnd(width)}\t${value}`)
    lines.push('')
  }
  for (const table of tables) if (table.trim()) lines.push(table.trim(), '')
  return `${lines.join('\n').replace(/\n{3,}/gu, '\n\n').trimEnd()}\n`
}
