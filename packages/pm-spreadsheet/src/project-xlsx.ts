import type { Workbook, Worksheet } from 'exceljs'
import { ANALYSIS_OPTIONS_VERSION, CALCULATION_PROFILES, PM_PROJECT_SCHEMA, demandCheckBasisOf, type PmProjectDocument } from '@pm/project'
import { compileSteelMaterial, steelMaterialIssues } from '@pm/materials'
import { designBasisIssues, designBasisRequiresOverrideReason } from '@pm/design'
import { fieldQuantity, parseQuantityUnitSelection, quantityUnit, type UnitContext } from '@pm/units'
import { inspectWorkbookArchive, WORKBOOK_MAX_BYTES } from './workbook-archive'
import { CANONICAL_WORKBOOK_UNITS, encodeQuantityCell, readQuantityCell, readWorkbookUnits, quantityCell } from './workbook-units'
import { allowedBinding, candidatePaths, canActivateStoredField, CRITERION_LABELS, decodeValue, encodeValue, fieldLabel, fieldRole, indexedInputPath, makeFieldContext, materialBindings, selectedInputPath, STEEL_YIELD_SOURCE, UNIT_LABELS, type FieldContext, type FieldValue } from './project-workbook-fields'
import { buildProjectWorkbookModel, readProjectWorkbookModel, scanSheet, specFor, fail, WorkbookInputError,
  projectWorkbookFileName, type Block, type InputRow, type ProjectWorkbookResult, type Scalar, type Scope } from './project-workbook-codec'

