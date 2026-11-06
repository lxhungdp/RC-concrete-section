import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import ExcelJS from 'exceljs'
import { applyCalculationProfileToMaterials, CALCULATION_PROFILE_IDS, createAdaptiveAnalysisOptions, createAdaptiveEquivalentBlockAnalysisOptions,
  createEmptyProjectDocument, createProjectDocument, createEmptyLoadingsInput, parseProjectDocument, type PmProjectDocument } from '@pm/project'
import { createKdsAppendixDesignBasis } from '@pm/design'
import { CANONICAL_WORKBOOK_UNITS } from '../src/workbook-units'
import { fromCanonical, QUANTITY_UNIT_OPTIONS, quantityUnit, selectUnit, UNIT_PRESETS, type UnitSelection } from '@pm/units'
import { buildProjectWorkbook, importProjectWorkbook, projectWorkbookFileName } from '../src/project-xlsx'

const buffer = (bytes: Uint8Array) => new Uint8Array(bytes).buffer
const canonical = (raw: unknown): PmProjectDocument => {
  const parsed = parseProjectDocument(raw)
  assert.ok(parsed.ok, parsed.ok ? '' : parsed.error)
  return parsed.document
}
const example = () => canonical(JSON.parse(readFileSync('docs/examples/realistic-sections/KDS-REAL-05-complex-stress-strain.pm-project.json', 'utf8')))
const readBook = async (project = example(), units?: UnitSelection) => {
  const book = new ExcelJS.Workbook()
  await book.xlsx.load(buffer(await buildProjectWorkbook(project, units)))
  return book
}
const importBook = async (book: ExcelJS.Workbook) => importProjectWorkbook(buffer(new Uint8Array(await book.xlsx.writeBuffer())))
const imported = async (book: ExcelJS.Workbook) => {
  const parsed = await importBook(book)
  assert.ok(parsed.ok, parsed.ok ? '' : parsed.error)
  return parsed.document
}
const field = (book: ExcelJS.Workbook, sheet: string, label: string) => {
  const ws = book.getWorksheet(sheet)!
  for (let r = 1; r <= ws.rowCount; r++) if (ws.getCell(r, 1).value === label) return ws.getCell(r, 2)
  throw Error(`Missing ${sheet}: ${label}`)
}
const marker = (book: ExcelJS.Workbook, sheet: string, title: string, id?: number) => {
  const ws = book.getWorksheet(sheet)!
  for (let r = 1; r <= ws.rowCount; r++) if (ws.getCell(r, 1).value === title && (id === undefined || ws.getCell(r, 2).value === id)) return r
  throw Error(`Missing ${sheet}: ${title}`)
}
const removeField = (book: ExcelJS.Workbook, sheet: string, label: string) => {
  const cell = field(book, sheet, label); cell.worksheet.spliceRows(Number(cell.row), 1)
}

test('Project workbook v2 contains plain human input sheets, Greek labels and dark-blue inputs without fills or bold', async () => {
  const p = example()
  p.inputs.materials.steel[0].stressStrain = { type: 'linear-hardening', ultimateStrength: { type: 'ratio', ratio: 1.08 }, epsUk: .05, strainLimit: { type: 'factor', value: 1 } }
  const book = await readBook(canonical(p))
  assert.equal(book.subject, 'P-M project inputs / 2')
  assert.deepEqual(book.worksheets.map(ws => ws.name), ['Section', 'Rebar', 'Material', 'Loadings'])
  assert.ok(book.worksheets.every(ws => ws.state === 'visible'))
  assert.equal(book.getWorksheet('Analysis'), undefined)
  assert.equal(field(book, 'Material', 'Peak input').value, 'k = fu/fy')
  for (const [sheet, name] of [['Material', 'fck (MPa)'], ['Material', 'εuk (1)'], ['Material', 'αε (1)'], ['Material', 'Profile']]) {
    const input = field(book, sheet, name)
    assert.equal(input.font.color?.argb, 'FF00008B')
  }
  for (const ws of [...book.worksheets]) {
    assert.deepEqual(ws.getTables(), [])
    assert.ok(ws.views.every(view => view.state === 'normal'))
    ws.eachRow(row => row.eachCell(cell => {
      assert.notEqual(cell.type, ExcelJS.ValueType.Formula)
      assert.equal(cell.note, undefined)
      assert.equal(cell.isMerged, false)
      assert.notEqual(cell.font?.bold, true)
      assert.ok(!cell.fill || cell.fill.type === 'pattern' && cell.fill.pattern === 'none')
      if (typeof cell.value === 'string') assert.doesNotMatch(cell.value, /stressStrain\.|workbookFormat|workbookVersion|optionsVersion|basisVersion|verificationStatus|PROJECT_METADATA|SECTION_METADATA/)
    }))
  }
})

