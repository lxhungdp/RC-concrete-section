import { CANONICAL_UNITS, fieldQuantity, fromCanonical, toCanonical, quantityUnit, type Quantity, type UnitContext } from '@pm/units'
import { CANONICAL_WORKBOOK_UNITS, quantityCell, readQuantityCell, writeQuantityCell, readWorkbookUnits, writeWorkbookUnits, type QuantityCell } from './workbook-units'
import { CENTROID_LOAD_REFERENCE, calculationProfile, createAnalysisOptionsForProfile, createDesignBasisForCalculationProfile, createEmptyLoadingsInput, createEmptyProjectDocument, createProjectDocument, createLoadCombination, resultantAtCentroid, type CalculationProfileId, parseProjectDocument, projectDocumentFileName, type ParseProjectResult, type PmProjectDocument } from '@pm/project'
import { readLoadReferenceSheet } from './loadcase-xlsx'
import { allocateIds, parseRebarAreaSource, rebarAreaSource, withStoredRebarArea } from '@pm/geometry'
import type { CellValue, Workbook, Worksheet } from 'exceljs'

// Private flat field model shared by the v1 presenter and validator. This is not a file reader.

const FORMAT = 'pm-column-input-workbook'
const MAX_ROWS = 100_000
export type Scalar = string | number | boolean | null
type ExportCell = Scalar | QuantityCell
type Fields = Record<string, unknown>
type WorkbookIssueCode = 'WORKBOOK_FORMAT' | 'WORKBOOK_CELL' | 'WORKBOOK_RESOURCE_LIMIT' | 'PROJECT_INPUT'
export type ProjectWorkbookResult =
  | Extract<ParseProjectResult, { ok: true }>
  | { ok: false; code: WorkbookIssueCode; error: string }
export class WorkbookInputError extends Error {
  constructor(readonly code: WorkbookIssueCode, message: string) { super(message) }
}
export const fail = (code: WorkbookIssueCode, message: string): never => { throw new WorkbookInputError(code, message) }
const excelModule = async () => {
  const imported = await import('exceljs')
  return imported.default ?? imported
}
export const projectWorkbookFileName = (project: PmProjectDocument) =>
  projectDocumentFileName(project).replace(/\.json$/, '.xlsx')
const isObject = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value)
const blank = (value: Scalar) => value === null || value === ''
const normalized = (value: Scalar) => typeof value === 'string' ? value.trim().toUpperCase() : ''
const cellScalar = (value: CellValue, context: string): Scalar => {
  if (value == null) return null
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  return fail('WORKBOOK_CELL', `${context}: use plain values; formulas, dates, errors and linked/rich text are unsupported. Paste values before importing.`)
}
const text = (value: Scalar, context: string) => {
  if (value === null) return ''
  if (typeof value !== 'string') return fail('WORKBOOK_CELL', `${context}: expected text.`)
  return value
}
const number = (value: Scalar, context: string) => {
  if (value === null || typeof value === 'boolean' || (typeof value === 'string' && !value.trim())) {
    return fail('WORKBOOK_CELL', `${context}: a number is required; blank is not zero.`)
  }
  const n = typeof value === 'number' ? value : /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()) ? Number(value) : NaN
  if (!Number.isFinite(n)) return fail('WORKBOOK_CELL', `${context}: expected a finite number.`)
  return n
}
const integer = (value: Scalar, context: string) => {
  const n = number(value, context)
  if (!Number.isSafeInteger(n) || n < 1) return fail('WORKBOOK_CELL', `${context}: expected a positive integer.`)
  return n
}

// Explicit transport types, not material/analysis defaults. Unknown fields fail closed.
type FieldType = 'string' | 'number' | 'boolean' | 'object' | 'array'
export type Scope = 'project' | 'projectInformation' | 'section' | 'material' | 'concrete' | 'steel' | 'analysis' | 'resistance'
type FieldSpec = { path: string; type: FieldType; label: string }
const unitFor = (path: string): string => {
  const key = path.split('.').at(-1) ?? ''
  if (['cellSize', 'constantMm'].includes(key)) return 'mm'
  if (['fck', 'fy', 'elasticModulus', 'yieldStressThreshold'].includes(key)) return 'MPa'
  if (key === 'mc') return 'kg/m3'
  if (key.endsWith('Deg') || path.startsWith('directions.seed.anglesDeg.')) return 'deg'
  if (key.startsWith('eps') || ['extraStrain', 'fixedStrainLimit'].includes(key)) return '1'
  return ''
}
const specifications: Record<Scope, Map<string, FieldType>> = {
  project: new Map(), projectInformation: new Map(), section: new Map(), material: new Map(), concrete: new Map(),
  steel: new Map(), analysis: new Map(), resistance: new Map()
}
const declare = (scope: Scope, type: FieldType, paths: string[]) =>
  paths.forEach((path) => specifications[scope].set(path, type))
