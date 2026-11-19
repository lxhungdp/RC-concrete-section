import { validatePolygonSection, circularRebarArea, type GeometryInputRebarView, type Point2 } from '@pm/geometry'

/** Editable drawing contract: development/03, not the analysis-mesh audit format. */
export const DRAWING_LAYER = 'pm'
export const DRAWING_LIMITS = {
  bytes: 10 * 1024 * 1024, pairs: 500_000, entities: 20_000,
  rings: 128, ringVertices: 1024, vertices: 4096, rebars: 2048
} as const

export type SectionDrawing = { outers: Point2[][][]; rebars: GeometryInputRebarView[] }
export type DrawingIssueCode = 'FORMAT' | 'UNITS_REQUIRED' | 'UNSUPPORTED_UNITS' |
  'UNSUPPORTED_ENTITY' | 'INVALID_GEOMETRY' | 'INVALID_MATERIALS' | 'RESOURCE_LIMIT' | 'UNSUPPORTED_REBAR_AREA'
export type DrawingResult<T> =
  | { ok: true; value: T; warnings: string[] }
  | { ok: false; issue: { code: DrawingIssueCode; message: string; line?: number } }
type Pair = { code: number; value: string; line: number }
type RecordEntry = { type: string; tags: Pair[]; line: number }

class DrawingFailure extends Error {
  constructor(readonly code: DrawingIssueCode, message: string, readonly line?: number) { super(message) }
}
function fail(code: DrawingIssueCode, message: string, line?: number): never {
  throw new DrawingFailure(code, message, line)
}
const attempt = <T>(operation: () => { value: T; warnings: string[] }): DrawingResult<T> => {
  try { return { ok: true, ...operation() } } catch (error) {
    if (!(error instanceof DrawingFailure)) throw error
    return { ok: false, issue: { code: error.code, message: error.message, line: error.line } }
  }
}
const single = (record: RecordEntry, code: number): Pair | undefined => {
  const values = record.tags.filter(pair => pair.code === code)
  if (values.length > 1) fail('FORMAT', `Repeated DXF group ${code} in ${record.type}.`, record.line)
  return values[0]
}
const number = (pair: Pair | undefined, label: string, fallback?: number): number => {
  if (!pair) {
    if (fallback !== undefined) return fallback
    return fail('FORMAT', `Missing ${label}.`)
  }
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(pair.value)) {
    fail('FORMAT', `${label} must be a finite number.`, pair.line)
  }
  const value = Number(pair.value)
  if (!Number.isFinite(value)) fail('FORMAT', `${label} must be finite.`, pair.line)
  return value
}
const numeric = (record: RecordEntry, code: number, fallback?: number) =>
  number(single(record, code), `${record.type} group ${code}`, fallback)
const integer = (record: RecordEntry, code: number, fallback?: number) => {
  const value = numeric(record, code, fallback)
  if (!Number.isSafeInteger(value) || value < 0) fail('FORMAT', `Invalid integer group ${code}.`, record.line)
  return value
}
const layerOf = (record: RecordEntry) => (single(record, 8)?.value ?? '0').toLowerCase()
const checkFrame = (record: RecordEntry) => {
  for (const code of [30, 38, 39, 210, 220]) {
    if (numeric(record, code, 0) !== 0) fail('UNSUPPORTED_ENTITY', 'Use flat XY geometry at Z = 0, without thickness or transformed extrusion.', record.line)
  }
  if (numeric(record, 230, 1) !== 1 || integer(record, 67, 0) !== 0 ||
    (single(record, 410)?.value.toLowerCase() ?? 'model') !== 'model') {
    fail('UNSUPPORTED_ENTITY', 'Use model-space geometry with the default XY extrusion.', record.line)
  }
}
const checkStraight = (record: RecordEntry) => {
  for (const pair of record.tags.filter(pair => [40, 41, 42, 43].includes(pair.code))) {
    if (number(pair, `Polyline group ${pair.code}`) !== 0) {
      fail('UNSUPPORTED_ENTITY', 'Boundary polylines must have straight segments and zero width. Convert curves to an explicitly chosen polygon in CAD.', pair.line)
    }
  }
}

