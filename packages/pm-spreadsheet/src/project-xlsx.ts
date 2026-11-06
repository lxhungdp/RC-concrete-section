import type { Workbook, Worksheet } from 'exceljs'
import { CALCULATION_PROFILES, type PmProjectDocument } from '@pm/project'
import { compileSteelMaterial, steelMaterialIssues } from '@pm/materials'
import { fieldQuantity, parseQuantityUnitSelection, parseUnitSelection, quantityUnit, type UnitContext, type UnitSelection } from '@pm/units'
import { inspectWorkbookArchive, WORKBOOK_MAX_BYTES } from './workbook-archive'
import { CANONICAL_WORKBOOK_UNITS, encodeQuantityCell, readQuantityCell, writeWorkbookUnits, quantityCell } from './workbook-units'
import { allowedBinding, candidatePaths, canActivateStoredField, decodeValue, encodeValue, fieldLabel, fieldRole, makeFieldContext, materialBindings, selectedInputPath, STEEL_YIELD_SOURCE, UNIT_LABELS, type FieldContext, type FieldValue } from './project-workbook-fields'
import { buildProjectWorkbookModel, readProjectWorkbookModel, scanSheet, specFor, fail, WorkbookInputError,
  projectWorkbookFileName, type Block, type InputRow, type ProjectWorkbookResult, type Scalar, type Scope } from './project-workbook-codec'

export { projectWorkbookFileName, type ProjectWorkbookResult }
export const PROJECT_WORKBOOK_MAX_BYTES = WORKBOOK_MAX_BYTES
const SUBJECT = 'P-M project inputs / 2'
const LEGACY_SUBJECT = 'P-M project inputs / 1'
const FORMAT = 'pm-column-input-workbook'
const MAX_ROWS = 100_000
export const PROJECT_INPUT_TEXT_COLOR = 'FF00008B'
export const PROJECT_WORKBOOK_SHEETS = ['Section', 'Rebar', 'Material', 'Loadings'] as const
const LEGACY_INPUT_SHEETS = ['Project', ...PROJECT_WORKBOOK_SHEETS, 'Load reference', 'Units'] as const
export const projectWorkbookInputSheets = (subject: string) =>
  subject === SUBJECT ? PROJECT_WORKBOOK_SHEETS : subject === LEGACY_SUBJECT ? LEGACY_INPUT_SHEETS
    : fail('WORKBOOK_FORMAT', 'Unsupported P-M Project XLSX format.')
type GroupDef = { sheet: string; title: string; scope?: Scope; owner?: boolean }
const GROUPS: Record<string, GroupDef> = {
  SECTION_METADATA: { sheet: 'Section', title: 'Section', scope: 'section' },
  OUTER: { sheet: 'Section', title: 'Outer', owner: true }, HOLE: { sheet: 'Section', title: 'Hole', owner: true },
  REBAR: { sheet: 'Rebar', title: 'Rebars' }, MATERIAL: { sheet: 'Material', title: 'Defaults', scope: 'material' },
  CONCRETE: { sheet: 'Material', title: 'Concrete', scope: 'concrete', owner: true },
  STEEL: { sheet: 'Material', title: 'Steel', scope: 'steel', owner: true },
  CONCRETE_CURVE: { sheet: 'Material', title: 'Concrete curve', owner: true },
  STEEL_CURVE: { sheet: 'Material', title: 'Steel curve', owner: true },
  LOADINGS: { sheet: 'Loadings', title: 'Loadcases' }
}
type SavedGroup = { key: string; keyword: string; paths: string[]; stored: FieldValue[]; bindings: Array<{ target: string; source: string }> }
type Metadata = { groups: SavedGroup[]; barSources: Array<{ id: number; source: string }>; sourceUnits?: UnitSelection }
type HumanBlock = { keyword: string; args: Scalar[]; rows: InputRow[]; template?: string }
const keyOf = (block: Pick<Block, 'keyword' | 'args'>) => `${block.keyword}:${block.args.join(':')}`
const scalar = (value: unknown, context: string): Scalar => {
  if (value == null) return null
  if (typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return fail('WORKBOOK_CELL', `${context}: use finite, plain input values; paste values instead of formulas.`)
}
const string = (value: unknown, context: string): string => typeof value === 'string' ? value : fail('WORKBOOK_FORMAT', `${context}: text is required.`)
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const array = (value: unknown, context: string): unknown[] => Array.isArray(value) && value.length <= MAX_ROWS ? value : fail('WORKBOOK_FORMAT', `${context}: invalid input metadata.`)
const positiveId = (value: Scalar, context: string): number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : fail('WORKBOOK_CELL', `${context}: a positive number is required.`)
const excel = async () => { const module = await import('exceljs'); return module.default ?? module }
const clearBook = (book: Workbook) => { for (const sheet of [...book.worksheets]) book.removeWorksheet(sheet.id) }
const row = (values: Scalar[], notes: InputRow['notes'] = [], context = 'Workbook'): InputRow => ({ values, notes, context })
const pathOf = (label: Scalar): string => string(label, 'Field').replace(/ \([^)]+\)$/, '')
const TEMPLATE_PREFIX = 'Input template: '
const codecHeaders = (keyword: string, units: UnitContext): string[] => {
  if (GROUPS[keyword].scope) return ['Field', 'Value']
  switch (keyword) {
    case 'OUTER': case 'HOLE': return ['X', 'Y', 'ID']
    case 'REBAR': return ['Diameter', 'X', 'Y', 'Steel Material ID', 'ID', 'As', 'As source']
    case 'LOADINGS': return ['Name', 'P', 'Mx', 'My', 'ID']
    default: return ['Strain (1)', `Stress (${quantityUnit('stress', units)})`]
  }
}
const humanHeaders = (keyword: string, units: UnitContext): string[] => {
  const unit = (q: Parameters<typeof quantityUnit>[0]) => quantityUnit(q, units)
  if (GROUPS[keyword].scope) return ['Parameter', 'Value']
  switch (keyword) {
    case 'OUTER': case 'HOLE': return [`x (${unit('length')})`, `y (${unit('length')})`, 'ID']
    case 'REBAR': return [`db (${unit('barDiameter')})`, `x (${unit('length')})`, `y (${unit('length')})`, 'Steel', 'ID', `As (${unit('area')})`]
    case 'LOADINGS': return ['Name', `P (${unit('force')})`, `Mx (${unit('moment')})`, `My (${unit('moment')})`, 'ID']
    default: return ['ε (1)', `σ (${unit('stress')})`]
  }
}