const expectedInputs = (project: PmProjectDocument) => canonical(createProjectDocument({
  calculationProfileId: project.inputs.calculationProfileId,
  geometry: project.inputs.geometry,
  materials: project.inputs.materials,
  loadings: { ...createEmptyLoadingsInput(), combinations: project.inputs.loadings.combinations }
})).inputs

test('UNITS-005: Project XLSX applies the selected units to values and headers and reads them back', async () => {
  const project = example()
  const { geometry, materials, loadings } = project.inputs
  Object.assign(loadings.combinations[0], { P: 2e6, Mx: -3e8, My: 4e8 })
  // A stored, noneditable material quantity stays canonical even when stress display changes.
  materials.concrete.elasticModulus = 31873.5467
  const custom = selectUnit(selectUnit(selectUnit(UNIT_PRESETS.metric, 'length', 'cm'), 'stress', 'GPa'), 'moment', 'N·m')
  for (const units of [UNIT_PRESETS.metric, UNIT_PRESETS.us, custom]) {
    const book = await readBook(project, units)
    const section = book.getWorksheet('Section')!, vertex = marker(book, 'Section', 'Outer') + 2
    const rebar = book.getWorksheet('Rebar')!, bar = marker(book, 'Rebar', 'Rebars') + 2
    const demand = book.getWorksheet('Loadings')!, load = marker(book, 'Loadings', 'Loadcases') + 2
    assert.equal(section.getCell(vertex - 1, 1).value, `x (${quantityUnit('length', units)})`)
    assert.equal(section.getCell(vertex, 1).value, fromCanonical('length', geometry.outers[0].points[0].x, units))
    assert.equal(rebar.getCell(bar - 1, 1).value, `db (${quantityUnit('barDiameter', units)})`)
    assert.equal(rebar.getCell(bar - 1, 6).value, `As (${quantityUnit('area', units)})`)
    assert.equal(rebar.getCell(bar, 1).value, fromCanonical('barDiameter', geometry.rebars[0].dia, units))
    assert.equal(rebar.getCell(bar, 6).value, fromCanonical('area', geometry.rebars[0].area!, units))
    assert.equal(field(book, 'Material', `fck (${quantityUnit('stress', units)})`).value, fromCanonical('stress', materials.concrete.fck, units))
    assert.equal(field(book, 'Material', `fy (${quantityUnit('stress', units)})`).value, fromCanonical('stress', materials.steel[0].fy, units))
    assert.equal(field(book, 'Material', `Es (${quantityUnit('modulus', units)})`).value, fromCanonical('modulus', materials.steel[0].elasticModulus, units))
    assert.deepEqual(demand.getRow(load - 1).values, [, 'Name', `P (${units.groups.force})`, `Mx (${units.groups.moment})`, `My (${units.groups.moment})`, 'ID'])
    assert.equal(demand.getCell(load, 2).value, fromCanonical('force', 2e6, units))
    assert.equal(demand.getCell(load, 3).value, fromCanonical('moment', -3e8, units))
    assert.equal(demand.getCell(load, 4).value, fromCanonical('moment', 4e8, units))
    if (units === UNIT_PRESETS.metric) assert.deepEqual((demand.getRow(load).values as ExcelJS.CellValue[]).slice(2, 5), [2000, -300, 400])
    const parsed = (await imported(book)).inputs
    const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) <= 4 * Number.EPSILON * Math.max(1, Math.abs(expected)))
    close(parsed.loadings.combinations[0].Mx, -3e8)
    close(parsed.geometry.rebars[0].area!, geometry.rebars[0].area!)
    close(parsed.materials.steel[0].elasticModulus, materials.steel[0].elasticModulus)
    assert.equal(parsed.materials.concrete.elasticModulus, materials.concrete.elasticModulus)
    assert.equal(book.worksheets.length, 4)
    for (const sheet of book.worksheets) sheet.eachRow(row => row.eachCell(cell => assert.equal(cell.note, undefined)))
  }
})