declare('project', 'string', ['schema', 'meta.name', 'meta.createdAt', 'meta.updatedAt',
  ...['client', 'company', 'designedBy', 'checkedBy', 'address', 'date'].map((key) => `meta.information.${key}`),
  'inputs.calculationProfileId', 'inputs.loadCheckBasis'])
declare('project', 'number', ['version', 'meta.id'])
const PROJECT_LABELS: Record<string, string> = {
  'meta.name': 'Name', 'meta.information.client': 'Client', 'meta.information.company': 'Company',
  'meta.information.designedBy': 'Designed by', 'meta.information.checkedBy': 'Checked by',
  'meta.information.address': 'Address', 'meta.information.date': 'Date'
}
declare('projectInformation', 'string', Object.keys(PROJECT_LABELS))
declare('section', 'number', ['id'])
declare('section', 'string', ['name'])
declare('material', 'string', ['strainSign'])
declare('material', 'number', ['defaults.steelMaterialId'])
for (const scope of ['concrete', 'steel'] as const) {
  declare(scope, 'string', ['name', 'standard', 'stressStrain.type', 'stressStrain.interpolation', 'stressStrain.extrapolation'])
  declare(scope, 'number', ['elasticModulus', 'factors.resistanceScale'])
  declare(scope, 'object', ['factors'])
}
declare('concrete', 'number', ['fck', 'mc', ...['n', 'eps0', 'epsCu', 'alpha', 'beta1', 'epsC2', 'epsCu2', 'alpha2', 'gamma'].map((p) => `stressStrain.${p}`),
  'limits.eps0', 'limits.epsCu', 'factors.alpha', 'factors.gammaC'])
declare('concrete', 'boolean', ['limits.ignoreTension', 'stressStrain.zeroTension'])
declare('steel', 'number', ['fy', 'stressStrain.hardeningRatio', 'limits.epsY', 'limits.epsU', 'factors.gammaS'])
declare('steel', 'string', ['stressStrain.ultimateStrength.type', 'stressStrain.strainLimit.type'])
declare('steel', 'number', ['stressStrain.ultimateStrength.ratio', 'stressStrain.ultimateStrength.stress', 'stressStrain.epsUk', 'stressStrain.strainLimit.value'])
declare('steel', 'object', ['limits'])
declare('analysis', 'string', ['methodId', 'samplingMode', 'stations.basedOn', 'stations.refinement.type',
  'neutralAxisStations.basedOn', 'neutralAxisStations.refinement.type', 'directions.seed.type',
  'directions.refinement.type', 'directions.refinement.probe', 'mesh.sizing.type'])
declare('analysis', 'number', ['optionsVersion', 'directions.seed.count', 'directions.seed.startDeg',
  'directions.seed.anglesDeg.#', 'directions.seedCount', 'directions.startDeg', 'directions.refinement.probe.stationIds.#',
  'mesh.sizing.seedDivisions', 'mesh.sizing.cellSize', 'mesh.maxCells', 'mesh.maxSubdivision',
  ...['stations.refinement', 'neutralAxisStations.refinement', 'directions.refinement'].flatMap((prefix) =>
    ['tolerance', 'maxPasses', 'maxStations', 'maxDirections'].map((key) => `${prefix}.${key}`))])
declare('analysis', 'array', ['directions.seed.anglesDeg', 'directions.refinement.probe.stationIds'])
declare('resistance', 'string', ['profileId', 'verificationStatus', 'overrideReason', 'format', 'transverseReinforcement',
  'transition.type', 'compressionEndpoint', 'minimumEccentricity.clauseRef',
  ...['organization', 'document', 'edition', 'amendment', 'jurisdiction', 'nationalAnnex', 'methodId', 'profileVersion'].map((key) => `identity.${key}`),
  ...['concrete', 'reinforcement'].flatMap((family) => ['characteristicSymbol', 'designSymbol',
    ...['id', 'symbol', 'label', 'operation', 'clauseRef'].map((key) => `components.#.${key}`)].map((key) => `factors.${family}.${key}`))])
declare('resistance', 'number', ['basisVersion',
  ...['phiCompressionOther', 'phiCompressionSpiral', 'phiTension', 'axialCapOther', 'axialCapSpiral'].map((key) => `factors.${key}`),
  ...['extraStrain', 'yieldStressThreshold', 'fixedStrainLimit', 'highStrengthYieldMultiple'].map((key) => `transition.${key}`),
  'minimumEccentricity.constantMm', 'minimumEccentricity.depthFactor',
  'factors.concrete.components.#.value', 'factors.reinforcement.components.#.value'])