export { projectWorkbookFileName, type ProjectWorkbookResult }
export const PROJECT_WORKBOOK_MAX_BYTES = WORKBOOK_MAX_BYTES
const SUBJECT = 'P-M project inputs / 1'
const FORMAT = 'pm-column-input-workbook'
const MAX_ROWS = 100_000
export const PROJECT_INPUT_TEXT_COLOR = 'FF00008B'
export const PROJECT_WORKBOOK_SHEETS = ['Project', 'Section', 'Rebar', 'Material', 'Loadings', 'Load reference', 'Options', 'Resistance', 'Units'] as const
const SHEETS = PROJECT_WORKBOOK_SHEETS
type GroupDef = { sheet: string; title: string; scope?: Scope; owner?: boolean }
const GROUPS: Record<string, GroupDef> = {
  PROJECT: { sheet: 'Project', title: 'Project', scope: 'projectInformation' },
  PROJECT_METADATA: { sheet: 'Project', title: 'Design', scope: 'project' },
  SECTION_METADATA: { sheet: 'Section', title: 'Section', scope: 'section' },
  OUTER: { sheet: 'Section', title: 'Outer', owner: true }, HOLE: { sheet: 'Section', title: 'Hole', owner: true },
  REBAR: { sheet: 'Rebar', title: 'Rebars' }, MATERIAL: { sheet: 'Material', title: 'Defaults', scope: 'material' },
  CONCRETE: { sheet: 'Material', title: 'Concrete', scope: 'concrete', owner: true },
  STEEL: { sheet: 'Material', title: 'Steel', scope: 'steel', owner: true },
  CONCRETE_CURVE: { sheet: 'Material', title: 'Concrete curve', owner: true },
  STEEL_CURVE: { sheet: 'Material', title: 'Steel curve', owner: true },
  LOADINGS: { sheet: 'Loadings', title: 'Loadcases' }, ANALYSIS: { sheet: 'Options', title: 'Sampling', scope: 'analysis' },
  STATIONS: { sheet: 'Options', title: 'Points' }, RESISTANCE: { sheet: 'Resistance', title: 'Resistance', scope: 'resistance' }
}
type SavedGroup = { key: string; keyword: string; paths: string[]; stored: FieldValue[]; bindings: Array<{ target: string; source: string }> }
type Metadata = { groups: SavedGroup[]; checkBasisPresent: boolean; barSources: Array<{ id: number; source: string }> }
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
const pathOf = (scope: Scope, label: Scalar): string => {
  const text = string(label, 'Field').replace(/ \([^)]+\)$/, '')
  if (scope !== 'projectInformation') return text
  const names: Record<string, string> = { Name: 'meta.name', Client: 'meta.information.client', Company: 'meta.information.company',
    'Designed by': 'meta.information.designedBy', 'Checked by': 'meta.information.checkedBy', Address: 'meta.information.address', Date: 'meta.information.date' }
  return names[text] ?? fail('WORKBOOK_CELL', `Unknown project input: ${text}.`)
}
const codecHeaders = (keyword: string, units: UnitContext): string[] => {
  if (GROUPS[keyword].scope) return ['Field', 'Value']
  switch (keyword) {
    case 'OUTER': case 'HOLE': return ['X', 'Y', 'ID']
    case 'REBAR': return ['Diameter', 'X', 'Y', 'Steel Material ID', 'ID', 'As', 'As source']
    case 'LOADINGS': return ['Name', 'P', 'Mx', 'My', 'ID']
    case 'STATIONS': return ['ID', 'Label', 'Type', 'Ratio (1)', 'Strain (1)']
    default: return ['Strain (1)', `Stress (${quantityUnit('stress', units)})`]
  }
}
const humanHeaders = (keyword: string, units: UnitContext, fibre: boolean): string[] => {
  const unit = (q: Parameters<typeof quantityUnit>[0]) => quantityUnit(q, units)
  if (GROUPS[keyword].scope) return ['Parameter', 'Value']
  switch (keyword) {
    case 'OUTER': case 'HOLE': return [`x (${unit('length')})`, `y (${unit('length')})`, 'ID']
    case 'REBAR': return [`db (${unit('barDiameter')})`, `x (${unit('length')})`, `y (${unit('length')})`, 'Steel', 'ID', `As (${unit('area')})`]
    case 'LOADINGS': return ['Name', `P (${unit('force')})`, `Mx (${unit('moment')})`, `My (${unit('moment')})`, 'ID']
    case 'STATIONS': return fibre ? ['No.', 'Name', 'Criterion', 'Value'] : ['Criterion', 'Value']
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
        if (value !== null && value !== undefined && value !== '') cells.push({ col, text: String(value).trim() })
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
  sheet.views = [{ state: 'frozen', ySplit: 3, showGridLines: false }]
  sheet.getColumn(1).width = 30; sheet.getColumn(2).width = 36
  for (let i = 3; i <= 6; i++) sheet.getColumn(i).width = 23
}
const header = (sheet: Worksheet, values: Scalar[]) => {
  const added = sheet.addRow(values)
  return added
}
const inputs = (sheet: Worksheet, values: Scalar[], notes: InputRow['notes']) => {
  const added = sheet.addRow(values)
  added.height = 18
  for (let i = 0; i < values.length; i++) {
    const cell = added.getCell(i + 1)
    const note = notes[i]
    if (note !== undefined) cell.note = note
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
  block.rows.map(r => ({ path: pathOf(GROUPS[block.keyword].scope!, r.values[0]), value: r.values[1] })), profileId)

/** Engineering input sheets; readonly transport identity is stored once in document properties. */
export async function buildProjectWorkbook(project: PmProjectDocument, units: UnitContext = CANONICAL_WORKBOOK_UNITS): Promise<Uint8Array> {
  const book = await buildProjectWorkbookModel(project, units)
  const declared = readWorkbookUnits(book, FORMAT)
  const source = ['Project', 'Section', 'Rebar', 'Material', 'Loadings', 'Analysis', 'Resistance'].flatMap(name => scanSheet(book, name, declared))
  source.sort((a, b) => Number(b.keyword === 'SECTION_METADATA') - Number(a.keyword === 'SECTION_METADATA'))
  const reference = book.getWorksheet('Load reference')!
  const offsets = [4, 5].map(n => ({ value: scalar(reference.getCell(n, 2).value, 'Load reference'), note: reference.getCell(n, 2).note }))
  const meta: Metadata = { groups: [], checkBasisPresent: project.inputs.loadings.checkBasis !== undefined, barSources: [] }
  const fibre = project.inputs.analysis.methodId === 'strain-domain-surface-v1'
  clearBook(book)
  for (const name of SHEETS) caption(book.addWorksheet(name))
  for (const block of source) {
    const def = GROUPS[block.keyword]
    const sheet = book.getWorksheet(def.sheet)!
    const output: InputRow[] = []
    if (def.scope) {
      let context = fieldContext(block, project.inputs.calculationProfileId)
      if (block.keyword === 'PROJECT_METADATA' && !meta.checkBasisPresent) context = makeFieldContext([...context.fields, { path: 'inputs.loadCheckBasis', value: demandCheckBasisOf(project.inputs.loadings) }], context.profileId)
      const bindings = materialBindings(def.scope, context)
      const saved: SavedGroup = { key: keyOf(block), keyword: block.keyword, paths: [], stored: [], bindings }
      const sourceRows = new Map(block.rows.map(r => [pathOf(def.scope!, r.values[0]), r]))
      for (const field of context.fields) {
        const original = sourceRows.get(field.path)
        const spec = specFor(def.scope, field.path, 'Export', declared)
        const role = fieldRole(def.scope, field.path, context)
        if (role === 'derived' || bindings.some(binding => binding.target === field.path)) continue
        if (role === 'stored' || spec.type === 'array' || spec.type === 'object') {
          const quantity = fieldQuantity(field.path)
          const value = quantity && typeof field.value === 'number' ? readQuantityCell(quantity, field.value, declared, original?.notes[1]) : field.value
          saved.stored.push({ path: field.path, value })
        } else {
          saved.paths.push(field.path)
          output.push(row([fieldLabel(def.scope, field.path, context, declared), encodeValue(field.path, field.value)], [undefined, original?.notes[1]]))
        }
      }
      meta.groups.push(saved)
    } else {
      for (const item of block.rows) {
        if (block.keyword === 'REBAR') {
          if (typeof item.values[4] === 'number' && typeof item.values[6] === 'string') meta.barSources.push({ id: item.values[4], source: item.values[6] })
          output.push(row(item.values.slice(0, 6), item.notes.slice(0, 6)))
        } else if (block.keyword === 'STATIONS') {
          const type = string(item.values[2], 'Point criterion'), label = CRITERION_LABELS[type]
          if (!label) fail('WORKBOOK_CELL', `Unsupported point criterion: ${type}.`)
          const value = item.values[3] ?? item.values[4]
          output.push(row(fibre ? [item.values[0], item.values[1], label, value] : [label, value]))
        } else output.push(item)
      }
    }
    if (!output.length && def.scope) continue
    if (sheet.rowCount > 1) sheet.addRow([])
    const marker = header(sheet, [def.title, ...block.args])
    marker.getCell(1).note = `Input template: ${keyOf(block)}`
    header(sheet, humanHeaders(block.keyword, declared, fibre))
    output.forEach(item => inputs(sheet, item.values, item.notes))
  }
  for (const [sheetName, column] of [['Section', 3], ['Rebar', 5], ['Loadings', 5]] as const) book.getWorksheet(sheetName)!.getColumn(column).hidden = true
  const frame = book.getWorksheet('Load reference')!
  frame.views = [{ state: 'frozen', ySplit: 2, showGridLines: false }]
  header(frame, ['Parameter', 'Value'])
  offsets.forEach((offset, i) => inputs(frame, [`${i === 0 ? 'xO' : 'yO'} (${quantityUnit('length', declared)})`, offset.value], [undefined, offset.note]))
  const unitSheet = book.getWorksheet('Units')!
  unitSheet.views = [{ state: 'frozen', ySplit: 2, showGridLines: false }]
  header(unitSheet, ['Quantity', 'Unit'])
  for (const [quantity, unit] of Object.entries(declared.groups)) inputs(unitSheet, [UNIT_LABELS[quantity], unit], [])
  book.subject = SUBJECT
  book.description = JSON.stringify(meta)
  formatProjectWorkbook(book)
  const bytes = new Uint8Array(await book.xlsx.writeBuffer())
  const issue = inspectWorkbookArchive(new Uint8Array(bytes).buffer, 'Project workbook')
  if (issue) fail(issue.code, issue.message)
  return bytes
}

// The v1 reader normalizes this one human-facing format through the shared field codec.
const keysExactly = (value: Record<string, unknown>, keys: string[], context: string) => {
  if (Object.keys(value).sort().join('|') !== [...keys].sort().join('|')) fail('WORKBOOK_FORMAT', `${context}: unsupported metadata fields.`)
}
function metadataOf(book: Workbook): Metadata {
  if (book.subject !== SUBJECT) return fail('WORKBOOK_FORMAT', 'Only P-M project input workbook v1 is supported.')
  if (typeof book.description !== 'string' || new TextEncoder().encode(book.description).length > WORKBOOK_MAX_BYTES) return fail('WORKBOOK_FORMAT', 'Missing or oversized input identity.')
  const raw: unknown = JSON.parse(book.description)
  if (!record(raw)) return fail('WORKBOOK_FORMAT', 'Missing input identity.')
  keysExactly(raw, ['groups', 'checkBasisPresent', 'barSources'], 'Workbook')
  if (typeof raw.checkBasisPresent !== 'boolean') return fail('WORKBOOK_FORMAT', 'Invalid check-basis identity.')
  const groups: SavedGroup[] = array(raw.groups, 'Groups').map(value => {
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
  return { groups, barSources, checkBasisPresent: raw.checkBasisPresent }
}
function parameterRows(sheet: Worksheet): InputRow[] {
  const rows: InputRow[] = []
  let columns: [number, number] | undefined
  sheet.eachRow(source => {
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
function scanHuman(book: Workbook, units: UnitContext, fibre: boolean): HumanBlock[] {
  const result: HumanBlock[] = []
  for (const name of SHEETS.filter(name => name !== 'Units' && name !== 'Load reference')) {
    const sheet = book.getWorksheet(name)
    if (!sheet || sheet.state !== 'visible') fail('WORKBOOK_FORMAT', `Missing input sheet: ${name}.`)
    if (sheet!.rowCount > MAX_ROWS || sheet!.columnCount > 64) fail('WORKBOOK_RESOURCE_LIMIT', `${name}: input sheet exceeds the size limit.`)
    let active: HumanBlock | undefined, columns: number[] | undefined
    sheet!.eachRow(source => {
      const cells: Array<{ col: number; value: Scalar }> = []
      source.eachCell((cell, col) => { const value = scalar(cell.value, `${name}!${cell.address}`); if (value !== null && value !== '') cells.push({ col, value }) })
      if (!cells.length || (cells.length === 1 && String(cells[0].value).trimStart().startsWith('#'))) return
      const def = Object.entries(GROUPS).find(([, def]) => def.sheet === name && def.title.toUpperCase() === String(cells[0].value).trim().toUpperCase() && cells.length === (def.owner ? 2 : 1))
      if (def) {
        if (active && !columns) fail('WORKBOOK_FORMAT', `${name}: missing table headers.`)
        const [keyword, definition] = def
        const args = definition.owner ? [positiveId(cells[1].value, `${name} ${definition.title}`)] : []
        const note = source.getCell(cells[0].col).note
        const noteText = typeof note === 'string' ? note : note?.texts?.map(part => part.text ?? '').join('') ?? ''
        const template = noteText.startsWith('Input template: ') ? noteText.slice('Input template: '.length) : undefined
        active = { keyword, args, rows: [], ...(template ? { template } : {}) }; result.push(active); columns = undefined
        return
      }
      if (!active) fail('WORKBOOK_FORMAT', `${name} row ${source.number}: input outside a named table.`)
      const expected = humanHeaders(active!.keyword, units, fibre)
      const normalized = (value: unknown) => String(value ?? '').trim().toUpperCase()
      const headerColumns = expected.map(label => cells.find(cell => normalized(cell.value) === normalized(label))?.col)
      // Optional technical identity hints may be hidden/removed. They never supply engineering defaults.
      const optional = (label: string) => label === 'ID' || (active!.keyword === 'REBAR' && label === 'Steel')
      if (expected.every((label, i) => headerColumns[i] !== undefined || optional(label)) && cells.every(cell => expected.some(label => normalized(label) === normalized(cell.value)))) {
        columns = headerColumns.map(col => col ?? 0); return
      }
      if (!columns) fail('WORKBOOK_FORMAT', `${name} row ${source.number}: missing headers or units disagree with Units.`)
      if (cells.some(cell => !columns!.includes(cell.col))) fail('WORKBOOK_FORMAT', `${name} row ${source.number}: data outside input columns.`)
      active!.rows.push(row(columns!.map(col => col ? scalar(source.getCell(col).value, `${name} row ${source.number}`) : null),
        columns!.map(col => col ? source.getCell(col).note : undefined), `${name} row ${source.number}`))
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
  const fibre = CALCULATION_PROFILES.find(profile => profile.id === profileId)?.mechanics === 'stress-strain-integration'
  const extra = candidatePaths(scope).filter(path => scope !== 'analysis' || (fibre
    ? !path.startsWith('neutralAxisStations.') && !['directions.seedCount', 'directions.startDeg'].includes(path)
    : !path.startsWith('stations.') && !path.startsWith('directions.seed.') && !path.startsWith('mesh.')))
  const indexed = block.rows.flatMap(item => { const path = typeof item.values[0] === 'string' ? indexedInputPath(scope, item.values[0]) : undefined; return path ? [path] : [] })
  const paths = [...new Set([...saved.paths, ...extra, ...indexed])]
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
  // Required v1 controls are independent of the untrusted presence manifest.
  const required = scope === 'project' ? ['inputs.calculationProfileId', 'inputs.loadCheckBasis']
    : scope === 'analysis' && fibre ? ['mesh.sizing.type', 'mesh.maxCells', 'mesh.maxSubdivision',
      context.fields.find(field => field.path === 'mesh.sizing.type')?.value === 'fixed' ? 'mesh.sizing.cellSize' : 'mesh.sizing.seedDivisions'] : []
  for (const path of required) if (!decoded.has(path)) fail('WORKBOOK_CELL', `${GROUPS[block.keyword].title}: missing ${fieldLabel(scope, path, context, units)}.`)
  for (const path of saved.paths) {
    const indexed = /^(directions\.seed\.anglesDeg|directions\.refinement\.probe\.stationIds)\.\d+$/.test(path)
    if (!indexed && selectedInputPath(scope, path, context) && !decoded.has(path) && !cleared.has(path)) fail('WORKBOOK_CELL', `${GROUPS[block.keyword].title}: missing ${fieldLabel(scope, path, context, units)}.`)
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
  const sheetName = keyword === 'PROJECT_METADATA' || keyword === 'SECTION_METADATA' || keyword === 'ANALYSIS' || keyword === 'STATIONS' ? 'Analysis' : GROUPS[keyword].sheet
  const sheet = book.getWorksheet(sheetName)!
  if (sheet.rowCount) sheet.addRow([])
  sheet.addRow(keyword === 'OUTER' || keyword === 'HOLE' ? [`${keyword.toLowerCase()} #${args[0]}`] : [keyword, ...args])
  sheet.addRow(codecHeaders(keyword, units))
  data.forEach(item => { const added = sheet.addRow(item.values); item.notes.forEach((note, i) => { if (note !== undefined) added.getCell(i + 1).note = note }) })
}

/** Checks readonly v1 identity without evaluating or trusting formula caches. */
export function projectWorkbookProperties(book: Workbook): Readonly<{ subject: string; description: string }> {
  metadataOf(book)
  return { subject: book.subject, description: book.description }
}

/** Consumes an in-memory plain-value workbook through the same v1 validator as file import. */
export function readProjectWorkbookInputs(book: Workbook): ProjectWorkbookResult {
  try {
    const meta = metadataOf(book), units = readUnits(book)
    if (book.worksheets.some(sheet => !SHEETS.some(name => name === sheet.name))) fail('WORKBOOK_FORMAT', 'Unexpected worksheet; keep one project input source.')
    const projectSheet = book.getWorksheet('Project')
    if (!projectSheet) fail('WORKBOOK_FORMAT', 'Missing Project sheet.')
    const profileRows = parameterRows(projectSheet!).filter(row => row.values[0] === 'Profile')
    if (profileRows.length !== 1) fail('WORKBOOK_CELL', 'Exactly one Profile input is required.')
    const profileId = string(decodeValue('inputs.calculationProfileId', profileRows[0].values[1]), 'Profile')
    const profile = CALCULATION_PROFILES.find(profile => profile.id === profileId)
    if (!profile) fail('WORKBOOK_CELL', 'Unsupported calculation profile.')
    const fibre = profile!.mechanics === 'stress-strain-integration'
    const blocks = scanHuman(book, units, fibre)
    const frame = book.getWorksheet('Load reference')
    if (!frame) fail('WORKBOOK_FORMAT', 'Missing Load reference sheet.')
    const offsets: InputRow[] = []
    parameterRows(frame!).forEach(r => {
      const key = r.values[0]
      const axis = ['xO', 'yO'].find(axis => key === `${axis} (${quantityUnit('length', units)})`)
      if (!axis || offsets.some(item => item.values[0] === axis)) fail('WORKBOOK_CELL', 'Load reference: unknown, duplicate or mismatched-unit offset.')
      offsets.push(row([axis!, r.values[1]], r.notes))
    })
    if (offsets.length !== 2) fail('WORKBOOK_CELL', 'Load reference requires xO and yO.')
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
      } else if (block.keyword === 'STATIONS') {
        const allowed = fibre ? ['c-over-c1', 'depth-ratio', 'steel-stress-ratio', 'steel-strain', 'bar-tension-yield-ratio', 'strength-reduction-transition-ratio', 'strength-reduction-post-transition'] : ['depth-ratio', 'bar-tension-yield-ratio', 'extreme-tension-strain']
        normalized.push({ block, data: block.rows.map(item => {
          const criterion = fibre ? item.values[2] : item.values[0], value = fibre ? item.values[3] : item.values[1]
          const type = allowed.find(type => CRITERION_LABELS[type] === criterion)
          if (!type) fail('WORKBOOK_CELL', `${item.context}: unknown point criterion.`)
          const strain = ['steel-strain', 'extreme-tension-strain', 'strength-reduction-post-transition'].includes(type!)
          return row([fibre ? item.values[0] : null, fibre ? item.values[1] : null, type!, strain ? null : value, strain ? value : null])
        }) })
      } else if (block.keyword === 'REBAR') normalized.push({ block, data: block.rows.map(item => row([...item.values, typeof item.values[4] === 'number' ? barSources.get(item.values[4]) ?? null : null], item.notes)) })
      else normalized.push({ block, data: block.rows })
    }
    for (const keyword of ['PROJECT', 'PROJECT_METADATA', 'SECTION_METADATA', 'MATERIAL', 'CONCRETE', 'ANALYSIS', 'RESISTANCE']) {
      if (!normalized.some(item => item.block.keyword === keyword)) fail('WORKBOOK_FORMAT', `Missing ${GROUPS[keyword].title} inputs.`)
    }
    const analysis = normalized.find(item => item.block.keyword === 'ANALYSIS')!
    const modeRow = analysis.data.find(item => item.values[0] === 'samplingMode')
    const mode = modeRow?.values[1]
    if (mode !== 'fixed' && mode !== 'adaptive') fail('WORKBOOK_CELL', 'Sampling requires Fixed or Adaptive mode.')
    analysis.data.push(row(['optionsVersion', ANALYSIS_OPTIONS_VERSION]), row(['methodId', fibre ? 'strain-domain-surface-v1' : 'equivalent-block-surface-v1']),
      row([fibre ? 'stations.refinement.type' : 'neutralAxisStations.refinement.type', mode!]), row(['directions.refinement.type', mode!]))
    const identity = normalized.find(item => item.block.keyword === 'PROJECT_METADATA')!
    identity.data.push(row(['schema', PM_PROJECT_SCHEMA]))
    if (!meta.checkBasisPresent) identity.data = identity.data.filter(item => !(item.values[0] === 'inputs.loadCheckBasis' && item.values[1] === 'proportional3D'))
    clearBook(book)
    for (const name of ['Project', 'Section', 'Rebar', 'Material', 'Loadings', 'Analysis', 'Resistance']) book.addWorksheet(name)
    for (const item of normalized) addNormalized(book, item.block.keyword, item.block.args, item.data, units)
    const ref = book.addWorksheet('Load reference')
    ref.addRows([['LOAD_REFERENCE', 1], ['Moment basis', 'load-reference'], ['Kind', 'centroid-offset']])
    offsets.forEach(item => { const r = ref.addRow([`${item.values[0] === 'xO' ? 'Offset X' : 'Offset Y'} (${quantityUnit('length', units)})`, item.values[1]]); if (item.notes[1]) r.getCell(2).note = item.notes[1] })
    const unitSheet = book.addWorksheet('Units'); unitSheet.addRows([['pm-presentation-units', 1, FORMAT], ['Quantity', 'Unit'], ...Object.entries(units.groups)])
    const result = readProjectWorkbookModel(book)
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
    const basis = result.document.inputs.design
    // An authored coefficient override retains the owner's reason requirement and draft status.
    if (designBasisRequiresOverrideReason({ ...basis, modified: true })) basis.modified = true
    const issues = designBasisIssues(basis)
    if (issues.length) fail('PROJECT_INPUT', issues.join(' '))
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