/** Presentation only: classify editable values from the visible table layout, never source colours. */
export function formatProjectWorkbook(book: Workbook): void {
  for (const sheet of book.worksheets) {
    for (const column of sheet.columns) {
      // Column style setters create missing cells in other rows. Keep sparse sheets sparse.
      column.style = { ...column.style, font: {}, fill: { type: 'pattern', pattern: 'none' }, border: {} }
    }
    let table: { field: boolean; header: boolean; valueColumn: number } | undefined
    sheet.eachRow(source => {
      source.eachCell(cell => { cell.style = { ...cell.style } })
      source.font = {}; source.fill = { type: 'pattern', pattern: 'none' }; source.border = {}
      const cells: Array<{ col: number; text: string }> = []
      source.eachCell((cell, col) => {
        // Imported cells may share a style object. Detach before assigning this cell's role.
        cell.style = { ...cell.style, font: {}, fill: { type: 'pattern', pattern: 'none' }, border: {} }
        // Cached labels may guide appearance only. They never become validated project inputs.
        const value = cell.formula ? cell.result : cell.value
        if (value !== null && value !== undefined && value !== '' && !String(value).startsWith(TEMPLATE_PREFIX)) cells.push({ col, text: String(value).trim() })
      })
      if (!cells.length || cells.length === 1 && cells[0].text.startsWith('#')) return
      const group = Object.values(GROUPS).find(def => def.sheet === sheet.name && def.title.toUpperCase() === cells[0].text.toUpperCase() && cells.length === (def.owner ? 2 : 1))
      if (group) {
        table = { field: group.scope !== undefined, header: true, valueColumn: 2 }
        if (group.owner) source.getCell(cells[1].col).font = { color: { argb: PROJECT_INPUT_TEXT_COLOR } }
        return
      }
      const label = cells.find(cell => cell.text === 'Parameter' || cell.text === 'Quantity')
      const value = cells.find(cell => cell.text === 'Value' || cell.text === 'Unit')
      if (label && value) { table = { field: true, header: false, valueColumn: value.col }; return }
      if (!table) return
      if (table.header) { table.header = false; return }
      source.eachCell((cell, col) => {
        if (!table!.field || col === table!.valueColumn) cell.font = { color: { argb: PROJECT_INPUT_TEXT_COLOR } }
      })
    })
  }
}
const caption = (sheet: Worksheet) => {
  sheet.addRow([`# ${sheet.name}`])
  sheet.views = [{ state: 'normal', showGridLines: false }]
  sheet.getColumn(1).width = 30; sheet.getColumn(2).width = 36
  for (let i = 3; i <= 6; i++) sheet.getColumn(i).width = 23
}
const header = (sheet: Worksheet, values: Scalar[]) => {
  const added = sheet.addRow(values)
  return added
}
const inputs = (sheet: Worksheet, values: Scalar[]) => {
  const added = sheet.addRow(values)
  added.height = 18
  for (let i = 0; i < values.length; i++) {
    const cell = added.getCell(i + 1)
    cell.alignment = { vertical: 'middle', wrapText: typeof values[i] === 'string' }
    cell.numFmt = typeof values[i] === 'number' ? Number.isInteger(values[i]) ? '0' : '0.###############' : '@'
    if (typeof values[i] === 'string') {
      const value = String(values[i]), width = (sheet.getColumn(i + 1).width ?? 23) * .85
      const lines = value.split(/\r?\n/).reduce((count, part) => count + Math.max(1, Math.ceil(part.length / width)), 0)
      added.height = Math.min(409, Math.max(added.height, lines * 15 + 3))
    }
  }
}
const fieldContext = (block: Block, profileId: string): FieldContext => makeFieldContext(
  block.rows.map(r => ({ path: pathOf(r.values[0]), value: r.values[1] })), profileId)