declare('resistance', 'boolean', ['modified', 'materialModelModified', 'steelModelModified', 'axialCapEnabled'])
declare('resistance', 'array', ['factors.concrete.components', 'factors.reinforcement.components'])
export const specFor = (scope: Scope, path: string, context: string, units: UnitContext = CANONICAL_WORKBOOK_UNITS): FieldSpec => {
  const type = specifications[scope].get(path.replace(/\.\d+(?=\.|$)/g, '.#'))
  if (!type) return fail('WORKBOOK_CELL', `${context}: unknown field "${path}" in ${scope}.`)
  const quantity = type === 'number' ? fieldQuantity(path) : null
  const unit = quantity ? quantityUnit(quantity, units) : type === 'number' ? unitFor(path) : ''
  return { path, type, label: scope === 'projectInformation' ? PROJECT_LABELS[path] : unit ? `${path} (${unit})` : path }
}
const flatten = (scope: Scope, value: unknown, prefix = '', units: UnitContext = CANONICAL_WORKBOOK_UNITS): ExportCell[][] => {
  if (value === undefined) return []
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value).filter(([, child]) => child !== undefined)
    if (entries.length) return entries.flatMap(([key, child]) => flatten(scope, child, prefix ? `${prefix}.${key}` : key, units))
  }
  const spec = specFor(scope, prefix, 'Export', units)
  if (spec.type === 'array' || spec.type === 'object') {
    if (value === null || typeof value !== 'object' || Array.isArray(value) !== (spec.type === 'array')) return fail('WORKBOOK_CELL', `${prefix}: invalid container.`)
    return [[spec.label, spec.type === 'array' ? '[]' : '{}']]
  }
  if (typeof value !== spec.type) return fail('WORKBOOK_CELL', `${prefix}: invalid ${spec.type} input.`)
  const quantity = spec.type === 'number' ? fieldQuantity(prefix) : null
  return [[spec.label, quantity && typeof value === 'number' ? quantityCell(quantity, value, units)
    : typeof value === 'boolean' ? (value ? 'TRUE' : 'FALSE') : value as Scalar]]
}
const FIELD_HEADERS = ['Field', 'Value']
const POINT_HEADERS = ['X', 'Y', 'ID']
const BAR_HEADERS = ['Diameter', 'X', 'Y', 'Steel Material ID', 'ID', 'As', 'As source']
const LOAD_HEADERS = ['Name', 'P', 'Mx', 'My', 'ID']
const STATION_HEADERS = ['ID', 'Label', 'Type', 'Ratio (1)', 'Strain (1)']
const CURVE_HEADERS = ['Strain (1)', 'Stress (MPa)']
const blockHeaders: Record<string, string[]> = {
  PROJECT: FIELD_HEADERS, PROJECT_METADATA: FIELD_HEADERS, SECTION_METADATA: FIELD_HEADERS, OUTER: POINT_HEADERS, HOLE: POINT_HEADERS,
  REBAR: BAR_HEADERS, MATERIAL: FIELD_HEADERS, CONCRETE: FIELD_HEADERS, STEEL: FIELD_HEADERS,
  CONCRETE_CURVE: CURVE_HEADERS, STEEL_CURVE: CURVE_HEADERS, LOADINGS: LOAD_HEADERS,
  ANALYSIS: FIELD_HEADERS, STATIONS: STATION_HEADERS, RESISTANCE: FIELD_HEADERS
}
const sheetKeywords: Record<string, string[]> = {
  Section: [], Rebar: ['REBAR'],
  Material: ['MATERIAL', 'CONCRETE', 'STEEL', 'CONCRETE_CURVE', 'STEEL_CURVE'],
  Loadings: ['LOADINGS'], Analysis: ['SECTION_METADATA']
}
const optionalColumns = (keyword: string) => ['OUTER', 'HOLE', 'LOADINGS'].includes(keyword) ? ['ID']
  : keyword === 'REBAR' ? ['ID', 'Steel Material ID', 'As source'] : []