const readRecords = (text: string): RecordEntry[] => {
  if (text.length > DRAWING_LIMITS.bytes || new TextEncoder().encode(text).byteLength > DRAWING_LIMITS.bytes) {
    fail('RESOURCE_LIMIT', 'DXF exceeds the 10 MiB text limit.')
  }
  if (/^AC10\d{2}/.test(text)) fail('FORMAT', 'DWG import is unavailable. Save the drawing as ASCII DXF (.dxf) in CAD, then import that file.')
  if (text.includes('\0') || text.startsWith('AutoCAD Binary DXF')) fail('FORMAT', 'Save the drawing as ASCII DXF (.dxf) in CAD before import. Binary DXF is unsupported.')
  const lines = text.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/)
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop()
  if (lines.length % 2 !== 0) fail('FORMAT', 'DXF must contain complete code/value pairs.')
  if (lines.length / 2 > DRAWING_LIMITS.pairs) fail('RESOURCE_LIMIT', 'DXF has too many code/value pairs.')
  const records: RecordEntry[] = []
  let record: RecordEntry | undefined
  for (let index = 0; index < lines.length; index += 2) {
    const codeText = lines[index].trim()
    if (!/^\d+$/.test(codeText)) fail('FORMAT', 'Invalid DXF group code.', index + 1)
    const code = Number(codeText)
    if (code > 1071) fail('FORMAT', 'Unsupported DXF group code.', index + 1)
    const pair = { code, value: lines[index + 1].trim(), line: index + 1 }
    if (code === 999) continue
    if (code === 0) {
      record = { type: pair.value.toUpperCase(), tags: [], line: pair.line }
      records.push(record)
    } else {
      if (!record) fail('FORMAT', 'DXF data precedes its first record.', pair.line)
      record.tags.push(pair)
    }
  }
  return records
}

const readEntities = (text: string, unitlessMillimetres: boolean) => {
  const records = readRecords(text)
  const entities: RecordEntry[] = []
  let section: string | undefined
  let sawEntities = false
  let sawEof = false
  let units: number | undefined
  for (const record of records) {
    if (sawEof) fail('FORMAT', 'DXF contains data after EOF.', record.line)
    if (record.type === 'SECTION') {
      if (section) fail('FORMAT', 'Nested DXF sections are invalid.', record.line)
      section = record.tags[0]?.code === 2 ? record.tags[0].value.toUpperCase() : undefined
      if (!section) fail('FORMAT', 'Missing DXF section name.', record.line)
      if (section === 'HEADER') {
        for (let index = 0; index < record.tags.length; index++) {
          const tag = record.tags[index]
          if (tag.code !== 9 || tag.value !== '$INSUNITS') continue
          if (units !== undefined || record.tags[index + 1]?.code !== 70) fail('FORMAT', 'Invalid or duplicate $INSUNITS.', tag.line)
          units = number(record.tags[index + 1], '$INSUNITS')
        }
      }
      if (section === 'ENTITIES') {
        if (sawEntities) fail('FORMAT', 'Duplicate ENTITIES section.', record.line)
        sawEntities = true
      }
    } else if (record.type === 'ENDSEC') {
      if (!section) fail('FORMAT', 'Unexpected ENDSEC.', record.line)
      if (record.tags.length) fail('FORMAT', 'Unexpected data after ENDSEC.', record.line)
      section = undefined
    } else if (record.type === 'EOF') {
      if (section) fail('FORMAT', 'Unclosed DXF section.', record.line)
      if (record.tags.length) fail('FORMAT', 'Unexpected data after EOF.', record.line)
      sawEof = true
    } else if (!section) fail('FORMAT', 'DXF record is outside a section.', record.line)
    else if (section === 'ENTITIES') {
      if (entities.length >= DRAWING_LIMITS.entities) fail('RESOURCE_LIMIT', 'DXF has too many entities.')
      entities.push(record)
    }
  }
  if (!sawEntities || !sawEof || section) fail('FORMAT', 'DXF requires a complete ENTITIES section and EOF.')
  if (units === undefined || units === 0) {
    if (!unitlessMillimetres) fail('UNITS_REQUIRED', 'The drawing has no declared units. Choose explicitly whether one drawing unit is one millimetre.')
  } else if (units !== 4) fail('UNSUPPORTED_UNITS', 'Save/rescale the drawing in millimetres ($INSUNITS = 4) before import.')
  return { entities, unitless: units === undefined || units === 0 }
}