/** Engineering input sheets; readonly transport identity is stored once in document properties. */
export async function buildProjectWorkbook(project: PmProjectDocument, selection: UnitSelection = CANONICAL_WORKBOOK_UNITS): Promise<Uint8Array> {
  const units = parseUnitSelection(selection)
  const book = await buildProjectWorkbookModel(project, units)
  const source = ['Section', 'Rebar', 'Material', 'Loadings', 'Analysis'].flatMap(name => scanSheet(book, name, units))
  source.sort((a, b) => Number(b.keyword === 'SECTION_METADATA') - Number(a.keyword === 'SECTION_METADATA'))
  const meta: Metadata = { groups: [], barSources: [], sourceUnits: units }
  clearBook(book)
  for (const name of PROJECT_WORKBOOK_SHEETS) caption(book.addWorksheet(name))
  for (const block of source) {
    const def = GROUPS[block.keyword]
    const sheet = book.getWorksheet(def.sheet)!
    const output: InputRow[] = []
    if (def.scope) {
      const context = fieldContext(block, project.inputs.calculationProfileId)
      const bindings = materialBindings(def.scope, context)
      const saved: SavedGroup = { key: keyOf(block), keyword: block.keyword, paths: [], stored: [], bindings }
      if (block.keyword === 'MATERIAL') {
        output.push(row(['Profile', encodeValue('inputs.calculationProfileId', project.inputs.calculationProfileId)]))
      }
      for (const field of context.fields) {
        const spec = specFor(def.scope, field.path, 'Export', units)
        const role = fieldRole(def.scope, field.path, context)
        if (role === 'derived' || bindings.some(binding => binding.target === field.path)) continue
        if (role === 'stored' || spec.type === 'array' || spec.type === 'object') {
          const quantity = fieldQuantity(field.path)
          const source = block.rows.find(item => pathOf(item.values[0]) === field.path)
          saved.stored.push(quantity && typeof field.value === 'number'
            ? { ...field, value: readQuantityCell(quantity, field.value, units, source?.notes[1]) }
            : field)
        } else {
          saved.paths.push(field.path)
          output.push(row([fieldLabel(def.scope, field.path, context, units), encodeValue(field.path, field.value)]))
        }
      }
      meta.groups.push(saved)
    } else if (block.keyword === 'REBAR') {
      for (const item of block.rows) {
        if (typeof item.values[4] === 'number' && typeof item.values[6] === 'string') meta.barSources.push({ id: item.values[4], source: item.values[6] })
        output.push(row(item.values.slice(0, 6)))
      }
    } else output.push(...block.rows)
    if (!output.length && def.scope) continue
    if (sheet.rowCount > 1) sheet.addRow([])
    const marker = header(sheet, [def.title, ...block.args])
    if (def.owner && def.scope) {
      // A copied material table carries its template identity even when its material ID changes.
      marker.getCell(3).value = TEMPLATE_PREFIX + keyOf(block)
      sheet.getColumn(3).hidden = true
    }
    header(sheet, humanHeaders(block.keyword, units))
    output.forEach(item => inputs(sheet, item.values))
  }
  for (const [sheetName, column] of [['Section', 3], ['Rebar', 5], ['Loadings', 5]] as const) book.getWorksheet(sheetName)!.getColumn(column).hidden = true
  book.subject = SUBJECT
  book.description = JSON.stringify(meta)
  formatProjectWorkbook(book)
  const bytes = new Uint8Array(await book.xlsx.writeBuffer())
  const issue = inspectWorkbookArchive(new Uint8Array(bytes).buffer, 'Project workbook')
  if (issue) fail(issue.code, issue.message)
  return bytes
}