test('every canonical JSON fixture retains the four input groups and gets current defaults', async () => {
  for (const root of ['docs/examples/equivalent-block', 'docs/examples/realistic-sections', 'docs/examples/reference-case/projects']) {
    for (const name of readdirSync(root).filter(name => name.endsWith('.pm-project.json'))) {
      const project = canonical(JSON.parse(readFileSync(join(root, name), 'utf8')))
      if (name === 'P16_Column_ULS.pm-project.json') {
        await assert.rejects(buildProjectWorkbook(project), /Use Project JSON/)
      } else {
        assert.deepEqual((await imported(await readBook(project))).inputs, expectedInputs(project), name)
      }
    }
  }
})

test('all profiles, empty inputs and optional rebar assignments import with profile defaults', async () => {
  const base = example()
  const empty = createEmptyProjectDocument({ name: '' }); empty.meta.information.company = '구조 설계 — Công ty Á Châu'; empty.meta.information.date = ''
  const cases = [canonical(empty)]
  for (const profile of CALCULATION_PROFILE_IDS) cases.push(canonical(createProjectDocument({ calculationProfileId: profile,
    geometry: base.inputs.geometry, materials: applyCalculationProfileToMaterials(base.inputs.materials, profile) })))
  const fibre = example(); fibre.inputs.analysis = createAdaptiveAnalysisOptions(); cases.push(canonical(fibre))
  const block = structuredClone(cases.find(p => p.inputs.analysis.methodId === 'equivalent-block-surface-v1')!)
  block.inputs.analysis = createAdaptiveEquivalentBlockAnalysisOptions(); cases.push(canonical(block))
  const optional = example(); delete optional.inputs.geometry.rebars[0].steelMaterialId; cases.push(canonical(optional))
  for (const project of cases) assert.deepEqual((await imported(await readBook(project))).inputs, expectedInputs(project))
  assert.equal(projectWorkbookFileName(empty), 'pm-project.xlsx')
})

test('hardening ratio/stress and factor/absolute cutoff inputs are meaningful and retain their selected representation', async () => {
  for (const peak of [{ type: 'ratio', ratio: 1.08 }, { type: 'stress', stress: 550 }] as const) {
    for (const cutoff of [{ type: 'factor', value: .9 }, { type: 'absolute', value: .04 }] as const) {
      const p = example(); p.inputs.materials.steel[0].stressStrain = { type: 'linear-hardening', ultimateStrength: peak, epsUk: .05, strainLimit: cutoff }
      const project = canonical(p), book = await readBook(project)
      assert.equal(field(book, 'Material', 'Peak input').value, peak.type === 'ratio' ? 'k = fu/fy' : 'fu')
      assert.equal(field(book, 'Material', 'Cutoff input').value, cutoff.type === 'factor' ? 'αε · εuk' : 'εud')
      assert.deepEqual((await imported(book)).inputs, expectedInputs(project))
    }
  }
})