/** Parse only declared drawing roles. Expected failures never return a partial geometry. */
export const importSectionDxf = (text: string, options: { unitlessMillimetres?: boolean } = {}): DrawingResult<SectionDrawing> => attempt(() => {
  const { entities, unitless } = readEntities(text, options.unitlessMillimetres === true)
  const warnings: string[] = unitless ? ['Unitless DXF interpreted as mm by explicit choice.'] : []
  const rings: Point2[][] = []
  const rebars: GeometryInputRebarView[] = []
  let pointId = 1
  let ignored = 0
  const addRing = (record: RecordEntry, ring: Point2[]) => {
    if (rings.length >= DRAWING_LIMITS.rings) fail('RESOURCE_LIMIT', 'Too many boundary rings.', record.line)
    if (ring.length > DRAWING_LIMITS.ringVertices || pointId - 1 > DRAWING_LIMITS.vertices) fail('RESOURCE_LIMIT', 'Too many boundary vertices.', record.line)
    if (ring.length > 1 && ring[0].x === ring[ring.length - 1].x && ring[0].y === ring[ring.length - 1].y) {
      ring.pop()
      warnings.push(`Line ${record.line}: removed the repeated closing vertex from an explicitly closed polyline.`)
    }
    const issues = validatePolygonSection({ solids: [{ outer: ring, holes: [] }] })
    if (issues.length) fail('INVALID_GEOMETRY', issues.map(issue => `${issue.code}: ${issue.message}`).join('; '), record.line)
    rings.push(ring)
  }
  for (let index = 0; index < entities.length; index++) {
    const record = entities[index]
    const layer = layerOf(record)
    const vertices: RecordEntry[] = []
    if (record.type === 'POLYLINE') {
      while (entities[index + 1]?.type === 'VERTEX') vertices.push(entities[++index])
      if (entities[index + 1]?.type !== 'SEQEND') fail('FORMAT', 'POLYLINE is missing SEQEND.', record.line)
      index++
    }
    if (layer !== DRAWING_LAYER) { ignored++; continue }
    checkFrame(record)
    if (record.type === 'CIRCLE') {
      const dia = 2 * numeric(record, 40)
      if (!Number.isFinite(dia) || dia <= 0) fail('INVALID_GEOMETRY', 'Circle radius must be positive and finite.', record.line)
      const center = { x: numeric(record, 10), y: numeric(record, 20) }
      if (rebars.length >= DRAWING_LIMITS.rebars) fail('RESOURCE_LIMIT', 'Too many rebars.', record.line)
      rebars.push({ id: rebars.length + 1, solidIndex: 0, dia, ...center })
      continue
    }
    if (record.type !== 'LWPOLYLINE' && record.type !== 'POLYLINE') {
      fail('UNSUPPORTED_ENTITY', 'The pm layer accepts closed straight POLYLINE/LWPOLYLINE boundaries and CIRCLE entities only.', record.line)
    }
    const flags = integer(record, 70, 0)
    if (flags !== 1 && flags !== 129) fail('UNSUPPORTED_ENTITY', 'Boundary polylines must be closed, straight and 2D.', record.line)
    checkStraight(record)
    const ring: Point2[] = []
    if (record.type === 'POLYLINE') {
      for (const vertex of vertices) {
        checkFrame(vertex)
        checkStraight(vertex)
        if (integer(vertex, 70, 0) !== 0 || !['0', layer].includes(layerOf(vertex))) fail('UNSUPPORTED_ENTITY', 'Unsupported polyline vertex flags or layer.', vertex.line)
        ring.push({ id: pointId++, x: numeric(vertex, 10), y: numeric(vertex, 20) })
      }
    } else {
      let x: Pair | undefined
      for (const pair of record.tags) {
        if (pair.code === 10) {
          if (x) fail('FORMAT', 'Missing polyline Y coordinate.', pair.line)
          x = pair
        } else if (pair.code === 20) {
          if (!x) fail('FORMAT', 'Missing polyline X coordinate.', pair.line)
          ring.push({ id: pointId++, x: number(x, 'Polyline X'), y: number(pair, 'Polyline Y') })
          x = undefined
        }
      }
      if (x || integer(record, 90) !== ring.length) fail('FORMAT', 'Polyline vertex count/coordinates do not match.', record.line)
    }
    addRing(record, ring)
  }
  if (!rings.length) fail('INVALID_GEOMETRY', 'No closed concrete boundary was found on the pm layer.')
  const containers = rings.map((ring, index) => rings.flatMap((candidate, candidateIndex) =>
    index !== candidateIndex && validatePolygonSection({ solids: [{ outer: candidate, holes: [ring] }] }).length === 0
      ? [candidateIndex] : []))
  const outerIndexes = rings.flatMap((_, index) => containers[index].length % 2 === 0 ? [index] : [])
  const outers = outerIndexes.map(index => [rings[index]])
  rings.forEach((ring, index) => {
    const depth = containers[index].length
    if (depth % 2 === 0) return
    const parents = containers[index].filter(parent => containers[parent].length === depth - 1)
    if (parents.length !== 1) fail('INVALID_GEOMETRY', 'Boundary nesting is ambiguous; rings must be disjoint or strictly contained.')
    const outerIndex = outerIndexes.indexOf(parents[0])
    if (outerIndex < 0) fail('INVALID_GEOMETRY', 'A hole has no unique immediate concrete outer.')
    outers[outerIndex].push(ring)
  })
  const issues = validatePolygonSection({ solids: outers.map(rings => ({ outer: rings[0], holes: rings.slice(1) })), rebars })
  if (issues.length) fail('INVALID_GEOMETRY', issues.map(issue => `${issue.code}: ${issue.path} ${issue.message}`).join('; '))
  if (ignored) warnings.push(`Ignored ${ignored} entity/entities on other layers. Only layer pm is imported.`)
  return { value: { outers, rebars }, warnings }
})