const sheet = (book: Workbook, name: string, note: string, widths: number[]) => {
  const ws = book.addWorksheet(name)
  ws.addRow([`# ${note}`])
  widths.forEach((width, i) => { ws.getColumn(i + 1).width = width })
  return ws
}
const addBlock = (ws: Worksheet, keyword: string, args: Scalar[], data: ExportCell[][], units?: UnitContext) => {
  if (ws.rowCount > 1) ws.addRow([])
  ws.addRow(keyword === 'OUTER' || keyword === 'HOLE' ? [`${keyword.toLowerCase()} #${args[0]}`] : [keyword, ...args]).font = { bold: true }
  ws.addRow(units && keyword.endsWith('_CURVE') ? ['Strain (1)', `Stress (${quantityUnit('stress', units)})`] : blockHeaders[keyword]).font = { bold: true }
  data.forEach((values) => {
    const row = ws.addRow(values.map((v) => typeof v === 'object' && v !== null ? null : v === '' ? null : v))
    values.forEach((value, i) => {
      const cell = row.getCell(i + 1)
      if (typeof value === 'object' && value !== null) {
        writeQuantityCell(cell, value)
        cell.numFmt = '0.###############'
      }
      if (typeof value === 'number') cell.numFmt = Number.isInteger(value) ? '0' : '0.###############'
      // Keep dates, provenance identifiers and literal labels as editable text in Excel.
      if (typeof value === 'string') cell.numFmt = '@'
    })
  })
}
const withoutCurve = (material: PmProjectDocument['inputs']['materials']['concrete'] | PmProjectDocument['inputs']['materials']['steel'][number]) => {
  const { id: _id, ...copy } = structuredClone(material)
  if (copy.stressStrain.type === 'user-curve') {
    const { points: _points, ...model } = copy.stressStrain
    return { ...copy, stressStrain: model }
  }
  return copy
}
const assertDefaultResistanceCompatible = (profileId: CalculationProfileId, model: unknown) => {
  const profile = calculationProfile(profileId)
  if (profile.code !== null && profile.concreteModels.some(item => item.materialModelType === model && item.source === 'user-defined')) {
    fail('PROJECT_INPUT', 'This concrete model needs its project resistance settings. Use Project JSON to transfer it.')
  }
}
export const buildProjectWorkbookModel = async (project: PmProjectDocument, units: UnitContext = CANONICAL_WORKBOOK_UNITS): Promise<Workbook> => {
  const ExcelJS = await excelModule()
  const book = new ExcelJS.Workbook()
  book.creator = 'P-M Column Designer'
  assertDefaultResistanceCompatible(project.inputs.calculationProfileId, project.inputs.materials.concrete.stressStrain.type)
  const { geometry, materials, loadings } = project.version === 1 ? createProjectDocument(project.inputs).inputs : project.inputs
  const section = sheet(book, 'Section', `Units: ${quantityUnit('length', units)}. Hole belongs to outer above.`, [22, 22, 12])
  section.getColumn(3).hidden = true
  for (const outer of geometry.outers) {
    addBlock(section, 'OUTER', [outer.id], outer.points.map((p) => [quantityCell('length', p.x, units), quantityCell('length', p.y, units), p.id]))
    for (const hole of outer.holes) addBlock(section, 'HOLE', [hole.id], hole.points.map((p) => [quantityCell('length', p.x, units), quantityCell('length', p.y, units), p.id]))
  }
  const rebarSheet = sheet(book, 'Rebar', `Diameter: ${quantityUnit('barDiameter', units)}; As: ${quantityUnit('area', units)}; coordinates: ${quantityUnit('length', units)}. Blank material uses the default steel.`, [22, 22, 22, 23, 12, 22, 48])
  addBlock(rebarSheet, 'REBAR', [], geometry.rebars.map((b) => [quantityCell('barDiameter', b.dia, units), quantityCell('length', b.x, units), quantityCell('length', b.y, units), b.steelMaterialId ?? null, b.id,
    b.area === undefined ? null : quantityCell('area', b.area, units), b.areaSource ? JSON.stringify(rebarAreaSource(b)) : null]))
  rebarSheet.getColumn(7).hidden = true
  rebarSheet.getColumn(5).hidden = true
  rebarSheet.getColumn(4).hidden = materials.steel.length <= 1
  const materialSheet = sheet(book, 'Material', 'Units are declared beside fields and on the Units sheet; strain dimensionless. Material values are independent.', [40, 48])
  addBlock(materialSheet, 'MATERIAL', [], flatten('material', { strainSign: materials.strainSign, defaults: materials.defaults }))
  const addMaterial = (keyword: 'CONCRETE' | 'STEEL', material: typeof materials.concrete | typeof materials.steel[number]) => {
    addBlock(materialSheet, keyword, [material.id], flatten(keyword === 'CONCRETE' ? 'concrete' : 'steel', withoutCurve(material), '', units))
    if (material.stressStrain.type === 'user-curve') addBlock(materialSheet, `${keyword}_CURVE`, [material.id],
      material.stressStrain.points.map((p) => [p.strain, quantityCell('stress', p.stress, units)]), units)
  }
  addMaterial('CONCRETE', materials.concrete)
  materials.steel.forEach((m) => addMaterial('STEEL', m))
  for (const load of loadings.combinations) if (load.actionBasis !== 'factoredULS') return fail('WORKBOOK_CELL', 'Loadings: only factoredULS demand is supported.')
  const loadSheet = sheet(book, 'Loadings', `P: ${quantityUnit('force', units)}; Mx, My: ${quantityUnit('moment', units)}. Factored ULS; P compression positive.`, [38, 24, 24, 24, 12])
  addBlock(loadSheet, 'LOADINGS', [], loadings.combinations.map(load =>
    [load.name, quantityCell('force', load.P, units), quantityCell('moment', load.Mx, units), quantityCell('moment', load.My, units), load.id]))
  addBlock(sheet(book, 'Analysis', '', []), 'SECTION_METADATA', [], flatten('section', { id: geometry.id, name: geometry.name }))
  if (book.worksheets.some((ws) => ws.rowCount > MAX_ROWS)) return fail('WORKBOOK_RESOURCE_LIMIT', 'Project exceeds the workbook row limit.')
  writeWorkbookUnits(book, units, FORMAT)
  return book
}