test('readonly compatibility data survives without appearing as an editable material input', async () => {
  const p = example(); p.inputs.materials.concrete.mc = 2412.1234567890123; p.inputs.materials.concrete.elasticModulus = 31234.567890123
  const project = canonical(p), book = await readBook(project)
  const labels = book.getWorksheet('Material')!.getColumn(1).values
  assert.ok(!labels.some(value => typeof value === 'string' && /^(mc|Ec|elasticModulus|standard|strainSign)/.test(value)))
  assert.deepEqual((await imported(book)).inputs, expectedInputs(project))
  const metadata = JSON.parse(book.description)
  assert.ok(metadata.groups.flatMap((group: { stored: unknown[] }) => group.stored).length > 0)
  assert.ok(metadata.groups.every((group: { paths: string[]; stored: Array<{ path: string }> }) => group.stored.every(value => !group.paths.includes(value.path))))
})

test('custom stress-strain curves retain independent controls and editable points', async () => {
  const base = example()
  const p = createProjectDocument({ calculationProfileId: 'custom-stress-strain', geometry: base.inputs.geometry,
    materials: applyCalculationProfileToMaterials(base.inputs.materials, 'custom-stress-strain') })
  p.inputs.materials.concrete.stressStrain = { type: 'user-curve', points: [{ strain: 0, stress: 0 }, { strain: .002, stress: 30 }, { strain: .0033, stress: 30 }], interpolation: 'linear', extrapolation: 'clamp', zeroTension: true }
  p.inputs.materials.steel[0].stressStrain = { type: 'user-curve', points: [{ strain: -.05, stress: -420 }, { strain: -.002, stress: -400 }, { strain: 0, stress: 0 }, { strain: .002, stress: 400 }, { strain: .05, stress: 420 }], interpolation: 'linear', extrapolation: 'clamp' }
  const project = canonical(p), book = await readBook(project)
  assert.deepEqual((await imported(book)).inputs, expectedInputs(project))
  const usBook = await readBook(project, UNIT_PRESETS.us)
  for (const [title, stress] of [['Concrete curve', 30], ['Steel curve', -400]] as const) {
    const start = marker(usBook, 'Material', title)
    const sheet = usBook.getWorksheet('Material')!
    assert.equal(sheet.getCell(start + 1, 2).value, 'σ (ksi)')
    assert.equal(sheet.getCell(start + 3, 2).value, fromCanonical('stress', stress, UNIT_PRESETS.us))
  }
  assert.ok((await importBook(usBook)).ok)
  const table = book.getWorksheet('Material')!, start = marker(book, 'Material', 'Concrete curve')
  table.getCell(start + 3, 2).value = 4.5
  const changed = await imported(book)
  assert.equal(changed.inputs.materials.concrete.stressStrain.type, 'user-curve')
  if (changed.inputs.materials.concrete.stressStrain.type === 'user-curve') assert.notEqual(changed.inputs.materials.concrete.stressStrain.points[1].stress, 30)
  assert.deepEqual(changed.inputs.materials.steel, project.inputs.materials.steel)
})

test('clearing an optional physical steel cap removes it; required strains cannot be blank', async () => {
  const p = example(); p.inputs.materials.steel[0].limits = { ...p.inputs.materials.steel[0].limits, epsU: .05 }
  const book = await readBook(canonical(p))
  field(book, 'Material', 'εs,phys (1)').value = null
  assert.equal((await imported(book)).inputs.materials.steel[0].limits?.epsU, undefined)
  field(book, 'Material', 'εcu (1)').value = null
  assert.equal((await importBook(book)).ok, false)
})

test('equal law/boundary strains have one editable source; distinct active bounds stay independent', async () => {
  const p = example(), book = await readBook(p)
  field(book, 'Material', 'εc0 (1)').value = .0022
  const changed = await imported(book)
  assert.equal(changed.inputs.materials.concrete.limits.eps0, .0022)
  assert.equal(changed.inputs.materials.concrete.stressStrain.type, 'kds-parabolic')
  if (changed.inputs.materials.concrete.stressStrain.type === 'kds-parabolic') assert.equal(changed.inputs.materials.concrete.stressStrain.eps0, .0022)
  const distinct = example(); distinct.inputs.materials.concrete.limits.epsCu = .0032
  const project = canonical(distinct), separated = await readBook(project)
  assert.equal(field(separated, 'Material', 'εcu,lim (1)').value, .0032)
  assert.deepEqual((await imported(separated)).inputs, expectedInputs(project))
})

