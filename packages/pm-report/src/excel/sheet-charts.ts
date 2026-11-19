/**
 * Native Excel scatter charts, written into a finished workbook.
 *
 * A curve exported as a column of numbers is a curve the reader has to plot before they can judge
 * it, and the first thing anyone does with the vertical and fixed-P sheets is exactly that. So the
 * plot ships with the sheet — and as a real chart part, not a picture: it points at the sheet's own
 * cells, so it moves when a reviewer edits an input and the formulas below recompute.
 *
 * exceljs has no chart API, so the parts are written by hand into the package it produced. That is
 * a deliberate seam: everything above this file stays exceljs-shaped, and the only OOXML this
 * package hand-writes is the small, closed set of parts a scatter chart needs —
 *
 *   xl/charts/chartN.xml        the chart itself, one per plot
 *   xl/drawings/drawingN.xml    the anchor that places it on its sheet
 *   xl/worksheets/sheetN.xml    gains a <drawing> reference
 *   [Content_Types].xml         gains an override per new part
 *
 * The cached point values are written alongside the cell references. Excel recalculates them on
 * open and does not need the cache; a viewer that renders without recalculating does, and a chart
 * that draws as an empty box in half the tools it is opened in is not a published result.
 */

export type ChartSeriesData = {
  name: string
  /** Absolute A1 range on the chart's own sheet, e.g. `$D$8:$D$34`. */
  ref: string
  values: readonly number[]
}

export type SheetChartSeries = {
  x: ChartSeriesData
  y: ChartSeriesData
  /** `RRGGBB`. */
  color: string
  line: 'solid' | 'dashed' | 'none'
  marker: 'circle' | 'diamond' | 'none'
  markerSize?: number
}

export type SheetChart = {
  /** Worksheet the chart is anchored on; its cell references are read from this sheet. */
  sheet: string
  title: string
  xTitle: string
  yTitle: string
  /** Zero-based top-left anchor cell. */
  anchor: { column: number; row: number }
  widthPx: number
  heightPx: number
  series: readonly SheetChartSeries[]
}

const EMU_PER_PIXEL = 9525

const escapeXml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

/** Excel quotes every sheet name in a chart reference and doubles an embedded apostrophe. */
const sheetReference = (sheet: string, range: string) => `'${sheet.replace(/'/g, "''")}'!${range}`

const richText = (tag: string, text: string) =>
  `<c:${tag}><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${escapeXml(text)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:${tag}>`

const numberCache = (data: ChartSeriesData, sheet: string) => {
  const points = data.values
    .map((value, index) =>
      Number.isFinite(value) ? `<c:pt idx="${index}"><c:v>${value}</c:v></c:pt>` : ''
    )
    .join('')
  return (
    `<c:numRef><c:f>${escapeXml(sheetReference(sheet, data.ref))}</c:f>` +
    `<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${data.values.length}"/>${points}</c:numCache>` +
    `</c:numRef>`
  )
}

const seriesXml = (series: SheetChartSeries, index: number, sheet: string) => {
  const stroke =
    series.line === 'none'
      ? '<a:ln w="19050"><a:noFill/></a:ln>'
      : `<a:ln w="${series.line === 'dashed' ? 15875 : 22225}" cap="rnd">` +
        `<a:solidFill><a:srgbClr val="${series.color}"/></a:solidFill>` +
        (series.line === 'dashed' ? '<a:prstDash val="dash"/>' : '<a:prstDash val="solid"/>') +
        '</a:ln>'
  const marker =
    series.marker === 'none'
      ? '<c:marker><c:symbol val="none"/></c:marker>'
      : `<c:marker><c:symbol val="${series.marker}"/><c:size val="${series.markerSize ?? 4}"/>` +
        `<c:spPr><a:solidFill><a:srgbClr val="${series.color}"/></a:solidFill>` +
        `<a:ln w="9525"><a:solidFill><a:srgbClr val="${series.color}"/></a:solidFill></a:ln></c:spPr></c:marker>`
  return (
    `<c:ser><c:idx val="${index}"/><c:order val="${index}"/>` +
    `<c:tx><c:v>${escapeXml(series.x.name)}</c:v></c:tx>` +
    `<c:spPr>${stroke}</c:spPr>${marker}` +
    `<c:xVal>${numberCache(series.x, sheet)}</c:xVal>` +
    `<c:yVal>${numberCache(series.y, sheet)}</c:yVal>` +
    '<c:smooth val="0"/></c:ser>'
  )
}