export type InputRow = { values: Scalar[]; notes: Array<import('exceljs').Cell['note'] | undefined>; context: string }
export type Block = { keyword: string; args: Scalar[]; rows: InputRow[]; context: string }
// Scan populated rows and named headers. No absolute row/column location participates in import.
export const scanSheet = (book: Workbook, name: string, units: UnitContext): Block[] => {
  const ws = book.getWorksheet(name)
  if (!ws || (!['Analysis', 'Resistance'].includes(name) && ws.state !== 'visible')) return fail('WORKBOOK_FORMAT', `Missing worksheet: ${name}.`)
  if (ws.rowCount > MAX_ROWS || ws.columnCount > 64) return fail('WORKBOOK_RESOURCE_LIMIT', `${name}: worksheet exceeds the import size limit.`)
  const blocks: Block[] = []
  let active: Block | undefined
  let columns: Array<number | undefined> | undefined
  ws.eachRow((source, rowNumber) => {
    const cells: Array<{ col: number; value: Scalar }> = []
    const context = `${name} row ${rowNumber}`
    source.eachCell((cell, col) => {
      const value = cellScalar(cell.value, `${name}!${cell.address}`)
      if (!blank(value)) cells.push({ col, value })
    })
    if (!cells.length) return
    const first = textOrEmpty(cells[0].value)
    if (cells.length === 1 && first.trimStart().startsWith('#')) return
    const ring = name === 'Section' ? /^(OUTER|HOLE)\s*#\s*(\d+)$/i.exec(first.trim()) : null
    const keyword = ring ? ring[1].toUpperCase() : normalized(cells[0].value)
    if (ring || (sheetKeywords[name].includes(keyword) && (keyword !== 'LOADINGS' || cells.length === 1))) {
      if (active && !columns) return fail('WORKBOOK_FORMAT', `${active.context}: missing column header.`)
      const start = cells[0].col
      const args: Scalar[] = ring ? [integer(ring[2], context)] : []
      if (ring && cells.length !== 1) return fail('WORKBOOK_FORMAT', `${context}: use a single-cell outer #ID or hole #ID marker.`)
      for (let col = start + 1; col <= cells.at(-1)!.col; col++) args.push(cellScalar(source.getCell(col).value, context))
      active = { keyword, args, rows: [], context }
      blocks.push(active)
      columns = undefined
      return
    }
    if (!active) return fail('WORKBOOK_FORMAT', `${context}: expected a table keyword (or # comment).`)
    const headers = active.keyword.endsWith('_CURVE') ? ['Strain (1)', `Stress (${quantityUnit('stress', units)})`] : blockHeaders[active.keyword]
    const names = cells.map((c) => normalized(c.value))
    const headerNames = headers.map((h) => normalized(h))
    const required = headers.filter((h) => !optionalColumns(active!.keyword).includes(h)).map((h) => normalized(h))
    if (!columns || required.every((h) => names.includes(h))) {
      if (new Set(names).size !== names.length || names.some((h) => !headerNames.includes(h)) || !required.every((h) => names.includes(h))) {
        return fail('WORKBOOK_FORMAT', `${context}: ${active.keyword} requires columns: ${headers.join(', ')}. Keep column names.`)
      }
      columns = headerNames.map((h) => cells[names.indexOf(h)]?.col)
      return
    }
    if (cells.some((cell) => !columns!.includes(cell.col))) return fail('WORKBOOK_FORMAT', `${context}: data outside the table columns.`)
    active.rows.push({ values: columns.map((col) => col === undefined ? null : cellScalar(source.getCell(col).value, context)),
      notes: columns.map(col => col === undefined ? undefined : source.getCell(col).note), context })
  })
  if (active && !columns) return fail('WORKBOOK_FORMAT', `${active.context}: missing column header.`)
  return blocks
}
const textOrEmpty = (value: Scalar) => typeof value === 'string' ? value : ''
const select = (blocks: Block[], keyword: string, required = true): Block[] => {
  const result = blocks.filter((b) => b.keyword === keyword)
  if (required && !result.length) return fail('WORKBOOK_FORMAT', `Missing table keyword: ${keyword}.`)
  return result
}
const single = (blocks: Block[], keyword: string) => {
  const result = select(blocks, keyword)
  if (result.length !== 1) return fail('WORKBOOK_FORMAT', `Duplicate table keyword: ${keyword}.`)
  return result[0]
}
const args = (block: Block, count: number) => {
  if (block.args.length !== count) return fail('WORKBOOK_FORMAT', `${block.context}: ${block.keyword} expects ${count} marker values.`)
  return block.args
}
const recordRows = (blocks: Block[], keyword: string) =>
  select(blocks, keyword).flatMap((b) => { args(b, 0); return b.rows })