test('editing fy and Es refreshes only the derived yield snapshot through the material owner', async () => {
  const p = example(), book = await readBook(p)
  field(book, 'Material', 'fy (MPa)').value = 500
  field(book, 'Material', 'Es (MPa)').value = 210000
  const q = await imported(book)
  assert.equal(q.inputs.materials.steel[0].fy, 500)
  assert.equal(q.inputs.materials.steel[0].elasticModulus, 210000)
  assert.equal(q.inputs.materials.steel[0].limits?.epsY, 500 / 210000)
  assert.deepEqual(q.inputs.materials.concrete, p.inputs.materials.concrete)
  book.getWorksheet('Material')!.spliceRows(marker(book, 'Material', 'Steel') + 2, 0, ['εs,phys (1)', .0022])
  assert.equal((await importBook(book)).ok, false)
})

test('file import ignores additional worksheets and uses defaults for omitted settings', async () => {
  const p = example()
  p.meta.information.client = 'Private client'
  p.inputs.design = createKdsAppendixDesignBasis()
  p.inputs.analysis = createAdaptiveAnalysisOptions()
  p.inputs.loadings.checkBasis = 'constantAxial'
  const book = await readBook(p)
  for (const name of ['Project', 'Options', 'Resistance', 'Load reference', 'Units']) {
    book.addWorksheet(name).getCell('A1').value = { formula: '1/0' }
  }
  const q = await imported(book)
  assert.deepEqual(q.inputs, expectedInputs(p))
  assert.equal(q.meta.information.client, createEmptyProjectDocument().meta.information.client)
  assert.doesNotMatch(book.description, /Private client|constantAxial|minimumEccentricity|verificationStatus/)
})

test('legacy workbook reads only the old profile, units and origin needed to interpret the inputs', async () => {
  const project = example(), book = await readBook(project)
  const profile = field(book, 'Material', 'Profile')
  book.addWorksheet('Project').addRows([['Project'], ['Parameter', 'Value'], ['Client', { formula: '1/0' }],
    ['Design'], ['Parameter', 'Value'], ['Profile', profile.value], ['Check basis', 'Constant P']])
  removeField(book, 'Material', 'Profile')
  book.addWorksheet('Units').addRows([['Quantity', 'Unit'], ...Object.keys(QUANTITY_UNIT_OPTIONS).map(key => {
    const quantity = key as keyof typeof QUANTITY_UNIT_OPTIONS
    const labels = { length: 'Length', barDiameter: 'Bar diameter', area: 'Area', force: 'Force', moment: 'Moment',
      stress: 'Stress', modulus: 'Modulus', curvature: 'Curvature', density: 'Density' }
    return [labels[quantity], quantityUnit(quantity, CANONICAL_WORKBOOK_UNITS)]
  })])
  book.addWorksheet('Load reference').addRows([['Parameter', 'Value'], ['xO (mm)', 10], ['yO (mm)', 20]])
  book.addWorksheet('Options').getCell('A1').value = { formula: '1/0' }
  book.subject = 'P-M project inputs / 1'
  const { sourceUnits: _units, ...legacyMetadata } = JSON.parse(book.description)
  book.description = JSON.stringify({ ...legacyMetadata, checkBasisPresent: true })
  const expected = expectedInputs(project)
  expected.loadings.combinations = expected.loadings.combinations.map(load => ({
    ...load, Mx: load.Mx + load.P * 20, My: load.My + load.P * 10
  }))
  assert.deepEqual((await imported(book)).inputs, expected)
})