// Both versions normalize the input tables through the same field codec.
const keysExactly = (value: Record<string, unknown>, keys: string[], context: string) => {
  if (Object.keys(value).sort().join('|') !== [...keys].sort().join('|')) fail('WORKBOOK_FORMAT', `${context}: unsupported metadata fields.`)
}
function metadataOf(book: Workbook): Metadata & { legacyDiameterOnly: boolean } {
  projectWorkbookInputSheets(book.subject)
  const legacy = book.subject === LEGACY_SUBJECT
  if (typeof book.description !== 'string' || new TextEncoder().encode(book.description).length > WORKBOOK_MAX_BYTES) return fail('WORKBOOK_FORMAT', 'Missing or oversized input identity.')
  const raw: unknown = JSON.parse(book.description)
  if (!record(raw)) return fail('WORKBOOK_FORMAT', 'Missing input identity.')
  const hasSourceUnits = !legacy && Object.hasOwn(raw, 'sourceUnits')
  keysExactly(raw, legacy ? ['groups', 'checkBasisPresent', 'barSources']
    : hasSourceUnits ? ['groups', 'barSources', 'sourceUnits'] : ['groups', 'barSources'], 'Workbook')
  const sourceUnits = hasSourceUnits ? parseUnitSelection(raw.sourceUnits) : undefined
  const declaredGroups = array(raw.groups, 'Groups')
  const legacyDiameterOnly = legacy && declaredGroups.some(group => record(group) && group.keyword === 'PROJECT_METADATA' &&
    Array.isArray(group.stored) && group.stored.some(field => record(field) && field.path === 'version' && field.value === 1))
  const groups: SavedGroup[] = declaredGroups.filter(value =>
    !legacy || !record(value) || !['PROJECT', 'PROJECT_METADATA', 'ANALYSIS', 'RESISTANCE'].includes(String(value.keyword))
  ).map(value => {
    if (!record(value)) return fail('WORKBOOK_FORMAT', 'Invalid input group identity.')
    keysExactly(value, ['key', 'keyword', 'paths', 'stored', 'bindings'], 'Group')
    const keyword = string(value.keyword, 'Group'), key = string(value.key, 'Group')
    if (!GROUPS[keyword]?.scope || !key.startsWith(`${keyword}:`)) return fail('WORKBOOK_FORMAT', 'Unknown input group identity.')
    const paths = array(value.paths, 'Input fields').map(path => string(path, 'Input field'))
    if (new Set(paths).size !== paths.length) return fail('WORKBOOK_FORMAT', 'Duplicate input field identity.')
    paths.forEach(path => specFor(GROUPS[keyword].scope!, path, 'Input identity'))
    const stored: FieldValue[] = array(value.stored, 'Readonly fields').map(field => {
      if (!record(field)) return fail('WORKBOOK_FORMAT', 'Invalid readonly field.')
      keysExactly(field, ['path', 'value'], 'Readonly field')
      return { path: string(field.path, 'Readonly field'), value: scalar(field.value, 'Readonly field') }
    })
    const bindings = array(value.bindings, 'Field bindings').map(binding => {
      if (!record(binding)) return fail('WORKBOOK_FORMAT', 'Invalid field binding.')
      keysExactly(binding, ['target', 'source'], 'Field binding')
      const target = string(binding.target, 'Field binding'), source = string(binding.source, 'Field binding')
      if (!allowedBinding(GROUPS[keyword].scope!, target, source)) return fail('WORKBOOK_FORMAT', 'Unsupported field binding.')
      return { target, source }
    })
    return { key, keyword, paths, stored, bindings }
  })
  if (new Set(groups.map(group => group.key)).size !== groups.length) return fail('WORKBOOK_FORMAT', 'Duplicate group identity.')
  const barSources = array(raw.barSources, 'As sources').map(value => {
    if (!record(value)) return fail('WORKBOOK_FORMAT', 'Invalid As source identity.')
    keysExactly(value, ['id', 'source'], 'As source')
    return { id: positiveId(scalar(value.id, 'As source'), 'As source'), source: string(value.source, 'As source') }
  })
  if (new Set(barSources.map(source => source.id)).size !== barSources.length) return fail('WORKBOOK_FORMAT', 'Duplicate As source identity.')
  return { groups, barSources, sourceUnits, legacyDiameterOnly }
}
function parameterRows(sheet: Worksheet, only?: string): InputRow[] {
  if (sheet.state !== 'visible' || sheet.rowCount > MAX_ROWS || sheet.columnCount > 64) {
    return fail('WORKBOOK_FORMAT', 'Missing or oversized legacy input table.')
  }
  const rows: InputRow[] = []
  let columns: [number, number] | undefined
  sheet.eachRow(source => {
    if (only && !(source.values as unknown[]).includes(only) && !(source.values as unknown[]).includes('Parameter')) return
    const cells: Array<{ col: number; value: Scalar }> = []
    source.eachCell((cell, col) => { const value = scalar(cell.value, `${sheet.name}!${cell.address}`); if (value !== null && value !== '') cells.push({ col, value }) })
    if (!cells.length || (cells.length === 1 && String(cells[0].value).trimStart().startsWith('#'))) return
    const parameter = cells.find(cell => cell.value === 'Parameter'), value = cells.find(cell => cell.value === 'Value')
    if (parameter && value && cells.length === 2) { columns = [parameter.col, value.col]; return }
    if (Object.values(GROUPS).some(def => def.sheet === sheet.name && def.title === cells[0].value && cells.length === (def.owner ? 2 : 1))) return
    if (!columns) fail('WORKBOOK_FORMAT', `${sheet.name}: missing Parameter / Value headers.`)
    if (cells.some(cell => !columns!.includes(cell.col))) fail('WORKBOOK_FORMAT', `${sheet.name}: data outside Parameter / Value columns.`)
    rows.push(row(columns!.map(col => scalar(source.getCell(col).value, sheet.name)), columns!.map(col => source.getCell(col).note), `${sheet.name} row ${source.number}`))
  })
  return rows
}
function readUnits(book: Workbook): UnitContext {
  const sheet = book.getWorksheet('Units')
  if (!sheet || sheet.rowCount > 100 || sheet.columnCount > 64) return fail('WORKBOOK_FORMAT', 'Missing or oversized Units sheet.')
  const groups: Record<string, string> = {}
  let columns: [number, number] | undefined
  sheet.eachRow(source => {
    const cells: Array<{ col: number; value: Scalar }> = []
    source.eachCell((cell, col) => { const value = scalar(cell.value, `Units!${cell.address}`); if (value !== null && value !== '') cells.push({ col, value }) })
    if (!cells.length || (cells.length === 1 && String(cells[0].value).trimStart().startsWith('#'))) return
    const quantity = cells.find(cell => cell.value === 'Quantity'), unit = cells.find(cell => cell.value === 'Unit')
    if (quantity && unit && cells.length === 2) { columns = [quantity.col, unit.col]; return }
    if (!columns || cells.some(cell => !columns!.includes(cell.col))) fail('WORKBOOK_CELL', 'Units: missing Quantity / Unit headers or data outside input columns.')
    const values = columns!.map(col => scalar(source.getCell(col).value, 'Units'))
    const key = Object.entries(UNIT_LABELS).find(([, label]) => label === values[0])?.[0]
    if (!key || values.length !== 2 || typeof values[1] !== 'string' || Object.hasOwn(groups, key)) fail('WORKBOOK_CELL', `Units row ${source.number}: missing, unknown or duplicate quantity declaration (${String(values[0])}).`)
    groups[key!] = string(values[1], 'Unit')
  })
  return parseQuantityUnitSelection({ version: 1, groups })
}
function scanHuman(book: Workbook, units: UnitContext): HumanBlock[] {
  const result: HumanBlock[] = []
  for (const name of PROJECT_WORKBOOK_SHEETS) {
    const sheet = book.getWorksheet(name)
    if (!sheet || sheet.state !== 'visible') fail('WORKBOOK_FORMAT', `Missing input sheet: ${name}.`)
    if (sheet!.rowCount > MAX_ROWS || sheet!.columnCount > 64) fail('WORKBOOK_RESOURCE_LIMIT', `${name}: input sheet exceeds the size limit.`)
    let active: HumanBlock | undefined, columns: number[] | undefined
    sheet!.eachRow(source => {
      const cells: Array<{ col: number; value: Scalar }> = []
      source.eachCell((cell, col) => { const value = scalar(cell.value, `${name}!${cell.address}`); if (value !== null && value !== '') cells.push({ col, value }) })
      if (!cells.length || (cells.length === 1 && String(cells[0].value).trimStart().startsWith('#'))) return
      const templateCell = cells.find(cell => typeof cell.value === 'string' && cell.value.startsWith(TEMPLATE_PREFIX))
      const markerCells = templateCell ? cells.filter(cell => cell !== templateCell) : cells
      const def = Object.entries(GROUPS).find(([, def]) => def.sheet === name && def.title.toUpperCase() === String(markerCells[0]?.value).trim().toUpperCase() && markerCells.length === (def.owner ? 2 : 1))
      if (def) {
        if (active && !columns) fail('WORKBOOK_FORMAT', `${name}: missing table headers.`)
        const [keyword, definition] = def
        const args = definition.owner ? [positiveId(cells[1].value, `${name} ${definition.title}`)] : []
        const note = source.getCell(cells[0].col).note
        const noteText = typeof note === 'string' ? note : note?.texts?.map(part => part.text ?? '').join('') ?? ''
        const template = templateCell ? String(templateCell.value).slice(TEMPLATE_PREFIX.length)
          : book.subject === LEGACY_SUBJECT && noteText.startsWith(TEMPLATE_PREFIX) ? noteText.slice(TEMPLATE_PREFIX.length) : undefined
        active = { keyword, args, rows: [], ...(template ? { template } : {}) }; result.push(active); columns = undefined
        return
      }
      if (!active) fail('WORKBOOK_FORMAT', `${name} row ${source.number}: input outside a named table.`)
      const expected = humanHeaders(active!.keyword, units)
      const normalized = (value: unknown) => String(value ?? '').trim().toUpperCase()
      const headerColumns = expected.map(label => cells.find(cell => normalized(cell.value) === normalized(label))?.col)
      // Optional technical identity hints may be hidden/removed. They never supply engineering defaults.
      const optional = (label: string) => label === 'ID' || (active!.keyword === 'REBAR' && label === 'Steel')
      if (expected.every((label, i) => headerColumns[i] !== undefined || optional(label)) && cells.every(cell => expected.some(label => normalized(label) === normalized(cell.value)))) {
        columns = headerColumns.map(col => col ?? 0); return
      }
      if (!columns) fail('WORKBOOK_FORMAT', `${name} row ${source.number}: missing headers or mismatched source units.`)
      if (cells.some(cell => !columns!.includes(cell.col))) fail('WORKBOOK_FORMAT', `${name} row ${source.number}: data outside input columns.`)
      active!.rows.push(row(columns!.map(col => col ? scalar(source.getCell(col).value, `${name} row ${source.number}`) : null),
        columns!.map(col => col && book.subject === LEGACY_SUBJECT ? source.getCell(col).note : undefined), `${name} row ${source.number}`))
    })
    if (active && !columns) fail('WORKBOOK_FORMAT', `${name}: missing table headers.`)
  }
  return result
}
function requiredGroup(meta: Metadata, block: HumanBlock): SavedGroup {
  const key = block.template ?? keyOf(block)
  const saved = meta.groups.find(group => group.key === key && group.keyword === block.keyword)
  return saved ?? fail('WORKBOOK_FORMAT', `${GROUPS[block.keyword].title}: missing input template; copy its complete block to create a new material.`)
}
function contextFor(saved: SavedGroup, block: HumanBlock, profileId: string): FieldContext {
  const fields: FieldValue[] = [...saved.stored, ...saved.paths.map(path => ({ path, value: null }))]
  const update = (path: string, value: Scalar) => {
    const index = fields.findIndex(field => field.path === path)
    if (index < 0) fields.push({ path, value }); else fields[index] = { path, value }
  }
  for (const path of ['stressStrain.type', 'stressStrain.strainLimit.type', 'stressStrain.ultimateStrength.type', 'samplingMode', 'mesh.sizing.type', 'directions.seed.type', 'transition.type']) {
    const candidates = saved.paths.filter(candidate => candidate === path)
    if (!candidates.length) continue
    const labels: Record<string, string> = { 'stressStrain.type': 'Curve', 'stressStrain.strainLimit.type': 'Cutoff input', 'stressStrain.ultimateStrength.type': 'Peak input', samplingMode: 'Mode', 'mesh.sizing.type': 'Mesh sizing', 'directions.seed.type': 'Direction input', 'transition.type': 'εt rule' }
    const input = block.rows.find(r => r.values[0] === labels[path])
    update(path, input ? decodeValue(path, input.values[1]) : fail('WORKBOOK_CELL', `${GROUPS[block.keyword].title}: missing ${labels[path]}.`))
  }
  const cap = block.rows.find(r => r.values[0] === 'Axial cap')
  if (cap) update('axialCapEnabled', cap.values[1])
  return makeFieldContext(fields, profileId)
}
function decodeFields(block: HumanBlock, saved: SavedGroup, profileId: string, units: UnitContext): InputRow[] {
  const scope = GROUPS[block.keyword].scope!
  const context = contextFor(saved, block, profileId)
  const extra = candidatePaths(scope)
  const paths = [...new Set([...saved.paths, ...extra])]
  const inputPaths = new Set(saved.paths)
  const labels = new Map<string, string[]>()
  for (const path of paths) {
    if ((fieldRole(scope, path, context) === 'input' || inputPaths.has(path)) && selectedInputPath(scope, path, context)) {
      const label = fieldLabel(scope, path, context, units)
      labels.set(label, [...(labels.get(label) ?? []), path])
    }
  }
  const decoded = new Map<string, InputRow>()
  const cleared = new Set<string>()
  for (const item of block.rows) {
    const label = string(item.values[0], item.context).trim()
    const matches = labels.get(label) ?? []
    if (matches.length !== 1) fail('WORKBOOK_CELL', `${item.context}: unknown or ambiguous parameter "${label}" or mismatched unit.`)
    const path = matches[0]
    if (decoded.has(path) || cleared.has(path)) fail('WORKBOOK_CELL', `${item.context}: duplicate parameter ${label}.`)
    const spec = specFor(scope, path, item.context, units)
    const value = decodeValue(path, item.values[1])
    // A physical steel cap is optional. Clearing it removes the cap; it never means zero.
    if (scope === 'steel' && path === 'limits.epsU' && (value === null || value === '')) { cleared.add(path); continue }
    decoded.set(path, row([spec.label, value], item.notes, item.context))
  }
  for (const path of saved.paths) {
    if (selectedInputPath(scope, path, context) && !decoded.has(path) && !cleared.has(path)) fail('WORKBOOK_CELL', `${GROUPS[block.keyword].title}: missing ${fieldLabel(scope, path, context, units)}.`)
  }
  for (const field of saved.stored) {
    const spec = specFor(scope, field.path, 'Readonly input identity', units)
    const container = (spec.type === 'array' && field.value === '[]') || (spec.type === 'object' && field.value === '{}')
    if (inputPaths.has(field.path)) fail('WORKBOOK_FORMAT', 'Readonly metadata cannot shadow an input.')
    if (container && [...decoded.keys()].some(path => path.startsWith(`${field.path}.`))) continue
    if (canActivateStoredField(scope, field.path) && fieldRole(scope, field.path, context) === 'input') {
      if (!decoded.has(field.path)) fail('WORKBOOK_CELL', `${GROUPS[block.keyword].title}: add ${fieldLabel(scope, field.path, context, units)} for the selected input mode.`)
      continue
    }
    if (!container && fieldRole(scope, field.path, context) !== 'stored') fail('WORKBOOK_FORMAT', 'Readonly metadata cannot contain or override an editable input.')
    if (decoded.has(field.path)) fail('WORKBOOK_FORMAT', 'Metadata conflicts with an input cell.')
    const quantity = fieldQuantity(field.path)
    if (quantity) {
      const canonical = typeof field.value === 'number' ? field.value : fail('WORKBOOK_FORMAT', 'Invalid readonly quantity.')
      const encoded = encodeQuantityCell(quantityCell(quantity, canonical, units))
      decoded.set(field.path, row([spec.label, encoded.value], [undefined, encoded.note]))
    } else decoded.set(field.path, row([spec.label, field.value]))
  }
  for (const binding of saved.bindings) {
    if (decoded.has(binding.target)) fail('WORKBOOK_FORMAT', 'A bound parameter has a second input source.')
    if (binding.source === STEEL_YIELD_SOURCE) {
      const model = context.fields.find(field => field.path === 'stressStrain.type')?.value
      if (scope !== 'steel' || (model !== 'elastic-perfectly-plastic' && model !== 'bilinear')) fail('WORKBOOK_FORMAT', 'A derived steel yield snapshot requires its matching material model.')
      continue
    }
    const source = decoded.get(binding.source)
    if (!source) fail('WORKBOOK_CELL', 'The source of a material boundary is missing.')
    decoded.set(binding.target, row([specFor(scope, binding.target, 'Material boundary', units).label, source!.values[1]], source!.notes))
  }
  return [...decoded.values()]
}
function addNormalized(book: Workbook, keyword: string, args: Scalar[], data: InputRow[], units: UnitContext) {
  const sheetName = keyword === 'SECTION_METADATA' ? 'Analysis' : GROUPS[keyword].sheet
  const sheet = book.getWorksheet(sheetName)!
  if (sheet.rowCount) sheet.addRow([])
  sheet.addRow(keyword === 'OUTER' || keyword === 'HOLE' ? [`${keyword.toLowerCase()} #${args[0]}`] : [keyword, ...args])
  sheet.addRow(codecHeaders(keyword, units))
  data.forEach(item => { const added = sheet.addRow(item.values); item.notes.forEach((note, i) => { if (note !== undefined) added.getCell(i + 1).note = note }) })
}