const setField = (target: Fields, path: string, value: unknown, context: string) => {
  const parts = path.split('.')
  if (parts.length > 16 || parts.some((part) => !/^(?:[A-Za-z][A-Za-z0-9]*|\d+)$/.test(part) || ['__proto__', 'prototype', 'constructor'].includes(part))) {
    return fail('WORKBOOK_CELL', `${context}: invalid field path.`)
  }
  let node: Fields | unknown[] = target
  for (let i = 0; i < parts.length; i++) {
    const key = parts[i], numeric = /^\d+$/.test(key)
    if (numeric !== Array.isArray(node)) return fail('WORKBOOK_CELL', `${context}: inconsistent array/object path.`)
    if (numeric && Number(key) >= MAX_ROWS) return fail('WORKBOOK_RESOURCE_LIMIT', `${context}: array index exceeds import limit.`)
    const previous: unknown = Array.isArray(node) ? node[Number(key)] : node[key]
    if (i === parts.length - 1) {
      if (previous !== undefined) return fail('WORKBOOK_CELL', `${context}: duplicate/conflicting field ${path}.`)
      if (Array.isArray(node)) node[Number(key)] = value
      else node[key] = value
    } else {
      const nextIsArray = /^\d+$/.test(parts[i + 1])
      const child: unknown = previous ?? (nextIsArray ? [] : {})
      if ((!isObject(child) && !Array.isArray(child)) || Array.isArray(child) !== nextIsArray) return fail('WORKBOOK_CELL', `${context}: conflicting field ${path}.`)
      if (Array.isArray(node)) node[Number(key)] = child
      else node[key] = child
      node = child
    }
  }
}
const readFields = (block: Block, scope: Scope, markerValues = 0, units: UnitContext = CANONICAL_WORKBOOK_UNITS): Fields => {
  args(block, markerValues)
  const result: Fields = {}
  for (const { values: [label, raw], notes, context } of block.rows) {
    const name = text(label, context).trim()
    const path = scope === 'projectInformation' ? Object.entries(PROJECT_LABELS).find(([, label]) => label === name)?.[0] ?? name : name.replace(/ \([^)]+\)$/, '')
    const spec = specFor(scope, path, context, units)
    if (name !== spec.label) return fail('WORKBOOK_CELL', `${context}: expected field/unit label "${spec.label}".`)
    let value: unknown
    switch (spec.type) {
      case 'string': value = text(raw, context); break
      case 'number': {
        const quantity = fieldQuantity(spec.path)
        value = quantity ? readQuantityCell(quantity, number(raw, context), units, notes[1]) : number(raw, context)
        break
      }
      case 'boolean':
        if (typeof raw === 'boolean') value = raw
        else if (typeof raw === 'string' && /^(true|false)$/i.test(raw.trim())) value = raw.trim().toLowerCase() === 'true'
        else return fail('WORKBOOK_CELL', `${context}: expected TRUE or FALSE.`)
        break
      case 'array': case 'object':
        if (raw !== (spec.type === 'array' ? '[]' : '{}')) return fail('WORKBOOK_CELL', `${context}: expected an empty ${spec.type} marker.`)
        value = spec.type === 'array' ? [] : {}
        break
    }
    setField(result, spec.path, value, context)
  }
  const checkArrays = (value: unknown): void => {
    if (Array.isArray(value)) {
      if (value.length !== Object.keys(value).length) return fail('WORKBOOK_CELL', `${block.context}: field arrays require consecutive indexes starting at 0.`)
      value.forEach(checkArrays)
    } else if (isObject(value)) Object.values(value).forEach(checkArrays)
  }
  checkArrays(result)
  return result
}
// Optional hidden identity hints preserve existing rows; new/copied rows get fresh editor IDs.
const rowIds = (rows: InputRow[], column: number, warnings: string[], label: string): Map<InputRow, number> => {
  const hints = rows.map((row) => blank(row.values[column]) ? undefined : integer(row.values[column], row.context))
  const reserved = new Set(hints.filter((id): id is number => id !== undefined))
  const assigned = new Set<number>()
  let copies = 0
  const unique = hints.map((id) => {
    if (id === undefined) return undefined
    if (assigned.has(id)) { copies++; return undefined }
    assigned.add(id)
    return id
  })
  const fresh = allocateIds(unique.filter((id) => id === undefined).length, reserved)
  let next = 0
  if (copies) warnings.push(`${label}: assigned new technical IDs to ${copies} copied row(s).`)
  return new Map(rows.map((row, i) => [row, unique[i] ?? fresh[next++]]))
}
const readSection = (blocks: Block[], identity: Fields, warnings: string[], units: UnitContext) => {
  type Point = { id: number; x: number; y: number }
  type Outer = { id: number; points: Point[]; holes: Array<{ id: number; points: Point[] }> }
  const ids = rowIds(blocks.flatMap((b) => b.rows), 2, warnings, 'Section')
  const points = (b: Block): Point[] => b.rows.map((row) => ({
    id: ids.get(row)!, x: readQuantityCell('length', number(row.values[0], row.context), units, row.notes[0]), y: readQuantityCell('length', number(row.values[1], row.context), units, row.notes[1])
  }))
  const outerIds = new Set<number>(), holeIds = new Set<number>()
  const outers: Outer[] = []
  let current: Outer | undefined
  for (const b of blocks) {
    const id = integer(args(b, 1)[0], b.context)
    if (b.keyword === 'OUTER') {
      if (outerIds.has(id)) return fail('WORKBOOK_CELL', `${b.context}: duplicate outer #${id}.`)
      outerIds.add(id)
      current = { id, points: points(b), holes: [] }
      outers.push(current)
    } else {
      if (!current) return fail('WORKBOOK_CELL', `${b.context}: hole #${id} requires an outer above it.`)
      if (holeIds.has(id)) return fail('WORKBOOK_CELL', `${b.context}: duplicate hole #${id}.`)
      holeIds.add(id)
      current.holes.push({ id, points: points(b) })
    }
  }
  return { ...identity, outers }
}