test('geometry, stored As, loading and scalar input edits remain authoritative and do not derive unrelated material data', async () => {
  const p = example(), book = await readBook(p)
  field(book, 'Material', 'fck (MPa)').value = 35
  const section = book.getWorksheet('Section')!, bars = book.getWorksheet('Rebar')!, loads = book.getWorksheet('Loadings')!
  section.getCell(marker(book, 'Section', 'Outer') + 2, 1).value = -560
  bars.getCell(marker(book, 'Rebar', 'Rebars') + 2, 1).value = 25
  bars.addRow([16, 100, 530, null, null, 200])
  loads.addRow(['New load', 1000, -2000000, 3000000])
  const q = await imported(book)
  assert.equal(q.inputs.materials.concrete.fck, 35)
  assert.equal(q.inputs.materials.concrete.elasticModulus, p.inputs.materials.concrete.elasticModulus)
  assert.equal(q.inputs.geometry.outers[0].points[0].x, -560)
  assert.equal(q.inputs.geometry.rebars[0].area, p.inputs.geometry.rebars[0].area)
  assert.equal(q.inputs.geometry.rebars.at(-1)!.area, 200)
  assert.equal(q.inputs.loadings.combinations.at(-1)!.Mx, -2000000)
  assert.equal(new Set(q.inputs.loadings.combinations.map(load => load.id)).size, q.inputs.loadings.combinations.length)
})

test('copied outer/hole/steel blocks and optional technical IDs retain explicit identity semantics', async () => {
  const p = example(), book = await readBook(p), section = book.getWorksheet('Section')!, materials = book.getWorksheet('Material')!
  section.addRows([[], ['Outer', 2], ['x (mm)', 'y (mm)'], [2000, 0], [2600, 0], [2600, 600], [2000, 600],
    [], ['Hole', 3], ['x (mm)', 'y (mm)'], [2200, 200], [2200, 400], [2400, 400], [2400, 200]])
  const start = marker(book, 'Material', 'Steel')
  const sourceRows = materials.getRows(start, materials.rowCount - start + 1)!.map(row => row.values)
  materials.addRow([])
  const copied = materials.rowCount + 1
  materials.addRows(sourceRows)
  materials.getCell(copied, 2).value = 2
  const q = await imported(book)
  assert.equal(q.inputs.geometry.outers.length, 2)
  assert.equal(q.inputs.geometry.outers[1].holes[0].id, 3)
  assert.equal(q.inputs.materials.steel.length, 2)
  assert.equal(q.inputs.materials.steel[1].id, 2)
  assert.equal(new Set(q.inputs.geometry.outers.flatMap(outer => [...outer.points, ...outer.holes.flatMap(hole => hole.points)]).map(point => point.id)).size,
    q.inputs.geometry.outers.flatMap(outer => [...outer.points, ...outer.holes.flatMap(hole => hole.points)]).length)
})

test('blank rows, moved tables and reordered columns retain cells and their exact unit provenance', async () => {
  const p = example(), book = await readBook(p)
  for (const ws of book.worksheets) {
    const rows: Array<{ values: ExcelJS.CellValue[]; notes: Array<ExcelJS.Cell['note'] | undefined> }> = []
    ws.eachRow(row => rows.push({ values: (row.values as ExcelJS.CellValue[]).slice(1), notes: Array.from({ length: row.cellCount }, (_, i) => row.getCell(i + 1).note) }))
    const name = ws.name
    book.removeWorksheet(ws.id)
    const moved = book.addWorksheet(name)
    moved.addRow(['# Custom note'])
    for (const source of rows) {
      // Unit and loading columns are identified by their headers, not their positions.
      const order = name === 'Units' && source.values.length === 2 ? [1, 0]
        : name === 'Loadings' && source.values.length > 2 ? [2, 0, 3, 1, 4] : source.values.map((_, i) => i)
      moved.addRow([])
      const r = moved.addRow([null, null, ...order.map(i => source.values[i])])
      order.forEach((index, i) => { const note = source.notes[index]; if (note) r.getCell(i + 3).note = note })
    }
  }
  assert.deepEqual((await imported(book)).inputs, expectedInputs(p))
})