/** Standard R2000 ASCII structure; numbers are written at their JS round-trip precision. */
export const buildSectionDxf = (drawing: SectionDrawing): DrawingResult<string> => attempt(() => {
  const rings = drawing.outers.flat()
  if (!drawing.outers.length || drawing.outers.some(outer => !outer.length)) fail('INVALID_GEOMETRY', 'Select a nonempty concrete boundary.')
  if (rings.length > DRAWING_LIMITS.rings || rings.some(ring => ring.length > DRAWING_LIMITS.ringVertices) ||
    rings.reduce((sum, ring) => sum + ring.length, 0) > DRAWING_LIMITS.vertices || drawing.rebars.length > DRAWING_LIMITS.rebars) {
    fail('RESOURCE_LIMIT', 'The section exceeds the DXF interchange limits.')
  }
  const issues = validatePolygonSection({ solids: drawing.outers.map(rings => ({ outer: rings[0], holes: rings.slice(1) })), rebars: drawing.rebars })
  if (issues.length) fail('INVALID_GEOMETRY', issues.map(issue => `${issue.code}: ${issue.message}`).join('; '))
  if (drawing.rebars.some(bar => bar.area !== undefined && bar.area !== circularRebarArea(bar.dia))) {
    fail('UNSUPPORTED_REBAR_AREA', 'DXF circles cannot preserve independent rebar As. Export Excel or project JSON to retain the stored reinforcement areas.')
  }
  const lines: string[] = []
  const pair = (code: number, value: string | number) => { lines.push(String(code), String(value)) }
  let nextHandle = 1
  const handle = () => (nextHandle++).toString(16).toUpperCase()
  const entity = (type: string, owner: string, layer?: string, handleCode = 5) => {
    const id = handle()
    pair(0, type); pair(handleCode, id); pair(330, owner)
    if (layer !== undefined) { pair(100, 'AcDbEntity'); pair(8, layer) }
    return id
  }
  // TABLE is a container, not an entity: its name must immediately follow 0/TABLE.
  const table = (name: string, count: number) => {
    const id = handle()
    pair(0, 'TABLE'); pair(2, name); pair(5, id); pair(330, '0')
    pair(100, 'AcDbSymbolTable'); pair(70, count)
    return id
  }
  pair(0, 'SECTION'); pair(2, 'HEADER')
  pair(9, '$ACADVER'); pair(1, 'AC1015'); pair(9, '$INSUNITS'); pair(70, 4)
  pair(9, '$HANDSEED'); pair(5, '0')
  const handseedIndex = lines.length - 1
  pair(0, 'ENDSEC')
  pair(0, 'SECTION'); pair(2, 'CLASSES'); pair(0, 'ENDSEC')
  pair(0, 'SECTION'); pair(2, 'TABLES')
  table('VPORT', 0); pair(0, 'ENDTAB')
  const ltypes = table('LTYPE', 3)
  for (const name of ['BYBLOCK', 'BYLAYER', 'CONTINUOUS']) {
    entity('LTYPE', ltypes); pair(100, 'AcDbSymbolTableRecord'); pair(100, 'AcDbLinetypeTableRecord')
    pair(2, name); pair(70, 0); pair(3, name === 'CONTINUOUS' ? 'Solid line' : '')
    pair(72, 65); pair(73, 0); pair(40, 0)
  }
  pair(0, 'ENDTAB')
  const layers = table('LAYER', 2)
  for (const [name, color] of [['0', 7], [DRAWING_LAYER, 7]] as const) {
    entity('LAYER', layers); pair(100, 'AcDbSymbolTableRecord'); pair(100, 'AcDbLayerTableRecord')
    pair(2, name); pair(70, 0); pair(62, color); pair(6, 'CONTINUOUS')
  }
  pair(0, 'ENDTAB')
  const styles = table('STYLE', 1)
  const standardStyle = entity('STYLE', styles)
  pair(100, 'AcDbSymbolTableRecord'); pair(100, 'AcDbTextStyleTableRecord')
  pair(2, 'STANDARD'); pair(70, 0); pair(40, 0); pair(41, 1); pair(50, 0)
  pair(71, 0); pair(42, 0); pair(3, 'txt'); pair(4, ''); pair(0, 'ENDTAB')
  for (const name of ['VIEW', 'UCS']) { table(name, 0); pair(0, 'ENDTAB') }
  const apps = table('APPID', 1)
  entity('APPID', apps); pair(100, 'AcDbSymbolTableRecord'); pair(100, 'AcDbRegAppTableRecord')
  pair(2, 'ACAD'); pair(70, 0); pair(0, 'ENDTAB')
  const dimstyles = table('DIMSTYLE', 1)
  pair(100, 'AcDbDimStyleTable'); pair(71, 1)
  entity('DIMSTYLE', dimstyles, undefined, 105)
  pair(100, 'AcDbSymbolTableRecord'); pair(100, 'AcDbDimStyleTableRecord')
  pair(2, 'STANDARD'); pair(70, 0); pair(340, standardStyle); pair(0, 'ENDTAB')
  const blocks = table('BLOCK_RECORD', 2)
  const spaces = ['*Model_Space', '*Paper_Space'].map(name => {
    const id = entity('BLOCK_RECORD', blocks); pair(100, 'AcDbSymbolTableRecord'); pair(100, 'AcDbBlockTableRecord'); pair(2, name)
    return { id, name }
  })
  pair(0, 'ENDTAB'); pair(0, 'ENDSEC'); pair(0, 'SECTION'); pair(2, 'BLOCKS')
  for (const space of spaces) {
    entity('BLOCK', space.id, '0'); pair(100, 'AcDbBlockBegin'); pair(2, space.name); pair(70, 0)
    pair(10, 0); pair(20, 0); pair(30, 0); pair(3, space.name); pair(1, '')
    entity('ENDBLK', space.id, '0'); pair(100, 'AcDbBlockEnd')
  }
  pair(0, 'ENDSEC'); pair(0, 'SECTION'); pair(2, 'ENTITIES')
  for (const outer of drawing.outers) {
    outer.forEach(ring => {
      entity('LWPOLYLINE', spaces[0].id, DRAWING_LAYER)
      pair(100, 'AcDbPolyline'); pair(90, ring.length); pair(70, 1)
      for (const point of ring) { pair(10, point.x); pair(20, point.y) }
    })
  }
  for (const bar of drawing.rebars) {
    const radius = bar.dia / 2
    if (!Number.isFinite(radius) || radius <= 0) fail('INVALID_GEOMETRY', 'Rebar radius must be positive and finite.')
    entity('CIRCLE', spaces[0].id, DRAWING_LAYER); pair(100, 'AcDbCircle')
    pair(10, bar.x); pair(20, bar.y); pair(30, 0); pair(40, radius)
  }
  pair(0, 'ENDSEC'); pair(0, 'SECTION'); pair(2, 'OBJECTS')
  const rootDictionary = entity('DICTIONARY', '0')
  pair(100, 'AcDbDictionary'); pair(281, 1)
  pair(3, 'ACAD_GROUP'); pair(350, nextHandle.toString(16).toUpperCase())
  entity('DICTIONARY', rootDictionary); pair(100, 'AcDbDictionary'); pair(281, 1)
  pair(0, 'ENDSEC'); pair(0, 'EOF')
  lines[handseedIndex] = nextHandle.toString(16).toUpperCase()
  return { value: `${lines.join('\r\n')}\r\n`, warnings: [] }
})

export const sectionDrawingFileName = (name: string) =>
  `${name.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/\s+/g, '-').replace(/^[-.]+|[-.]+$/g, '') || 'section'}.dxf`