const axisXml = (id: number, crossId: number, position: 'b' | 'l', title: string) =>
  `<c:valAx><c:axId val="${id}"/><c:scaling><c:orientation val="minMax"/></c:scaling>` +
  `<c:delete val="0"/><c:axPos val="${position}"/>` +
  '<c:majorGridlines><c:spPr><a:ln w="3175"><a:solidFill><a:srgbClr val="D8DEE9"/></a:solidFill></a:ln></c:spPr></c:majorGridlines>' +
  richText('title', title) +
  '<c:numFmt formatCode="General" sourceLinked="0"/>' +
  '<c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>' +
  `<c:crossAx val="${crossId}"/><c:crosses val="autoZero"/><c:crossBetween val="midCat"/></c:valAx>`

const chartXml = (chart: SheetChart) => {
  const xAxis = 111000000
  const yAxis = 222000000
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"' +
    ' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"' +
    ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<c:chart>' +
    richText('title', chart.title) +
    '<c:autoTitleDeleted val="0"/>' +
    '<c:plotArea><c:layout/>' +
    '<c:scatterChart><c:scatterStyle val="lineMarker"/><c:varyColors val="0"/>' +
    chart.series.map((series, index) => seriesXml(series, index, chart.sheet)).join('') +
    `<c:axId val="${xAxis}"/><c:axId val="${yAxis}"/></c:scatterChart>` +
    axisXml(xAxis, yAxis, 'b', chart.xTitle) +
    axisXml(yAxis, xAxis, 'l', chart.yTitle) +
    '<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>' +
    '</c:plotArea>' +
    '<c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend>' +
    '<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/>' +
    '</c:chart>' +
    '<c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>' +
    '<a:ln><a:solidFill><a:srgbClr val="CBD5E1"/></a:solidFill></a:ln></c:spPr>' +
    '</c:chartSpace>'
  )
}

const drawingXml = (charts: ReadonlyArray<{ chart: SheetChart; relationshipId: string }>) =>
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"' +
  ' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"' +
  ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
  charts
    .map(({ chart, relationshipId }, index) =>
      '<xdr:oneCellAnchor>' +
      `<xdr:from><xdr:col>${chart.anchor.column}</xdr:col><xdr:colOff>0</xdr:colOff>` +
      `<xdr:row>${chart.anchor.row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>` +
      `<xdr:ext cx="${chart.widthPx * EMU_PER_PIXEL}" cy="${chart.heightPx * EMU_PER_PIXEL}"/>` +
      '<xdr:graphicFrame macro="">' +
      `<xdr:nvGraphicFramePr><xdr:cNvPr id="${index + 2}" name="${escapeXml(chart.title)}"/>` +
      '<xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>' +
      '<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>' +
      '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">' +
      '<c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"' +
      ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"' +
      ` r:id="${relationshipId}"/>` +
      '</a:graphicData></a:graphic></xdr:graphicFrame>' +
      '<xdr:clientData/></xdr:oneCellAnchor>'
    )
    .join('') +
  '</xdr:wsDr>'

const RELATIONSHIPS_NS = 'http://schemas.openxmlformats.org/package/2006/relationships'

const relationshipsXml = (
  entries: ReadonlyArray<{ id: string; type: string; target: string }>
) =>
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  `<Relationships xmlns="${RELATIONSHIPS_NS}">` +
  entries
    .map((entry) => `<Relationship Id="${entry.id}" Type="${entry.type}" Target="${entry.target}"/>`)
    .join('') +
  '</Relationships>'

/**
 * Worksheet part path for every sheet name, resolved through the workbook's own relationships
 * rather than assumed from the sheet order — the two agree today and there is no reason to depend
 * on it.
 */
const worksheetPaths = (workbookXml: string, workbookRelsXml: string) => {
  const targets = new Map<string, string>()
  for (const match of workbookRelsXml.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /Id="([^"]+)"/.exec(match[0])?.[1]
    const target = /Target="([^"]+)"/.exec(match[0])?.[1]
    if (id && target) targets.set(id, target.replace(/^\/?xl\//, ''))
  }
  const paths = new Map<string, string>()
  for (const match of workbookXml.matchAll(/<sheet\b[^>]*\/?>/g)) {
    const name = /name="([^"]*)"/.exec(match[0])?.[1]
    const id = /r:id="([^"]+)"/.exec(match[0])?.[1]
    const target = id ? targets.get(id) : undefined
    if (name && target) paths.set(decodeXmlAttribute(name), `xl/${target}`)
  }
  return paths
}

const decodeXmlAttribute = (value: string) =>
  value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')

/**
 * `<drawing>` sits near the end of the worksheet sequence, after everything this package writes but
 * before `tableParts` and `extLst`. Inserting at the first of those, or at the closing tag, keeps
 * the part schema-valid — an out-of-order child is what Excel reports as a corrupt file.
 */