/** Checks readonly format identity without evaluating or trusting formula caches. */
export function projectWorkbookProperties(book: Workbook): Readonly<{ subject: string; description: string }> {
  metadataOf(book)
  return { subject: book.subject, description: book.description }
}

/** Consumes an in-memory plain-value workbook through the same validator as file import. */
export function readProjectWorkbookInputs(book: Workbook): ProjectWorkbookResult {
  try {
    const meta = metadataOf(book)
    const legacy = book.subject === LEGACY_SUBJECT
    const units = legacy ? readUnits(book) : meta.sourceUnits ?? CANONICAL_WORKBOOK_UNITS
    const blocks = scanHuman(book, units)
    const material = blocks.find(block => block.keyword === 'MATERIAL')
    const projectSheet = legacy ? book.getWorksheet('Project') : undefined
    if (legacy && !projectSheet) fail('WORKBOOK_FORMAT', 'Missing legacy Project profile.')
    const profileRows = (legacy ? parameterRows(projectSheet!, 'Profile') : material?.rows ?? []).filter(row => row.values[0] === 'Profile')
    if (profileRows.length !== 1) fail('WORKBOOK_CELL', 'Exactly one Profile input is required.')
    if (!legacy && material) material.rows = material.rows.filter(row => row.values[0] !== 'Profile')
    const profileId = string(decodeValue('inputs.calculationProfileId', profileRows[0].values[1]), 'Profile')
    const profile = CALCULATION_PROFILES.find(profile => profile.id === profileId)
    if (!profile) return fail('WORKBOOK_CELL', 'Unsupported calculation profile.')
    // Legacy coordinates need their old origin to recover the centroidal actions.
    const offsets: InputRow[] = []
    if (legacy) {
      const frame = book.getWorksheet('Load reference')
      if (!frame) return fail('WORKBOOK_FORMAT', 'Missing legacy Load reference sheet.')
      for (const r of parameterRows(frame)) {
        const axis = ['xO', 'yO'].find(axis => r.values[0] === `${axis} (${quantityUnit('length', units)})`)
        if (!axis || offsets.some(item => item.values[0] === axis)) fail('WORKBOOK_CELL', 'Load reference: unknown, duplicate or mismatched-unit offset.')
        offsets.push(row([axis!, r.values[1]], r.notes))
      }
      if (offsets.length !== 2) fail('WORKBOOK_CELL', 'Load reference requires xO and yO.')
    }
    const normalized: Array<{ block: HumanBlock; data: InputRow[] }> = []
    const barSources = new Map(meta.barSources.map(source => [source.id, source.source]))
    const seen = new Set<string>()
    for (const block of blocks) {
      if (GROUPS[block.keyword].scope) {
        const key = keyOf(block)
        if (seen.has(key)) fail('WORKBOOK_CELL', 'Duplicate input block.')
        seen.add(key)
        const saved = requiredGroup(meta, block), data = decodeFields(block, saved, profileId, units)
        normalized.push({ block, data })
      } else if (block.keyword === 'REBAR') normalized.push({ block, data: block.rows.map(item => row([...item.values, typeof item.values[4] === 'number' ? barSources.get(item.values[4]) ?? null : null], item.notes)) })
      else normalized.push({ block, data: block.rows })
    }
    for (const keyword of ['SECTION_METADATA', 'REBAR', 'MATERIAL', 'CONCRETE', 'LOADINGS']) {
      if (!normalized.some(item => item.block.keyword === keyword)) fail('WORKBOOK_FORMAT', `Missing ${GROUPS[keyword].title} inputs.`)
    }
    clearBook(book)
    for (const name of [...PROJECT_WORKBOOK_SHEETS, 'Analysis']) book.addWorksheet(name)
    for (const item of normalized) addNormalized(book, item.block.keyword, item.block.args, item.data, units)
    if (legacy) {
      const ref = book.addWorksheet('Load reference')
      ref.addRows([['LOAD_REFERENCE', 1], ['Moment basis', 'load-reference'], ['Kind', 'centroid-offset']])
      for (const item of offsets) {
        const added = ref.addRow([`${item.values[0] === 'xO' ? 'Offset X' : 'Offset Y'} (${quantityUnit('length', units)})`, item.values[1]])
        if (item.notes[1]) added.getCell(2).note = item.notes[1]
      }
    }
    writeWorkbookUnits(book, units, FORMAT)
    const result = readProjectWorkbookModel(book, profile.id, meta.legacyDiameterOnly)
    if (!result.ok) return result
    for (const block of blocks.filter(block => block.keyword === 'STEEL')) {
      if (!requiredGroup(meta, block).bindings.some(binding => binding.source === STEEL_YIELD_SOURCE)) continue
      const material = result.document.inputs.materials.steel.find(material => material.id === block.args[0])!
      const yieldStrain = compileSteelMaterial(material).limits.epsYield
      if (yieldStrain === undefined || !Number.isFinite(yieldStrain)) fail('PROJECT_INPUT', 'The material owner did not resolve a finite steel yield strain.')
      material.limits = { epsY: yieldStrain, epsU: material.limits?.epsU }
      const issues = steelMaterialIssues(material)
      if (issues.length) fail('PROJECT_INPUT', issues.map(issue => `${issue.path}: ${issue.message}`).join(' '))
    }
    return result
  } catch (error) {
    return { ok: false, code: error instanceof WorkbookInputError ? error.code : 'WORKBOOK_FORMAT', error: error instanceof Error ? error.message : 'Could not read the project workbook.' }
  }
}

export async function importProjectWorkbook(buffer: ArrayBuffer): Promise<ProjectWorkbookResult> {
  try {
    const issue = inspectWorkbookArchive(buffer, 'Project workbook'); if (issue) fail(issue.code, issue.message)
    const ExcelJS = await excel(), book = new ExcelJS.Workbook(); await book.xlsx.load(buffer)
    return readProjectWorkbookInputs(book)
  } catch (error) {
    return { ok: false, code: error instanceof WorkbookInputError ? error.code : 'WORKBOOK_FORMAT', error: error instanceof Error ? error.message : 'Could not read the project workbook.' }
  }
}
