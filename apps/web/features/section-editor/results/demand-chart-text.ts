import { formatTextDocument, type TextGroup } from '../../../application/files/text-document'

const text = (node: Element | null): string => node?.textContent?.replace(/\s+/gu, ' ').trim() ?? ''

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
  stations: readonly { id: string; label: string }[]): string => {
  if (role === 'axial-center') return 'Axial center'
  if (role === 'cap-edge' || role === 'axial-cap') return 'Pmax intersection'
  if (stationId !== null) return stations.find(station => station.id === stationId)?.label ?? '—'
  return 'Surface intersection'
}

/** Point identity and four engineering values; internal bindings never become user-facing text. */
export const plottedPointsText = (series: readonly PlottedTrace2D[] | undefined, units: PointUnits): string => {
  if (!series) return 'Point data is loading.\n'
  const tables: string[] = []
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
    const rows: string[] = []
    for (let i = 0; i < Math.min(trace.x.length, trace.y.length); i++) {
      const values: unknown[] = [read('Mx', i), read('My', i), read('MR', i), read('P', i)]
      if (![trace.x[i], trace.y[i], ...values].every(value => typeof value === 'number' && Number.isFinite(value))) {
        if (rows.length && rows[rows.length - 1] !== '') rows.push('')
        continue
      }
      const criterion = read('Criteria', i) ?? meta.criteriaLabel
      const label = typeof criterion === 'string' ? criterion.replace(/\s+/gu, ' ').trim() : '—'
      rows.push([String(i + 1), label, ...values.map(value => Object.is(value, -0) ? '-0' : String(value))].join('\t'))
    }
    while (rows[rows.length - 1] === '') rows.pop()
    if (!rows.length) continue
    const heading = `${stage === 'nominal' ? 'Nominal' : 'Design'}${typeof meta.dataLabel === 'string' && meta.dataLabel ? ` — ${meta.dataLabel}` : ''}`
    const symbols = stage === 'nominal' ? ['Mnx', 'Mny', 'Mn'] : ['Mrx', 'Mry', 'Mr']
    const header = ['N#', 'Criteria', ...symbols.map(symbol => `${symbol} (${units.moment})`), `P (${units.force})`]
    const records = [header, ...rows.map(row => row ? row.split('\t') : [])]
    const widths = header.map(value => value.length)
    for (const cells of records) cells.forEach((value, column) => { widths[column] = Math.max(widths[column], value.length) })
    tables.push([heading, ...records.map(cells => cells.map((value, column) => column < 5 ? value.padEnd(widths[column]) : value).join('\t'))].join('\n'))
  }
  return tables.length ? `PREVIEW\n\n${tables.join('\n\n')}\n` : 'No resistance-curve points are displayed.\n'
}

/** Snapshot the presentation owner instead of duplicating its formulas, precision or labels. */
export const chartText = (chart: HTMLElement, context: TextGroup, workspace: 'Capacity' | 'Demand Check', pointUnits?: PointUnits): string => {
  if (pointUnits && workspace === 'Capacity') {
    const frame = context.rows.find(([label]) => label === 'Frame')?.[1]
    const warning = frame && /previous|updating|rebuilding/i.test(frame) ? `${frame}\n\n` : ''
    return warning + plottedPointsText(chart.querySelector<PlottedGraph>('.js-plotly-plot')?.data, pointUnits)
  }
  const title = text(chart.querySelector('[data-text-heading] > span'))
  const summary = text(chart.querySelector('[data-text-heading] > strong'))
  const groups: TextGroup[] = [context]
  if (summary) groups.push({ title: 'Chart', rows: [['Summary', summary]] })
  const options: [string, string][] = []
  for (const input of chart.querySelectorAll<HTMLInputElement>('[data-text-controls] input:not([type="range"])')) {
    const label = input.closest('label')
    const name = input.getAttribute('aria-label') ?? label?.getAttribute('title') ?? text(label?.querySelector('.pm-synced-control-label') ?? label)
    if (input.type === 'radio') { if (input.checked) options.push([input.closest('fieldset')?.getAttribute('aria-label') ?? 'Mode', text(label)]) }
    else if (input.type === 'checkbox') options.push([name, input.checked ? 'On' : 'Off'])
    else options.push([name, input.value])
  }
  for (const button of chart.querySelectorAll<HTMLButtonElement>('[data-text-controls] button[aria-pressed="true"]')) {
    options.push([button.closest('[aria-label]')?.getAttribute('aria-label') ?? 'Mode', button.title || text(button)])
  }
  if (options.length) groups.push({ title: 'Displayed options', rows: options })
  for (const card of chart.querySelectorAll('[data-text-group]')) {
    const rows: [string, string][] = []
    for (const row of card.querySelectorAll('.pm-field-metric-rows > div')) {
      rows.push([text(row.querySelector('span')), text(row.querySelector('strong'))])
    }
    groups.push({ title: text(card.querySelector('header')), rows })
  }
  const annotations = [...new Set([...chart.querySelectorAll('.annotation-text, .textpoint text')].map(node => text(node)).filter(Boolean))]
  if (annotations.length) groups.push({ title: 'Drawing labels', rows: annotations.map(label => ['', label]) })
  const notes = [...chart.querySelectorAll('.pm-preview-hint, .pm-results-frame-status')]
    .flatMap(node => {
      const paragraphs = [...node.querySelectorAll(':scope > p')]
      return (paragraphs.length ? paragraphs : [node]).map(value => text(value))
    }).filter(Boolean)
  const diagnostic = chart.querySelector('.pm-field-metric-rows strong[title]')?.getAttribute('title')
  if (diagnostic) notes.push(diagnostic)
  const document = formatTextDocument({ title: `${workspace} — ${title}`, groups, notes: [...new Set(notes)] })
  return pointUnits
    ? document.trimEnd() + '\n\n' + plottedPointsText(chart.querySelector<PlottedGraph>('.js-plotly-plot')?.data, pointUnits)
    : document
}