export const readProjectWorkbookModel = (book: Workbook, profile: CalculationProfileId, legacyDiameterOnly: boolean): ProjectWorkbookResult => {
  try {
    const declaredUnits = readWorkbookUnits(book, FORMAT)
    const sheets = new Map(Object.keys(sheetKeywords).map((name) => [name, scanSheet(book, name, declaredUnits)]))
    const blocks = (name: string) => sheets.get(name)!
    const identityWarnings: string[] = []
    const geometry: Fields = readSection(blocks('Section'), readFields(single(blocks('Analysis'), 'SECTION_METADATA'), 'section'), identityWarnings, declaredUnits)
    const barRows = recordRows(blocks('Rebar'), 'REBAR')
    const barIds = rowIds(barRows, 4, identityWarnings, 'Rebar')
    const bars = barRows.map((row) => {
      const displayedDiameter = number(row.values[0], row.context)
      const displayedArea = blank(row.values[5]) ? undefined : number(row.values[5], row.context)
      const source = blank(row.values[6]) ? undefined : parseRebarAreaSource(JSON.parse(text(row.values[6], `${row.context} As source`)))
      // Keep the recorded pair only while both authored cells still match its display conversion.
      const unchanged = source && source.type !== 'manual' &&
        displayedDiameter === fromCanonical('barDiameter', source.dia, declaredUnits) &&
        displayedArea === fromCanonical('area', source.area, declaredUnits) ? source : undefined
      const area = unchanged?.area ?? (displayedArea === undefined ? undefined : readQuantityCell('area', displayedArea, declaredUnits, row.notes[5]))
      return {
        id: barIds.get(row)!, ...(blank(row.values[3]) ? {} : { steelMaterialId: integer(row.values[3], row.context) }),
        dia: unchanged?.dia ?? readQuantityCell('barDiameter', displayedDiameter, declaredUnits, row.notes[0]),
        x: readQuantityCell('length', number(row.values[1], row.context), declaredUnits, row.notes[1]),
        y: readQuantityCell('length', number(row.values[2], row.context), declaredUnits, row.notes[2]),
        ...(area === undefined ? {} : { area }),
        ...(source === undefined ? {} : { areaSource: unchanged ?? { type: 'manual' } })
      }
    })
    if (legacyDiameterOnly && bars.some(bar => bar.area !== undefined || bar.areaSource !== undefined)) {
      return fail('WORKBOOK_CELL', 'Stored rebar area does not belong to the legacy diameter-only project.')
    }
    geometry.rebars = legacyDiameterOnly ? bars.map(bar => withStoredRebarArea(bar,
      calculationProfile(profile).mechanics === 'equivalent-rectangular-block' ? 'equivalent-block' : 'stress-strain')) : bars
    const materialBlocks = blocks('Material')
    const materials = readFields(single(materialBlocks, 'MATERIAL'), 'material')
    const readMaterial = (b: Block, scope: 'concrete' | 'steel'): Fields & { id: number } =>
      ({ ...readFields(b, scope, 1, declaredUnits), id: integer(b.args[0], b.context) })
    const concrete = readMaterial(single(materialBlocks, 'CONCRETE'), 'concrete')
    assertDefaultResistanceCompatible(profile, isObject(concrete.stressStrain) ? concrete.stressStrain.type : undefined)
    materials.concrete = concrete
    const steelIds = new Set<number>()
    const steel = select(materialBlocks, 'STEEL', false).map((b) => {
      const material = readMaterial(b, 'steel')
      if (steelIds.has(material.id)) return fail('WORKBOOK_CELL', `${b.context}: duplicate STEEL ID ${material.id}.`)
      steelIds.add(material.id)
      return material
    })
    materials.steel = steel
    for (const [keyword, items] of [['CONCRETE_CURVE', [concrete]], ['STEEL_CURVE', steel]] as const) {
      const seen = new Set<number>()
      for (const b of select(materialBlocks, keyword, false)) {
        const id = integer(args(b, 1)[0], b.context)
        const material: Fields | undefined = items.find((m) => m.id === id)
        if (seen.has(id)) return fail('WORKBOOK_CELL', `${b.context}: duplicate ${keyword} ID ${id}.`)
        seen.add(id)
        if (!material || !isObject(material.stressStrain) || material.stressStrain.type !== 'user-curve') return fail('WORKBOOK_CELL', `${b.context}: curve does not reference a user-curve material.`)
        material.stressStrain.points = b.rows.map(({ values: v, notes, context }) => ({ strain: number(v[0], context), stress: readQuantityCell('stress', number(v[1], context), declaredUnits, notes[1]) }))
      }
      for (const material of items as Fields[]) {
        if (isObject(material.stressStrain) && material.stressStrain.type === 'user-curve' && !seen.has(material.id as number)) {
          return fail('WORKBOOK_CELL', `Material ${material.id}: missing ${keyword} table.`)
        }
      }
    }
    const loadRows = recordRows(blocks('Loadings'), 'LOADINGS')
    const loadIds = rowIds(loadRows, 4, identityWarnings, 'Loadings')
    // v1 authored moments at its declared input origin. v2 stores centroidal moments.
    const reference = book.getWorksheet('Load reference') ? readLoadReferenceSheet(book, declaredUnits, true) : CENTROID_LOAD_REFERENCE
    if (legacyDiameterOnly && (reference.offsetX !== 0 || reference.offsetY !== 0)) {
      return fail('WORKBOOK_CELL', 'A legacy diameter-only project requires centroidal moments.')
    }
    const combinations = loadRows.map((row) => resultantAtCentroid(createLoadCombination({ id: loadIds.get(row)!,
      name: text(row.values[0], row.context), P: readQuantityCell('force', number(row.values[1], row.context), declaredUnits, row.notes[1]),
      Mx: readQuantityCell('moment', number(row.values[2], row.context), declaredUnits, row.notes[2]), My: readQuantityCell('moment', number(row.values[3], row.context), declaredUnits, row.notes[3])
    }), reference))
    const defaults = createEmptyProjectDocument()
    const parsed = parseProjectDocument({
      ...defaults,
      meta: { ...defaults.meta, name: geometry.name },
      inputs: {
        calculationProfileId: profile,
        geometry,
        materials,
        loadings: { ...createEmptyLoadingsInput(), combinations },
        analysis: createAnalysisOptionsForProfile(profile),
        design: createDesignBasisForCalculationProfile(profile)
      }
    })
    if (!parsed.ok) return { ...parsed, code: 'PROJECT_INPUT' }
    for (const bar of parsed.document.inputs.geometry.rebars) {
      if (bar.steelMaterialId !== undefined && !steelIds.has(bar.steelMaterialId)) return fail('WORKBOOK_CELL', `Rebar ID ${bar.id}: unknown Steel Material ID ${bar.steelMaterialId}.`)
    }
    return { ...parsed, warnings: [...parsed.warnings, ...identityWarnings] }
  } catch (error) {
    return { ok: false, code: error instanceof WorkbookInputError ? error.code : 'WORKBOOK_FORMAT',
      error: error instanceof Error ? error.message : 'Could not read the project workbook.' }
  }
}