const withDrawingReference = (sheetXml: string, relationshipId: string) => {
  if (/<drawing\b/.test(sheetXml)) return sheetXml
  const reference = `<drawing r:id="${relationshipId}"/>`
  const anchor = ['<tableParts', '<extLst', '</worksheet>']
    .map((tag) => sheetXml.indexOf(tag))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0]
  if (anchor === undefined) return sheetXml
  return `${sheetXml.slice(0, anchor)}${reference}${sheetXml.slice(anchor)}`
}

const nextRelationshipId = (relsXml: string) => {
  const used = [...relsXml.matchAll(/Id="rId(\d+)"/g)].map((match) => Number(match[1]))
  return `rId${Math.max(0, ...used) + 1}`
}

const withContentTypeOverrides = (
  contentTypesXml: string,
  overrides: ReadonlyArray<{ part: string; type: string }>
) => {
  const additions = overrides
    .filter((override) => !contentTypesXml.includes(`PartName="${override.part}"`))
    .map((override) => `<Override PartName="${override.part}" ContentType="${override.type}"/>`)
    .join('')
  return contentTypesXml.replace('</Types>', `${additions}</Types>`)
}

const DRAWING_RELATIONSHIP = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing'
const CHART_RELATIONSHIP = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart'

/**
 * Adds every chart to the workbook package and returns the rewritten bytes.
 *
 * A chart whose sheet is not in the package is dropped rather than throwing: the caller collects
 * specs while writing sheets, and a sheet that turned out to have no rows to plot should cost the
 * export nothing.
 */
export const injectSheetCharts = async (
  bytes: Uint8Array,
  charts: readonly SheetChart[]
): Promise<Uint8Array> => {
  if (charts.length === 0) return bytes
  // jszip ships CJS with a default export; the browser bundle and Node resolve the namespace
  // differently, exactly as `createWorkbook` handles for exceljs.
  const imported = await import('jszip')
  const JSZip = ((imported as { default?: unknown }).default ?? imported) as typeof import('jszip')
  const zip = await JSZip.loadAsync(bytes)

  const workbookXml = await zip.file('xl/workbook.xml')?.async('string')
  const workbookRelsXml = await zip.file('xl/_rels/workbook.xml.rels')?.async('string')
  if (!workbookXml || !workbookRelsXml) return bytes
  const paths = worksheetPaths(workbookXml, workbookRelsXml)

  const bySheet = new Map<string, SheetChart[]>()
  for (const chart of charts) {
    if (!paths.has(chart.sheet)) continue
    bySheet.set(chart.sheet, [...(bySheet.get(chart.sheet) ?? []), chart])
  }
  if (bySheet.size === 0) return bytes

  const overrides: Array<{ part: string; type: string }> = []
  let partNumber = 0
  for (const [sheetName, sheetCharts] of bySheet) {
    partNumber += 1
    const drawingPath = `xl/drawings/drawing${partNumber}.xml`
    const anchored = sheetCharts.map((chart, index) => {
      const chartPath = `xl/charts/chart${partNumber}_${index + 1}.xml`
      zip.file(chartPath, chartXml(chart))
      overrides.push({
        part: `/${chartPath}`,
        type: 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml'
      })
      return { chart, relationshipId: `rId${index + 1}`, chartPath }
    })
    zip.file(drawingPath, drawingXml(anchored))
    zip.file(
      `xl/drawings/_rels/drawing${partNumber}.xml.rels`,
      relationshipsXml(anchored.map((entry) => ({
        id: entry.relationshipId,
        type: CHART_RELATIONSHIP,
        target: `../charts/${entry.chartPath.split('/').pop()}`
      })))
    )
    overrides.push({
      part: `/${drawingPath}`,
      type: 'application/vnd.openxmlformats-officedocument.drawing+xml'
    })

    const sheetPath = paths.get(sheetName)!
    const sheetRelsPath = sheetPath.replace(/([^/]+)$/, '_rels/$1.rels')
    const existingRels = await zip.file(sheetRelsPath)?.async('string')
    const relationshipId = existingRels ? nextRelationshipId(existingRels) : 'rId1'
    const entry = `<Relationship Id="${relationshipId}" Type="${DRAWING_RELATIONSHIP}" Target="../drawings/drawing${partNumber}.xml"/>`
    zip.file(
      sheetRelsPath,
      existingRels
        ? existingRels.replace('</Relationships>', `${entry}</Relationships>`)
        : relationshipsXml([{
            id: relationshipId,
            type: DRAWING_RELATIONSHIP,
            target: `../drawings/drawing${partNumber}.xml`
          }])
    )

    const sheetXml = await zip.file(sheetPath)?.async('string')
    if (sheetXml) zip.file(sheetPath, withDrawingReference(sheetXml, relationshipId))
  }

  const contentTypes = await zip.file('[Content_Types].xml')?.async('string')
  if (contentTypes) zip.file('[Content_Types].xml', withContentTypeOverrides(contentTypes, overrides))

  return zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  })
}