test('missing Profile or mismatched unit labels fail before applying defaults', async () => {
  const missing = await readBook()
  removeField(missing, 'Material', 'Profile')
  assert.equal((await importBook(missing)).ok, false)
  const wrong = await readBook()
  wrong.getWorksheet('Loadings')!.getCell(marker(wrong, 'Loadings', 'Loadcases') + 1, 2).value = 'P (kN)'
  const result = await importBook(wrong)
  assert.equal(result.ok, false)
  if (!result.ok) assert.match(result.error, /unit|header/i)
})

test('edited material input branches use only their newly authored cells', async () => {
  const p = example()
  p.inputs.materials.steel[0].stressStrain = { type: 'linear-hardening', ultimateStrength: { type: 'ratio', ratio: 1.08 }, epsUk: .05, strainLimit: { type: 'factor', value: .9 } }
  const book = await readBook(canonical(p))
  field(book, 'Material', 'Peak input').value = 'fu'
  const strength = field(book, 'Material', 'k = fu/fy (1)')
  strength.worksheet.getCell(Number(strength.row), 1).value = 'fu (MPa)'
  strength.value = 550
  field(book, 'Material', 'Cutoff input').value = 'εud'
  const cutoff = field(book, 'Material', 'αε (1)')
  cutoff.worksheet.getCell(Number(cutoff.row), 1).value = 'εud (1)'
  cutoff.value = .04
  const q = await imported(book)
  assert.deepEqual(q.inputs.materials.steel[0].stressStrain, { type: 'linear-hardening', ultimateStrength: { type: 'stress', stress: 550 }, epsUk: .05, strainLimit: { type: 'absolute', value: .04 } })

})

test('metadata cannot shadow input values or grant reviewed/verified status', async () => {
  for (const kind of ['shadow', 'status'] as const) {
    const book = await readBook(), metadata = JSON.parse(book.description)
    if (kind === 'shadow') metadata.groups.find((group: { keyword: string }) => group.keyword === 'CONCRETE').stored.push({ path: 'fck', value: 99 })
    else metadata.groups.push({ key: 'RESISTANCE:', keyword: 'RESISTANCE', paths: [], stored: [{ path: 'verificationStatus', value: 'verified' }], bindings: [] })
    book.description = JSON.stringify(metadata)
    assert.equal((await importBook(book)).ok, false, kind)
  }
})

test('inactive material fields fail instead of being silently discarded', async () => {
  const book = await readBook()
  book.getWorksheet('Material')!.addRow(['Hardening ratio', .02])
  assert.equal((await importBook(book)).ok, false)
})

test('unknown format, missing metadata/sheets, duplicate inputs, formulas and broken references fail without mutating the source', async () => {
  const p = example(), before = JSON.stringify(p)
  const cases: Array<(book: ExcelJS.Workbook) => void> = [
    book => { book.subject = 'Unrecognized workbook' }, book => { book.description = '' },
    book => { book.removeWorksheet('Section') }, book => { book.removeWorksheet('Rebar') }, book => { book.removeWorksheet('Loadings') },
    book => { book.getWorksheet('Material')!.addRow(['fy (MPa)', 999]) },
    book => { field(book, 'Material', 'fck (MPa)').value = { formula: '20+10', result: 30 } },
    book => { field(book, 'Material', 'Default steel').value = -1 },
    book => { book.getWorksheet('Section')!.addRows([['Outer', 1], ['x (mm)', 'y (mm)']]) }
  ]
  for (const mutate of cases) { const book = await readBook(p); mutate(book); assert.equal((await importBook(book)).ok, false) }
  assert.equal(JSON.stringify(p), before)
  assert.equal((await importProjectWorkbook(new ArrayBuffer(10 * 1024 * 1024 + 1))).ok, false)
  assert.equal((await importProjectWorkbook(new Uint8Array([1, 2, 3]).buffer)).ok, false)
})
